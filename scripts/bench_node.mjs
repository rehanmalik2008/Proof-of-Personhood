// Desktop proving-time benchmark for the merkle-cost ladder (Node + snarkjs).
//   node scripts/bench_node.mjs
//   ITERS=20 node scripts/bench_node.mjs
//
// Same prover core as the browser. The phone numbers are the ones that decide
// GO/NO-GO -- run web/index.html on the device -- but this bracket the ladder.

import * as snarkjs from "snarkjs";
import { readFileSync } from "fs";
import os from "os";
import path from "path";

const ITERS = Number(process.env.ITERS ?? 12);

// [label, artifact, input, k, depth, constraints]
const LADDER = [
  ["Step 0  baseline Wedge3",  "wedge_baseline",    "input_k3.json",        3, "-",  13098],
  ["        ship WedgeFull",    "wedge_ship",        "input_wf_k3_d20.json", 3, 20,  29123],
  ["Merkle  D: depth 20->10",  "wedge_d10_k3",      "input_wf_k3_d10.json", 3, 10,  21833],
  ["Merkle  E: k=2, depth 20", "wedge_d20_k2",      "input_wf_k2_d20.json", 2, 20,  19572],
  ["Merkle  D+E: k=2, d=10",   "wedge_d10_k2",      "input_wf_k2_d10.json", 2, 10,  14712],
  ["Merkle  A/B: accum, k=3",  "wedge_accum_k3",    "input_wf_k3_d1.json",  3, "-",  14803],
  ["Merkle  A/B+E: accum k=2", "wedge_accum_k2",    "input_wf_k2_d1.json",  2, "-",  10091],
  ["Lever C residual k=3",     "wedge_residual_k3", "input_residual_k3.json", 3, "-",   478],
  ["Lever C residual k=2",     "wedge_residual_k2", "input_residual_k2.json", 2, "-",   476],
  ["H  direct  k=1 (private)", "wedge_direct_k1",   "input_direct_k1.json",   1, "-",  4682],
  ["H  direct  k=2 (private)", "wedge_direct_k2",   "input_direct_k2.json",   2, "-",  8890],
  ["H  direct  k=3 (private)", "wedge_direct_k3",   "input_direct_k3.json",   3, "-", 13099],
  ["H  half-agg k=2 (private)","wedge_haggr_k2",    "input_haggr_k2.json",    2, "-", 10525],
  ["H  half-agg k=3 (private)","wedge_haggr_k3",    "input_haggr_k3.json",    3, "-", 16350],
  ["P2 mem w4 d8   (65k)",     "wedge_mem_w4_d8",   "input_mem_w4_d8.json",   "-", 8,   2947],
  ["P2 mem w8 d6   (262k)",    "wedge_mem_w8_d6",   "input_mem_w8_d6.json",   "-", 6,   3031],
  ["P2 mem w8 d9   (134M)",    "wedge_mem_w8_d9",   "input_mem_w8_d9.json",   "-", 9,   4309],
  ["P2 mem bin d16 (65k)",     "wedge_mem_bin_d16", "input_mem_bin_d16.json", "-", 16,  4363],
  ["P2 mem bin d20 (1M)",      "wedge_mem_bin_d20", "input_mem_bin_d20.json", "-", 20,  5335],
  ["P2 mem bin d27 (134M)",    "wedge_mem_bin_d27", "input_mem_bin_d27.json", "-", 27,  7036],
  ["P2 mem w4 d14  (268M)",    "wedge_mem_w4_d14",  "input_mem_w4_d14.json",  "-", 14,  4801],
];

const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95),
           mean: a.reduce((x, y) => x + y, 0) / a.length, max: s[s.length - 1] };
};
const ms = (n) => n.toFixed(0).padStart(5);

console.log(`node ${process.version}   ${os.cpus()[0].model}   (${os.cpus().length} logical CPUs)`);
console.log(`iterations per circuit: ${ITERS}  (1 warm-up discarded)\n`);
console.log(`rung                         k  depth  constr   median   p95   NO-GO?`);
console.log(`-------------------------------------------------------------------`);

const R = {};
for (const [label, base, inp, k, depth, nc] of LADDER) {
  const input = JSON.parse(readFileSync(`build/${inp}`, "utf8"));
  const wasm = `build/${base}.wasm`, zkey = `build/${base}_final.zkey`;
  const tmp = path.join(os.tmpdir(), `wedge_${Math.random().toString(36).slice(2)}.wtns`);
  const tt = [];
  for (let i = 0; i < ITERS + 1; i++) {
    const t0 = performance.now();
    await snarkjs.wtns.calculate(input, wasm, tmp);
    await snarkjs.groth16.prove(zkey, tmp);
    if (i > 0) tt.push(performance.now() - t0);
  }
  const T = stat(tt);
  R[base] = { label, k, depth, nc, T };
  const flag = T.p95 >= 2000 ? `+${((T.p95 - 2000) / 1000).toFixed(2)}s` : "ok";
  console.log(`${label.padEnd(27)} ${String(k)}  ${String(depth).padStart(5)}  ${String(nc).padStart(6)}  ${ms(T.median)}   ${ms(T.p95)}   ${flag}`);
}

console.log(`\n(desktop ${os.cpus()[0].model}, Node multi-thread. A mid-range phone runs`);
console.log(` roughly 2-4x slower single-threaded -- measure with web/index.html.)`);
console.log(`\nladder deltas vs. baseline Wedge3 (${ms(R.wedge_baseline.T.median)} ms median):`);
for (const b of ["wedge_ship", "wedge_d10_k3", "wedge_d20_k2", "wedge_d10_k2", "wedge_accum_k3", "wedge_accum_k2"]) {
  const d = R[b].T.median - R.wedge_baseline.T.median;
  console.log(`  ${R[b].label.trim().padEnd(24)} ${d >= 0 ? "+" : ""}${ms(d)} ms`);
}
process.exit(0);
