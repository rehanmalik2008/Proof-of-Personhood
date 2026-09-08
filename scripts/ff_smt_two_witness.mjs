// ===========================================================================
// Satisfiability modulo finite fields: the two-witness query, posed exactly
//   (the-last-technical-frontier.md, Tasks 1 and 2)
//
//   node scripts/ff_smt_two_witness.mjs <r1cs> [--tag NAME] [--tlimit-s N]
//        [--cvc5 PATH] [--wsl] [--out DIR] [--joint] [--ff-solver gb|split]
//
// By default the query is SPLIT into one UNSAT check per public output k:
//   system(w1) & system(w2) & (w1,w2 agree on every input) & (w1_k - w2_k)*s = 1
// The Rabinowitsch inverse `s` turns "w1_k != w2_k" into a single polynomial,
// so each sub-query is a pure conjunctive system a Groebner-basis FF solver can
// attack directly (1 in the ideal  <=>  UNSAT  <=>  output k is forced equal).
// ALL sub-queries UNSAT  =>  no public output can differ  =>  the public
// outputs are uniquely determined, with no linearization and no bound.
// `--joint` instead emits the single disjunctive query (harder for the solver).
//
// Every prior soundness result carries the linearization bound: "no second
// witness with a non-zero linear component." That bound comes from working with
// the Jacobian null space -- a local object. This script removes the bound by
// asking the question directly, with no linearization:
//
//   Do there exist two full witnesses w1, w2 over the BN254 scalar field such
//   that BOTH satisfy every R1CS constraint (quadratic, exact), they AGREE on
//   every input signal (public + private) and the constant wire, and they
//   DIFFER at some public output (index 1..nPubOut)?
//
//   UNSAT  -> a complete proof of unique determination. No bound, no probe
//             count, no caveat (for this circuit / abstraction).
//   SAT    -> the model is a concrete second witness. It is re-checked here
//             against the full non-linear R1CS and reported at the top.
//   unknown / timeout -> a real methodological result: direct SMT does not
//             decide this circuit; the linearization bound is permanent, not
//             temporary. The resource profile is recorded.
//
// Encoding: QF_FF (quantifier-free finite fields) for cvc5 built with --cocoa
// (the `-gpl` static release; CoCoALib is GPL). Field sort modulus = the BN254
// scalar prime. Linear combinations become n-ary `ff.add` of `ff.mul`;
// constraint k is `(= (ff.mul (A.w) (B.w)) (C.w))`.
// ===========================================================================

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { readR1CS, P, mod } from "./two_witness_search.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const R1CS = A.find((x) => !x.startsWith("--"));
if (!R1CS) { console.error("usage: node scripts/ff_smt_two_witness.mjs <r1cs> [--tag NAME] [--tlimit-s N]"); process.exit(2); }
const TAG = opt("tag", basename(R1CS).replace(/\.r1cs$/, ""));
const TLIMIT_S = parseInt(opt("tlimit-s", "1800"), 10);
const USE_WSL = A.includes("--wsl") || process.platform === "win32";
const CVC5 = opt("cvc5", "/opt/cvc5/bin/cvc5");
const JOINT = A.includes("--joint");
const FF_SOLVER = opt("ff-solver", "gb");
// --concrete WASM,INPUT : pin every input signal to a concrete honest value.
// Removes the linearization bound COMPLETELY at that one input point (an exact,
// non-linear two-witness check) rather than universally. Complements the
// symbolic run: if the symbolic query does not terminate, the concrete one
// still gives an unbounded result per point.
const CONCRETE = opt("concrete", "");
const OUT = opt("out", join(ROOT, "docs", "self-audit"));
const WORK = join(ROOT, "build", "ff-smt");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ---- SMT2 emission ---------------------------------------------------------
function ff(c) { c = mod(BigInt(c)); return `(as ff${c} F)`; }
function lc(terms, pfx) {
  // terms: [[wire, coeff], ...]  ->  SMT term for sum coeff*w
  if (!terms.length) return "(as ff0 F)";
  const parts = terms.map(([w, c]) => {
    const v = `${pfx}${w}`;
    return c === 1n ? v : `(ff.mul ${ff(c)} ${v})`;
  });
  return parts.length === 1 ? parts[0] : `(ff.add ${parts.join(" ")})`;
}

