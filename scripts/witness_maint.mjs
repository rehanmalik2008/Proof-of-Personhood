// ---------------------------------------------------------------------------
// STEP 1 -- Broadcast-refresh, implemented (not argued).
//
// Append-only arity-8 Poseidon Merkle tree, depth 9  (capacity 8^9 = 134,217,728).
//
//   (a) epoch append          -- server-side: appendEpoch(newLeaves[]) -> broadcast
//   (b) per-epoch public       -- the returned `broadcast` object: identical bytes
//       broadcast object          for every client, contains ZERO per-user data
//   (c) client-side refresh    -- clientRefresh(broadcast, witness): recomputes the
//                                 client's OWN affected path levels from public data
//                                 + the client's private witness. No leaf index is
//                                 ever passed to a server call. Enforced structurally
//                                 (see MockServer -- its API cannot accept an index)
//                                 and by assertion (see assertQueryFree()).
//
// Falsification (this file's gate): the query-free property must be enforced in
// code, not promised. `clientRefresh` / `clientCatchup` take (publicData, privateWitness)
// and nothing else; they never receive, and cannot reach, the network. The only
// server surface is MockServer.getBroadcast(epoch) / getBroadcasts(from,to) -- keyed
// on epoch alone, never on anything derived from the client's position.
// ---------------------------------------------------------------------------

import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
export const F = poseidon.F;
export const H = (arr) => F.toObject(poseidon(arr));      // -> BigInt
export const toDec = (x) => (typeof x === "bigint" ? x : F.toObject(x)).toString();

// ------------------------------- the tree -----------------------------------

export class AppendOnlyMerkle {
  constructor({ depth = 9, arity = 8, hash = H } = {}) {
    this.D = depth;
    this.W = arity;
    this.hash = hash;
    this.capacity = this.W ** this.D;      // 134,217,728 for 8^9
    // zeros[i] = value of an empty subtree rooted at level i
    this.zeros = [0n];
    for (let i = 1; i <= this.D; i++) this.zeros[i] = hash(Array(this.W).fill(this.zeros[i - 1]));
    // Dense left-spine storage. level[i] holds every node computed so far at level i.
    // For the spike we enroll <= a few 10^5 leaves for real; huge scales are projected.
    this.level = Array.from({ length: this.D + 1 }, () => []);
    this.n = 0;                             // leaves appended
    this.epoch = 0;
  }

  root() {
    return this.n === 0 ? this.zeros[this.D] : this.level[this.D][0];
  }

  // node value at (lvl,idx): stored if computed, else the empty-subtree value.
  _node(lvl, idx) {
    const v = this.level[lvl][idx];
    return v === undefined ? this.zeros[lvl] : v;
  }

  // ----- (a) epoch append -> (b) public broadcast object ---------------------
  appendEpoch(newLeaves) {
    if (this.n + newLeaves.length > this.capacity) throw new Error("tree full");
    const W = this.W;
    const nBefore = this.n;
    const nAfter = nBefore + newLeaves.length;

    // place leaves
    for (let j = 0; j < newLeaves.length; j++) this.level[0][nBefore + j] = BigInt(newLeaves[j]);

    // recompute only the right-spine parents whose children changed, per level
    const changed = [];                                    // {level,index,value}  (internal nodes, level>=1)
    for (let lvl = 1; lvl <= this.D; lvl++) {
      const childCount = nAfter <= 0 ? 0 : Math.ceil(nAfter / W ** (lvl - 1));
      const firstParent = Math.floor(nBefore / W ** lvl);
      const lastParent = Math.floor((nAfter - 1) / W ** lvl);
      for (let p = firstParent; p <= lastParent; p++) {
        const kids = [];
        for (let s = 0; s < W; s++) kids.push(this._node(lvl - 1, p * W + s));
        const v = this.hash(kids);
        this.level[lvl][p] = v;
        changed.push({ level: lvl, index: p, value: v });
      }
      if (lastParent < firstParent) break;                 // nothing more up the spine
    }

    this.n = nAfter;
    const epoch = ++this.epoch;

    // per-level index->value view of `changed`, so a client does O(depth*W) direct
    // lookups instead of building an O(broadcast) map. Same bytes on the wire
    // (a sorted {index:value} block per level); just a serialization choice.
    const byLevel = {};
    for (const c of changed) (byLevel[c.level] ||= {})[c.index] = c.value;

    // The public broadcast. IDENTICAL for every client. No leaf index of any client.
    //   newLeaves : this epoch's appended leaf values (level-0)      -> "raw" form
    //   changed   : internal nodes (level>=1) whose value changed     -> "frontier-compressed" form
    // Both are provided; a client reads only the O(depth) entries on its own path.
    const broadcast = Object.freeze({
      epoch,
      nBefore,
      nAfter,
      root: this.root(),
      newLeaves: Object.freeze(newLeaves.map(BigInt)),
      changed: Object.freeze(changed.map(Object.freeze)),
      byLevel: Object.freeze(byLevel),          // {level: {index: value}}  -- O(1) lookup view
    });
    return broadcast;
  }

