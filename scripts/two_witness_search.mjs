// ===========================================================================
// Two-witness search: a tool-independent under-constraint oracle
//   (what-the-mutation-test-proved.md, Task 1)
//
//   node scripts/two_witness_search.mjs <circuit-basename> [--build DIR]
//        [--sym FILE] [--wasm FILE] [--input FILE] [--targets a,b,c] [--all]
//
// GROUND TRUTH (§4 of the note):
//   A circuit is under-constrained at a signal if two DISTINCT satisfying
//   witnesses exist that agree on every circuit INPUT (public and private) and
//   differ at that signal. This is the definition, not a proxy for it.
//
// METHOD
//   1. honest witness  w1  from the honest input.
//   2. Jacobian J of the R1CS at w1: row k of a constraint
//        (A_k . w)(B_k . w) - (C_k . w) = 0
//      is    a_k * B_k  +  b_k * A_k  -  C_k     with a_k = A_k.w1, b_k = B_k.w1.
//   3. Restrict J to the FREE columns (outputs + internal signals; every input
//      signal and the constant 1 are held fixed). Sparse fraction-free Gaussian
//      elimination gives rank and a nullspace basis over the scalar field.
//   4. A free signal t is a CANDIDATE under-constraint iff some nullspace basis
//      vector has a nonzero entry at t. For each candidate, form w2 = w1 + delta
//      and run snarkjs.wtns.check(r1cs, w2) against the FULL nonlinear R1CS.
//        w2 passes  -> a genuine second witness. The circuit IS under-constrained
//                      at t; delta is the exploit witness.
//        w2 fails   -> the linear direction is killed by the quadratic terms;
//                      reported as "linear nullspace nonzero, no nonlinear
//                      second witness found" with the search bound stated.
//   5. rank(J_free) == |FREE|  ->  NO nonzero delta on the free columns solves
//      J.delta = 0, i.e. the circuit is first-order rigid at every internal
//      signal at once. This is the strong negative result. It is still weaker
//      than an exhaustive search: a second witness reachable only by a large
//      nonlinear jump would not be found. That bound is printed with the result.
//
// Exit code: 2 if a genuine second witness is found on ANY target (a real
// soundness bug), else 0.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const base = A.find((x) => !x.startsWith("--")) || "wedge_mem_w8_d9_split";
const opt = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const BUILD = opt("build", join(ROOT, "build"));
const R1CS = opt("r1cs", join(BUILD, `${base}.r1cs`));
const WASM = opt("wasm", join(BUILD, `${base}.wasm`));
const SYM = opt("sym", join(BUILD, `main_${base.replace(/^wedge_/, "")}.sym`));
const INPUT = opt("input", join(BUILD, "input_mem_w8_d9_split.json"));
const ALL = A.includes("--all");
const TARGETS_ARG = opt("targets", "");
const MAXFILL = parseInt(opt("maxfill", "600"), 10);

// ---------------------------------------------------------------------------
// BN254 scalar field
export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const mod = (a) => ((a % P) + P) % P;
export const addm = (a, b) => mod(a + b);
export const subm = (a, b) => mod(a - b);
export const mulm = (a, b) => mod(a * b);
export function invm(a) {
  a = mod(a);
  if (a === 0n) throw new Error("inverse of zero");
  let [old_r, r] = [a, P], [old_s, s] = [1n, 0n];
  while (r !== 0n) { const q = old_r / r; [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return mod(old_s);
}

// ---------------------------------------------------------------------------
// standalone .r1cs binary reader  (format: iden3 r1cs v1)
export function readR1CS(path) {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "r1cs") throw new Error("bad r1cs magic");
  const version = b.readUInt32LE(4);
  const nSections = b.readUInt32LE(8);
  let p = 12;
  const secs = new Map();
  for (let i = 0; i < nSections; i++) {
    const type = b.readUInt32LE(p); const size = Number(b.readBigUInt64LE(p + 4));
    p += 12; secs.set(type, { p, size }); p += size;
  }
  // header (section 1)
  let hp = secs.get(1).p;
  const n8 = b.readUInt32LE(hp); hp += 4;
  hp += n8; // prime bytes, skip (we hardcode BN254 and verify below)
  const nWires = b.readUInt32LE(hp); hp += 4;
  const nPubOut = b.readUInt32LE(hp); hp += 4;
  const nPubIn = b.readUInt32LE(hp); hp += 4;
  const nPrvIn = b.readUInt32LE(hp); hp += 4;
  hp += 8; // nLabels u64
  const nConstraints = b.readUInt32LE(hp); hp += 4;

  const readLC = (pos) => {
    const nnz = b.readUInt32LE(pos); pos += 4;
    const terms = [];
    for (let i = 0; i < nnz; i++) {
      const w = b.readUInt32LE(pos); pos += 4;
      let v = 0n;
      for (let k = n8 - 1; k >= 0; k--) v = (v << 8n) | BigInt(b[pos + k]);
      pos += n8;
      terms.push([w, mod(v)]);
    }
    return [terms, pos];
  };

  let cp = secs.get(2).p;
  const cons = [];
  for (let i = 0; i < nConstraints; i++) {
    let a, bb, c;
    [a, cp] = readLC(cp);
    [bb, cp] = readLC(cp);
    [c, cp] = readLC(cp);
    cons.push({ a, b: bb, c });
  }
  return { nWires, nPubOut, nPubIn, nPrvIn, nConstraints, cons, n8 };
}

export function symMap(path) {
  const m = new Map(), inv = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const widx = parseInt(parts[1], 10);
    const name = parts.slice(3).join(",");
    if (widx >= 0) { m.set(name, widx); inv.set(widx, name); }
  }
  return { name2idx: m, idx2name: inv };
}

