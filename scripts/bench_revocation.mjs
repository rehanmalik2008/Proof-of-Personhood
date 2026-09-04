// STEP 3 -- attester-level revocation, measured against the 4,309-constraint budget.
//   node scripts/bench_revocation.mjs
//
// For R in {64,256,1024}: added constraints on top of Phase-2 (4,309), and the
// new full-flow p95 (WASM witness -> Groth16 prove -> Groth16 verify), 20 runs.
// Phone projection x2 (mid-range) / x4 (low-end). Gate: does it push projected
// low-end-phone p95 over ~2 s?

import * as snarkjs from "snarkjs";
import { readFileSync } from "fs";
import os from "os";
import path from "path";

const BASE_CONSTR = 4309;          // Phase-2 login, wedge_mem_w8_d9 (measured)
const ITERS = Number(process.env.ITERS ?? 20);
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1] };
};
const ms = (n) => n.toFixed(0).padStart(5);

const ROWS = [
  ["Phase-2 base (reference)", "wedge_mem_w8_d9",        "input_mem_w8_d9.json"],
  ["+ non-membership R=64",    "wedge_mem_w8_d9_rev64",  "input_mem_w8_d9_rev64.json"],
  ["+ non-membership R=256",   "wedge_mem_w8_d9_rev256", "input_mem_w8_d9_rev256.json"],
  ["+ non-membership R=1024",  "wedge_mem_w8_d9_rev1024","input_mem_w8_d9_rev1024.json"],
];

console.log(`node ${process.version}  ${os.cpus()[0].model}  (${os.cpus().length} logical CPUs)`);
console.log(`base Phase-2 = ${BASE_CONSTR} constraints. p95 over ${ITERS} runs.\n`);
console.log(`variant                     constr   +vs base   flow median   flow p95   phone x2 / x4   gate(<2s x4)`);
console.log(`---------------------------------------------------------------------------------------------------`);

async function constraints(r1cs) {
  // snarkjs r1cs info prints to console; read the count via the API
  const info = await snarkjs.r1cs.info(r1cs);
  return info.nConstraints ?? info.nConstrains ?? null;
}

for (const [label, base, inp] of ROWS) {
  const input = JSON.parse(readFileSync(`build/${inp}`, "utf8"));
  const wasm = `build/${base}.wasm`, zkey = `build/${base}_final.zkey`;
  const vkey = JSON.parse(readFileSync(`build/${base}_vkey.json`, "utf8"));
  const tmp = path.join(os.tmpdir(), `rev_${Math.random().toString(36).slice(2)}.wtns`);

  let nc = null;
  try { nc = await constraints(`build/${base}.r1cs`); } catch {}

  const flow = [];
  let okVerify = true;
  for (let i = 0; i < ITERS + 1; i++) {
    const t0 = performance.now();
    await snarkjs.wtns.calculate(input, wasm, tmp);
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, tmp);
    const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    const dt = performance.now() - t0;
    if (i === 0) { okVerify = ok; }          // warm-up, also sanity-check verify
    else flow.push(dt);
  }
  const s = stat(flow);
  const delta = nc != null ? nc - BASE_CONSTR : null;
  const x4 = s.p95 * 4;
  const gate = x4 < 2000 ? "PASS" : `OVER by ${((x4 - 2000) / 1000).toFixed(2)}s`;
  console.log(
    `${label.padEnd(27)} ${String(nc ?? "?").padStart(6)}   ${String(delta === null ? "?" : (delta >= 0 ? "+" + delta : delta)).padStart(8)}` +
    `   ${ms(s.median)} ms     ${ms(s.p95)} ms   ${ms(s.p95 * 2)} / ${ms(x4)} ms   ${gate}` +
    (okVerify ? "" : "   [VERIFY FAILED]"));
}

console.log(`\nNote: 'flow' = wtns.calculate + groth16.prove + groth16.verify, Node multi-thread,`);
console.log(`this desktop. A low-end single-weak-core phone runs ~2-4x slower -- x4 is the`);
console.log(`conservative projection. The revocation list is PUBLIC input here (verifier ships R`);
console.log(`field elements); a production system commits it as one root and proves non-membership`);
console.log(`against that (O(depth) hashes ~255 constr each, crossover near R~40).`);