  // ----- BULK REVOCATION: tree rebuild at an epoch boundary ----------------
  // closing-two-gates.md Item 2b. A compromised attester's leaves are set to the
  // zero-subtree value (TOMBSTONE -- indices are NOT compacted). Only the internal
  // nodes on the paths from the revoked leaves up to the root change, so the
  // broadcast is INCREMENTAL: its size is proportional to (revoked count x depth),
  // deduplicated near the root, NOT to the whole tree. Clients recompute exactly
  // as for a normal epoch (clientRefresh, query-free) -- a client whose path is
  // untouched still reads the O(depth) changed upper nodes and re-derives the root.
  //
  // Tombstoning (vs. compacting): revoked slots are not reclaimed, and a former
  // slot is publicly a zero. Leaf values are commitments and position is not
  // linked to identity, so this leaks only "a revocation happened here". The
  // alternative -- compacting -- shifts every later leaf's index, which is a
  // positional operation on every client's witness and forces full republication.
  revokeAndRebuild(revokedIndices) {
    const W = this.W;
    for (const idx of revokedIndices) {
      if (idx < 0 || idx >= this.n) throw new Error(`revoke: leaf ${idx} not present`);
      this.level[0][idx] = 0n;                         // tombstone
    }
    // recompute the union of affected internal-node paths, bottom-up, deduped
    let frontier = new Set(revokedIndices.map(Number));
    const changed = [];
    // level 0 tombstones are part of the broadcast (scattered indices -> byLevel[0])
    for (const idx of revokedIndices) changed.push({ level: 0, index: Number(idx), value: 0n });
    for (let lvl = 1; lvl <= this.D; lvl++) {
      const parents = new Set([...frontier].map((c) => Math.floor(c / W)));
      for (const p of parents) {
        const kids = [];
        for (let s = 0; s < W; s++) kids.push(this._node(lvl - 1, p * W + s));
        const v = this.hash(kids);
        this.level[lvl][p] = v;
        changed.push({ level: lvl, index: p, value: v });
      }
      frontier = parents;
    }
    const epoch = ++this.epoch;
    const byLevel = {};
    for (const c of changed) (byLevel[c.level] ||= {})[c.index] = c.value;
    return Object.freeze({
      epoch,
      nBefore: this.n,            // n is unchanged (tombstone, no compaction)
      nAfter: this.n,
      root: this.root(),
      rebuild: true,
      revokedCount: revokedIndices.length,
      newLeaves: Object.freeze([]),                    // scattered -> carried in byLevel[0]
      changed: Object.freeze(changed.map(Object.freeze)),
      byLevel: Object.freeze(byLevel),
    });
  }

  // ----- enrollment-time only (Phase 1, OFF the hot path) -------------------
  // Returns the client's initial private witness. This IS a positional read, but it
  // happens ONCE, at enrollment, in the heavy Phase-1 flow -- never again. Every
  // later update is clientRefresh(), which is query-free.
  authWitness(index) {
    if (index < 0 || index >= this.n) throw new Error("leaf not present");
    const W = this.W;
    const node = [];
    for (let lvl = 0; lvl < this.D; lvl++) {
      const parent = Math.floor(index / W ** (lvl + 1));
      const grp = [];
      for (let s = 0; s < W; s++) grp.push(this._node(lvl, parent * W + s));
      node.push(grp);
    }
    return { index, leaf: this._node(0, index), node, root: this.root(), syncedEpoch: this.epoch };
  }
}

