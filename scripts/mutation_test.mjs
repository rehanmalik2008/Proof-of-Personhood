// ===========================================================================
// Mutation testing for circuit soundness  (closing-what-code-can-close.md §1)
//
//   node scripts/mutation_test.mjs [--only=M1a,M4a] [--keep]
//
// WHY THIS EXISTS
//   The self-audit reports Picus "properly constrained", circomspect clean, and
//   24/24 on the adversarial harness. That is consistent with two very different
//   worlds: a genuinely sound circuit, or a circuit whose bug all three methods
//   happen to miss. Nothing so far distinguishes them.
//
//   Mutation testing distinguishes them. Inject a KNOWN bug into a copy of a
//   deployed circuit, then ask each method whether it catches it. The output is
//   not "the circuit is sound" but "here is exactly which bug classes this
//   process would and would not catch." A mutant surviving all three methods is
//   a detection gap: a class of bug the self-audit would miss in production.
//
// METHOD, per mutant
//   1. copy circuits/, apply one textual mutation, compile with circom2
//   2. circomspect  -> any NEW warning/error vs. the unmutated baseline?
//   3. Picus (SMT)  -> verdict still "properly constrained" (exit 8 = safe)?
//   4. adversarial harness, re-pointed at the mutant build -> any baseline-
//      passing check now failing?
//
// The harness runs with ADV_SKIP_PROVE=1: snarkjs.wtns.check against the mutant
// R1CS is the oracle, so no per-mutant Groth16 setup is needed. Detection is
// unaffected -- an assignment that fails wtns.check cannot yield a verifying
// proof.
//
// SCOPE NOTE, stated up front because it governs how to read the table:
//   Picus decides UNIQUE DETERMINATION of outputs from inputs. A mutant that
//   makes the circuit deterministically WRONG (e.g. a nullifier that drops ctx)
//   is not under-constrained, and Picus returning "safe" for it is correct
//   behaviour within its stated scope, not a miss. The table records that
//   distinction rather than scoring every tool against every mutant class.
// ===========================================================================

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const require = createRequire(import.meta.url);
const NODE = process.execPath;
const CIRCOM2 = require.resolve("circom2/cli.js");

const ARGS = process.argv.slice(2);
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const KEEP = ARGS.includes("--keep");
const WORK = join(ROOT, ".mut");

