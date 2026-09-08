// ===========================================================================
// Regression: the null-space-directed harness must catch M1a
//   (after-the-oracle.md, Task 2 -- "confirm the rebuilt harness catches M1a")
//
//   node scripts/nullspace_harness_regression.mjs [--keep] [--O0|--O1|--O2] [--rounds=N]
//
// M1a downgrades `N <== hN.out` to `N <-- hN.out` in ResidualSplit: the
// nullifier output is assigned but not constrained. The old signal-directed
// Layer B missed it (moving N alone breaks a1x === N*signalHash; the exploit
// moves a1x, N, y together). The null-space-directed search perturbs along the
// exact directions that preserve first-order constraint satisfaction, so it
// finds the (a1x, N, y) direction and reports N -- a public output -- moving.
//
// This builds the M1a mutant in a scratch dir, runs nullspaceProbe against it,
// and asserts `caught === true` with `main.N` among the public movers.
// Exit 0 iff the regression holds.
// ===========================================================================

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { nullspaceProbe } from "./nullspace_harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const CIRCOM2 = require.resolve("circom2/cli.js");
const KEEP = process.argv.includes("--keep");
const PREBUILT = process.argv.includes("--prebuilt");   // reuse .mut/M1a-regression if present
const OPT = (process.argv.find((a) => /^--O[012]$/.test(a)) || "--O2").slice(2);
const ROUNDS = Number((process.argv.find((a) => a.startsWith("--rounds=")) || "--rounds=16").split("=")[1]);
// M1a frees the residual line, so the RREF fills in more than on the pristine
// circuit (~99 -> a few hundred); keep generous headroom so it never aborts.
const MAXFILL = Number((process.argv.find((a) => a.startsWith("--maxfill=")) || "--maxfill=20000").split("=")[1]);
const WORK = join(ROOT, ".mut", "M1a-regression");
const MAIN = "main_mem_w8_d9_split";

const M1A_FROM = "epochAction;  // NOT epochTree. This is the whole security question.\n    N <== hN.out;";
const M1A_TO   = "epochAction;  // NOT epochTree. This is the whole security question.\n    N <-- hN.out;";

function build() {
  const circDir = join(WORK, "circuits");
  const art = {
    r1cs: join(circDir, `${MAIN}.r1cs`),
    wasm: join(circDir, `${MAIN}_js`, `${MAIN}.wasm`),
    sym: join(circDir, `${MAIN}.sym`),
  };
  if (PREBUILT && existsSync(art.r1cs) && existsSync(art.wasm)) {
    console.log(`reusing prebuilt M1a mutant at ${circDir}`);
    return art;
  }
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(circDir, { recursive: true });
  // copy ONLY the .circom sources -- a stale _js/ dir or leftover .r1cs/.sym
  // from circuits/ makes circom2-WASI abort with no message.
  for (const g of readdirSync(join(ROOT, "circuits")))
    if (g.endsWith(".circom")) cpSync(join(ROOT, "circuits", g), join(circDir, g));
  const srcPath = join(circDir, "wedge_membership.circom");
  const src = readFileSync(srcPath, "utf8");
  const n = src.split(M1A_FROM).length - 1;
  if (n !== 1) throw new Error(`M1a anchor matched ${n}x, expected 1 -- circuit source changed, update the anchor`);
  writeFileSync(srcPath, src.replace(M1A_FROM, M1A_TO), "utf8");

  console.log(`compiling M1a mutant (--${OPT}) via circom2-WASI (~10 s) ...`);
  execFileSync(process.execPath, [CIRCOM2, `${MAIN}.circom`, "--r1cs", "--wasm", "--sym", `--${OPT}`,
    "-o", ".", "-l", ".", "-l", "../../../node_modules/circomlib/circuits"],
    { cwd: circDir, stdio: ["ignore", "ignore", "pipe"] });
  return art;
}

const art = build();
console.log(`running null-space-directed harness (rounds=${ROUNDS}, maxfill=${MAXFILL}) ...`);
const res = await nullspaceProbe({
  r1cs: art.r1cs, wasm: art.wasm, sym: art.sym,
  input: join(ROOT, "build", "input_mem_w8_d9_split.json"),
  rounds: ROUNDS, seed: "M1a-regression", maxfill: MAXFILL,
});

if (!KEEP) rmSync(WORK, { recursive: true, force: true });

if (!res.ok) { console.error(`FAIL: probe did not run: ${res.reason}`); process.exit(1); }
console.log(`nullity ${res.nullity} (pristine is 9); caught=${res.caught}`);
for (const m of res.publicMovers) console.log(`  ${m.label}: moves public {${m.publicSignals.join(", ")}}, full move {${m.allMoved.join(", ")}}`);

const catchesN = res.caught && res.publicMovers.some((m) => m.publicSignals.some((s) => /(^|\.)N$/.test(s) || s === "main.N"));
if (catchesN) {
  console.log("\nPASS: the null-space-directed harness catches M1a (a null-space direction moves the public output main.N).");
  process.exit(0);
}
console.log("\nFAIL: the harness did NOT flag main.N moving on M1a — the rebuild is incomplete.");
process.exit(1);