// --------------------------- (c) client refresh ----------------------------

// Hard structural guard: the arguments a query-free refresh is allowed to see.
function assertQueryFree(fnName, args) {
  if (args.length !== 2) throw new Error(`${fnName}: must take exactly (publicData, privateWitness)`);
  const [pub] = args;
  const check = (b) => {
    if (!Object.isFrozen(b)) throw new Error(`${fnName}: public broadcast must be frozen (immutable public object)`);
    for (const k of Object.keys(b)) {
      if (typeof b[k] === "function") throw new Error(`${fnName}: broadcast carries a callable ('${k}') -- not a pure data object`);
    }
    // a broadcast must not carry anything that looks like a per-user handle
    for (const bad of ["index", "leafIndex", "position", "path", "socket", "url", "fetch", "server"]) {
      if (bad in b) throw new Error(`${fnName}: broadcast field '${bad}' would make the refresh position-dependent`);
    }
  };
  Array.isArray(pub) ? pub.forEach(check) : check(pub);
}

// Recompute the client's own path from one epoch's public broadcast + its witness.
// Returns the updated witness. Throws if the recomputed root != broadcast.root.
export function clientRefresh(broadcast, witness) {
  assertQueryFree("clientRefresh", arguments);
  const D = witness.node.length;
  const W = witness.node[0].length;
  const idx = witness.index;

  // O(1) lookup views over the PUBLIC broadcast (already downloaded; local only).
  // Internal nodes come from byLevel; the client's own bottom group can also draw
  // from newLeaves (only relevant if it enrolled into the group still being filled).
  const bl = broadcast.byLevel || {};
  const leafAt = (i) => {
    const j = i - broadcast.nBefore;
    return j >= 0 && j < broadcast.newLeaves.length ? broadcast.newLeaves[j] : undefined;
  };

  let cur = witness.leaf;
  let touched = 0;
  for (let lvl = 0; lvl < D; lvl++) {
    const parent = Math.floor(idx / W ** (lvl + 1));
    const mySlot = Math.floor(idx / W ** lvl) % W;
    const lvlMap = bl[lvl];
    for (let s = 0; s < W; s++) {
      if (s === mySlot) { witness.node[lvl][s] = cur; continue; }
      const childIdx = parent * W + s;
      const v = lvl === 0
        ? (lvlMap && lvlMap[childIdx] !== undefined ? lvlMap[childIdx] : leafAt(childIdx))
        : (lvlMap ? lvlMap[childIdx] : undefined);
      if (v !== undefined) { witness.node[lvl][s] = v; touched++; }
    }
    cur = H(witness.node[lvl]);
  }
  witness.root = cur;
  witness.syncedEpoch = broadcast.epoch;
  witness._lastTouched = touched;
  if (cur !== broadcast.root) throw new Error("clientRefresh: recomputed root != public root (divergent broadcast?)");
  return witness;
}

// Catch up over m epochs. Two modes, both query-free:
//   'replay'   : apply the m per-epoch broadcasts in order   (download = sum of m broadcasts)
//   'coalesce' : merge them into one delta, apply once        (download = deduped union)
export function clientCatchup(broadcasts, witness, mode = "replay") {
  assertQueryFree("clientCatchup", [broadcasts, witness]);
  if (mode === "replay") {
    for (const b of broadcasts) clientRefresh(b, witness);
    return witness;
  }
  // coalesce
  const chg = new Map();
  const leafByIndex = new Map();
  let last = null;
  for (const b of broadcasts) {
    for (const c of b.changed) chg.set(c.level + ":" + c.index, c.value);
    for (let j = 0; j < b.newLeaves.length; j++) leafByIndex.set(b.nBefore + j, b.newLeaves[j]);
    last = b;
  }
  const mergedChanged = [...chg.entries()].map(([k, v]) => {
    const [level, index] = k.split(":").map(Number);
    return Object.freeze({ level, index, value: v });
  });
  const mBy = {};
  for (const c of mergedChanged) (mBy[c.level] ||= {})[c.index] = c.value;
  const firstLeafIdx = broadcasts[0].nBefore;
  const merged = Object.freeze({
    epoch: last.epoch,
    nBefore: firstLeafIdx,
    nAfter: last.nAfter,
    root: last.root,
    newLeaves: Object.freeze([...leafByIndex.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])),
    changed: Object.freeze(mergedChanged),
    byLevel: Object.freeze(mBy),
  });
  // note: merged.newLeaves is indexed from broadcasts[0].nBefore contiguously
  return clientRefresh(merged, witness);
}

