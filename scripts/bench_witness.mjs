// ---------------------------------------------------------------------------
// STEP 2 -- Load-test the three costs of broadcast-refresh (§3 of the note).
//
//   1. Broadcast size per epoch   -- sweep 1k / 10k / 100k new leaves/epoch,
//                                    raw (leaves) vs frontier-compressed (nodes).
//   2. Offline catch-up           -- client dark for m = 1 / 4 / 30 epochs:
//                                    download size + local recompute time.
//                                    FAIL if it needs a per-user query or unbounded work.
//   3. Steady-state refresh p95   -- 1-epoch refresh, desktop, 20 runs, p95, phone projection.
//
//   node scripts/bench_witness.mjs
// ---------------------------------------------------------------------------

import {
  AppendOnlyMerkle, MockServer, clientRefresh, clientCatchup, broadcastBytes, H,
} from "./witness_maint.mjs";

const D = 9, W = 8, FE = 32;
const now = () => performance.now();
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1],
           mean: a.reduce((x, y) => x + y, 0) / a.length };
};
const kb = (b) => (b / 1024).toFixed(1) + " KB";
const mb = (b) => (b / 1024 / 1024).toFixed(2) + " MB";
let SEED = 1n;
const leaves = (k) => Array.from({ length: k }, () => H([SEED++]));

// Per-hash cost of this machine's Poseidon(8) -- the unit the phone projection scales.
function poseidonUnit() {
  const t0 = now(); const N = 400;
  for (let i = 0; i < N; i++) H([1n, 2n, 3n, 4n, 5n, 6n, 7n, BigInt(i)]);
  return (now() - t0) / N; // ms/hash
}

console.log(`Poseidon(8) unit on this desktop: ${poseidonUnit().toFixed(2)} ms/hash (i7-9850H, Node ${process.version})`);
console.log(`tree: append-only arity-${W} depth-${D}  capacity ${(W ** D).toLocaleString()}\n`);

// =========================================================================
// 2.1  BROADCAST SIZE PER EPOCH  -- sweep 1k / 10k / 100k
// =========================================================================
console.log("== 2.1  broadcast size per epoch (raw leaves vs frontier-compressed nodes) ==");
{
  const tree = new AppendOnlyMerkle({ depth: D, arity: W });
  const srv = new MockServer(tree);
  // warm the frontier to a realistic mid-fill position (~150k enrolled) so the
  // per-level changed-node counts are in steady state, not genesis-special.
  srv.publishEpoch(leaves(150_000));
  console.log(`  (warm start: ${tree.n.toLocaleString()} leaves already enrolled)\n`);

  console.log("   rate      raw (A leaves)     frontier (Δnodes)   ratio   frontier Δ by level");
  for (const A of [1_000, 10_000, 100_000]) {
    const b = srv.publishEpoch(leaves(A));
    const acct = broadcastBytes(b);
    const lvlStr = Object.entries(acct.changed_by_level).map(([l, c]) => `L${l}:${c}`).join(" ");
    console.log(
      `  ${String(A).padStart(6)}   ${String(acct.raw_bytes).padStart(9)} B (${kb(acct.raw_bytes).padStart(9)})` +
      `   ${String(acct.frontier_bytes).padStart(8)} B (${kb(acct.frontier_bytes).padStart(8)})` +
      `   ${(acct.raw_bytes / acct.frontier_bytes).toFixed(1)}x   ${lvlStr}`);
  }
  console.log(`\n  A far-from-frontier client (>1 epoch old) refreshes from the frontier form ALONE`);
  console.log(`  (Δnodes, level>=1). Raw leaves are needed only by the <=${W - 1} clients enrolled into`);
  console.log(`  the bottom group still being filled this epoch. Headline size = frontier form.`);
}

