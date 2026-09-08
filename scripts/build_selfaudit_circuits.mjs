// ===========================================================================
// Compile the auxiliary circuits used by the after-the-oracle self-audit tools
//   (after-the-oracle.md, Tasks 4 and 5)
//
//   node scripts/build_selfaudit_circuits.mjs
//
// These are NOT deployed and get no Groth16 setup. They exist only so the
// self-audit scripts have r1cs/wasm/sym to work on:
//
//   poseidon_only_k3, poseidon_only_k8   -- Layer A of compositional_verify.mjs
//   main_abstract_split                  -- Layer B of compositional_verify.mjs
//                                          (Poseidon -> determinism-only mock)
//   poseidon_rln, poseidon_rln_freed     -- the Picus upstream reproducer
//
// Artifacts land in circuits/ (git-ignored, like every other compiled circuit).
// circom2's WASI filesystem is fragile with nested paths, so we compile from
// inside circuits/ with bare names and -o . -- same shape as scripts/build.mjs.
// ===========================================================================

import { execFileSync } from "node:child_process";
import { rmSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const CIRCOM2 = require.resolve("circom2/cli.js");
const CIRC = join(ROOT, "circuits");

const JOBS = [
  { src: "poseidon_only_k3",     libs: ["-l", ".", "-l", "../node_modules/circomlib/circuits"] },
  { src: "poseidon_only_k8",     libs: ["-l", ".", "-l", "../node_modules/circomlib/circuits"] },
  { src: "poseidon_rln",         libs: ["-l", ".", "-l", "../node_modules/circomlib/circuits"] },
  { src: "poseidon_rln_freed",   libs: ["-l", ".", "-l", "../node_modules/circomlib/circuits"] },
  // abstract/poseidon.circom must SHADOW circomlib on the include path
  { src: "main_abstract_split",  libs: ["-l", "./abstract", "-l", ".", "-l", "../node_modules/circomlib/circuits"] },
  // residual projection (Poseidon -> mock): --O0 so every signal is an explicit
  // wire, for the symbolic FF-SMT two-witness query (ff_smt_two_witness.mjs)
  { src: "residual_abstract",       libs: ["-l", "./abstract", "-l", ".", "-l", "../node_modules/circomlib/circuits"], opt: "O0" },
  { src: "residual_abstract_freed",  libs: ["-l", "./abstract", "-l", ".", "-l", "../node_modules/circomlib/circuits"], opt: "O0" }, // positive control for ff_smt
];

// small honest input for the Picus reproducer's two-witness check
writeFileSync(join(CIRC, "prln_in.json"),
  JSON.stringify({ s: "7", ctx: "11", epoch: "3", signalHash: "5" }));

for (const j of JOBS) {
  if (!existsSync(join(CIRC, `${j.src}.circom`))) { console.log(`skip ${j.src} (no source)`); continue; }
  // clear stale artifacts that make circom2-WASI abort silently
  rmSync(join(CIRC, `${j.src}.r1cs`), { force: true });
  rmSync(join(CIRC, `${j.src}.sym`), { force: true });
  rmSync(join(CIRC, `${j.src}_js`), { recursive: true, force: true });
  console.log(`== compiling ${j.src} (--${j.opt || "O2"}) ==`);
  execFileSync(process.execPath,
    [CIRCOM2, `${j.src}.circom`, "--r1cs", "--wasm", "--sym", `--${j.opt || "O2"}`, "-o", ".", ...j.libs],
    { cwd: CIRC, stdio: ["ignore", "inherit", "inherit"] });
}
console.log("\nself-audit circuits compiled into circuits/ (git-ignored).");
console.log("then: node scripts/compositional_verify.mjs --picus  |  node scripts/two_witness_multipoint.mjs  |  node scripts/ff_smt_two_witness.mjs circuits/residual_abstract.r1cs");