// circomspect and Picus have no Windows build; they live in WSL.
const WSLREPO = "/mnt/" + ROOT[0].toLowerCase() + ROOT.slice(2).replace(/\\/g, "/");
const wsl = (cmd) => {
  try {
    return execFileSync("wsl.exe", ["-d", "Ubuntu-22.04", "--", "bash", "-c", cmd],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20,
        env: { ...process.env, MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" } });
  } catch (e) { return (e.stdout || "") + (e.stderr || ""); }
};

const FAM = {
  split: { main: "main_mem_w8_d9_split",       art: "wedge_mem_w8_d9_split" },
  rev64: { main: "main_mem_w8_d9_split_rev64", art: "wedge_mem_w8_d9_split_rev64" },
  enrol: { main: "main_wedge_direct_k3",       art: "wedge_direct_k3" },
};

// Exact-string replacement that throws unless the anchor matches exactly once,
// so a mutation that silently failed to apply can never be scored "undetected".
const sub = (from, to) => (src) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor matched ${n}x, expected 1`);
  return src.replace(from, to);
};

const MUTANTS = [
  { id: "M1a", fam: "split", file: "circuits/wedge_membership.circom",
    cls: "`<==` to `<--` (assignment without constraint)",
    what: "nullifier output N assigned but never constrained",
    // anchored on the ResidualSplit-only comment: the v1.0 `Residual` template is
    // byte-identical here but is NOT deployed, and mutating it would be a no-op.
    apply: sub("epochAction;  // NOT epochTree. This is the whole security question.\n    N <== hN.out;",
               "epochAction;  // NOT epochTree. This is the whole security question.\n    N <-- hN.out;") },

  { id: "M1b", fam: "split", file: "circuits/wedge_membership.circom",
    cls: "`<==` to `<--` (assignment without constraint)",
    what: "commitment C assigned but never constrained, so the Merkle leaf floats free",
    // find the deployed ResidualSplit via its unique comment, then rewrite the
    // C assignment that precedes it (the v1.0 Residual copy is left untouched).
    apply: (src) => {
      const marker = "    hN.inputs[2] <== epochAction;  // NOT epochTree.";
      const at = src.indexOf(marker);
      if (at < 0) throw new Error("ResidualSplit marker not found");
      const head = src.slice(0, at);
      const i = head.lastIndexOf("    C <== hC.out;");
      if (i < 0) throw new Error("C assignment not found inside ResidualSplit");
      return head.slice(0, i) + "    C <-- hC.out;" +
             head.slice(i + "    C <== hC.out;".length) + src.slice(at);
    } },

  { id: "M2",  fam: "split", file: "circuits/wedge_membership.circom",
    cls: "removed range check",
    what: "pathIndex in-range enforcement (selAcc[i][W] === 1) deleted",
    apply: sub("        selAcc[i][W] === 1;          // pathIndex in range, exactly one slot selected\n", "") },

  { id: "M3",  fam: "split", file: "circuits/wedge_membership.circom",
    cls: "swapped equality operand",
    what: "root checked against cur[depth-1], leaving the top Merkle level unconstrained",
    apply: sub("    root === cur[depth];\n}\n\ntemplate Residual()", "    root === cur[depth - 1];\n}\n\ntemplate Residual()") },

  { id: "M4a", fam: "split", file: "circuits/wedge_membership.circom",
    cls: "weakened nullifier binding",
    what: "ctx dropped from the nullifier hash, giving one N across every context",
    apply: sub("    hN.inputs[1] <== ctx;\n    hN.inputs[2] <== epochAction;  // NOT epochTree.",
               "    hN.inputs[1] <== 0;\n    hN.inputs[2] <== epochAction;  // NOT epochTree.") },

  { id: "M4b", fam: "split", file: "circuits/wedge_membership.circom",
    cls: "weakened nullifier binding",
    what: "epochAction dropped from the nullifier hash, so N never rotates",
    apply: sub("    hN.inputs[2] <== epochAction;  // NOT epochTree.",
               "    hN.inputs[2] <== 0;  // NOT epochTree.") },

  { id: "M5",  fam: "split", file: "circuits/wedge_membership.circom",
    cls: "unintended signal alias",
    what: "epochAction aliased to epochTree, the coupled-counter regression the epoch split removed",
    apply: sub("    res.s <== s; res.ctx <== ctx; res.epochAction <== epochAction; res.signalHash <== signalHash;",
               "    res.s <== s; res.ctx <== ctx; res.epochAction <== epochTree; res.signalHash <== signalHash;") },

  { id: "M6",  fam: "split", file: "circuits/wedge_membership.circom",
    cls: "RLN degree-1 binding broken",
    what: "share no longer depends on signalHash, so two shares never determine the line",
    apply: sub("    a1x <== N * signalHash;\n    y <== s + a1x;                 // RLN degree-1 Shamir share",
               "    a1x <== N * N;\n    y <== s + a1x;                 // RLN degree-1 Shamir share") },

  { id: "M7",  fam: "rev64", file: "circuits/wedge_revocation.circom",
    cls: "removed constraint (revocation)",
    what: "non-membership constraint deleted, so a revoked credential can still prove",
    apply: sub("        diff[i] * inv[i] === 1;          // 1 constraint; unsatisfiable iff val == revoked[i]\n", "") },

  { id: "M8",  fam: "enrol", file: "circuits/wedge_haggr.circom",
    cls: "disabled verification gadget",
    what: "EdDSA verifier disabled at enrolment, so credentials mint with no attester signature",
    apply: sub("        v[i] = EdDSAPoseidonVerifier();\n        v[i].enabled <== 1;",
               "        v[i] = EdDSAPoseidonVerifier();\n        v[i].enabled <== 0;") },
];

const chosen = ONLY ? MUTANTS.filter((m) => ONLY.split(",").includes(m.id)) : MUTANTS;

const LIB = `${WSLREPO}/node_modules/circomlib/circuits`;
const warnLines = (txt) =>
  txt.split("\n").filter((l) => /^(warning|error):/.test(l.trim())).map((l) => l.trim()).sort();

function circomspectOn(circDirWsl, mainName, fileRel) {
  const leaf = fileRel.split("/").pop();
  const a = wsl(`/opt/circomspect/bin/circomspect -L '${LIB}' -l WARNING '${circDirWsl}/${mainName}.circom' 2>&1`);
  const b = wsl(`/opt/circomspect/bin/circomspect -L '${LIB}' -l WARNING '${circDirWsl}/${leaf}' 2>&1`);
  return { entry: warnLines(a), template: warnLines(b) };
}
// Picus needs Racket 9.3 explicitly on PATH: Ubuntu 22.04's /usr/bin/racket is
// 8.2 and silently fails with a bytecode version mismatch rather than analysing.
const PICUS_PATH = "export PATH=/opt/racket/bin:/usr/local/bin:/usr/bin:/bin;";
// Picus is markedly slower on an UNDERconstrained circuit than on a sound one:
// it keeps searching for a counterexample. On the pristine circuit it answers in
// ~35 s; one mutant ran past 20 min with no verdict. So each invocation gets a
// hard wall-clock cap, and exceeding it is recorded as "no verdict in N s" --
// which is an honest property of the method, not a detection and not a miss.
const PICUS_QUERY_MS = 10000;
const PICUS_WALL_S   = Number(process.env.PICUS_WALL_S || 420);
function picusOn(r1csWsl) {
  const t0 = Date.now();
  const out = wsl(`${PICUS_PATH} cd /opt/Picus && timeout ${PICUS_WALL_S} ./run-picus ` +
                  `--solver z3 --timeout ${PICUS_QUERY_MS} '${r1csWsl}' 2>&1`);
  const secs = Math.round((Date.now() - t0) / 1000);
  const verdict = /properly constrained/.test(out) ? "properly constrained"
                : /underconstrained/.test(out)     ? "UNDERCONSTRAINED"
                : /Cannot determine/.test(out)     ? "unknown"
                : secs >= PICUS_WALL_S - 5         ? `no verdict in ${PICUS_WALL_S}s`
                : "TOOL ERROR";
  return { verdict, secs, tail: out.trim().split("\n").filter(Boolean).slice(-3).join(" | ") };
}

function compile(circDir, mainName) {
  for (const d of readdirSync(circDir)) {
    if (d.endsWith("_js")) rmSync(join(circDir, d), { recursive: true, force: true });
    if (d.endsWith(".r1cs") || d.endsWith(".sym")) rmSync(join(circDir, d), { force: true });
  }
  execFileSync(NODE, [CIRCOM2, `${mainName}.circom`, "--r1cs", "--wasm", "--sym", "--O2",
    "-o", ".", "-l", ".", "-l", "../../../node_modules/circomlib/circuits"],
    { cwd: circDir, stdio: ["ignore", "ignore", "pipe"] });
  return {
    r1cs: join(circDir, `${mainName}.r1cs`),
    wasm: join(circDir, `${mainName}_js`, `${mainName}.wasm`),
    sym:  join(circDir, `${mainName}.sym`),
  };
}

const BASE_ADV = JSON.parse(readFileSync(join(WORK, "adv_base.json"), "utf8")).results;
const BUILD = join(ROOT, "build");

// artifacts the harness loads at import time, for all three families
const NEEDED = [];
for (const f of Object.values(FAM)) NEEDED.push(`${f.art}.wasm`, `${f.art}.r1cs`, `${f.main}.sym`);
NEEDED.push("input_mem_w8_d9_split.json", "input_mem_w8_d9_split_rev64.json", "input_direct_k3.json");

console.log(`\nMUTATION TESTING — ${chosen.length} mutants across ${new Set(chosen.map((m) => m.fam)).size} deployed circuits`);
console.log(`adversarial-harness baseline: ${Object.keys(BASE_ADV).length} checks, all passing\n`);

// circomspect on the pristine tree, once per distinct source file
const baseCs = {};
for (const f of new Set(chosen.map((m) => m.file))) {
  const fam = chosen.find((m) => m.file === f).fam;
  baseCs[f] = circomspectOn(`${WSLREPO}/circuits`, FAM[fam].main, f);
}

const rows = [];
for (const m of chosen) {
  process.stdout.write(`[${m.id}] ${m.cls}\n      ${m.what}\n`);
  const dir = join(WORK, m.id);
  rmSync(dir, { recursive: true, force: true });
  const circDir = join(dir, "circuits"), bDir = join(dir, "build");
  cpSync(join(ROOT, "circuits"), circDir, { recursive: true });
  mkdirSync(bDir, { recursive: true });

  const row = { id: m.id, fam: m.fam, cls: m.cls, what: m.what,
                compile: "ok", circomspect: "-", picus: "-", harness: "-",
                newFails: [], detectedBy: [] };

  try { writeFileSync(join(dir, m.file), m.apply(readFileSync(join(ROOT, m.file), "utf8")), "utf8"); }
  catch (e) {
    row.compile = `MUTATION NOT APPLIED: ${e.message}`;
    console.log(`      !! ${row.compile}\n`); rows.push(row); continue;
  }

  const F = FAM[m.fam];
  let art;
  try { art = compile(circDir, F.main); }
  catch (e) {
    row.compile = "COMPILE ERROR";
    row.detectedBy.push("circom compiler");
    row.circomspect = row.picus = row.harness = "n/a (did not compile)";
    console.log(`      compile: REJECTED by circom — ${String(e.stderr || e.message).split("\n").filter(Boolean).slice(-1)[0].slice(0, 72)}\n`);
    rows.push(row); if (!KEEP) rmSync(dir, { recursive: true, force: true }); continue;
  }

  for (const n of NEEDED) if (existsSync(join(BUILD, n))) cpSync(join(BUILD, n), join(bDir, n));
  cpSync(art.r1cs, join(bDir, `${F.art}.r1cs`));
  cpSync(art.wasm, join(bDir, `${F.art}.wasm`));
  cpSync(art.sym,  join(bDir, `${F.main}.sym`));

  // 1. circomspect
  const cs = circomspectOn(`${WSLREPO}/.mut/${m.id}/circuits`, F.main, m.file);
  const basis = [...baseCs[m.file].entry, ...baseCs[m.file].template];
  const newWarn = [...cs.entry, ...cs.template].filter((w) => !basis.includes(w));
  row.circomspect = newWarn.length ? `DETECTED (${newWarn.length} new)` : "missed";
  if (newWarn.length) { row.detectedBy.push("circomspect"); row.csDetail = newWarn.slice(0, 2); }

  // 2. Picus
  const pi = picusOn(`${WSLREPO}/.mut/${m.id}/build/${F.art}.r1cs`);
  row.picusVerdict = pi.verdict;
  row.picusSecs = pi.secs;
  row.picusTail = pi.tail;
  // Only "UNDERCONSTRAINED" is a detection. "properly constrained" is a miss;
  // "unknown" (solver gave up) and "TOOL ERROR" are NOT detections and must
  // never be scored as such -- an unusable tool result is a gap in the method,
  // not evidence about the mutant.
  row.picus = pi.verdict === "UNDERCONSTRAINED" ? "DETECTED (underconstrained)"
            : pi.verdict === "properly constrained" ? "missed"
            : `INCONCLUSIVE (${pi.verdict})`;
  row.picus += pi.secs != null ? ` [${pi.secs}s]` : "";
  if (pi.verdict === "UNDERCONSTRAINED") row.detectedBy.push("picus");
  if (/TOOL ERROR/.test(pi.verdict)) row.picusError = pi.tail;

  // 3. adversarial harness, re-pointed at the mutant build
  const jsonRel = `.mut/${m.id}-adv.json`;
  rmSync(join(ROOT, jsonRel), { force: true });
  try {
    execFileSync(NODE, ["scripts/test_soundness_adversarial.mjs"], {
      cwd: ROOT, stdio: ["ignore", "ignore", "ignore"], maxBuffer: 32 << 20, timeout: 600000,
      env: { ...process.env, ADV_BUILD_DIR: bDir, ADV_SKIP_PROVE: "1", ADV_JSON: jsonRel },
    });
  } catch { /* non-zero exit means a check failed, which is the signal we want */ }
  if (existsSync(join(ROOT, jsonRel))) {
    const r = JSON.parse(readFileSync(join(ROOT, jsonRel), "utf8")).results;
    row.newFails = Object.keys(BASE_ADV).filter((k) => BASE_ADV[k] === true && r[k] === false);
    row.newFails.push(...Object.keys(BASE_ADV).filter((k) => !(k in r)).map((k) => `${k}(unreached)`));
  } else {
    row.newFails = ["harness aborted before writing results"];
  }
  row.harness = row.newFails.length ? `DETECTED (${row.newFails.length})` : "missed";
  if (row.newFails.length) row.detectedBy.push("harness");

  console.log(`      circomspect ${row.circomspect.padEnd(16)} picus ${row.picus.padEnd(26)} harness ${row.harness}`);
  if (row.newFails.length) console.log(`      harness checks that flipped: ${row.newFails.join(", ")}`);
  if (!row.detectedBy.length) console.log(`      *** SURVIVED ALL THREE METHODS ***`);
  console.log();
  rows.push(row);
  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

const applied   = rows.filter((r) => !/NOT APPLIED/.test(r.compile));
const survivors = applied.filter((r) => r.detectedBy.length === 0);
const md = ["| mutant | bug class | what it breaks | circomspect | Picus | adversarial harness | caught |",
            "|---|---|---|---|---|---|---|"];
for (const r of rows) {
  md.push(`| \`${r.id}\` | ${r.cls} | ${r.what} | ${r.circomspect} | ${r.picus} | ${r.harness} | ` +
          `${/NOT APPLIED/.test(r.compile) ? "_mutation not applied — excluded_"
             : r.detectedBy.length ? "**yes** (" + r.detectedBy.join(", ") + ")" : "**NO — SURVIVOR**"} |`);
}
const table = md.join("\n");
console.log("\n" + "=".repeat(78) + "\nDETECTION-RATE TABLE\n" + "=".repeat(78) + "\n");
console.log(table);
const d = (k) => applied.filter((r) => /DETECTED/.test(r[k])).length;
const T = applied.length;
console.log(`\ncaught by at least one method: ${T - survivors.length}/${T} applied mutants`);
console.log(`per method — circomspect ${d("circomspect")}/${T}   picus ${d("picus")}/${T}   harness ${d("harness")}/${T}`);
if (rows.length !== T) console.log(`(${rows.length - T} excluded: mutation anchor did not apply — harness fault, not a survivor)`);
if (survivors.length) {
  console.log(`\n*** ${survivors.length} SURVIVING MUTANT(S) — DETECTION GAP ***`);
  for (const s of survivors) console.log(`    ${s.id}: ${s.cls} — ${s.what}`);
} else {
  console.log("\nNo mutant survived all three methods.");
}
mkdirSync(join(ROOT, "docs/self-audit"), { recursive: true });
// never write an absolute machine path into a committed artifact: replace the
// WSL repo prefix (and its Windows form) with a neutral token.
const scrub = (s) => typeof s === "string"
  ? s.split(WSLREPO).join("<repo>").split(ROOT).join("<repo>").split(ROOT.replace(/\\/g, "/")).join("<repo>")
  : s;
const rowsClean = JSON.parse(JSON.stringify(rows), (k, v) => scrub(v));
writeFileSync(join(ROOT, "docs/self-audit/mutation_results.json"), JSON.stringify(rowsClean, null, 1));
writeFileSync(join(ROOT, "docs/self-audit/mutation_table.md"), scrub(table) + "\n");
console.log("\nwrote docs/self-audit/mutation_results.json and mutation_table.md");
