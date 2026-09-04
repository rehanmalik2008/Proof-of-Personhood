// Build the Step-3 revocation circuits: compile + Groth16 setup + self-verified input.
//   node scripts/build_revocation.mjs
// Reuses build/pot15_final.ptau from the main build.

import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from "fs";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const require = createRequire(import.meta.url);
const NODE = process.execPath;
const CIRCOM2 = require.resolve("circom2/cli.js");
const SNARKJS = join(dirname(require.resolve("snarkjs")), "cli.cjs");
const run = (args, opts = {}) => execFileSync(NODE, args, { stdio: "inherit", ...opts });
const circom2 = (args, opts) => run([CIRCOM2, ...args], opts);
const snarkjs = (args, opts) => run([SNARKJS, ...args], opts);
const seed = () => randomBytes(24).toString("hex");

const PTAU = "build/pot15_final.ptau";
if (!existsSync(PTAU)) { console.error("build/pot15_final.ptau missing -- run scripts/build.mjs first"); process.exit(1); }

const CIRCUITS = [
  { name: "wedge_mem_w8_d9_rev64",   src: "main_mem_w8_d9_rev64",   input: "input_mem_w8_d9_rev64.json" },
  { name: "wedge_mem_w8_d9_rev256",  src: "main_mem_w8_d9_rev256",  input: "input_mem_w8_d9_rev256.json" },
  { name: "wedge_mem_w8_d9_rev1024", src: "main_mem_w8_d9_rev1024", input: "input_mem_w8_d9_rev1024.json" },
  // split-epoch revocation (closing-two-gates.md Item 2a): epoch -> (epoch_action, epoch_tree).
  { name: "wedge_mem_w8_d9_split_rev64",   src: "main_mem_w8_d9_split_rev64",   input: "input_mem_w8_d9_split_rev64.json" },
  { name: "wedge_mem_w8_d9_split_rev256",  src: "main_mem_w8_d9_split_rev256",  input: "input_mem_w8_d9_split_rev256.json" },
  { name: "wedge_mem_w8_d9_split_rev1024", src: "main_mem_w8_d9_split_rev1024", input: "input_mem_w8_d9_split_rev1024.json" },
];

run(["scripts/gen_input_revocation.mjs"]);

for (const d of readdirSync("circuits")) {
  if (d.endsWith("_js")) rmSync(join("circuits", d), { recursive: true, force: true });
  if (d.endsWith(".r1cs") || d.endsWith(".sym")) rmSync(join("circuits", d), { force: true });
}
for (const c of CIRCUITS) {
  console.log(`\n== compiling ${c.src} ==`);
  circom2([`${c.src}.circom`, "--r1cs", "--wasm", "--O2", "-o", ".", "-l", ".",
           "-l", "../node_modules/circomlib/circuits"], { cwd: join(ROOT, "circuits") });
  copyFileSync(join("circuits", `${c.src}.r1cs`), join("build", `${c.name}.r1cs`));
  copyFileSync(join("circuits", `${c.src}_js`, `${c.src}.wasm`), join("build", `${c.name}.wasm`));
}
for (const { name } of CIRCUITS) {
  console.log(`\n== groth16 setup ${name} ==`);
  snarkjs(["r1cs", "info", `build/${name}.r1cs`]);
  snarkjs(["groth16", "setup", `build/${name}.r1cs`, PTAU, `build/${name}_0.zkey`]);
  snarkjs(["zkey", "contribute", `build/${name}_0.zkey`, `build/${name}_final.zkey`, "--name=spike", `-e=${seed()}`]);
  snarkjs(["zkey", "export", "verificationkey", `build/${name}_final.zkey`, `build/${name}_vkey.json`]);
  rmSync(`build/${name}_0.zkey`, { force: true });
}
console.log("\nrevocation build complete -> node scripts/bench_revocation.mjs");
