// Regenerates Appendix A of the paper: a real Groth16 proof over the published
// artefacts, its verification, a tampered-input negative control, and the
// artefact hashes. Run from the repository root:  node paper/mkproof.mjs
import * as snarkjs from "snarkjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (f) => join(ROOT, f);
const sha = (f) => createHash("sha256").update(readFileSync(p(f))).digest("hex");
const size = (f) => readFileSync(p(f)).length;

// split-epoch Phase-2 circuit (splitting-the-epochs.md). 4,309 constraints,
// nPublic 7: [ N, y, root, ctx, epochAction, epochTree, signalHash ].
const ART = [
  "build/wedge_mem_w8_d9_split.r1cs",
  "web/wedge_mem_w8_d9_split.wasm",
  "web/wedge_mem_w8_d9_split_final.zkey",
  "web/wedge_mem_w8_d9_split_vkey.json",
];

console.log("ARTEFACTS");
const artefacts = ART.map((f) => {
  const row = { file: f, bytes: size(f), sha256: sha(f) };
  console.log(`  ${row.sha256}  ${String(row.bytes).padStart(9)}  ${f}`);
  return row;
});

const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  JSON.parse(readFileSync(p("web/input_mem_w8_d9_split.json"), "utf8")),
  p("web/wedge_mem_w8_d9_split.wasm"),
  p("web/wedge_mem_w8_d9_split_final.zkey"),
);
const proveMs = Date.now() - t0;

const vkey = JSON.parse(readFileSync(p("web/wedge_mem_w8_d9_split_vkey.json"), "utf8"));
const t1 = Date.now();
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
const verifyMs = Date.now() - t1;

// negative control: perturb one public signal, re-verify the same proof
const tampered = [...publicSignals];
tampered[0] = (BigInt(tampered[0]) + 1n).toString();
const okTampered = await snarkjs.groth16.verify(vkey, tampered, proof);

console.log("\nPROOF");
console.log("  pi_a =", JSON.stringify(proof.pi_a));
console.log("  pi_b =", JSON.stringify(proof.pi_b));
console.log("  pi_c =", JSON.stringify(proof.pi_c));
console.log("  protocol =", proof.protocol, " curve =", proof.curve);

const NAMES = ["N (nullifier, output)", "y (RLN share, output)", "root (input)",
               "ctx (input)", "epochAction (input)", "epochTree (input)", "signalHash (input)"];
console.log("\nPUBLIC SIGNALS  (vkey nPublic =", vkey.nPublic + ")");
publicSignals.forEach((v, i) => console.log(`  [${i}] ${NAMES[i]}\n      ${v}`));

console.log("\nTRANSCRIPT");
console.log(`  VERIFY: ${ok}   TAMPERED: ${okTampered}   nPublic: ${publicSignals.length}` +
            `   proveMs: ${proveMs}   verifyMs: ${verifyMs}`);
if (!ok || okTampered || publicSignals.length !== 7) {
  console.error("\nFAILED: expected VERIFY true, TAMPERED false, nPublic 7");
  process.exit(1);
}
console.log("\nOK — proof verifies, tampered input rejected, exactly 7 public signals.");

writeFileSync(p("paper/_proof.json"), JSON.stringify(
  { artefacts, proof, publicSignals, verify: ok, verifyTamperedPublic: okTampered, proveMs, verifyMs },
  null, 1) + "\n");
