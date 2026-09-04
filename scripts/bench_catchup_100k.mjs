// STEP 2.2 continued -- the worst realistic case: offline a MONTH (m=30) at PEAK
// enrollment (100,000 leaves/epoch = 3,000,000 new leaves in the gap).
// Falsification #2: if this needs a per-user query or unbounded work, it FAILS.
//   node scripts/bench_catchup_100k.mjs

import { AppendOnlyMerkle, MockServer, clientCatchup, broadcastBytes, H } from "./witness_maint.mjs";

const D = 9, W = 8, FE = 32;
const now = () => performance.now();
const stat = (a) => { const s=[...a].sort((x,y)=>x-y); return { median:s[(s.length-1)>>1], p95:s[Math.min(s.length-1,Math.floor(0.95*s.length))], max:s[s.length-1] }; };
const mb = (b) => (b/1048576).toFixed(2) + " MB";
let SEED = 1n; const leaves = (k) => Array.from({ length: k }, () => H([SEED++]));

const RATE = 100_000, M = 30;
console.log(`worst case: rate ${RATE.toLocaleString()}/epoch, offline m=${M} epochs (${(RATE*M).toLocaleString()} leaves in the gap)`);

const tree = new AppendOnlyMerkle({ depth: D, arity: W });
const srv = new MockServer(tree);
console.log(`building base population 50,000 ...`);
srv.publishEpoch(leaves(50_000));
const CLIENT = 137;
const base = tree.authWitness(CLIENT);

console.log(`running ${M} epochs of +${RATE.toLocaleString()} ...`);
const broadcasts = [];
for (let e = 0; e < M; e++) { broadcasts.push(srv.publishEpoch(leaves(RATE))); if ((e+1)%10===0) console.log(`  ...epoch ${e+1}/${M}, n=${tree.n.toLocaleString()}`); }

const truth = tree.authWitness(CLIENT);
const cloneW = () => ({ index: base.index, leaf: base.leaf, root: base.root, syncedEpoch: base.syncedEpoch, node: base.node.map((g)=>g.slice()) });
const gtPath = JSON.stringify(truth.node.map((g)=>g.map(String)));

// ground-truth path after exactly the first `m` gap epochs. The captured tree IS
// the state after all 30, so for m=30 use it directly; for m<30 rebuild ONCE.
const gtPathAfter = (m) => {
  if (m === 30) return gtPath;
  const t = new AppendOnlyMerkle({ depth: D, arity: W });
  for (let e = 1; e <= 1 + m; e++) t.appendEpoch(srv.log[e].newLeaves.slice());
  return JSON.stringify(t.authWitness(CLIENT).node.map((g) => g.map(String)));
};

for (const m of [1, 4, 30]) {
  const win = broadcasts.slice(0, m);
  const replayBytes = win.reduce((s,b)=>s+broadcastBytes(b).frontier_bytes, 0);
  const merged = new Map();
  for (const b of win) for (const c of b.changed) merged.set(c.level+":"+c.index, 1);
  const coalescedBytes = merged.size * FE;
  const gp = gtPathAfter(m);

  const tR=[], tC=[]; let okR=true, okC=true;
  for (let r=0;r<20;r++){
    const wr=cloneW(); let t0=now(); clientCatchup(win,wr,"replay");   tR.push(now()-t0);
    const wc=cloneW();     t0=now(); clientCatchup(win,wc,"coalesce"); tC.push(now()-t0);
    if (JSON.stringify(wr.node.map(g=>g.map(String)))!==gp) okR=false;
    if (JSON.stringify(wc.node.map(g=>g.map(String)))!==gp) okC=false;
  }
  const sR=stat(tR), sC=stat(tC);
  console.log(`\n m=${m}:`);
  console.log(`   download  replay ${mb(replayBytes)}   coalesced ${mb(coalescedBytes)}`);
  console.log(`   recompute p95  replay ${sR.p95.toFixed(1)} ms   coalesce ${sC.p95.toFixed(1)} ms   (phone x4: ${(sC.p95*4).toFixed(0)} ms)`);
  console.log(`   correct: replay ${okR}  coalesce ${okC}`);
}
srv.auditQueryFree();
console.log(`\nupstream calls in the whole month-offline catch-up: ${srv.calls.length} (all epoch-keyed).`);
console.log(`work is bounded: coalesce = 9 hashes + one O(gap) dedup pass; replay = ${M}*9 hashes. NEITHER is per-user or unbounded.`);
console.log(`DONE.`);