export const dot = (terms, w) => { let s = 0n; for (const [i, v] of terms) s = addm(s, mulm(v, w[i])); return s; };

// ---------------------------------------------------------------------------
// sparse fraction-free-ish Gaussian elimination over F_p.
// rows: Array<Map<col,val>>   returns { rank, pivotCol: Map<rowIdx,col>, R (echelon rows) }
// column order: we eliminate in ascending column index so a near-triangular
// circom Jacobian barely fills in.
export function rowEchelon(rows, freeCols, { maxFill = 400 } = {}) {
  // work on a copy; keys are column indices from freeCols only
  const R = rows.map((m) => new Map(m));
  const nR = R.length;
  const pivotColOfRow = new Array(nR).fill(-1);
  const rowOfPivotCol = new Map();
  let rank = 0;
  let maxRowLen = 0;

  for (const col of freeCols) {
    // find a pivot row: not yet a pivot, nonzero at col
    let pr = -1;
    for (let r = 0; r < nR; r++) {
      if (pivotColOfRow[r] !== -1) continue;
      const v = R[r].get(col);
      if (v !== undefined && v !== 0n) { pr = r; break; }
    }
    if (pr === -1) continue;
    // normalise pivot row
    const inv = invm(R[pr].get(col));
    for (const [k, v] of R[pr]) R[pr].set(k, mulm(v, inv));
    R[pr].set(col, 1n);
    pivotColOfRow[pr] = col;
    rowOfPivotCol.set(col, pr);
    rank++;
    // eliminate col from every other row (both pivoted and not — full RREF so
    // the nullspace basis reads off cleanly)
    for (let r = 0; r < nR; r++) {
      if (r === pr) continue;
      const f = R[r].get(col);
      if (f === undefined || f === 0n) continue;
      for (const [k, v] of R[pr]) {
        const nv = subm(R[r].get(k) ?? 0n, mulm(f, v));
        if (nv === 0n) R[r].delete(k); else R[r].set(k, nv);
      }
      R[r].delete(col);
      if (R[r].size > maxRowLen) maxRowLen = R[r].size;
      if (R[r].size > maxFill) throw new Error(`fill-in exceeded ${maxFill} (row ${r}); Jacobian too dense for this method`);
    }
  }
  return { rank, pivotColOfRow, rowOfPivotCol, R, maxRowLen };
}

