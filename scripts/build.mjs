// Reproduce the whole benchmark from source. Cross-platform (Windows / macOS / Linux).
//   node scripts/build.mjs
//
// Needs: Node 18+ and internet for the first `npm install`.
// No Rust, no MSVC, no circom binary -- circuit compilation uses the `circom2`
// npm package (circom 2.2.3 compiled to WASM).

import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from "fs";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// Call the CLIs by their JS entry point with `node` directly -- avoids the
// `.cmd` shim, which Node 18.20+/20+/22+ refuse to spawn without shell:true.
const require = createRequire(import.meta.url);
const NODE = process.execPath;
const CIRCOM2 = require.resolve("circom2/cli.js");
// snarkjs' exports map hides build/cli.cjs; it sits next to the resolvable main.
const SNARKJS = join(dirname(require.resolve("snarkjs")), "cli.cjs");

const run = (args, opts = {}) => execFileSync(NODE, args, { stdio: "inherit", ...opts });
const circom2 = (args, opts) => run([CIRCOM2, ...args], opts);
const snarkjs = (args, opts) => run([SNARKJS, ...args], opts);
const seed = () => randomBytes(24).toString("hex");

// name        = artifact basename in build/ and web/
// src         = circuits/<src>.circom
// input       = witness input file in build/
// web         = also copy wasm/zkey/vkey/input into web/ for the phone harness
// The merkle-cost ladder. All rungs go into web/ so the phone harness runs them
// side by side in one load.
const CIRCUITS = [
  { name: "wedge_baseline", src: "main_full",           input: "input_k3.json",       web: false }, // Step 0  Wedge3, k=3, no Merkle -- the signature floor
  { name: "wedge_ship",     src: "main_wedge_full",     input: "input_wf_k3_d20.json", web: false }, // current WedgeFull: k=3, Merkle depth 20
  { name: "wedge_d10_k3",   src: "main_wedge_d10_k3",   input: "input_wf_k3_d10.json", web: false }, // Step 1  Lever D: depth 20 -> 10
  { name: "wedge_d20_k2",   src: "main_wedge_d20_k2",   input: "input_wf_k2_d20.json", web: false }, // Step 2  Lever E: k=2, depth 20
  { name: "wedge_d10_k2",   src: "main_wedge_d10_k2",   input: "input_wf_k2_d10.json", web: false }, // Step 2  Lever D+E
  { name: "wedge_accum_k3", src: "main_wedge_accum_k3", input: "input_wf_k3_d1.json",  web: false }, // Step 3  Lever A/B: accumulator, out-of-circuit, k=3
  { name: "wedge_accum_k2", src: "main_wedge_accum_k2", input: "input_wf_k2_d1.json",  web: false }, // Step 3  Lever A/B + E, k=2
  { name: "wedge_residual_k3", src: "main_wedge_residual_k3", input: "input_residual_k3.json", web: false }, // Lever C: no sigs, no Merkle, in-circuit residual, k=3
  { name: "wedge_residual_k2", src: "main_wedge_residual_k2", input: "input_residual_k2.json", web: false }, // NOT in the phone harness: this variant exposes C (Lever C shape) -- constraint-floor reference only
  // Lever H / G -- FULLY PRIVATE, kept as desktop reference (not in the current phone harness)
  { name: "wedge_direct_k1", src: "main_wedge_direct_k1", input: "input_direct_k1.json", web: false }, // residual + 1 direct EdDSA verify
  { name: "wedge_direct_k2", src: "main_wedge_direct_k2", input: "input_direct_k2.json", web: false }, // residual + 2 direct EdDSA verifs
  { name: "wedge_direct_k3", src: "main_wedge_direct_k3", input: "input_direct_k3.json", web: false }, // residual + 3 direct EdDSA verifs; also STEP 3's Phase-1 reference
  { name: "wedge_haggr_k2",  src: "main_wedge_haggr_k2",  input: "input_haggr_k2.json",  web: false }, // Lever H: residual + in-circuit half-aggregate verify, k=2
  { name: "wedge_haggr_k3",  src: "main_wedge_haggr_k3",  input: "input_haggr_k3.json",  web: false }, // Lever H: k=3
  // No-shared-key bridge, route 2a -- Phase-2 LOGIN: residual + IN-CIRCUIT private membership.
  // C is never a public output; only N (+ RLN share y) leave the proof. THIS is the phone harness.
  { name: "wedge_mem_bin_d16", src: "main_mem_bin_d16", input: "input_mem_bin_d16.json", web: true }, // binary Merkle, depth 16, 65,536 users -- backstop
  { name: "wedge_mem_bin_d20", src: "main_mem_bin_d20", input: "input_mem_bin_d20.json", web: false }, // binary, depth 20, 1.05M users
  { name: "wedge_mem_bin_d27", src: "main_mem_bin_d27", input: "input_mem_bin_d27.json", web: false }, // binary, depth 27, 134M users
  { name: "wedge_mem_w4_d8",   src: "main_mem_w4_d8",   input: "input_mem_w4_d8.json",   web: true }, // arity-4, depth 8, 65,536 users
  { name: "wedge_mem_w4_d14",  src: "main_mem_w4_d14",  input: "input_mem_w4_d14.json",  web: false }, // arity-4, depth 14, 268M users
  { name: "wedge_mem_w8_d6",   src: "main_mem_w8_d6",   input: "input_mem_w8_d6.json",   web: false }, // arity-8, depth 6, 262,144 users
  { name: "wedge_mem_w8_d9",   src: "main_mem_w8_d9",   input: "input_mem_w8_d9.json",   web: true }, // arity-8, depth 9, 134M users -- real scale, cheapest at this capacity
  // split-epoch (splitting-the-epochs.md): `epoch` -> (epochAction, epochTree).
  // Same 4,309 constraints; one extra public input (nPublic 6 -> 7). The paper's
  // headline Phase-2 circuit from v1.1 on.
  { name: "wedge_mem_w8_d9_split", src: "main_mem_w8_d9_split", input: "input_mem_w8_d9_split.json", web: true },
];

