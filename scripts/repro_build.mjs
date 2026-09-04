// Reproducible-build pipeline for the deployed prover circuits.
//   node scripts/repro_build.mjs --verify      (default) build + check every hash against supply-chain/artifacts.lock.json
//   node scripts/repro_build.mjs --update      build + (re)write the lock file
//   node scripts/repro_build.mjs --double      build TWICE and assert byte-identical output (determinism proof)
//
// What this proves, and what it cannot:
//
//   .circom  source        -> hashed (with its include graph)         REPRODUCIBLE (it's the input)
//   circom2 compile         -> .r1cs  + .wasm                          REPRODUCIBLE, byte-identical  [the "binary == audited circuit" claim]
//   groth16 setup(r1cs,ptau)-> _0.zkey (pre-contribution)              REPRODUCIBLE, byte-identical
//   zkey contribute (x N)  -> _final.zkey                              NOT reproducible (ceremony entropy) -- VERIFIED instead (see TRUSTED-SETUP.md)
//   zkey export vkey       -> _vkey.json                               REPRODUCIBLE given a fixed _final.zkey
//
// The ptau is a pinned INPUT with documented provenance (supply-chain/TRUSTED-SETUP.md),
// not something this script regenerates -- powers-of-tau is itself a ceremony.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const require = createRequire(import.meta.url);
const NODE = process.execPath;
const CIRCOM2 = require.resolve("circom2/cli.js");
const SNARKJS = join(dirname(require.resolve("snarkjs")), "cli.cjs");

const MODE = process.argv.includes("--update") ? "update"
  : process.argv.includes("--double") ? "double" : "verify";
const PTAU = process.env.PTAU || "build/pot15_final.ptau";
const OUT = "build-repro";
const LOCK = "supply-chain/artifacts.lock.json";

