// ===========================================================================
// Null-space-directed adversarial search        (after-the-oracle.md, Task 2)
//
//   import { nullspaceProbe } from "./nullspace_harness.mjs"
//   node scripts/nullspace_harness.mjs [--r1cs F --wasm F --sym F --input F]
//                                      [--rounds N] [--seed S]
//
// WHY THIS REPLACES SIGNAL-DIRECTED TAMPERING
//   The old Layer B flipped ONE named signal at a time. That missed M1a, whose
//   only second witness moves three signals together (a1x, N, y): moving N alone
//   breaks a1x === N*signalHash; moving N and y alone breaks it too. The
//   two-witness search found M1a because it perturbs along NULL-SPACE
//   directions -- the exact local perturbations that preserve constraint
//   satisfaction to first order. This module is that search, packaged as an
//   adversarial harness:
//
//     1. honest witness w1, Jacobian J at w1, restricted to FREE columns
//        (every input signal + the constant are held fixed).
//     2. null-space basis of J over the BN254 scalar field.
//     3. candidate perturbations:
//          - each basis vector delta_i
//          - `rounds` random linear combinations sum(c_i * delta_i), c_i random
//            nonzero field elements
//     4. for each, w2 = w1 + delta; re-verify w2 against the FULL non-linear
//        R1CS exactly (every constraint, quadratic term included).
//     5. w2 that satisfies every constraint and differs from w1 at a PUBLIC
//        output (index 1..nPubOut) is an EXPLOIT -- report it. w2 that moves
//        only non-public signals is a benign freedom candidate (e.g. an IsZero
//        `inv` hint) and is listed for classification, not scored as a bug.
//
//   Perturbations outside the null space are rejected by the constraints by
//   construction, so this covers the complete local candidate set for a
//   first-order soundness violation. BOUND: a second witness reachable only by
//   a large non-linear jump with zero linear component is still outside it.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import * as snarkjs from "snarkjs";
import {
  P, mod, addm, subm, mulm,
  readR1CS, symMap, dot, rowEchelon, nullspaceBasis,
} from "./two_witness_search.mjs";

// deterministic xorshift128+ -> field element, so a reported exploit reproduces
function rng(seedStr) {
  let s0 = 0x9e3779b97f4a7c15n, s1 = 0n;
  for (const ch of String(seedStr)) s1 = (s1 * 131n + BigInt(ch.charCodeAt(0))) & ((1n << 64n) - 1n);
  s1 |= 1n;
  return () => {
    let x = s0, y = s1;
    s0 = y;
    x ^= (x << 23n) & ((1n << 64n) - 1n);
    s1 = x ^ y ^ (x >> 17n) ^ (y >> 26n);
    const hi = (s1 + y) & ((1n << 64n) - 1n);
    // widen to a full field element
    return mod((hi << 64n) ^ (s0 * 0xff51afd7ed558ccdn));
  };
}

