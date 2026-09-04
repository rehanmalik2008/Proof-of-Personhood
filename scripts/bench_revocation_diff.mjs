// STEP 3 -- revocation cost as a DIFFERENTIAL against the base, interleaved so
// shared machine noise cancels. Each round: prove base, then prove each R variant,
// back to back. Report per-round (variant - base) deltas; p95 of the deltas.
//   node scripts/bench_revocation_diff.mjs   [ROUNDS=25]

import * as snarkjs from "snarkjs";
import { readFileSync } from "fs";
import os from "os";
import path from "path";

const BASE_CONSTR = 4309;
const ROUNDS = Number(process.env.ROUNDS ?? 25);
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1],
           mean: a.reduce((x, y) => x + y, 0) / a.length };
};
const f = (n) => (n >= 0 ? "+" : "") + n.toFixed(0);

const VARIANTS = [
  ["base",     "wedge_mem_w8_d9",         "input_mem_w8_d9.json",        4309],
  ["R=64",     "wedge_mem_w8_d9_rev64",   "input_mem_w8_d9_rev64.json",  4373],
  ["R=256",    "wedge_mem_w8_d9_rev256",  "input_mem_w8_d9_rev256.json", 4565],
  ["R=1024",   "wedge_mem_w8_d9_rev1024", "input_mem_w8_d9_rev1024.json", 5333],
];

const loaded = VARIANTS.map(([name, base, inp, nc]) => ({
  name, nc,
  input: JSON.parse(readFileSync(`build/${inp}`, "utf8")),
  wasm: `build/${base}.wasm`,
  zkey: `build/${base}_final.zkey`,
  vkey: JSON.parse(readFileSync(`build/${base}_vkey.json`, "utf8")),
  tmp: path.join(os.tmpdir(), `revd_${name}.wtns`),
  flow: [],
}));

async function once(v) {
  const t0 = performance.now();
  await snarkjs.wtns.calculate(v.input, v.wasm, v.tmp);
  const { proof, publicSignals } = await snarkjs.groth16.prove(v.zkey, v.tmp);
  const ok = await snarkjs.groth16.verify(v.vkey, publicSignals, proof);
  if (!ok) throw new Error(`${v.name} verify failed`);
  return performance.now() - t0;
}

console.log(`node ${process.version}  ${os.cpus()[0].model}`);
console.log(`interleaved differential, ${ROUNDS} rounds (1 warm-up dropped). base = ${BASE_CONSTR} constraints.\n`);

for (let r = 0; r < ROUNDS + 1; r++) {
  for (const v of loaded) {
    const dt = await once(v);
    if (r > 0) v.flow.push(dt);
  }
  if (r > 0 && r % 5 === 0) process.stdout.write(`  round ${r}/${ROUNDS}\r`);
}
console.log("                        ");

const base = loaded[0];
const bStat = stat(base.flow);
console.log(`variant   constr   +constr   flow median   flow p95   Δmedian vs base   Δp95 vs base   per-round Δ p95`);
console.log(`-------------------------------------------------------------------------------------------------------`);
for (const v of loaded) {
  const s = stat(v.flow);
  const perRoundDelta = v.flow.map((t, i) => t - base.flow[i]);
  const d = stat(perRoundDelta);
  console.log(
    `${v.name.padEnd(8)} ${String(v.nc).padStart(5)}   ${String(v.nc - BASE_CONSTR).padStart(6)}   ` +
    `${s.median.toFixed(0).padStart(7)} ms   ${s.p95.toFixed(0).padStart(6)} ms   ` +
    `${f(s.median - bStat.median).padStart(9)} ms      ${f(s.p95 - bStat.p95).padStart(7)} ms     ` +
    `${f(d.p95).padStart(6)} ms  (med ${f(d.median)})`);
}

console.log(`\nThe per-round Δ (variant proven immediately after base, same round) is the`);
console.log(`noise-cancelled cost of the non-membership check. Absolute flow numbers on this`);
console.log(`desktop are load-dependent (see README caveat); the Δ is the portable result.`);