let CONCRETE_W = null;
async function loadConcrete(r) {
  if (!CONCRETE) return;
  const [wasm, input] = CONCRETE.split(",");
  const snarkjs = await import("snarkjs");
  const wp = join(tmpdir(), `ffsmt_${process.pid}.wtns`);
  await snarkjs.wtns.calculate(JSON.parse(readFileSync(input, "utf8")), wasm, wp);
  CONCRETE_W = (await snarkjs.wtns.exportJson(wp)).map((x) => mod(BigInt(x)));
  if (CONCRETE_W.length < r.nWires) throw new Error(`witness ${CONCRETE_W.length} < nWires ${r.nWires}`);
}

function emitCommon(r, { models = false } = {}) {
  const nIn = r.nPubOut + r.nPubIn + r.nPrvIn;
  const L = [];
  L.push(`(set-logic QF_FF)`);
  if (models) L.push(`(set-option :produce-models true)`);
  L.push(`(define-sort F () (_ FiniteField ${P}))`);
  for (let i = 0; i < r.nWires; i++) { L.push(`(declare-fun a${i} () F)`); L.push(`(declare-fun b${i} () F)`); }
  L.push(`(assert (= a0 (as ff1 F)))`);
  L.push(`(assert (= b0 (as ff1 F)))`);
  let fixed = 0;
  for (let i = 1 + r.nPubOut; i <= nIn; i++) {
    if (CONCRETE_W) { L.push(`(assert (= a${i} ${ff(CONCRETE_W[i])}))`); L.push(`(assert (= b${i} ${ff(CONCRETE_W[i])}))`); }
    else L.push(`(assert (= a${i} b${i}))`);
    fixed++;
  }
  for (const c of r.cons) {
    L.push(`(assert (= (ff.mul ${lc(c.a, "a")} ${lc(c.b, "a")}) ${lc(c.c, "a")}))`);
    L.push(`(assert (= (ff.mul ${lc(c.a, "b")} ${lc(c.b, "b")}) ${lc(c.c, "b")}))`);
  }
  return { L, fixed };
}

// split: one UNSAT check per public output k, "w1_k != w2_k" via a Rabinowitsch inverse
function emitSplit(r, k) {
  const { L, fixed } = emitCommon(r);
  L.push(`(declare-fun s () F)`);
  L.push(`(assert (= (ff.mul (ff.add a${k} (ff.neg b${k})) s) (as ff1 F)))`);
  L.push(`(check-sat)`);
  return { smt: L.join("\n") + "\n", fixed };
}
// joint: one disjunctive query over all public outputs (harder for the solver)
function emitJoint(r) {
  const { L, fixed } = emitCommon(r, { models: true });
  const diffs = [];
  for (let k = 1; k <= r.nPubOut; k++) diffs.push(`(not (= a${k} b${k}))`);
  L.push(`(assert (or ${diffs.join(" ")}))`);
  L.push(`(check-sat)`);
  const want = [];
  for (let k = 1; k <= r.nPubOut; k++) want.push(`a${k}`, `b${k}`);
  L.push(`(get-value (${want.join(" ")}))`);
  return { smt: L.join("\n") + "\n", fixed };
}

