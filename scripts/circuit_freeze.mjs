// ===========================================================================
// Circuit freeze v1.2  (the request: "Freeze circuit v1.2")
//
//   node scripts/circuit_freeze.mjs            # print the table + lock cross-check
//   node scripts/circuit_freeze.mjs --write    # (re)generate CIRCUIT-FREEZE.md
//
// Records, for the deployed circuit set: the entrypoint .circom SHA-256, the
// transitive-include source-tree SHA-256 (same function as
// scripts/repro_build.mjs), the R1CS SHA-256, the prover WASM SHA-256, and the
// exact constraint / wire / public-signal counts read from the .r1cs header.
//
// The reproducible subset (everything in supply-chain/artifacts.lock.json) is
// cross-checked against the lock: the freeze is only valid if every one MATCHes.
// These R1CS hashes are the trusted-setup ceremony's target; any post-freeze
// change to a circuit invalidates the freeze for that circuit and requires a
// fresh ceremony (docs/CEREMONY-RUNBOOK.md).
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readR1CS } from "./two_witness_search.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const LOCK = JSON.parse(readFileSync(join(ROOT, "supply-chain", "artifacts.lock.json"), "utf8"));

const sha256File = (p) => existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null;

// BYTE-IDENTICAL to repro_build.mjs hashSourceTree, run from ROOT: entrypoint +
// every transitively included LOCAL circom file, `--- <repo-relative path> ---`
// separators (forward slashes, no leading slash).
function hashSourceTree(entryRel) {
  const seen = new Set();
  const h = createHash("sha256");
  const walk = (file) => {                       // `file` is repo-relative, e.g. "circuits/x.circom"
    const abs = join(ROOT, file);
    const norm = resolve(abs);
    if (seen.has(norm) || !existsSync(abs)) return;
    seen.add(norm);
    const src = readFileSync(abs, "utf8");
    h.update(`\n--- ${file.replace(/\\/g, "/")} ---\n`);
    h.update(src);
    for (const m of src.matchAll(/include\s+"([^"]+)"/g)) {
      const local = join("circuits", m[1]);
      if (existsSync(join(ROOT, local))) walk(local);
    }
  };
  walk(entryRel);
  return h.digest("hex");
}

// The deployed circuit set for v1.2. `lock` = key in artifacts.lock.json, if any.
const SET = [
  { name: "wedge_mem_w8_d9_split",        src: "main_mem_w8_d9_split",        lock: "wedge_mem_w8_d9_split",        role: "Phase-2 login — headline (v1.1+), split epoch", tier: "production" },
  { name: "wedge_mem_w8_d9_split_rev64",  src: "main_mem_w8_d9_split_rev64",  lock: "wedge_mem_w8_d9_split_rev64",  role: "Phase-2 login + individual revocation, R=64 (Gate 6)", tier: "production" },
  { name: "wedge_mem_w8_d9_split_rev256", src: "main_mem_w8_d9_split_rev256", lock: null, role: "Phase-2 login + individual revocation, R=256", tier: "production" },
  { name: "wedge_mem_w8_d9_split_rev1024",src: "main_mem_w8_d9_split_rev1024",lock: null, role: "Phase-2 login + individual revocation, R=1024", tier: "production" },
  { name: "wedge_direct_k3",              src: "main_wedge_direct_k3",        lock: null, role: "Phase-1 enrolment, k=3 (one-time, off the hot path)", tier: "production" },
  { name: "wedge_mem_w8_d9",              src: "main_mem_w8_d9",              lock: "wedge_mem_w8_d9",              role: "Phase-2 login, pre-split (v1.0) — benchmarked, legacy", tier: "legacy" },
  { name: "wedge_mem_w4_d8",              src: "main_mem_w4_d8",              lock: "wedge_mem_w4_d8",              role: "arity-4 depth-8 variant (65,536 users)", tier: "variant" },
  { name: "wedge_mem_bin_d16",           src: "main_mem_bin_d16",            lock: "wedge_mem_bin_d16",           role: "binary depth-16 — guaranteed-sound backstop", tier: "backstop" },
];

const rows = [];
let lockChecked = 0, lockOk = 0, missing = 0;