// ------------------------- broadcast size accounting ----------------------

const FE = 32; // one field element serialized = 32 bytes

export function broadcastBytes(b) {
  const rawLeaves = b.newLeaves.length * FE;                       // level-0 only
  const frontierNodes = b.changed.length * FE;                     // internal nodes level>=1
  // "raw" broadcast   = new leaves; a far client must hash a subtree to get its sibling
  // "frontier-compr." = internal nodes; a far client reads its one sibling directly, O(depth) work
  return {
    epoch: b.epoch,
    appended: b.nAfter - b.nBefore,
    raw_bytes: rawLeaves,
    frontier_bytes: frontierNodes,
    raw_plus_frontier_bytes: rawLeaves + frontierNodes,
    changed_by_level: b.changed.reduce((m, c) => ((m[c.level] = (m[c.level] || 0) + 1), m), {}),
  };
}

// --------------------------- the server surface ---------------------------
// The ONLY thing a client ever calls upstream. Note the API: it is keyed on
// `epoch` and nothing else. There is deliberately no getPathForLeaf(index).

export class MockServer {
  constructor(tree) {
    this.tree = tree;
    this.log = [];                 // broadcast per epoch
    this.calls = [];               // audit of every upstream call's arguments
  }
  publishEpoch(newLeaves) {
    const b = this.tree.appendEpoch(newLeaves);
    this.log[b.epoch] = b;
    return b;
  }
  getBroadcast(epoch) {
    this.calls.push({ method: "getBroadcast", args: [epoch] });
    return this.log[epoch];
  }
  getBroadcasts(fromEpoch, toEpoch) {
    this.calls.push({ method: "getBroadcasts", args: [fromEpoch, toEpoch] });
    return this.log.slice(fromEpoch, toEpoch + 1).filter(Boolean);
  }
  // Assert no upstream call ever carried anything but an epoch number.
  auditQueryFree() {
    for (const c of this.calls) {
      for (const a of c.args) {
        if (typeof a !== "number" || !Number.isInteger(a) || a < 0)
          throw new Error(`upstream call ${c.method} carried a non-epoch argument: ${a}`);
      }
    }
    return { calls: this.calls.length, allEpochKeyed: true };
  }
}