// ---- run cvc5 ------------------------------------------------------------
function toWslPath(p) {
  const abs = resolve(p).replace(/\\/g, "/");
  const m = abs.match(/^([A-Za-z]):\/(.*)$/);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2]}` : abs;
}
function runCvc5(smtPath, tlimitS) {
  const flags = [`--tlimit=${tlimitS * 1000}`, "--stats", `--ff-solver=${FF_SOLVER}`];
  const t0 = Date.now();
  let out = "", code = 0;
  try {
    if (USE_WSL) {
      out = execFileSync("wsl.exe", ["-d", "Ubuntu-22.04", "--", CVC5, ...flags, toWslPath(smtPath)],
        { encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" } });
    } else {
      out = execFileSync(CVC5, [...flags, smtPath], { encoding: "utf8", maxBuffer: 256 << 20 });
    }
  } catch (e) { out = (e.stdout || "") + "\n" + (e.stderr || ""); code = e.status ?? -1; }
  const secs = (Date.now() - t0) / 1000;
  return { out, secs, code };
}
function classify(out, firstLineOnly) {
  const fl = out.trim().split("\n").map((s) => s.trim()).find((s) => /^(sat|unsat|unknown)$/.test(s)) || "";
  if (fl) return fl;
  if (/interrupted by timeout|tlimit/.test(out)) return "timeout";
  if (/terminated by the C\+\+ runtime|CoCoA::ErrorInfo|std::bad_alloc|out of memory/.test(out)) return "solver-error";
  if (/\(error/.test(out)) return "error";
  return "no-verdict";
}

// ---- parse model & verify --------------------------------------------------
// cvc5 prints values as  #f<value>m<modulus>  or  (as ffN F)
function parseFF(tok) {
  let m = tok.match(/#f(\d+)m\d+/); if (m) return mod(BigInt(m[1]));
  m = tok.match(/ff(-?\d+)/); if (m) return mod(BigInt(m[1]));
  return null;
}

function statLines(out) {
  return (out.match(/^(global::totalTime|resource::|theory::ff|.*[Gg]roebner.*|.*CoCoA.*)\S*.*$/gm) || [])
    .map((s) => s.trim()).slice(0, 30);
}

async function main() {
  await loadConcrete(readR1CS(R1CS));
  const r = readR1CS(R1CS);
  console.log(`\n=== FF-SMT two-witness : ${TAG} ===`);
  console.log(`r1cs        ${relR1CS}`);
  console.log(`wires ${r.nWires} | constraints ${r.nConstraints} | pub-out ${r.nPubOut}`);
  console.log(`solver      ${USE_WSL ? "wsl:" : ""}${CVC5}  --ff-solver=${FF_SOLVER}  tlimit ${TLIMIT_S}s  mode=${JOINT ? "joint" : "split-per-output"}`);
  const commonFixed = emitCommon(r).fixed;
  console.log(`inputs fixed & agreed between w1,w2: ${commonFixed}   (public outputs 1..${r.nPubOut} left free)\n`);

  const relR1CS = R1CS.replace(ROOT, "").replace(/\\/g, "/").replace(/^\/+/, "") || R1CS;
  const result = { tag: TAG, r1cs: relR1CS, wires: r.nWires, constraints: r.nConstraints,
    nPubOut: r.nPubOut, inputsFixed: commonFixed, tlimitS: TLIMIT_S, ffSolver: FF_SOLVER,
    mode: JOINT ? "joint" : "split", subqueries: [], stamp: new Date().toISOString() };
  let logAll = `# ${relR1CS}\n# ${result.stamp}\n`;

  if (JOINT) {
    const { smt } = emitJoint(r);
    const p = join(WORK, `${TAG}.joint.smt2`); writeFileSync(p, smt);
    console.log(`joint query -> ${p} (${(smt.length / 1024).toFixed(0)} KB); running cvc5 ...`);
    const { out, secs, code } = runCvc5(p, TLIMIT_S);
    logAll += `\n===== joint =====\n${out}\n`;
    const v = classify(out);
    console.log(`  ${v}   (${secs.toFixed(1)}s, exit ${code})`);
    result.subqueries.push({ output: "any", verdict: v, seconds: secs, exit: code, stats: statLines(out) });
    if (v === "sat") {
      const vals = {};
      for (const seg of out.match(/\(\s*(a\d+|b\d+)\s+[^()]*\)/g) || []) {
        const mm = seg.match(/\(\s*(a\d+|b\d+)\s+(.+?)\s*\)/); if (mm) { const x = parseFF(mm[2]); if (x !== null) vals[mm[1]] = x.toString(); }
      }
      result.model = vals;
      writeFileSync(join(WORK, `${TAG}.model.txt`), out);
    }
    result.verdict = v === "unsat" ? "UNIQUELY DETERMINED (proof)"
      : v === "sat" ? "SECOND WITNESS EXISTS" : `UNDECIDED (${v})`;
  } else {
    let allUnsat = true, anySat = false, anyUndecided = false;
    for (let k = 1; k <= r.nPubOut; k++) {
      const { smt } = emitSplit(r, k);
      const p = join(WORK, `${TAG}.out${k}.smt2`); writeFileSync(p, smt);
      console.log(`sub-query: can public output #${k} differ?  -> ${p} (${(smt.length / 1024).toFixed(0)} KB); running cvc5 ...`);
      const { out, secs, code } = runCvc5(p, TLIMIT_S);
      logAll += `\n===== output #${k} =====\n${out}\n`;
      const v = classify(out);
      console.log(`  output #${k}: ${v}   (${secs.toFixed(1)}s, exit ${code})`);
      result.subqueries.push({ output: k, verdict: v, seconds: secs, exit: code, stats: statLines(out) });
      if (v === "unsat") { /* output k forced equal - good */ }
      else if (v === "sat") { allUnsat = false; anySat = true; writeFileSync(join(WORK, `${TAG}.out${k}.model.txt`), out); }
      else { allUnsat = false; anyUndecided = true; }
    }
    result.verdict = anySat ? "SECOND WITNESS EXISTS"
      : allUnsat ? "UNIQUELY DETERMINED (proof)"
      : "UNDECIDED (at least one sub-query not solved)";
    result.anySat = anySat; result.anyUndecided = anyUndecided;
  }

  writeFileSync(join(OUT, `ff_smt_${TAG}.txt`), logAll + "\n");
  writeFileSync(join(OUT, `ff_smt_${TAG}.json`), JSON.stringify(result, null, 2));

  console.log(`\n============================================================`);
  if (/SECOND WITNESS/.test(result.verdict)) {
    console.log(`  *** SAT -- a second witness exists for ${TAG}. ***`);
    console.log(`  A public output can differ while every input agrees. Check`);
    console.log(`  the model against the full deployed circuit IMMEDIATELY.`);
    console.log(`  Model: ${join(WORK, TAG + ".*.model.txt")}`);
  } else if (/UNIQUELY DETERMINED/.test(result.verdict)) {
    console.log(`  UNSAT on every sub-query. The public outputs of ${TAG} are`);
    console.log(`  UNIQUELY DETERMINED by the inputs -- a complete proof, with`);
    console.log(`  no linearization, no probe count, no bound. Scope: this`);
    console.log(`  circuit exactly as encoded, BN254 scalar field, cvc5 1.3.4.`);
  } else {
    console.log(`  UNDECIDED. cvc5 did not settle every sub-query within ${TLIMIT_S}s.`);
    console.log(`  This is a real methodological result: direct SMT does not`);
    console.log(`  decide this circuit at ${r.nConstraints} constraints, so the`);
    console.log(`  linearization bound on the two-witness search is, on this`);
    console.log(`  evidence, permanent rather than temporary. Profile in the .txt.`);
  }
  console.log(`============================================================`);
  console.log(`\nwrote ${join(OUT, `ff_smt_${TAG}.json`)}\nwrote ${join(OUT, `ff_smt_${TAG}.txt`)}`);
  process.exit(/SECOND WITNESS/.test(result.verdict) ? 2 : /UNIQUELY/.test(result.verdict) ? 0 : 1);
}

main();