// ---- the deployed prover surface: what actually ships to a device / an RP ----
const CIRCUITS = [
  { name: "wedge_mem_w8_d9_split", src: "main_mem_w8_d9_split", note: "arity-8 depth-9, 4,309 constraints, split epoch (epoch_action + epoch_tree) -- the headline Phase-2 login circuit from v1.1" },
  { name: "wedge_mem_w8_d9_split_rev64", src: "main_mem_w8_d9_split_rev64", note: "split circuit + in-circuit non-membership against a 64-entry revocation list (+64 constraints, measured); Gate 6, individual revocation" },
  { name: "wedge_mem_w8_d9",   src: "main_mem_w8_d9",   note: "arity-8 depth-9, 4,309 constraints -- pre-split (v1.0); the benchmark measurements were taken on this" },
  { name: "wedge_mem_w4_d8",   src: "main_mem_w4_d8",   note: "arity-4 depth-8, 65,536-user variant" },
  { name: "wedge_mem_bin_d16", src: "main_mem_bin_d16", note: "binary depth-16, guaranteed-sound backstop" },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sha256File = (p) => sha256(readFileSync(p));

// ---- 1. pinned toolchain: fail loudly on any drift ----
function pkgVersion(name) {
  return JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8")).version;
}
const TOOLCHAIN = {
  node: process.version.replace(/^v/, ""),
  circom2: pkgVersion("circom2"),
  circomlib: pkgVersion("circomlib"),
  snarkjs: pkgVersion("snarkjs"),
};
const EXPECT = {
  node: JSON.parse(readFileSync("package.json", "utf8")).engines?.node,
  circom2: "0.2.23", circomlib: "2.0.5", snarkjs: "0.7.6",
};
let toolchainOk = true;
for (const k of Object.keys(EXPECT)) {
  const got = TOOLCHAIN[k], want = EXPECT[k];
  const ok = !want || got === want;
  if (!ok) toolchainOk = false;
  console.log(`  toolchain ${k.padEnd(10)} ${got}${ok ? "" : `   !=  expected ${want}`}`);
}
if (!toolchainOk) {
  console.error("\nTOOLCHAIN MISMATCH -- reproducibility is only defined for the pinned versions. Aborting.");
  process.exit(2);
}
console.log();

// ---- 2. compile + setup into OUT/ ----
function buildOnce(destSuffix = "") {
  const dest = OUT + destSuffix;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // circom2's WASI fs is fragile with nested paths -> compile from circuits/ with bare names
  for (const d of readdirSync("circuits")) {
    if (d.endsWith("_js")) rmSync(join("circuits", d), { recursive: true, force: true });
    if (d.endsWith(".r1cs") || d.endsWith(".sym")) rmSync(join("circuits", d), { force: true });
  }
  const artifacts = {};
  for (const c of CIRCUITS) {
    execFileSync(NODE, [CIRCOM2, `${c.src}.circom`, "--r1cs", "--wasm", "--O2",
      "-o", ".", "-l", ".", "-l", "../node_modules/circomlib/circuits"],
      { cwd: join(ROOT, "circuits"), stdio: ["ignore", "ignore", "inherit"] });
    const r1cs = join("circuits", `${c.src}.r1cs`);
    const wasm = join("circuits", `${c.src}_js`, `${c.src}.wasm`);
    const z0 = join(dest, `${c.name}_0.zkey`);
    execFileSync(NODE, [SNARKJS, "groth16", "setup", r1cs, PTAU, z0], { stdio: ["ignore", "ignore", "inherit"] });
    artifacts[c.name] = {
      note: c.note,
      circom_src: `circuits/${c.src}.circom`,
      sha256: {
        circom_src_tree: hashSourceTree(`circuits/${c.src}.circom`),
        r1cs: sha256File(r1cs),
        wasm_prover: sha256File(wasm),
        zkey_0_pre_ceremony: sha256File(z0),
      },
      bytes: { r1cs: statSync(r1cs).size, wasm: statSync(wasm).size, zkey_0: statSync(z0).size },
    };
    // stage r1cs/wasm into dest for inspection
    copyFileSync(r1cs, join(dest, `${c.name}.r1cs`));
    copyFileSync(wasm, join(dest, `${c.name}.wasm`));
  }
  return artifacts;
}

// hash a circom file together with everything it transitively `include`s from circuits/
function hashSourceTree(entry) {
  const seen = new Set();
  const h = createHash("sha256");
  const walk = (file) => {
    const norm = resolve(file);
    if (seen.has(norm) || !existsSync(file)) return;
    seen.add(norm);
    const src = readFileSync(file, "utf8");
    h.update(`\n--- ${file.replace(ROOT, "").replace(/\\/g, "/")} ---\n`);
    h.update(src);
    for (const m of src.matchAll(/include\s+"([^"]+)"/g)) {
      const inc = m[1];
      const local = join("circuits", inc);
      if (existsSync(local)) walk(local);
      // circomlib includes are pinned via the toolchain check; not re-hashed here
    }
  };
  walk(entry);
  return h.digest("hex");
}

console.log(`building ${CIRCUITS.length} circuits into ${OUT}/  (ptau: ${PTAU})\n`);
if (!existsSync(PTAU)) {
  console.error(`ptau not found: ${PTAU}\n  run scripts/build.mjs once to generate the spike ptau, or set PTAU= to a public perpetual-powers-of-tau file (see supply-chain/TRUSTED-SETUP.md).`);
  process.exit(2);
}

const a = buildOnce("");
if (MODE === "double") {
  console.log("second build for determinism check ...\n");
  const b = buildOnce("-2");
  let identical = true;
  for (const c of CIRCUITS) {
    for (const k of ["circom_src_tree", "r1cs", "wasm_prover", "zkey_0_pre_ceremony"]) {
      const same = a[c.name].sha256[k] === b[c.name].sha256[k];
      if (!same) identical = false;
      console.log(`  ${same ? "OK  " : "DIFF"} ${c.name}.${k}`);
    }
  }
  rmSync(OUT + "-2", { recursive: true, force: true });
  console.log(`\n${identical ? "REPRODUCIBLE: both builds byte-identical." : "NOT REPRODUCIBLE: outputs diverged -- investigate."}`);
  process.exit(identical ? 0 : 1);
}

