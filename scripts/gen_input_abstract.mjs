// Honest inputs for main_abstract_split (Poseidon replaced by the determinism-
// only mock  out = sum_i (i+1)*inputs[i]).  Used by ff_smt_two_witness.mjs
// --concrete and compositional_verify.mjs.
//   node scripts/gen_input_abstract.mjs [N]   ->  build/abstract/point_XX.json
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (x) => ((x % P) + P) % P;
const rnd = () => mod(BigInt("0x" + randomBytes(31).toString("hex")));
const linH = (arr) => { let a = 0n; arr.forEach((x, i) => { a = mod(a + BigInt(i + 1) * mod(BigInt(x))); }); return a; };

const OUT = join("build", "abstract");
mkdirSync(OUT, { recursive: true });
const N = Math.max(Number(process.argv[2] || 6), 1);

const SHAPES = [
  { pathIndex: Array(9).fill(0),                                     sib: "zero" },   // leftmost
  { pathIndex: Array(9).fill(7),                                     sib: "rand" },   // rightmost
  { pathIndex: Array.from({ length: 9 }, (_, i) => 1 + (i % 7)),     sib: "alt"  },   // max-depth
  { pathIndex: Array.from({ length: 9 }, (_, i) => i % 8),           sib: "rand" },   // ascending
  { pathIndex: Array.from({ length: 9 }, (_, i) => (i % 2 ? 7 : 0)), sib: "zero" },   // alternating
  { pathIndex: Array.from({ length: 9 }, () => randomBytes(1)[0] % 8), sib: "rand" }, // random
];

for (let k = 0; k < N; k++) {
  const sh = SHAPES[k % SHAPES.length];
  const s = rnd(), ctx = rnd(), ea = rnd(), et = rnd(), sgh = rnd();
  const C = linH([s]);
  let cur = C;
  const node = [];
  for (let i = 0; i < 9; i++) {
    const grp = [];
    for (let j = 0; j < 8; j++) {
      if (j === sh.pathIndex[i]) grp.push(cur);
      else grp.push(sh.sib === "zero" ? 0n : sh.sib === "rand" ? rnd() : (BigInt(i + j) % 2n ? P - 1n : 1n));
    }
    node.push(grp.map(String));
    cur = linH(grp);
  }
  const obj = {
    s: s.toString(), ctx: ctx.toString(), epochAction: ea.toString(),
    epochTree: et.toString(), signalHash: sgh.toString(),
    root: cur.toString(), node, pathIndex: sh.pathIndex.map(String),
  };
  const id = String(k).padStart(2, "0");
  writeFileSync(join(OUT, `point_${id}.json`), JSON.stringify(obj, null, 2));
}
console.log(`wrote ${N} abstract-consistent inputs to ${OUT}/`);
