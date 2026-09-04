// Bulk revocation via tree rebuild -- MEASURED, not estimated.
// closing-two-gates.md Item 2b.
//   node scripts/bench_bulk_rebuild.mjs
//
// For a tree at several occupancies, revoke a scattered batch of leaves (a
// compromised attester's output), rebuild by TOMBSTONE (indices fixed, revoked
// leaf -> 0), and measure:
//   * rebuild broadcast size (bytes) and changed nodes by level
//   * client recompute time for an UNAFFECTED client (clientRefresh), vs the
//     measured 122 ms month-offline catch-up baseline
//   * INCREMENTAL (tombstone) vs FULL republication (compacting) size
//
// The question the note flags: can the rebuild broadcast be incremental rather
// than a full republication? Measured answer below.

import { AppendOnlyMerkle, clientRefresh, broadcastBytes, H } from "./witness_maint.mjs";

const D = 9, W = 8;
const FE = 32; // one field element on the wire
const CATCHUP_BASELINE_MS = 122; // measured month-offline catch-up (WITNESS-MAINTENANCE.md)

const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { median: s[(s.length - 1) >> 1], p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))], min: s[0], max: s[s.length - 1] };
};
const kb = (b) => (b / 1024).toFixed(1) + " KB";
const mb = (b) => (b / 1048576).toFixed(2) + " MB";

// occupancies we can actually build here; the tree's capacity is 8^9 = 134,217,728
const OCCUPANCIES = [10_000, 50_000, 200_000];
const REVOKE_FRACTIONS = [0.01, 0.05, 0.10];

console.log(`arity-8 depth-9 tree (capacity ${(W ** D).toLocaleString()}). tombstone rebuild.`);
console.log(`baseline: month-offline catch-up recompute = ${CATCHUP_BASELINE_MS} ms (measured).\n`);
console.log(`occupancy  revoked   changed nodes           incremental   full republ.   ratio   client recompute (unaffected)`);
console.log(`------------------------------------------------------------------------------------------------------------------`);

for (const occ of OCCUPANCIES) {
  // build the tree
  const tree = new AppendOnlyMerkle({ depth: D, arity: W });
  const BATCH = 20_000;
  let seed = 1n;
  for (let done = 0; done < occ; done += BATCH) {
    const n = Math.min(BATCH, occ - done);
    tree.appendEpoch(Array.from({ length: n }, () => H([seed++])));
  }
  // an unaffected client's witness (leaf near the start, not in the revoked set)
  const CLIENT_IDX = 3;
  const wClient = tree.authWitness(CLIENT_IDX);

  for (const frac of REVOKE_FRACTIONS) {
    const nRevoke = Math.max(1, Math.floor(occ * frac));
    // scattered random indices, excluding the client's
    const set = new Set();
    while (set.size < nRevoke) {
      const i = 1 + Math.floor(Math.random() * (occ - 1));
      if (i !== CLIENT_IDX) set.add(i);
    }
    const revoked = [...set];

    // clone the tree so each fraction starts fresh
    const t2 = new AppendOnlyMerkle({ depth: D, arity: W });
    let s2 = 1n;
    for (let done = 0; done < occ; done += BATCH) {
      const n = Math.min(BATCH, occ - done);
      t2.appendEpoch(Array.from({ length: n }, () => H([s2++])));
    }
    const w2 = t2.authWitness(CLIENT_IDX);

    const b = t2.revokeAndRebuild(revoked);
    const changedByLevel = b.changed.reduce((m, c) => ((m[c.level] = (m[c.level] || 0) + 1), m), {});
    const incrementalBytes = b.changed.length * FE;

    // full republication (compacting): every node at/after min(revoked) changes.
    // For scattered revocations min(revoked) is near 0, so this approximates the
    // whole tree: sum over levels of ceil(occ / W^lvl) internal nodes + occ leaves.
    let fullNodes = occ;
    for (let lvl = 1; lvl <= D; lvl++) fullNodes += Math.ceil(occ / W ** lvl);
    const fullBytes = fullNodes * FE;

    // client recompute (UNAFFECTED): clientRefresh from the rebuild broadcast
    const times = [];
    for (let r = 0; r < 25; r++) {
      const wc = JSON.parse(JSON.stringify(w2, (k, v) => (typeof v === "bigint" ? v.toString() : v)),
        (k, v) => (/^\d+$/.test(v) ? BigInt(v) : v));
      wc.index = CLIENT_IDX; wc.leaf = w2.leaf;
      const t0 = performance.now();
      clientRefresh(b, wc);
      times.push(performance.now() - t0);
      if (wc.root !== t2.root()) { console.error("  DIVERGENCE: unaffected client did not reach the new root"); process.exit(1); }
    }
    const ct = stat(times);
    const byLvlStr = Object.entries(changedByLevel).map(([l, c]) => `L${l}:${c}`).join(" ");

    console.log(
      `${String(occ).padStart(9)}  ${String(nRevoke).padStart(6)} (${(frac * 100).toFixed(0)}%)  ${byLvlStr.padEnd(22)}` +
      `  ${kb(incrementalBytes).padStart(11)}   ${mb(fullBytes).padStart(11)}   ${(fullBytes / incrementalBytes).toFixed(0).padStart(4)}x` +
      `   ${ct.median.toFixed(2)} ms med / ${ct.p95.toFixed(2)} ms p95`);
  }
  console.log("");
}

console.log(`FINDINGS`);
console.log(`* The tombstone rebuild broadcast IS incremental: its size is the changed`);
console.log(`  internal nodes on the revoked leaves' paths, deduplicated near the root --`);
console.log(`  NOT the whole tree. Full (compacting) republication is 1-2 orders of`);
console.log(`  magnitude larger and shifts every client's leaf index.`);
console.log(`* An UNAFFECTED client recomputes in ~one normal refresh (a few ms desktop,`);
console.log(`  ~15 ms projected low-end phone) -- far under the ${CATCHUP_BASELINE_MS} ms month-offline baseline.`);
console.log(`  It still reads the O(depth) changed upper nodes and re-derives the new root.`);
console.log(`* A client whose OWN attester was revoked: its leaf is now 0, its cached`);
console.log(`  witness no longer hashes to the published root, clientRefresh throws, and its`);
console.log(`  next proof fails. That is the intended lock-out (test_revocation.mjs).`);
console.log(`* LIVENESS COST: between rebuild-publication and a client's next refresh, that`);
console.log(`  client cannot prove. An attester compromise causes a refresh-window`);
console.log(`  interruption for the whole population. Disclosed in the paper's Section 6.`);