if (!existsSync("node_modules")) {
  console.error("node_modules/ missing -- run `npm install` first, then re-run this script.");
  process.exit(1);
}
mkdirSync("build", { recursive: true });
mkdirSync("web", { recursive: true });

// --- 1. witness inputs (built first; self-verify every signature + Merkle path + half-aggregate) ---
run(["scripts/gen_input.mjs", "3"]);        // build/input_k3.json           (baseline Wedge3)
run(["scripts/gen_input_wf.mjs"]);          // build/input_wf_k{2,3}_d{1,10,20}.json + residual + bls
run(["scripts/gen_input_haggr.mjs"]);       // build/input_direct_k{1,2,3}.json + input_haggr_k{2,3}.json
run(["scripts/gen_input_membership.mjs"]);  // build/input_mem_bin_d{16,20,27}.json + input_mem_w{4,8}_d*.json

// --- 2. compile circuits ------------------------------------------------------
// circom2's WASI filesystem is fragile with nested paths, so we compile from
// INSIDE circuits/ with bare filenames and copy the artifacts out afterwards.
for (const d of readdirSync("circuits")) {
  if (d.endsWith("_js")) rmSync(join("circuits", d), { recursive: true, force: true });
  if (d.endsWith(".r1cs") || d.endsWith(".sym")) rmSync(join("circuits", d), { force: true });
}
for (const c of CIRCUITS) {
  console.log(`\n== compiling ${c.src} ==`);
  circom2([`${c.src}.circom`, "--r1cs", "--wasm", "--sym", "--O2",
           "-o", ".", "-l", ".", "-l", "../node_modules/circomlib/circuits"],
          { cwd: join(ROOT, "circuits") });
  copyFileSync(join("circuits", `${c.src}.r1cs`), join("build", `${c.name}.r1cs`));
  copyFileSync(join("circuits", `${c.src}_js`, `${c.src}.wasm`), join("build", `${c.name}.wasm`));
  // .sym gives scripts/two_witness_search.mjs readable signal names (optional)
  try { copyFileSync(join("circuits", `${c.src}.sym`), join("build", `${c.src}.sym`)); } catch {}
}

// --- 3. powers of tau (2^15 = 32,768 -- fits wedge_ship at 29,122; generated locally) ---
const PTAU = "build/pot15_final.ptau";
if (!existsSync(PTAU)) {
  console.log("\n== generating powers of tau 2^15 (local, ~1-2 min) ==");
  snarkjs(["powersoftau", "new", "bn128", "15", "build/pot15_0.ptau", "-v"]);
  snarkjs(["powersoftau", "contribute", "build/pot15_0.ptau", "build/pot15_1.ptau", "--name=spike", `-e=${seed()}`]);
  snarkjs(["powersoftau", "prepare", "phase2", "build/pot15_1.ptau", PTAU, "-v"]);
  rmSync("build/pot15_0.ptau", { force: true });
  rmSync("build/pot15_1.ptau", { force: true });
}

// --- 4. Groth16 setup per circuit ------------------------------------------------
for (const { name } of CIRCUITS) {
  console.log(`\n== groth16 setup ${name} ==`);
  snarkjs(["r1cs", "info", `build/${name}.r1cs`]);
  snarkjs(["groth16", "setup", `build/${name}.r1cs`, PTAU, `build/${name}_0.zkey`]);
  snarkjs(["zkey", "contribute", `build/${name}_0.zkey`, `build/${name}_final.zkey`, "--name=spike", `-e=${seed()}`]);
  snarkjs(["zkey", "export", "verificationkey", `build/${name}_final.zkey`, `build/${name}_vkey.json`]);
  rmSync(`build/${name}_0.zkey`, { force: true });
}

// --- 5. assemble web/ for the phone harness ---
for (const f of readdirSync("web")) {
  if (f !== "index.html") rmSync(join("web", f), { force: true });
}
copyFileSync("node_modules/snarkjs/build/snarkjs.min.js", "web/snarkjs.min.js");
for (const c of CIRCUITS.filter((c) => c.web)) {
  for (const ext of [".wasm", "_final.zkey", "_vkey.json"])
    copyFileSync(`build/${c.name}${ext}`, `web/${c.name}${ext}`);
  copyFileSync(`build/${c.input}`, `web/${c.input}`);
}
// (Lever C's bls_k*.json and /vendor routes are no longer used by the current harness.)

console.log("\nBuild complete.");
console.log("  Desktop numbers : node scripts/bench_node.mjs");
console.log("  Browser / phone : node scripts/serve.mjs   then open the printed URL");