// ---- 3. lock file: write or verify ----
const manifest = {
  _comment: "SHA-256 of the reproducible build artifacts. See REPRODUCIBLE-BUILDS.md.",
  generated_by: "scripts/repro_build.mjs",
  toolchain: TOOLCHAIN,
  ptau: { path: PTAU, sha256: sha256File(PTAU), bytes: statSync(PTAU).size,
          provenance: "see supply-chain/TRUSTED-SETUP.md" },
  circuits: a,
  // the deployed vkeys are derived from the (ceremony) _final.zkey; hash whatever is
  // currently in build/ so a verifier can confirm the shipped vkey matches.
  deployed_vkeys: Object.fromEntries(CIRCUITS.map((c) => {
    const p = `build/${c.name}_vkey.json`;
    return [c.name, existsSync(p) ? { path: p, sha256: sha256File(p) } : { path: p, sha256: null, note: "not built yet" }];
  })),
  deployed_final_zkeys: Object.fromEntries(CIRCUITS.map((c) => {
    const p = `build/${c.name}_final.zkey`;
    return [c.name, existsSync(p) ? { path: p, sha256: sha256File(p), note: "ceremony artifact -- verify with `snarkjs zkey verify`, not by hash-match" } : { path: p, sha256: null }];
  })),
};

mkdirSync("supply-chain", { recursive: true });

if (MODE === "update") {
  writeFileSync(LOCK, JSON.stringify(manifest, null, 2) + "\n");
  // also emit a plain sha256sum -c compatible file for the reproducible parts
  const lines = [];
  lines.push(`# reproducible artifacts (circom compile + groth16 setup are deterministic)`);
  lines.push(`${manifest.ptau.sha256}  ${PTAU}`);
  for (const c of CIRCUITS) {
    lines.push(`${a[c.name].sha256.r1cs}  ${OUT}/${c.name}.r1cs`);
    lines.push(`${a[c.name].sha256.wasm_prover}  ${OUT}/${c.name}.wasm`);
    lines.push(`${a[c.name].sha256.zkey_0_pre_ceremony}  ${OUT}/${c.name}_0.zkey`);
  }
  writeFileSync("supply-chain/ARTIFACTS.sha256", lines.join("\n") + "\n");
  console.log(`\nwrote ${LOCK}`);
  console.log(`wrote supply-chain/ARTIFACTS.sha256`);
  process.exit(0);
}

// verify
if (!existsSync(LOCK)) {
  console.error(`\n${LOCK} not found -- run with --update first to establish the baseline.`);
  process.exit(2);
}
const want = JSON.parse(readFileSync(LOCK, "utf8"));
let ok = true;
const cmp = (label, got, exp) => {
  const good = got === exp;
  if (!good) ok = false;
  console.log(`  ${good ? "OK  " : "MISMATCH"}  ${label}`);
  if (!good) console.log(`        got ${got}\n        exp ${exp}`);
};
cmp("ptau", manifest.ptau.sha256, want.ptau?.sha256);
for (const c of CIRCUITS) {
  const g = a[c.name].sha256, w = want.circuits?.[c.name]?.sha256 || {};
  cmp(`${c.name} circom source tree`, g.circom_src_tree, w.circom_src_tree);
  cmp(`${c.name} r1cs`, g.r1cs, w.r1cs);
  cmp(`${c.name} wasm (prover)`, g.wasm_prover, w.wasm_prover);
  cmp(`${c.name} _0.zkey (pre-ceremony setup)`, g.zkey_0_pre_ceremony, w.zkey_0_pre_ceremony);
}
console.log(`\n${ok ? "VERIFIED: build artifacts match supply-chain/artifacts.lock.json" : "FAILED: artifact hash mismatch -- the build does not match the pinned source/toolchain"}`);
process.exit(ok ? 0 : 1);