for (const c of SET) {
  const srcPath = join(ROOT, "circuits", `${c.src}.circom`);
  const r1csPath = join(ROOT, "build", `${c.name}.r1cs`);
  const wasmPath = join(ROOT, "build", `${c.name}.wasm`);
  const row = { ...c, present: existsSync(srcPath) && existsSync(r1csPath) };
  if (!existsSync(srcPath)) { row.error = "no .circom"; rows.push(row); missing++; continue; }
  if (!existsSync(r1csPath)) { row.error = "no build/*.r1cs — run `npm run build`"; rows.push(row); missing++; continue; }

  row.circom_sha256 = sha256File(srcPath);
  row.circom_src_tree_sha256 = hashSourceTree(`circuits/${c.src}.circom`);
  row.r1cs_sha256 = sha256File(r1csPath);
  row.wasm_sha256 = sha256File(wasmPath);

  const r = readR1CS(r1csPath);
  row.constraints = r.nConstraints;
  row.wires = r.nWires;
  row.nPubOut = r.nPubOut; row.nPubIn = r.nPubIn; row.nPrvIn = r.nPrvIn;
  row.nPublic = r.nPubOut + r.nPubIn;

  if (c.lock && LOCK.circuits[c.lock]) {
    lockChecked++;
    const L = LOCK.circuits[c.lock].sha256;
    row.lock_r1cs_match = L.r1cs === row.r1cs_sha256;
    row.lock_src_tree_match = L.circom_src_tree === row.circom_src_tree_sha256;
    row.lock_wasm_match = L.wasm_prover === row.wasm_sha256;
    if (row.lock_r1cs_match && row.lock_src_tree_match && row.lock_wasm_match) lockOk++;
  }
  rows.push(row);
}

// ---- console report ----------------------------------------------------
console.log(`\n=== CIRCUIT FREEZE v1.2 ===  toolchain: circom2 ${LOCK.toolchain.circom2}, circomlib ${LOCK.toolchain.circomlib}, node ${LOCK.toolchain.node}\n`);
for (const r of rows) {
  console.log(`${r.name}`);
  console.log(`  ${r.role}  [${r.tier}]`);
  if (r.error) { console.log(`  !! ${r.error}\n`); continue; }
  console.log(`  constraints ${r.constraints}   wires ${r.wires}   public ${r.nPublic} (out ${r.nPubOut} + in ${r.nPubIn}), private in ${r.nPrvIn}`);
  console.log(`  circom            ${r.circom_sha256}`);
  console.log(`  circom_src_tree   ${r.circom_src_tree_sha256}`);
  console.log(`  r1cs              ${r.r1cs_sha256}`);
  console.log(`  wasm_prover       ${r.wasm_sha256}`);
  if (r.lock) {
    const t = (b) => b ? "match" : "**MISMATCH**";
    console.log(`  vs artifacts.lock.json[${r.lock}]:  r1cs ${t(r.lock_r1cs_match)} | src_tree ${t(r.lock_src_tree_match)} | wasm ${t(r.lock_wasm_match)}`);
  } else {
    console.log(`  (not in artifacts.lock.json — see note in CIRCUIT-FREEZE.md)`);
  }
  console.log();
}
console.log(`lock cross-check: ${lockOk}/${lockChecked} circuits match artifacts.lock.json exactly` + (missing ? `; ${missing} circuit(s) missing artifacts` : ""));
const FREEZE_VALID = lockChecked > 0 && lockOk === lockChecked && missing === 0;
console.log(FREEZE_VALID ? "FREEZE VALID — every locked circuit matches, every listed artifact present." : "FREEZE NOT VALID — resolve mismatches / missing artifacts before tagging.");