// ------------------------------- self-test --------------------------------
// node scripts/witness_maint.mjs
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("witness_maint.mjs")) {
  const D = 9, W = 8;
  const tree = new AppendOnlyMerkle({ depth: D, arity: W });
  const server = new MockServer(tree);
  console.log(`AppendOnlyMerkle depth=${D} arity=${W}  capacity=${tree.capacity.toLocaleString()}`);

  // enroll a batch, pick a client early in the tree
  server.publishEpoch(Array.from({ length: 500 }, (_, i) => H([BigInt(i + 1)])));
  const CLIENT_IDX = 37;
  let w = tree.authWitness(CLIENT_IDX);
  const clientLeaf = w.leaf;
  console.log(`client enrolled at index ${CLIENT_IDX}; root after epoch 1 = ${w.root.toString().slice(0, 12)}...`);

  // run many epochs of growth; refresh each epoch; assert the witness stays valid
  const rates = [130, 900, 40, 777, 6000, 1234, 20000, 15000, 9001];
  let seed = 1_000_000n;
  for (let e = 0; e < rates.length; e++) {
    const leaves = Array.from({ length: rates[e] }, () => H([seed++]));
    const b = server.publishEpoch(leaves);
    const fresh = tree.authWitness(CLIENT_IDX);                 // ground truth
    clientRefresh(b, w);                                        // query-free update
    const ok = w.root === tree.root() && w.root === fresh.root &&
      JSON.stringify(w.node.map((g) => g.map(String))) === JSON.stringify(fresh.node.map((g) => g.map(String)));
    console.log(`  epoch ${b.epoch}: +${rates[e]} leaves (n=${tree.n})  refresh touched ${w._lastTouched} sibling(s)  witness==groundtruth: ${ok}`);
    if (!ok) { console.error("  DIVERGENCE"); process.exit(1); }
  }

  // offline catch-up: a second client that goes dark for the whole run
  const OFF_IDX = 111;
  const wOffBase = (() => {
    // reconstruct its witness as of epoch 1 by rebuilding a parallel tree
    const t2 = new AppendOnlyMerkle({ depth: D, arity: W });
    t2.appendEpoch(Array.from({ length: 500 }, (_, i) => H([BigInt(i + 1)])));
    return t2.authWitness(OFF_IDX);
  })();
  const wOffReplay = JSON.parse(JSON.stringify(wOffBase, (k, v) => (typeof v === "bigint" ? v.toString() : v)),
    (k, v) => (/^\d+$/.test(v) ? BigInt(v) : v));
  wOffReplay.index = OFF_IDX; wOffReplay.leaf = wOffBase.leaf;
  const wOffCoalesce = JSON.parse(JSON.stringify(wOffReplay, (k, v) => (typeof v === "bigint" ? v.toString() : v)),
    (k, v) => (/^\d+$/.test(v) ? BigInt(v) : v));
  wOffCoalesce.index = OFF_IDX; wOffCoalesce.leaf = wOffBase.leaf;

  const allB = server.log.slice(2).filter(Boolean);            // epochs 2..end (was offline since 1)
  clientCatchup(allB, wOffReplay, "replay");
  clientCatchup(allB, wOffCoalesce, "coalesce");
  const truth = tree.authWitness(OFF_IDX);
  const eqNode = (a) => JSON.stringify(a.node.map((g) => g.map(String)));
  console.log(`offline client idx ${OFF_IDX}, dark for ${allB.length} epochs:`);
  console.log(`  replay   -> root match ${wOffReplay.root === truth.root}, path match ${eqNode(wOffReplay) === eqNode(truth)}`);
  console.log(`  coalesce -> root match ${wOffCoalesce.root === truth.root}, path match ${eqNode(wOffCoalesce) === eqNode(truth)}`);

  const audit = server.auditQueryFree();
  console.log(`upstream audit: ${audit.calls} calls, all epoch-keyed: ${audit.allEpochKeyed}`);

  // ---- structural query-free guards (Falsification: enforced, not promised) ----
  const guard = (label, fn) => {
    try { fn(); console.error(`  GUARD FAIL (did not throw): ${label}`); process.exit(1); }
    catch { console.log(`  guard ok: ${label} -> rejected`); }
  };
  console.log(`structural guards:`);
  guard("refresh with 3 args", () => clientRefresh(server.log[2], w, 12345));
  guard("refresh with a mutable (non-frozen) broadcast", () => clientRefresh({ ...server.log[2] }, w));
  guard("refresh with a broadcast carrying a leaf 'index'", () =>
    clientRefresh(Object.freeze({ ...server.log[2], index: CLIENT_IDX }), w));
  guard("refresh with a broadcast carrying a 'fetch' handle", () =>
    clientRefresh(Object.freeze({ ...server.log[2], fetch: () => {} }), w));
  guard("server exposes no per-leaf path call", () => { server.getPathForLeaf(37); });
  // positive: refresh reaches root using ONLY the frontier-compressed form (no raw leaves)
  {
    const b = server.log[server.log.length - 1];
    const frontierOnly = Object.freeze({ ...b, newLeaves: Object.freeze([]) });
    const w2 = tree.authWitness(CLIENT_IDX);
    // roll w2 back one epoch by rebuilding, then refresh from frontier-only
    const t3 = new AppendOnlyMerkle({ depth: D, arity: W });
    t3.appendEpoch(Array.from({ length: 500 }, (_, i) => H([BigInt(i + 1)])));
    let seed3 = 1_000_000n;
    for (let e = 0; e < rates.length - 1; e++) t3.appendEpoch(Array.from({ length: rates[e] }, () => H([seed3++])));
    const w3 = t3.authWitness(CLIENT_IDX);
    clientRefresh(frontierOnly, w3);
    console.log(`  frontier-compressed form alone refreshes an established client: ${w3.root === tree.root()}`);
  }
  console.log("SELF-TEST PASS");
}