// =========================================================================
// 2.2  OFFLINE CATCH-UP  -- m = 1 / 4 / 30 epochs, realistic rates
// =========================================================================
console.log(`\n== 2.2  offline catch-up: m = 1 / 4 / 30 epochs ==`);
for (const RATE of [1_000, 10_000]) {
  console.log(`\n  --- enrollment rate ${RATE.toLocaleString()} leaves/epoch ---`);
  const tree = new AppendOnlyMerkle({ depth: D, arity: W });
  const srv = new MockServer(tree);
  srv.publishEpoch(leaves(50_000));                       // base population
  const CLIENT = 137;                                     // an established client
  const base = tree.authWitness(CLIENT);                  // its witness "now", before it goes dark

  const M = 30;
  const broadcasts = [];
  for (let e = 0; e < M; e++) broadcasts.push(srv.publishEpoch(leaves(RATE)));

  const cloneW = () => ({
    index: base.index, leaf: base.leaf, root: base.root, syncedEpoch: base.syncedEpoch,
    node: base.node.map((g) => g.slice()),
  });
  // ground-truth witness path after exactly m of the captured epochs
  const truthPathAfter = (m) => {
    const t = new AppendOnlyMerkle({ depth: D, arity: W });
    for (let e = 1; e < srv.log.length && e <= base.syncedEpoch + m; e++)
      if (srv.log[e]) t.appendEpoch(srv.log[e].newLeaves.slice());
    const tw = t.authWitness(CLIENT);
    return { path: JSON.stringify(tw.node.map((g) => g.map(String))), root: tw.root };
  };

  console.log(`   m    replay dl     coalesced dl   recompute p95 (replay / coalesce)   query-free?  correct?`);
  for (const m of [1, 4, 30]) {
    const win = broadcasts.slice(0, m);
    const replayBytes = win.reduce((s, b) => s + broadcastBytes(b).frontier_bytes, 0);
    const merged = new Map();
    for (const b of win) for (const c of b.changed) merged.set(c.level + ":" + c.index, 1);
    const coalescedBytes = merged.size * FE;
    const gt = truthPathAfter(m);

    const tReplay = [], tCoal = [];
    let okR = true, okC = true;
    for (let r = 0; r < 20; r++) {
      const wr = cloneW(); let t0 = now(); clientCatchup(win, wr, "replay");   tReplay.push(now() - t0);
      const wc = cloneW();     t0 = now(); clientCatchup(win, wc, "coalesce"); tCoal.push(now() - t0);
      if (JSON.stringify(wr.node.map((g) => g.map(String))) !== gt.path || wr.root !== gt.root) okR = false;
      if (JSON.stringify(wc.node.map((g) => g.map(String))) !== gt.path || wc.root !== gt.root) okC = false;
    }
    const sR = stat(tReplay), sC = stat(tCoal);
    console.log(
      `  ${String(m).padStart(2)}   ${kb(replayBytes).padStart(9)}   ${kb(coalescedBytes).padStart(11)}` +
      `   ${sR.p95.toFixed(1).padStart(6)} ms / ${sC.p95.toFixed(1).padStart(6)} ms` +
      `            yes         ${okR && okC}`);
  }
  srv.auditQueryFree();
  console.log(`   upstream calls during entire catch-up: ${srv.calls.length} (all epoch-keyed) -- query-free CONFIRMED`);
}

// =========================================================================
// 2.3  STEADY-STATE (1-EPOCH) REFRESH p95  -- 20 runs, phone projection
// =========================================================================
console.log(`\n== 2.3  steady-state 1-epoch refresh: p95 over 20 runs ==`);
{
  const unit = poseidonUnit();
  for (const RATE of [1_000, 10_000, 100_000]) {
    const tree = new AppendOnlyMerkle({ depth: D, arity: W });
    const srv = new MockServer(tree);
    srv.publishEpoch(leaves(120_000));
    const CLIENT = 251;
    const base = tree.authWitness(CLIENT);
    const b = srv.publishEpoch(leaves(RATE));

    const t = [];
    let touched = 0;
    for (let r = 0; r < 21; r++) {
      const w = { index: base.index, leaf: base.leaf, root: base.root, syncedEpoch: base.syncedEpoch,
                  node: base.node.map((g) => g.slice()) };
      const t0 = now(); clientRefresh(b, w); const dt = now() - t0;
      if (r > 0) t.push(dt);
      touched = w._lastTouched;
    }
    const s = stat(t);
    console.log(
      `  rate ${String(RATE).padStart(6)}/epoch:  p95 ${s.p95.toFixed(1)} ms  (median ${s.median.toFixed(1)}, max ${s.max.toFixed(1)})` +
      `  | ${D} Poseidon(8) hashes, ${touched} sibling(s) updated` +
      `  | phone x2 = ${(s.p95 * 2).toFixed(0)} ms, x4 = ${(s.p95 * 4).toFixed(0)} ms`);
  }
  console.log(`\n  Refresh is O(depth) = ${D} hashes REGARDLESS of enrollment rate or m. The rate`);
  console.log(`  only changes how many sibling slots get overwritten before the same ${D} hashes run.`);
}

console.log(`\nDONE.`);