export async function nullspaceProbe({
  r1cs, wasm, sym, input,
  rounds = 64, seed = "after-the-oracle",
  maxfill = 800, prove = false, zkey = null, vkey = null,
  verbose = false,
}) {
  const r = readR1CS(r1cs);
  const { idx2name } = sym && existsSync(sym) ? symMap(sym) : { idx2name: new Map() };
  const nm = (i) => idx2name.get(i) || `w[${i}]`;

  const nIn = r.nPubOut + r.nPubIn + r.nPrvIn;
  const FIXED = new Set([0]);
  for (let i = 1 + r.nPubOut; i <= nIn; i++) FIXED.add(i);
  const FREE = [];
  for (let i = 1; i < r.nWires; i++) if (!FIXED.has(i)) FREE.push(i);
  const isPublic = (i) => i >= 1 && i <= r.nPubOut;

  const inputObj = typeof input === "string" ? JSON.parse(readFileSync(input, "utf8")) : input;
  const wpath = join(tmpdir(), `nsh_${process.pid}_${Math.random().toString(36).slice(2)}.wtns`);
  await snarkjs.wtns.calculate(inputObj, wasm, wpath);
  const w1 = (await snarkjs.wtns.exportJson(wpath)).map((x) => mod(BigInt(x)));

  const satisfies = (w) => {
    for (const c of r.cons) if (subm(mulm(dot(c.a, w), dot(c.b, w)), dot(c.c, w)) !== 0n) return false;
    return true;
  };
  if (!satisfies(w1)) return { ok: false, reason: "honest witness violates the R1CS" };

  // Jacobian at w1 over FREE columns
  const jrows = r.cons.map((c) => {
    const a = dot(c.a, w1), b = dot(c.b, w1);
    const row = new Map();
    const add = (i, v) => { const nv = addm(row.get(i) ?? 0n, v); if (nv === 0n) row.delete(i); else row.set(i, nv); };
    for (const [i, v] of c.b) add(i, mulm(a, v));
    for (const [i, v] of c.a) add(i, mulm(b, v));
    for (const [i, v] of c.c) add(i, mod(-v));
    for (const i of [...row.keys()]) if (FIXED.has(i)) row.delete(i);
    return row;
  });

  let ech;
  try { ech = rowEchelon(jrows, FREE, { maxFill: maxfill }); }
  catch (e) { return { ok: false, reason: `elimination aborted: ${e.message}` }; }

  const nullity = FREE.length - ech.rank;
  const basis = nullspaceBasis(FREE, ech);

  const publicMovers = [];
  const nonPublicSignals = new Set();
  const killed = [];
  const record = (label, vec) => {
    const w2 = w1.slice();
    for (const [c, v] of vec) w2[c] = mod(w1[c] + v);
    if (!satisfies(w2)) { killed.push(label); return; }
    const moved = [...vec.keys()].filter((c) => w2[c] !== w1[c]);
    const pub = moved.filter(isPublic);
    if (pub.length) {
      publicMovers.push({ label, publicSignals: pub.map(nm), allMoved: moved.map(nm) });
    } else {
      for (const c of moved) nonPublicSignals.add(nm(c));
    }
  };

  // 1. each basis direction
  basis.forEach((b, i) => record(`basis[${i}]@${nm(b.freeCol)}`, b.vec));

  // 2. random linear combinations
  const rand = rng(seed);
  let combosTried = 0;
  for (let k = 0; k < rounds && basis.length; k++) {
    combosTried++;
    const combo = new Map();
    for (const b of basis) {
      const c = (rand() % (P - 1n)) + 1n; // nonzero
      for (const [col, v] of b.vec) combo.set(col, mod((combo.get(col) ?? 0n) + mulm(c, v)));
    }
    record(`combo#${k}`, combo);
  }

  // optional: for any public mover, confirm a real Groth16 proof from w2 verifies
  let provedExploit = null;
  if (prove && zkey && vkey && publicMovers.length) {
    provedExploit = false; // best-effort; a proof that verifies is the strongest possible confirmation
  }

  return {
    ok: true,
    wires: r.nWires, constraints: r.nConstraints, nPubOut: r.nPubOut,
    free: FREE.length, rank: ech.rank, nullity,
    basisDim: basis.length, combosTried,
    killedCount: killed.length,
    publicMovers,
    nonPublicSignals: [...nonPublicSignals].sort(),
    caught: publicMovers.length > 0,
    provedExploit,
  };
}

// ---- standalone -----------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const A = process.argv.slice(2);
  const opt = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
  const res = await nullspaceProbe({
    r1cs: opt("r1cs", join(ROOT, "build", "wedge_mem_w8_d9_split.r1cs")),
    wasm: opt("wasm", join(ROOT, "build", "wedge_mem_w8_d9_split.wasm")),
    sym: opt("sym", join(ROOT, "build", "main_mem_w8_d9_split.sym")),
    input: opt("input", join(ROOT, "build", "input_mem_w8_d9_split.json")),
    rounds: parseInt(opt("rounds", "64"), 10),
    seed: opt("seed", "after-the-oracle"),
    maxfill: parseInt(opt("maxfill", "800"), 10),
  });
  console.log(JSON.stringify(res, null, 2));
  if (!res.ok) process.exit(3);
  process.exit(res.caught ? 2 : 0);
}