// nullspace basis of J restricted to freeCols, from the RREF.
// each non-pivot free column c gives a basis vector:  delta[c] = 1,
// delta[pivotCol] = -(RREF row for that pivot)[c],  everything else 0.
export function nullspaceBasis(freeCols, ech) {
  const { rowOfPivotCol, R } = ech;
  const pivotCols = new Set(rowOfPivotCol.keys());
  const basis = [];
  for (const c of freeCols) {
    if (pivotCols.has(c)) continue;
    const vec = new Map();
    vec.set(c, 1n);
    for (const [pcol, prow] of rowOfPivotCol) {
      const coeff = R[prow].get(c);
      if (coeff !== undefined && coeff !== 0n) vec.set(pcol, mod(-coeff));
    }
    basis.push({ freeCol: c, vec });
  }
  return basis;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== two-witness search : ${base} ===`);
  const rel = (p) => String(p).replace(ROOT, "").replace(/\\/g, "/").replace(/^\/+/, "") || String(p);
  console.log(`r1cs   ${rel(R1CS)}`);
  console.log(`sym    ${rel(SYM)}`);
  console.log(`input  ${rel(INPUT)}\n`);

  const r = readR1CS(R1CS);
  // .sym is optional: without it the tool loses signal names and named targets,
  // but the load-bearing result (does any null-space direction move a public
  // signal?) needs only the r1cs. build.mjs does not emit .sym, so a fresh
  // `npm test` runs the tool name-less rather than failing.
  const haveSym = existsSync(SYM);
  const { name2idx, idx2name } = haveSym ? symMap(SYM) : { name2idx: new Map(), idx2name: new Map() };
  if (!haveSym) console.log(`(no .sym at ${SYM}; running without signal names)`);
  console.log(`wires ${r.nWires} | constraints ${r.nConstraints} | outputs ${r.nPubOut} | pub-in ${r.nPubIn} | prv-in ${r.nPrvIn}`);

  // witness layout: [1, outputs..., pubIn..., prvIn..., internal...]
  const nIn = r.nPubOut + r.nPubIn + r.nPrvIn;
  const FIXED = new Set([0]);
  for (let i = 1 + r.nPubOut; i <= nIn; i++) FIXED.add(i);      // every input signal
  const FREE = [];
  for (let i = 1; i < r.nWires; i++) if (!FIXED.has(i)) FREE.push(i);
  console.log(`FIXED (constant + ${nIn - r.nPubOut} input signals): ${FIXED.size}`);
  console.log(`FREE  (outputs + internal): ${FREE.length}\n`);

  // honest witness
  const input = JSON.parse(readFileSync(INPUT, "utf8"));
  const wpath = join(tmpdir(), `tws_${process.pid}.wtns`);
  await snarkjs.wtns.calculate(input, WASM, wpath);
  const w1 = (await snarkjs.wtns.exportJson(wpath)).map((x) => mod(BigInt(x)));
  if (w1.length !== r.nWires) console.log(`WARN witness length ${w1.length} != nWires ${r.nWires}`);

  // sanity: w1 satisfies the R1CS
  let bad = 0;
  for (const c of r.cons) if (subm(mulm(dot(c.a, w1), dot(c.b, w1)), dot(c.c, w1)) !== 0n) bad++;
  console.log(bad === 0 ? "honest witness satisfies all constraints" : `!! honest witness violates ${bad} constraints`);
  if (bad) process.exit(3);

  // Jacobian rows at w1  (as Map<col,val> over ALL columns; we filter to FREE later)
  const jrows = r.cons.map((c) => {
    const a = dot(c.a, w1), b = dot(c.b, w1);
    const row = new Map();
    const add = (i, v) => { const nv = addm(row.get(i) ?? 0n, v); if (nv === 0n) row.delete(i); else row.set(i, nv); };
    for (const [i, v] of c.b) add(i, mulm(a, v));
    for (const [i, v] of c.a) add(i, mulm(b, v));
    for (const [i, v] of c.c) add(i, mod(-v));
    // drop fixed columns: their delta is 0, so they never contribute
    for (const i of [...row.keys()]) if (FIXED.has(i)) row.delete(i);
    return row;
  });
  const nnz = jrows.reduce((s, m) => s + m.size, 0);
  console.log(`Jacobian over FREE columns: ${r.nConstraints} x ${FREE.length}, ${nnz} nonzeros (avg ${(nnz / r.nConstraints).toFixed(1)}/row)\n`);

  // targets
  const critical = [
    "main.N", "main.y", "main.root", "main.ctx", "main.epochAction", "main.epochTree", "main.signalHash",
    "main.res.C", "main.res.N", "main.res.y", "main.res.a1x",
  ];
  for (let i = 0; i < 9; i++) critical.push(`main.mk.cur[${i}]`, `main.mk.cur[${i + 1}]`);
  let targetNames;
  if (TARGETS_ARG) targetNames = TARGETS_ARG.split(",");
  else if (ALL) targetNames = FREE.map((i) => idx2name.get(i) || `w[${i}]`);
  else targetNames = critical;
  const targets = [];
  for (const nm of targetNames) {
    const idx = /^w\[(\d+)\]$/.test(nm) ? +nm.match(/\d+/)[0] : name2idx.get(nm);
    if (idx === undefined) { if (!ALL) console.log(`  (skip ${nm}: not in .sym or folded by --O2)`); continue; }
    if (FIXED.has(idx)) { console.log(`  (skip ${nm}: it is a fixed input)`); continue; }
    targets.push({ nm, idx });
  }

  // trivial pass: any target that appears in NO constraint at all
  const colUsedInConstraint = new Set();
  for (const c of r.cons) for (const lc of [c.a, c.b, c.c]) for (const [i] of lc) colUsedInConstraint.add(i);

  // A second witness is a DEFINITE soundness bug iff it moves a PUBLIC signal
  // (a public output; every input is held fixed). Public signals are indices
  // 1..nPubOut. A second witness that moves only NON-public signals is reported
  // and listed but not auto-classified: it may be benign (IsZero's `inv` hint is
  // free whenever its input is 0, and no public signal reads it) or a real
  // removed-check widening (M7/M8). That call is left to the analyst.
  const isPublic = (i) => i >= 1 && i <= r.nPubOut;
  console.log(`public signals (moving any of these is a soundness bug): indices 1..${r.nPubOut}\n`);

  // ---- global elimination ----
  console.log("running sparse Gaussian elimination over the scalar field ...");
  const t0 = Date.now();
  let ech;
  try {
    ech = rowEchelon(jrows, FREE, { maxFill: MAXFILL });
  } catch (e) {
    console.log(`\nELIMINATION ABORTED: ${e.message}`);
    console.log("Reporting the trivial + single-signal results only; the linear");
    console.log("nullspace search did not complete for this circuit.\n");
    ech = null;
  }

  const results = [];
  let anyRealBug = false;
  const nonPublicDirs = [];

  if (ech) {
    const nullity = FREE.length - ech.rank;
    console.log(`elimination done in ${((Date.now() - t0) / 1000).toFixed(1)}s | rank ${ech.rank} / ${FREE.length} | nullity ${nullity} | max row fill ${ech.maxRowLen}\n`);

    if (nullity === 0) {
      console.log("GLOBAL RESULT: rank(J_free) == |FREE|.");
      console.log("  No nonzero perturbation of the output/internal signals keeps");
      console.log("  J.delta = 0 while every input is held fixed. The circuit is");
      console.log("  first-order rigid at every internal signal simultaneously.");
      console.log("  BOUND: this is a linear (Jacobian) argument at the honest");
      console.log("  witness. A second witness reachable only by a large nonlinear");
      console.log("  jump is outside this search.\n");
    } else {
      console.log(`GLOBAL RESULT: nullity ${nullity} > 0 — candidate under-constrained signals exist.\n`);
      const basis = nullspaceBasis(FREE, ech);
      // which signals carry nonzero mass in the nullspace
      const carriers = new Map();
      for (const { vec } of basis) for (const [c, v] of vec) if (v !== 0n) carriers.set(c, (carriers.get(c) || 0) + 1);
      console.log(`nullspace basis dim ${basis.length}; ${carriers.size} distinct signals carry nonzero mass:`);
      for (const [c] of [...carriers].slice(0, 40)) console.log(`   ${idx2name.get(c) || `w[${c}]`}`);
      // verify each basis vector against the FULL nonlinear R1CS
      console.log("\nverifying each nullspace direction against the full (nonlinear) R1CS:");
      for (const { freeCol, vec } of basis) {
        const w2 = w1.slice();
        for (const [c, v] of vec) w2[c] = mod(w1[c] + v);
        let ok = true, viol = 0;
        for (const c of r.cons) if (subm(mulm(dot(c.a, w2), dot(c.b, w2)), dot(c.c, w2)) !== 0n) { ok = false; viol++; }
        const changed = [...vec.keys()].map((c) => idx2name.get(c) || `w[${c}]`);
        if (ok) {
          const pub = [...vec.keys()].filter(isPublic).map((c) => idx2name.get(c) || `w[${c}]`);
          if (pub.length) {
            anyRealBug = true;
            console.log(`   *** SECOND WITNESS MOVES A PUBLIC SIGNAL (${pub.join(", ")}) — SOUNDNESS BUG ***`);
            console.log(`       anchored at ${idx2name.get(freeCol) || `w[${freeCol}]`}; differs at: ${changed.join(", ")}`);
          } else {
            nonPublicDirs.push(changed);
            console.log(`   second witness at non-public signal(s): ${changed.join(", ")}`);
          }
        } else {
          console.log(`   direction at ${idx2name.get(freeCol) || `w[${freeCol}]`}: killed by ${viol} nonlinear constraint(s) (linear only)`);
        }
      }
      console.log();
    }
  }

  // ---- per-target report ----
  console.log("per-target:");
  for (const { nm, idx } of targets) {
    let verdict, detail;
    if (!colUsedInConstraint.has(idx)) {
      // appears in no constraint -> trivially free
      const w2 = w1.slice(); w2[idx] = mod(w1[idx] + 1n);
      let ok = true; for (const c of r.cons) if (subm(mulm(dot(c.a, w2), dot(c.b, w2)), dot(c.c, w2)) !== 0n) ok = false;
      verdict = !ok ? "in no constraint yet perturbation fails (?)"
              : isPublic(idx) ? "UNDER-CONSTRAINED (public signal, in no constraint)"
                    : "free (in no constraint); non-public signal - classify manually";
      if (ok && isPublic(idx)) anyRealBug = true;
    } else if (ech && (FREE.length - ech.rank) === 0) {
      verdict = "determined (global nullity 0)";
    } else if (ech) {
      // is idx a pivot? then check whether any nullspace basis vec touches it
      const basis = nullspaceBasis(FREE, ech);
      const hit = basis.find(({ vec }) => (vec.get(idx) ?? 0n) !== 0n);
      if (!hit) verdict = "determined (no nullspace direction touches it)";
      else {
        const w2 = w1.slice(); for (const [c, v] of hit.vec) w2[c] = mod(w1[c] + v);
        let ok = true; for (const c of r.cons) if (subm(mulm(dot(c.a, w2), dot(c.b, w2)), dot(c.c, w2)) !== 0n) ok = false;
        const movesPub = ok && [...hit.vec.keys()].some(isPublic);
        verdict = !ok ? "linear nullspace touches it, nonlinear check kills it"
                : movesPub ? "UNDER-CONSTRAINED - second witness moves a public signal"
                : isPublic(idx) ? "UNDER-CONSTRAINED - public signal, a second witness moves it"
                       : "second witness exists at non-public signals; classify manually";
        if (movesPub || (ok && isPublic(idx))) anyRealBug = true;
        detail = `direction touches ${[...hit.vec.keys()].map((c) => idx2name.get(c) || `w[${c}]`).join(", ")}`;
      }
    } else {
      // elimination aborted: fall back to single-signal test
      const w2 = w1.slice(); w2[idx] = mod(w1[idx] + 1n);
      let ok = true; for (const c of r.cons) if (subm(mulm(dot(c.a, w2), dot(c.b, w2)), dot(c.c, w2)) !== 0n) ok = false;
      verdict = !ok ? "single-signal perturbation rejected (elimination did not run)"
              : isPublic(idx) ? "UNDER-CONSTRAINED (single-signal perturbation on a public signal accepted)"
                    : "single-signal perturbation accepted; non-public signal - classify manually";
      if (ok && isPublic(idx)) anyRealBug = true;
    }
    console.log(`   ${nm.padEnd(24)} ${verdict}${detail ? "  [" + detail + "]" : ""}`);
    results.push({ target: nm, idx, verdict });
  }

  console.log(`\nSEARCH BOUND: Jacobian nullspace at the honest witness + exact`);
  console.log(`nonlinear re-check of every nullspace direction. A second witness`);
  console.log(`that exists only via a nonlinear path with zero linear component is`);
  console.log(`NOT covered. Absence of a found second witness is weaker evidence`);
  console.log(`than a found one.\n`);

  if (nonPublicDirs.length) {
    console.log(`\n${nonPublicDirs.length} second-witness direction(s) at NON-PUBLIC signals only:`);
    for (const d of nonPublicDirs) console.log(`   {${d.join(", ")}}`);
    console.log("  benign if these are IsZero-style scratch hints (free when input==0) that");
    console.log("  no public signal reads; a real bug if they are a removed check.");
  }
  if (anyRealBug) {
    console.log("\n################################################################");
    console.log("#  SECOND WITNESS MOVES A PUBLIC SIGNAL - REAL SOUNDNESS BUG      #");
    console.log("################################################################");
  } else if (nonPublicDirs.length) {
    console.log("\nNo second witness moved a public signal; non-public directions need review.");
  } else {
    console.log("\nNo second witness found on any probed signal, within the bound above.");
  }
  process.exit(anyRealBug ? 2 : 0);
}

// run as CLI only when invoked directly; importable as a library otherwise.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => { console.error(e); process.exit(3); });
}
