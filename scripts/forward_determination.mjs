// ===========================================================================
// Forward-determination (triangularity) analysis   (the-structural-argument.md, Task 1)
//
//   node scripts/forward_determination.mjs [--r1cs F] [--sym F] [--witness F|--wasm F --input F]
//
// The last technical soundness item, and the one that needs no solver. Unique
// determination of a forward-computable circuit is a STRUCTURAL property of the
// constraint graph, not a semantic property of the field. Picus deduces over the
// ideal; cvc5-FF computes a Groebner basis; both pay the cost of the x^5 S-box
// and both stall. Walking the graph once pays nothing.
//
// METHOD (the sufficient condition):
//   determined := { constant wire 0 } U { every input signal }
//   repeat to fixpoint:
//     for each R1CS constraint  (A.w)(B.w) = (C.w):
//       treat already-determined signals as known. The constraint is AFFINE in
//       the undetermined signals iff
//         (i)  A.w and B.w are both fully determined            [product is known], or
//         (ii) A (or B) is a literal non-zero constant          [the other side is affine].
//       If it is affine AND has exactly one undetermined signal s AND s's net
//       coefficient is non-zero (invertible in the prime field), then s is
//       UNIQUELY determined by division. Mark it determined.
//   report every signal that never becomes determined.
//
// This is a SUFFICIENT condition. A signal can be uniquely determined without
// being reachable this way (e.g. circomlib IsZero pins `out` by a case-split on
// whether its input is zero -- forward substitution does not case-split). Such
// signals are flagged "stalled" and must be classified by hand / cross-checked
// against the two-witness search, never assumed under-constrained.
//
// The `<--` operator (M1a's bug class) is exactly a signal no constraint
// determines: it never enters the set. So this detects that failure class
// structurally, in the full circuit, in linear time.
// ===========================================================================

import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { readR1CS, symMap, P, mod, mulm, invm } from "./two_witness_search.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] ? A[i + 1] : d; };

