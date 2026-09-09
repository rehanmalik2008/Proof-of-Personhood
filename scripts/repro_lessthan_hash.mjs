// Reproducer + measurement for DISCOVERY-lessthan-hash-soundness.md.
//   node scripts/repro_lessthan_hash.mjs
//
// (A) Compiles circuits/cmp_hash_repro.circom = { lt <== LessThan(252)(a,b) }.
// (B) Shows LessThan(252) producing a satisfying witness that asserts a FALSE
//     comparison when fed a field element >= 2^252.
// (C) Measures, over real Poseidon(1) outputs, the fraction >= 2^252 and >= 2^253.

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
if (!existsSync("circuits/cmp_hash_repro_js/cmp_hash_repro.wasm")) {
  console.log("compiling circuits/cmp_hash_repro.circom ...");
  execFileSync(process.execPath, [
    require.resolve("circom2/cli.js"), "cmp_hash_repro.circom",
    "--r1cs", "--wasm", "--sym", "-o", ".", "-l", "../node_modules/circomlib/circuits",
  ], { cwd: "circuits", stdio: "inherit" });
}

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TWO252 = 1n << 252n;
const TWO253 = 1n << 253n;

const WASM = "circuits/cmp_hash_repro_js/cmp_hash_repro.wasm";
const tdir = mkdtempSync(join(tmpdir(), "lt_"));
let wc = 0;

// Return the circuit's `lt` output for inputs (a,b), or an Error if the witness
// cannot be generated (completeness failure).
async function circuitLt(a, b) {
  try {
    const wtns = join(tdir, `w${wc++}.wtns`);
    await snarkjs.wtns.calculate({ a: a.toString(), b: b.toString() }, WASM, wtns);
    const w = await snarkjs.wtns.exportJson(wtns);
    // witness layout: [1, lt, a, b, ...internal]; index 1 is the single output `lt`
    return BigInt(w[1]);
  } catch (e) {
    return new Error(String(e.message || e).split("\n")[0]);
  }
}

const trueLt = (a, b) => (a < b ? 1n : 0n);

console.log("=== (B) soundness: LessThan(252) on a field element >= 2^252 ===\n");

const cases = [
  // [label, a, b]
  ["honest small   3 < 5", 3n, 5n],
  ["honest small   5 < 3", 5n, 3n],
  ["a = P - 2^252 + 1 , b = 0", P - TWO252 + 1n, 0n],
  ["a = P - 1        , b = 1", P - 1n, 1n],
  ["a = P - 2^251    , b = 7", P - (1n << 251n), 7n],
];

let bug = 0;
for (const [label, a, b] of cases) {
  const got = await circuitLt(a, b);
  const want = trueLt(a, b);
  if (got instanceof Error) {
    console.log(`  ${label}\n      -> witness FAILS (${got.message})  [completeness broken]`);
  } else {
    const verdict = got === want ? "ok" : "*** WRONG ***";
    if (got !== want) bug++;
    console.log(`  ${label}\n      -> circuit lt = ${got}   true (a<b) = ${want}   ${verdict}`);
  }
}

console.log(`\n  ${bug} case(s) where LessThan(252) asserted a false comparison with a satisfying witness.\n`);

console.log("=== (C) fraction of Poseidon outputs that violate the < 2^252 precondition ===\n");
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H1 = (x) => F.toObject(poseidon([F.e(x)]));

const N = 200000;
let ge252 = 0, ge253 = 0;
for (let i = 0; i < N; i++) {
  const h = H1(BigInt(i) * 2654435761n + 12345n);
  if (h >= TWO252) ge252++;
  if (h >= TWO253) ge253++;
}
const exact252 = Number((P - TWO252) * 10000n / P) / 100;
const exact253 = Number((P - TWO253) * 10000n / P) / 100;
console.log(`  sampled ${N.toLocaleString()} Poseidon(1) outputs:`);
console.log(`    >= 2^252 : ${(100 * ge252 / N).toFixed(2)} %   (uniform expectation (P-2^252)/P = ${exact252} %)`);
console.log(`    >= 2^253 : ${(100 * ge253 / N).toFixed(2)} %   (uniform expectation (P-2^253)/P = ${exact253} %)`);
console.log(`\n  => any magnitude comparison on a hash output with circomlib LessThan(<=252)`);
console.log(`     has ~${exact252}% of one operand's range outside the gadget's precondition.`);

rmSync(tdir, { recursive: true, force: true });
process.exit(0);
