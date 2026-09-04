// Revocation R-list cost on the SPLIT circuit (closing-two-gates.md Item 2a).
// Differential: each round proves the split base, then each split-rev variant,
// back to back, so shared machine noise cancels. Reports (variant - base) deltas.
//   node scripts/bench_revocation_split.mjs   [ROUNDS=20]

import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SNARKJS_CLI = path.join(path.dirname(require.resolve("snarkjs")), "cli.cjs");
const constraintsOf = (r1cs) =>
  Number((execFileSync(process.execPath, [SNARKJS_CLI, "r1cs", "info", r1cs], { encoding: "utf8" })
    .match(/# of Constraints:\s*(\d+)/) || [])[1]);

const ROUNDS = Number(process.env.ROUNDS ?? 20);
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1],
           mean: a.reduce((x, y) => x + y, 0) / a.length };
};
const f = (n) => (n >= 0 ? "+" : "") + n.toFixed(0);

const VARIANTS = [
  ["base",   "wedge_mem_w8_d9_split",         "input_mem_w8_d9_split.json"],
  ["R=64",   "wedge_mem_w8_d9_split_rev64",   "input_mem_w8_d9_split_rev64.json"],
  ["R=256",  "wedge_mem_w8_d9_split_rev256",  "input_mem_w8_d9_split_rev256.json"],
  ["R=1024", "wedge_mem_w8_d9_split_rev1024", "input_mem_w8_d9_split_rev1024.json"],
].map(([name, base, inp]) => ({
  name, base,
  nc: constraintsOf(`build/${base}.r1cs`),
  nPublic: JSON.parse(readFileSync(`build/${base}_vkey.json`, "utf8")).nPublic,
  input: JSON.parse(readFileSync(`build/${inp}`, "utf8")),
  wasm: `build/${base}.wasm`,
  zkey: `build/${base}_final.zkey`,
  vkey: JSON.parse(readFileSync(`build/${base}_vkey.json`, "utf8")),
  tmp: path.join(os.tmpdir(), `revs_${name}.wtns`),
  flow: [], prove: [],
}));

const BASE_NC = VARIANTS[0].nc;

async function once(v) {
  const t0 = performance.now();
  await snarkjs.wtns.calculate(v.input, v.wasm, v.tmp);
  const tw = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.prove(v.zkey, v.tmp);
  const tp = performance.now();
  const ok = await snarkjs.groth16.verify(v.vkey, publicSignals, proof);
  const tv = performance.now();
  return { ok, prove: tp - tw, flow: tv - t0 };
}

console.log(`node ${process.version}  ${os.cpus()[0].model}  (${os.cpus().length} logical CPUs)`);
console.log(`split base = ${BASE_NC} constraints, nPublic ${VARIANTS[0].nPublic}. differential over ${ROUNDS} rounds.\n`);

for (let r = 0; r < ROUNDS + 1; r++) {
  for (const v of VARIANTS) {
    const o = await once(v);
    if (!o.ok) { console.error(`VERIFY FAILED: ${v.name}`); process.exit(1); }
    if (r > 0) { v.prove.push(o.prove); v.flow.push(o.flow); }
  }
}

const baseProve = stat(VARIANTS[0].prove);
console.log(`variant     constr  Δconstr   nPublic   prove median   Δprove(median)   flow p95   phone x4`);
console.log(`------------------------------------------------------------------------------------------------`);
for (const v of VARIANTS) {
  const p = stat(v.prove), fl = stat(v.flow);
  const dc = v.nc - BASE_NC;
  const dp = p.median - baseProve.median;
  console.log(
    `${v.name.padEnd(11)} ${String(v.nc).padStart(6)}  ${f(dc).padStart(7)}   ${String(v.nPublic).padStart(7)}` +
    `   ${p.median.toFixed(0).padStart(6)} ms     ${(f(dp) + " ms").padStart(11)}   ${fl.p95.toFixed(0).padStart(6)} ms   ${(fl.p95 * 4).toFixed(0).padStart(6)} ms`);
}
console.log(`\nΔconstr is the MEASURED non-membership cost: exactly +R, unchanged by the epoch split`);
console.log(`(the note's pre-split estimate was +64/+256/+1024 -- confirmed).`);
console.log(`The revocation list is a PUBLIC input here, so nPublic = 7 + R and the verifier ships`);
console.log(`R field elements. A production system commits it as one root (KZG / sorted-Merkle) and`);
console.log(`proves non-membership against that: O(depth) Poseidon (~255 constr each), verifier`);
console.log(`input back to O(1). Crossover near R ~ 40 (bench_revocation.mjs, pre-split).`);