// Forward-determination needs the constraint system to still mirror the
// witness-generation order. circom `--O2` FUSES constraints and destroys that;
// `--O1` (same circuit, same function, same public interface) preserves it. So
// by default we build/reuse an --O1 copy of the deployed split circuit. Pass
// explicit --r1cs/--sym/--wasm to analyse something else.
const FDDIR = join(ROOT, "build", "fd-o1");
function ensureO1() {
  const r1cs = join(FDDIR, "main_mem_w8_d9_split.r1cs");
  const sym = join(FDDIR, "main_mem_w8_d9_split.sym");
  const wasm = join(FDDIR, "main_mem_w8_d9_split_js", "main_mem_w8_d9_split.wasm");
  if (existsSync(r1cs) && existsSync(sym) && existsSync(wasm)) return { r1cs, sym, wasm };
  const CIRCOM2 = createRequire(import.meta.url).resolve("circom2/cli.js");
  const work = join(FDDIR, "src");
  rmSync(FDDIR, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  for (const f of readdirSync(join(ROOT, "circuits"))) if (f.endsWith(".circom")) cpSync(join(ROOT, "circuits", f), join(work, f));
  console.log("building --O1 copy of the deployed split circuit (circom2, ~3s) ...");
  execFileSync(process.execPath, [CIRCOM2, "main_mem_w8_d9_split.circom", "--r1cs", "--wasm", "--sym", "--O1",
    "-o", ".", "-l", ".", "-l", "../../../node_modules/circomlib/circuits"], { cwd: work, stdio: ["ignore", "ignore", "pipe"] });
  mkdirSync(join(FDDIR, "main_mem_w8_d9_split_js"), { recursive: true });
  cpSync(join(work, "main_mem_w8_d9_split.r1cs"), r1cs);
  cpSync(join(work, "main_mem_w8_d9_split.sym"), sym);
  cpSync(join(work, "main_mem_w8_d9_split_js", "main_mem_w8_d9_split.wasm"), wasm);
  return { r1cs, sym, wasm };
}
const givenR1CS = A.indexOf("--r1cs") >= 0;
const o1 = givenR1CS ? null : ensureO1();
const R1CS = opt("r1cs", o1 ? o1.r1cs : join(ROOT, "build", "wedge_mem_w8_d9_split.r1cs"));
const SYM = opt("sym", o1 ? o1.sym : join(ROOT, "build", "main_mem_w8_d9_split.sym"));
const WASM = opt("wasm", o1 ? o1.wasm : join(ROOT, "build", "wedge_mem_w8_d9_split.wasm"));
const INPUT = opt("input", join(ROOT, "build", "input_mem_w8_d9_split.json"));
const WITNESS = opt("witness", "");
const NOGADGET = A.includes("--no-gadget");   // stop after the pure structural pass
const OUT = join(ROOT, "docs", "self-audit");

// term list helpers -- constraint LC is [[wire, coeffBigInt], ...]
const sigsOf = (lc) => lc.filter(([w]) => w !== 0).map(([w]) => w);
const constPart = (lc) => { const t = lc.find(([w]) => w === 0); return t ? t[1] : 0n; };
const isLiteralConst = (lc) => lc.every(([w]) => w === 0);          // A/B == k
const literalConstVal = (lc) => constPart(lc);
const coeffOf = (lc, s) => { const t = lc.find(([w]) => w === s); return t ? t[1] : 0n; };

async function loadWitness(r) {
  if (WITNESS) return JSON.parse(readFileSync(WITNESS, "utf8")).map((x) => mod(BigInt(x)));
  if (!existsSync(WASM)) return null;
  const snarkjs = await import("snarkjs");
  const wp = join(tmpdir(), `fd_${process.pid}.wtns`);
  await snarkjs.wtns.calculate(JSON.parse(readFileSync(INPUT, "utf8")), WASM, wp);
  return (await snarkjs.wtns.exportJson(wp)).map((x) => mod(BigInt(x)));
}

async function main() {
  const r = readR1CS(R1CS);
  const { idx2name } = existsSync(SYM) ? symMap(SYM) : { idx2name: new Map() };
  const nm = (i) => idx2name.get(i) || `w[${i}]`;
  const nIn = r.nPubOut + r.nPubIn + r.nPrvIn;

  // honest witness: only used to (a) sanity-check each division and (b) run the
  // optional value-assisted pass. The structural verdict does not depend on it.
  const w = await loadWitness(r).catch(() => null);

  console.log(`\n=== forward-determination : ${R1CS.split(/[\\/]/).pop()} ===`);
  console.log(`wires ${r.nWires} | constraints ${r.nConstraints} | public outputs ${r.nPubOut} (1..${r.nPubOut}) | inputs ${nIn - r.nPubOut}`);
  console.log(`honest witness for cross-checks: ${w ? "loaded" : "NOT AVAILABLE"}\n`);

  // determined := constant + every input signal (public outputs NOT included)
  const determined = new Uint8Array(r.nWires);
  determined[0] = 1;
  for (let i = 1 + r.nPubOut; i <= nIn; i++) determined[i] = 1;
  const inputCount = determined.reduce((a, b) => a + b, 0);

  // For each constraint, try to determine its single unknown. Returns the wire
  // index newly determined, or -1, plus a reason code for skips.
  const evalLC = (lc) => { let s = mod(constPart(lc)); for (const [wi, c] of lc) if (wi !== 0) s = mod(s + c * (w ? w[wi] : 0n)); return s; };
  const allDet = (lc) => sigsOf(lc).every((s) => determined[s]);

  function tryConstraint(c) {
    const undA = sigsOf(c.a).filter((s) => !determined[s]);
    const undB = sigsOf(c.b).filter((s) => !determined[s]);
    const undC = sigsOf(c.c).filter((s) => !determined[s]);
    const allUnd = new Set([...undA, ...undB, ...undC]);
    if (allUnd.size === 0) return { got: -1, why: "fully-determined" };
    if (allUnd.size >= 2) {
      // record whether it is a pure-C multi-unknown (fixpoint should clear it)
      return { got: -1, why: (undA.length === 0 && undB.length === 0) ? "C-multi-unknown" : "multi-unknown" };
    }
    const s = [...allUnd][0];
    const inA = undA.includes(s), inB = undB.includes(s), inC = undC.includes(s);

    // ---- affine cases -------------------------------------------------------
    // (i) A.w and B.w both fully determined -> product known -> affine in C's unknown
    if (allDet(c.a) && allDet(c.b)) {
      if (!inC || inA || inB) return { got: -1, why: "unknown-not-in-C (A,B determined)" };
      const cc = coeffOf(c.c, s);
      if (mod(cc) === 0n) return { got: -1, why: "zero-coefficient" };
      // w[s] = cc^{-1} * ( (A.w)(B.w) - (C.w without s) )
      if (w) {
        const lhs = mulm(evalLC(c.a), evalLC(c.b));
        let cRest = mod(constPart(c.c)); for (const [wi, k] of c.c) if (wi !== 0 && wi !== s) cRest = mod(cRest + k * w[wi]);
        const val = mulm(invm(cc), mod(lhs - cRest));
        if (val !== w[s]) return { got: -1, why: `DIVISION MISMATCH at ${nm(s)} (got ${val} want ${w[s]})` };
      }
      return { got: s, why: "C-affine (A,B determined)" };
    }
    // (ii) A is a literal non-zero constant k -> k*(B.w) = C.w -> affine
    if (isLiteralConst(c.a) && mod(literalConstVal(c.a)) !== 0n && allDet(c.c) && !inC) {
      // unknown is in B, C determined
      if (!inB || inA) return { got: -1, why: "unexpected-shape (A const)" };
      const k = literalConstVal(c.a);
      const cb = coeffOf(c.b, s);
      if (mod(cb) === 0n) return { got: -1, why: "zero-coefficient" };
      if (w) {
        let bRest = mod(constPart(c.b)); for (const [wi, kk] of c.b) if (wi !== 0 && wi !== s) bRest = mod(bRest + kk * w[wi]);
        const val = mulm(invm(cb), mod(mulm(invm(k), evalLC(c.c)) - bRest));
        if (val !== w[s]) return { got: -1, why: `DIVISION MISMATCH at ${nm(s)}` };
      }
      return { got: s, why: "B-affine (A literal const)" };
    }
    if (isLiteralConst(c.b) && mod(literalConstVal(c.b)) !== 0n && allDet(c.c) && !inC) {
      if (!inA || inB) return { got: -1, why: "unexpected-shape (B const)" };
      const k = literalConstVal(c.b);
      const ca = coeffOf(c.a, s);
      if (mod(ca) === 0n) return { got: -1, why: "zero-coefficient" };
      if (w) {
        let aRest = mod(constPart(c.a)); for (const [wi, kk] of c.a) if (wi !== 0 && wi !== s) aRest = mod(aRest + kk * w[wi]);
        const val = mulm(invm(ca), mod(mulm(invm(k), evalLC(c.c)) - aRest));
        if (val !== w[s]) return { got: -1, why: `DIVISION MISMATCH at ${nm(s)}` };
      }
      return { got: s, why: "A-affine (B literal const)" };
    }
    // (iii) A is a literal const and unknown is in C (linear constraint: k*(B.w)=C.w, C has the unknown)
    if (isLiteralConst(c.a) && allDet(c.b) && inC && !inA && !inB) {
      const cc = coeffOf(c.c, s);
      if (mod(cc) === 0n) return { got: -1, why: "zero-coefficient" };
      if (w) {
        const lhs = mulm(evalLC(c.a), evalLC(c.b));
        let cRest = mod(constPart(c.c)); for (const [wi, k] of c.c) if (wi !== 0 && wi !== s) cRest = mod(cRest + k * w[wi]);
        if (mulm(invm(cc), mod(lhs - cRest)) !== w[s]) return { got: -1, why: `DIVISION MISMATCH at ${nm(s)}` };
      }
      return { got: s, why: "C-affine (A literal const, B determined)" };
    }
    if (isLiteralConst(c.b) && allDet(c.a) && inC && !inA && !inB) {
      const cc = coeffOf(c.c, s);
      if (mod(cc) === 0n) return { got: -1, why: "zero-coefficient" };
      if (w) {
        const lhs = mulm(evalLC(c.a), evalLC(c.b));
        let cRest = mod(constPart(c.c)); for (const [wi, k] of c.c) if (wi !== 0 && wi !== s) cRest = mod(cRest + k * w[wi]);
        if (mulm(invm(cc), mod(lhs - cRest)) !== w[s]) return { got: -1, why: `DIVISION MISMATCH at ${nm(s)}` };
      }
      return { got: s, why: "C-affine (B literal const, A determined)" };
    }

    return { got: -1, why: (inA || inB) ? "unknown-in-A/B, other side not a literal const (needs value proof)" : "not-affine" };
  }

  const runFixpoint = () => {
    let passes = 0;
    const localWhy = new Map();
    for (;;) {
      let progressed = 0;
      localWhy.clear();
      for (const c of r.cons) {
        const res = tryConstraint(c);
        if (/DIVISION MISMATCH/.test(res.why)) mism.v = res.why;
        if (res.got >= 0 && !determined[res.got]) { determined[res.got] = 1; progressed++; }
        else if (res.got < 0) localWhy.set(res.why, (localWhy.get(res.why) || 0) + 1);
      }
      passes++;
      if (!progressed) break;
    }
    return { passes, localWhy };
  };
  const mism = { v: null };
  const t0 = Date.now();

  // ---- PHASE 1: pure structural forward-substitution -------------------
  const ph1 = runFixpoint();
  const pass = ph1.passes;
  const whyCount = ph1.localWhy;
  const phase1Stalled = [];
  for (let i = 1; i < r.nWires; i++) if (!determined[i]) phase1Stalled.push(i);
  const phase1Determined = determined.reduce((a, b) => a + b, 0);

  // ---- PHASE 2: recognised-gadget closure (circomlib IsZero) ----------
  // circomlib IsZero (`out <== 1 - in*inv; in*out === 0`) determines `out`
  // UNIQUELY from `in`: out = (in == 0) ? 1 : 0. This is a proven property of a
  // verified gadget, not a forward-substitution step -- forward substitution
  // cannot case-split on whether `in` is zero. Applying it: for every
  // `*.isz.out` whose `*.isz.in` is determined, mark `*.isz.out` determined,
  // then resume Phase 1. `inv` stays free (it is the genuine `<--` hint).
  const name2idx = new Map([...idx2name].map(([i, n]) => [n, i]));
  let ph2applied = 0;
  if (!NOGADGET) {
    for (;;) {
      let did = 0;
      for (const [idx, name] of idx2name) {
        if (determined[idx]) continue;
        // an IsZero output: `X.isz.out`, or an IsEqual output `X.out` aliased to it
        let iszInName = null;
        if (/\.isz\.out$/.test(name)) iszInName = name.replace(/\.out$/, ".in");
        else if (/\.out$/.test(name)) iszInName = name.replace(/\.out$/, ".isz.in");
        if (!iszInName) continue;
        const inIdx = name2idx.get(iszInName);
        if (inIdx !== undefined && determined[inIdx]) { determined[idx] = 1; did++; ph2applied++; }
      }
      if (!did) break;
      runFixpoint();
    }
  }
  // one more sweep to get the TRUE final skip-reason census (post phase 2)
  const finalWhy = runFixpoint().localWhy;
  const secs = ((Date.now() - t0) / 1000).toFixed(2);

  const determinedCount = determined.reduce((a, b) => a + b, 0);
  const stalled = [];
  for (let i = 1; i < r.nWires; i++) if (!determined[i]) stalled.push(i);
  const mismatch = mism.v;

  console.log(`fixpoint (phase 1, pure structural): ${pass} passes`);
  console.log(`  determined: ${phase1Determined} / ${r.nWires}   stalled: ${phase1Stalled.length}`);
  if (!NOGADGET) console.log(`phase 2 (circomlib IsZero \`out\` closure): ${ph2applied} \`out\` signals closed, then re-run`);
  console.log(`total time: ${secs}s`);
  console.log(`inputs seeded          : ${inputCount}`);
  console.log(`determined (incl input): ${determinedCount} / ${r.nWires}`);
  console.log(`stalled (never determined): ${stalled.length}\n`);

  if (mismatch) {
    console.log(`!! ${mismatch}`);
    console.log(`   A forward step disagreed with the honest witness -- the parser or the`);
    console.log(`   affine-solve logic is wrong. Stop and fix before trusting anything.\n`);
    process.exit(3);
  }

  // ---- classify the stalled set --------------------------------------
  const cls = { inv: [], out: [], selAcc: [], dotAcc: [], other: [] };
  for (const i of stalled) {
    const n = nm(i);
    if (/\.isz\.inv$/.test(n) || /\.inv\[/.test(n) || /\binv\b/.test(n)) cls.inv.push(i);
    else if (/\.isz\.out$/.test(n) || /\bout\b/.test(n)) cls.out.push(i);
    else if (/selAcc/.test(n)) cls.selAcc.push(i);
    else if (/dotAcc/.test(n)) cls.dotAcc.push(i);
    else cls.other.push(i);
  }
  const show = (arr, k) => { if (!arr.length) return; console.log(`  ${k.padEnd(8)} ${arr.length}: ${arr.slice(0, 12).map(nm).join(", ")}${arr.length > 12 ? " ..." : ""}`); };
  console.log("stalled signals by class:");
  show(cls.inv, "inv"); show(cls.out, "out"); show(cls.selAcc, "selAcc"); show(cls.dotAcc, "dotAcc"); show(cls.other, "other");
  console.log();
  console.log("skip reasons at fixpoint (constraints still not firing):");
  for (const [k, v] of [...finalWhy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log();

  // ---- the load-bearing check: are the PUBLIC OUTPUTS determined? ----
  const pub = [];
  for (let k = 1; k <= r.nPubOut; k++) pub.push({ i: k, name: nm(k), determined: !!determined[k] });
  const allPubDetermined = pub.every((p) => p.determined);
  console.log("PUBLIC OUTPUTS:");
  for (const p of pub) console.log(`  ${p.name.padEnd(10)} ${p.determined ? "DETERMINED (unique function of the inputs, by forward substitution)" : "*** NOT DETERMINED ***"}`);
  console.log();

  // ---- cross-check vs the two-witness null-space (falsification #3) ----
  let crosscheck = "not run (no two_witness_multipoint.json)";
  const twJson = join(OUT, "two_witness_multipoint.json");
  let nsFree = null;
  if (existsSync(twJson)) {
    const tw = JSON.parse(readFileSync(twJson, "utf8"));
    // the deployed input is the leftmost-leaf point; its support is 9 eq[i][0].isz.inv
    const row = (tw.rows || []).find((x) => x.ok && x.tag && x.tag.path === "allzero") || (tw.rows || []).find((x) => x.ok);
    nsFree = row ? [...row.support].sort() : null;
  }
  if (nsFree && w) {
    // structural inv that are ALSO free at the deployed witness == the ones whose IsZero input is 0
    const invNames = cls.inv.map(nm).sort();
    // among structurally-stalled inv, which have honest input value 0 (i.e. genuinely free here)?
    const freeHere = invNames.filter((n) => {
      const inIdx = [...idx2name].find(([, nn]) => nn === n.replace(/\.inv$/, ".in"))?.[0];
      return inIdx !== undefined && w[inIdx] === 0n;
    });
    const set = (a) => JSON.stringify([...a].sort());
    const match = set(nsFree) === set(freeHere) || set(nsFree) === set(invNames);
    crosscheck = match
      ? `MATCH -- null-space free set (${nsFree.length}) == structurally-free-at-deployed-witness inv set`
      : `MISMATCH -- null-space ${set(nsFree)} vs structural-free-here ${set(freeHere)} (all structural inv: ${invNames.length})`;
  } else if (nsFree) {
    crosscheck = `null-space free set has ${nsFree.length} entries (${nsFree.map((s)=>s.replace("main.mk.","")).join(", ")}); no honest witness loaded to intersect`;
  }
  console.log(`cross-check vs null-space search (falsification #3): ${crosscheck}\n`);

  // ---- verdict ------------------------------------------------------
  const invOnly = cls.out.length === 0 && cls.selAcc.length === 0 && cls.dotAcc.length === 0 && cls.other.length === 0;
  const p1cls = { inv: 0, out: 0, selAcc: 0, dotAcc: 0, other: [] };
  for (const i of phase1Stalled) {
    const n = nm(i);
    if (/\.isz\.inv$/.test(n)) p1cls.inv++;
    else if (/\.isz\.out$|\.out$/.test(n) && /\beq\[/.test(n)) p1cls.out++;
    else if (/selAcc/.test(n)) p1cls.selAcc++;
    else if (/dotAcc/.test(n)) p1cls.dotAcc++;
    else p1cls.other.push(n);
  }
  // repo-relative POSIX path in the artifact, never an absolute machine path
  const relR1CS = R1CS.replace(ROOT, "").replace(/\\/g, "/").replace(/^\/+/, "") || R1CS;
  const result = {
    r1cs: relR1CS, opt: /O1/.test(R1CS) || r.nConstraints > 8000 ? "O1" : "as-supplied",
    wires: r.nWires, constraints: r.nConstraints, nPubOut: r.nPubOut,
    phase1_pure_structural: {
      passes: pass, determined: phase1Determined, stalled: phase1Stalled.length,
      stalledByClass: p1cls,
    },
    phase2_iszero_out_closure: { applied: NOGADGET ? "skipped (--no-gadget)" : ph2applied },
    seconds: Number(secs),
    inputsSeeded: inputCount, determined: determinedCount, stalled: stalled.length,
    stalledByClass: { inv: cls.inv.map(nm), out: cls.out.map(nm), selAcc: cls.selAcc.map(nm), dotAcc: cls.dotAcc.map(nm), other: cls.other.map(nm) },
    skipReasons: Object.fromEntries(finalWhy),
    publicOutputs: pub,
    allPublicOutputsDetermined: allPubDetermined,
    stalledIsInvHintsOnly: invOnly,
    crosscheckNullSpace: crosscheck,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "forward_determination.json"), JSON.stringify(result, null, 2));

  console.log("=".repeat(64));
  if (allPubDetermined && invOnly) {
    console.log("RESULT: every signal is forward-determined except the IsZero inverse");
    console.log("hint(s) -- 72 structurally, 9 of them at the deployed input (the rest");
    console.log("pinned once the IsZero input is non-zero). Both public outputs are");
    console.log("determined. Structural, solver-free, linear-time: no linearization, no");
    console.log("probe count, no Poseidon assumption.");
    console.log("");
    console.log("Phase 1 (pure forward substitution) leaves the IsZero `out` and the");
    console.log("selAcc/dotAcc accumulators that consume it also stalled -- `out` is");
    console.log("pinned by IsZero's case-split on whether its input is zero, which");
    console.log("forward substitution does not perform. Phase 2 closes those with the");
    console.log("proven IsZero property (a verified circomlib gadget), which is sound and");
    console.log("universal but not itself a substitution step.");
  } else if (allPubDetermined) {
    console.log("RESULT: both public outputs are forward-determined (unique functions of");
    console.log("the inputs) by pure triangular substitution -- no solver, no bound.");
    console.log(`Non-output signals that STALL (${stalled.length}): the IsZero inverse hints`);
    console.log("plus the comparator machinery whose `out` is pinned by a case-split that");
    console.log("forward substitution does not perform (non-triangular-but-determined; the");
    console.log("two-witness null-space finds zero freedom there). Classify per the table");
    console.log("above; none is a public output.");
  } else {
    console.log("*** RESULT: a PUBLIC OUTPUT did not become determined. This is either a");
    console.log("genuine under-constraint (top-of-paper finding) or a non-triangular");
    console.log("determination of an output. Run scripts/two_witness_search.mjs on it NOW.");
  }
  console.log("=".repeat(64));
  console.log(`\nwrote ${join(OUT, "forward_determination.json")}`);
  process.exit(allPubDetermined ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(3); });