// ---- write CIRCUIT-FREEZE.md -----------------------------------------
if (WRITE) {
  const now = new Date().toISOString().slice(0, 10);
  const L = [];
  L.push(`# Circuit freeze — v1.2`, "");
  L.push(`**Status:** ${FREEZE_VALID ? "VALID" : "NOT VALID (see cross-check below)"}.  Frozen ${now}.`, "");
  L.push(`The deployed circuit set has been stable for four rounds of work (rounds`);
  L.push(`5&ndash;8 were analysis &mdash; two-witness search, multi-point probing, taint`);
  L.push(`proof, compositional and finite-field-SMT verification, and the structural`);
  L.push(`forward-determination proof &mdash; not circuit modification). A freeze is`);
  L.push(`therefore defensible now.`, "");
  L.push(`**These R1CS hashes are the trusted-setup ceremony's target.** Any post-freeze`);
  L.push(`change to a circuit &mdash; source, included template, or toolchain version`);
  L.push(`&mdash; changes its \`r1cs\` hash, **invalidates this freeze for that circuit,**`);
  L.push(`and requires a fresh ceremony for it (\`docs/CEREMONY-RUNBOOK.md\`). Ceremony`);
  L.push(`keys produced against a stale hash must not be used.`, "");
  L.push(`This freeze does **not** close any gate. Gate 5 stays Open until the ceremony`);
  L.push(`runs with genuinely independent contributors; the shipped keys remain`);
  L.push(`evaluation-only until then. Gate 1 stays Open until independent review.`, "");
  L.push(`## Toolchain (pinned)`, "");
  L.push("```");
  L.push(`node       ${LOCK.toolchain.node}`);
  L.push(`circom2    ${LOCK.toolchain.circom2}   (circom ${"2.x compiled to WASM"})`);
  L.push(`circomlib  ${LOCK.toolchain.circomlib}`);
  L.push(`snarkjs    ${LOCK.toolchain.snarkjs}`);
  L.push(`ptau       ${LOCK.ptau.path}  sha256 ${LOCK.ptau.sha256}`);
  L.push("```", "");
  L.push(`A different toolchain version can produce a different R1CS from the same`);
  L.push(`source. The freeze is defined by the hashes below **and** this toolchain.`, "");
  L.push(`## Frozen circuits`, "");
  L.push(`\`circom_src_tree\` = SHA-256 of the entrypoint \`.circom\` plus every local`);
  L.push(`file it transitively \`include\`s (circomlib is pinned by the toolchain line,`);
  L.push(`not re-hashed). \`r1cs\` / \`wasm\` = SHA-256 of the compiled artifact in`);
  L.push(`\`build/\`. Counts are read from the \`.r1cs\` header.`, "");
  for (const r of rows) {
    L.push(`### \`${r.name}\` &mdash; ${r.role}`, "");
    if (r.error) { L.push(`> **artifact missing:** ${r.error}`, ""); continue; }
    L.push(`| field | value |`);
    L.push(`|---|---|`);
    L.push(`| tier | ${r.tier} |`);
    L.push(`| entrypoint | \`circuits/${r.src}.circom\` |`);
    L.push(`| constraints | **${r.constraints.toLocaleString()}** |`);
    L.push(`| wires | ${r.wires.toLocaleString()} |`);
    L.push(`| public signals | ${r.nPublic} (outputs ${r.nPubOut}, inputs ${r.nPubIn}) |`);
    L.push(`| private inputs | ${r.nPrvIn} |`);
    L.push(`| \`circom\` sha256 | \`${r.circom_sha256}\` |`);
    L.push(`| \`circom_src_tree\` sha256 | \`${r.circom_src_tree_sha256}\` |`);
    L.push(`| \`r1cs\` sha256 (**ceremony target**) | \`${r.r1cs_sha256}\` |`);
    L.push(`| \`wasm\` prover sha256 | \`${r.wasm_sha256}\` |`);
    if (r.lock) {
      const t = (b) => b ? "&#x2713; match" : "&#x2717; **MISMATCH**";
      L.push(`| vs \`artifacts.lock.json[${r.lock}]\` | r1cs ${t(r.lock_r1cs_match)} &nbsp; src_tree ${t(r.lock_src_tree_match)} &nbsp; wasm ${t(r.lock_wasm_match)} |`);
    } else {
      L.push(`| \`artifacts.lock.json\` | not present &mdash; see note |`);
    }
    L.push("");
  }
  L.push(`## Cross-check with \`supply-chain/artifacts.lock.json\``, "");
  L.push(`${lockOk} / ${lockChecked} circuits present in the reproducible-build lock`);
  L.push(`match it **exactly** (r1cs, source tree, and prover wasm).`, "");
  L.push(`Not in the lock: \`wedge_mem_w8_d9_split_rev256\`, \`wedge_mem_w8_d9_split_rev1024\`,`);
  L.push(`\`wedge_direct_k3\`. These are deployed-scope per \`docs/SELF-AUDIT.md\` &sect;1 but`);
  L.push(`were outside the original reproducible-build manifest. Their hashes are recorded`);
  L.push(`above from the current \`build/\` artifacts; **before any of them is used in`);
  L.push(`production, add it to \`artifacts.lock.json\` (via \`scripts/repro_build.mjs`);
  L.push(`--update\`), re-verify a clean double build, and reissue this freeze.**`, "");
  L.push(`## Applying the tag`, "");
  L.push(`The freeze is the set of hashes above. To mark it in git, tag the commit`);
  L.push(`that contains this file and the \`circuits/\` sources it hashes:`, "");
  L.push("```bash");
  L.push(`git tag -a v1.2-frozen -m "Circuit freeze v1.2 - ceremony target (CIRCUIT-FREEZE.md)"`);
  L.push("```", "");
  L.push(`The ceremony (\`docs/CEREMONY-RUNBOOK.md\`) is run against the artifacts at`);
  L.push(`this tag. If \`git describe\` at ceremony time does not resolve to`);
  L.push(`\`v1.2-frozen\` (clean, no local changes to \`circuits/\`), stop.`, "");
  L.push(`## Regenerating / verifying this file`, "");
  L.push("```bash");
  L.push(`node scripts/repro_build.mjs --double     # two clean builds are byte-identical`);
  L.push(`node scripts/circuit_freeze.mjs           # prints the table + lock cross-check`);
  L.push(`node scripts/circuit_freeze.mjs --write   # regenerates this file`);
  L.push("```", "");
  L.push(`A verifier re-runs the double build, then confirms every \`r1cs\` sha256 here`);
  L.push(`matches \`build/<name>.r1cs\`, and that the \`circom_src_tree\` hashes match the`);
  L.push(`\`circuits/\` sources at the tagged commit.`, "");
  writeFileSync(join(ROOT, "CIRCUIT-FREEZE.md"), L.join("\n") + "\n");
  console.log(`\nwrote ${join(ROOT, "CIRCUIT-FREEZE.md")}`);
}

process.exit(FREEZE_VALID ? 0 : 1);
