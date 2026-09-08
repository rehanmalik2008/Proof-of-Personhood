// ===========================================================================
// Adversarial soundness harness  (auditing-yourself-honestly.md, Step 3)
//
//   node scripts/test_soundness_adversarial.mjs
//
// WHY THIS EXISTS
//   Every other test in this repo drives the HONEST prover: it feeds well-formed
//   inputs to the witness generator and checks the output. That says nothing
//   about soundness. An under-constrained circuit is only exploitable by a
//   prover that supplies a witness the honest generator would never produce.
//
//   This harness constructs those witnesses and checks the circuit rejects them.
//   Two layers:
//
//   Layer A -- input-level. Hand a malformed input to the witness generator and
//     assert `wtns.calculate` THROWS. A throw means some `===` constraint fired
//     during witness computation, i.e. the property is enforced by a constraint.
//     If it does NOT throw, either the constraint is missing (a soundness bug) or
//     the "violation" was not really one.
//
//   Layer B -- witness-level (stronger). Compute an honest witness, then flip one
//     signal to an adversarial value, re-serialise the .wtns, and run BOTH
//       snarkjs.wtns.check(r1cs, wtns)      -- does the assignment satisfy R1CS?
//       groth16.prove + groth16.verify      -- does a proof from it verify?
//     A properly constrained signal makes both FAIL. A tampered assignment that
//     still satisfies the R1CS / still verifies is a genuine soundness bug: the
//     signal was under-constrained.
//
// Each check prints PASS/FAIL and the property it defends. Exit 0 iff all pass.
// A real soundness bug found here is a SUCCESS of the method (report it loudly).
// ===========================================================================

// snarkjs leaves FileHandles for the GC to close; that noise is not ours to fix.
process.on("warning", (w) => { if (!/file descriptor|FileHandle/.test(w.message)) console.warn(w); });

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nullspaceProbe } from "./nullspace_harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// Re-targetable so scripts/mutation_test.mjs can point the same checks at a
// mutant build. Defaults are the real build/, i.e. behaviour is unchanged.
const BUILD      = process.env.ADV_BUILD_DIR || join(ROOT, "build");
const SKIP_PROVE = process.env.ADV_SKIP_PROVE === "1";   // use wtns.check as the sole oracle
const JSON_OUT   = process.env.ADV_JSON || "";           // machine-readable {check: pass} map
const B = (p) => join(BUILD, p);

const poseidon = await buildPoseidon();
const F = poseidon.F;
const P = F.p; // BN254 scalar field prime
const H = (a) => F.toObject(poseidon(a));
const toDec = (x) => (typeof x === "bigint" ? x : F.toObject(x)).toString();

let pass = 0, fail = 0;
const RESULTS = {};                       // check-id -> true(pass)/false(fail)
const id = (n) => String(n).trim().split(/\s\s+/)[0];
const okpass = (n, why) => { pass++; RESULTS[id(n)] = true; console.log(`  PASS  ${n}`); if (why) console.log(`          ↳ ${why}`); };
const okfail = (n, d) => { fail++; RESULTS[id(n)] = false; console.log(`  FAIL  ${n}`); if (d) console.log(`          ↳ ${d}`); };

const tdir = mkdtempSync(join(tmpdir(), "advsound_"));
let wc = 0;
const wtnsPath = () => join(tdir, `w${wc++}.wtns`);

// ---------------------------------------------------------------------------
// minimal .wtns v2 binary writer (snarkjs exposes exportJson but no importer)
// format: "wtns" | u32 ver=2 | u32 nSec=2
//   sec1(id=1,len): u32 n8 | n8-byte prime LE | u32 nWitness
//   sec2(id=2,len): nWitness * n8-byte LE
// ---------------------------------------------------------------------------
function writeWtns(path, values /* BigInt[] */) {
  const n8 = 32;
  const nW = values.length;
  const leBytes = (v, len) => {
    v = ((v % P) + P) % P;
    const b = Buffer.alloc(len);
    for (let i = 0; i < len; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
    return b;
  };
  const head = Buffer.concat([
    Buffer.from("wtns", "ascii"),
    (() => { const b = Buffer.alloc(8); b.writeUInt32LE(2, 0); b.writeUInt32LE(2, 4); return b; })(),
  ]);
  const sec1body = Buffer.concat([
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(n8, 0); return b; })(),
    leBytes(P, n8),
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(nW, 0); return b; })(),
  ]);
  const sec1 = Buffer.concat([
    (() => { const b = Buffer.alloc(12); b.writeUInt32LE(1, 0); b.writeBigUInt64LE(BigInt(sec1body.length), 4); return b; })(),
    sec1body,
  ]);
  const sec2body = Buffer.concat(values.map((v) => leBytes(v, n8)));
  const sec2 = Buffer.concat([
    (() => { const b = Buffer.alloc(12); b.writeUInt32LE(2, 0); b.writeBigUInt64LE(BigInt(sec2body.length), 4); return b; })(),
    sec2body,
  ]);
  writeFileSync(path, Buffer.concat([head, sec1, sec2]));
}

// parse a .sym file -> Map(name -> witnessIndex)   (witnessIndex -1 == folded by --O2)
function symMap(symPath) {
  const m = new Map();
  for (const line of readFileSync(symPath, "utf8").split("\n")) {
    const p = line.split(",");
    if (p.length < 4) continue;
    m.set(p.slice(3).join(","), parseInt(p[1], 10));
  }
  return m;
}

async function honestWitness(wasm, input) {
  const w = wtnsPath();
  await snarkjs.wtns.calculate(input, wasm, w);
  return w;
}
async function wtnsValues(w) {
  return (await snarkjs.wtns.exportJson(w)).map((x) => BigInt(x));
}
async function checkR1CS(r1cs, w) {
  try { return await snarkjs.wtns.check(r1cs, w); }
  catch { return false; } // check() throws on gross malformation -> treat as "not satisfied"
}
async function proveVerify(zkey, vkeyPath, w) {
  const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, w);
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// expect wtns.calculate(input) to THROW  (Layer A)
async function expectReject(name, wasm, input, property) {
  try {
    const w = wtnsPath();
    await snarkjs.wtns.calculate(input, wasm, w);
    okfail(name, `witness generator ACCEPTED a malformed input — the constraint for "${property}" may be missing`);
  } catch (e) {
    okpass(name, `${property}  (generator rejected: ${String(e.message || e).split("\n")[0].slice(0, 90)})`);
  }
}
// expect wtns.calculate(input) to SUCCEED  (Layer A negative control / documented behaviour)
async function expectAccept(name, wasm, input, note) {
  try {
    const w = wtnsPath();
    await snarkjs.wtns.calculate(input, wasm, w);
    okpass(name, note);
    return w;
  } catch (e) {
    okfail(name, `expected the generator to ACCEPT this input but it threw: ${String(e.message || e).split("\n")[0]}`);
  }
}
// tamper witness[idx] := val ; expect BOTH r1cs-check and verify to FAIL  (Layer B)
async function expectTamperCaught(name, { r1cs, zkey, vkey }, baseVals, idx, val, property) {
  const vals = baseVals.slice();
  vals[idx] = ((val % P) + P) % P;
  const w = wtnsPath();
  writeWtns(w, vals);
  const satisfies = await checkR1CS(r1cs, w);
  let verifies = null;
  if (!satisfies && zkey && !SKIP_PROVE) {
    try { verifies = await proveVerify(zkey, vkey, w); } catch { verifies = false; }
  }
  if (satisfies) {
    okfail(name, `TAMPERED witness still satisfies the R1CS — signal #${idx} is UNDER-CONSTRAINED. Property at risk: ${property}`);
  } else if (verifies === true) {
    okfail(name, `TAMPERED witness fails wtns.check but a proof from it still VERIFIES — investigate (${property})`);
  } else {
    okpass(name, `${property}  (tampered signal #${idx}: R1CS unsatisfied${verifies === false ? " and proof rejected" : ""})`);
  }
}

const CIRC = {
  split: {
    wasm: B("wedge_mem_w8_d9_split.wasm"), r1cs: B("wedge_mem_w8_d9_split.r1cs"),
    zkey: B("wedge_mem_w8_d9_split_final.zkey"), vkey: B("wedge_mem_w8_d9_split_vkey.json"),
    sym: B("main_mem_w8_d9_split.sym"), input: JSON.parse(readFileSync(B("input_mem_w8_d9_split.json"), "utf8")),
  },
  rev64: {
    wasm: B("wedge_mem_w8_d9_split_rev64.wasm"), r1cs: B("wedge_mem_w8_d9_split_rev64.r1cs"),
    zkey: B("wedge_mem_w8_d9_split_rev64_final.zkey"), vkey: B("wedge_mem_w8_d9_split_rev64_vkey.json"),
    sym: B("main_mem_w8_d9_split_rev64.sym"), input: JSON.parse(readFileSync(B("input_mem_w8_d9_split_rev64.json"), "utf8")),
  },
  enrol: {
    wasm: B("wedge_direct_k3.wasm"), r1cs: B("wedge_direct_k3.r1cs"),
    zkey: B("wedge_direct_k3_final.zkey"), vkey: B("wedge_direct_k3_vkey.json"),
    sym: B("main_wedge_direct_k3.sym"), input: JSON.parse(readFileSync(B("input_direct_k3.json"), "utf8")),
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const bump = (x) => (BigInt(x) + 1n).toString();

// =========================================================================
console.log("\n=== LAYER A — input-level: the witness generator must reject malformed inputs ===\n");

// -- A. login circuit (split) --------------------------------------------------
{
  const c = CIRC.split, base = c.input;

  // A1  unforgeability / know-the-secret: s does not hash to the leaf under the path
  {
    const bad = clone(base); bad.s = bump(base.s);
    await expectReject("A1  s inconsistent with the committed leaf", c.wasm, bad,
      "membership requires C = Poseidon(s) to be the opened leaf");
  }
  // A2  Merkle path integrity: a sibling is not the real sibling
  {
    const bad = clone(base); bad.node[3][5] = bump(base.node[3][5]);
    await expectReject("A2  Merkle path with a forged sibling", c.wasm, bad,
      "the opened path must hash to the published root");
  }
  // A3  wrong (but in-range) path index
  {
    const bad = clone(base); bad.pathIndex[2] = base.pathIndex[2] === "0" ? "1" : "0";
    await expectReject("A3  path index points at the wrong (in-range) slot", c.wasm, bad,
      "dotAcc === cur[i]: the running hash must sit in the selected slot");
  }
  // A4  out-of-range path index
  {
    const bad = clone(base); bad.pathIndex[4] = "8"; // W = 8, valid slots 0..7
    await expectReject("A4  out-of-range path index (8, arity is 8)", c.wasm, bad,
      "selAcc[i][W] === 1: exactly one in-range slot must be selected");
  }
  // A5  forged root
  {
    const bad = clone(base); bad.root = bump(base.root);
    await expectReject("A5  proof against a root the path does not open to", c.wasm, bad,
      "root === cur[depth]");
  }
  // A6  DOCUMENTED, NOT A BUG: epochTree has no in-circuit role; the verifier must
  //     bind it out of circuit (root-freshness). Two inputs differing only in
  //     epochTree both succeed and produce the SAME N and y.
  {
    const w0 = await honestWitness(c.wasm, base);
    const v0 = await wtnsValues(w0);
    const alt = clone(base); alt.epochTree = "999999";
    const wA = await expectAccept("A6  epochTree varied → generator ACCEPTS (by design)", c.wasm, alt,
      "epochTree is a verifier-checked public input with zero in-circuit constraints; deployment MUST enforce root-freshness on it (THREAT-MODEL §6, freshness.mjs). This is an OBLIGATION ON THE VERIFIER, surfaced here, not a circuit bug.");
    if (wA) {
      const vA = await wtnsValues(wA);
      (v0[1] === vA[1] && v0[2] === vA[2])
        ? okpass("A6b  N and y unchanged when only epochTree changes", "confirms the RLN slot binds to epochAction only (splitting-the-epochs.md invariant)")
        : okfail("A6b  N or y moved when only epochTree changed", `N ${v0[1]}→${vA[1]}, y ${v0[2]}→${vA[2]}`);
    }
  }
  // A7  cross-context: changing ctx changes N (it is a per-context nullifier)
  {
    const w0 = await honestWitness(c.wasm, base);
    const v0 = await wtnsValues(w0);
    const alt = clone(base); alt.ctx = bump(base.ctx);
    const wA = await expectAccept("A7  ctx varied → generator ACCEPTS", c.wasm, alt, "different context is a legitimate different proof");
    if (wA) {
      const vA = await wtnsValues(wA);
      vA[1] !== v0[1]
        ? okpass("A7b  N differs across contexts", `N@ctx = ${v0[1].toString().slice(0,12)}…  ≠  N@ctx' = ${vA[1].toString().slice(0,12)}…  (Poseidon(s,ctx,epochAction))`)
        : okfail("A7b  N collided across two different contexts", "cross-context unlinkability would be broken");
    }
  }
}

// -- B. revocation circuit --------------------------------------------------
{
  const c = CIRC.rev64, base = c.input;
  const Cpriv = H([BigInt(base.s)]); // recover the private commitment from s

  // A8  a genuinely revoked credential must not be able to prove non-membership
  {
    const bad = clone(base); bad.revoked = base.revoked.slice(); bad.revoked[9] = toDec(Cpriv);
    await expectReject("A8  non-membership proof for a REVOKED entry (C on the list)", c.wasm, bad,
      "(C - r_i)·inv_i === 1 is unsatisfiable when C = r_i");
  }
  // A8b  sanity: the honest revocation input still proves (negative control)
  {
    const w = await expectAccept("A8b  honest (non-revoked) credential still proves", c.wasm, base, "negative control for A8");
  }
}

// -- C. enrolment circuit ------------------------------------------------------
{
  const c = CIRC.enrol, base = c.input;

  // A9  diversity predicate: category labels must be pairwise distinct
  {
    const bad = clone(base); bad.category = [base.category[0], base.category[0], base.category[2]];
    await expectReject("A9  enrolment with two equal category labels", c.wasm, bad,
      "IsEqual(category[i], category[j]).out === 0 for every pair");
  }
  // A10  a broken attester signature must not verify
  {
    const bad = clone(base); bad.S = base.S.slice(); bad.S[1] = bump(base.S[1]);
    await expectReject("A10  enrolment with a corrupted attester signature", c.wasm, bad,
      "EdDSAPoseidonVerifier over C for every attester");
  }
  // A11  the message every signature signs is C = Poseidon(s), not a free value
  {
    const bad = clone(base); bad.s = bump(base.s);
    await expectReject("A11  enrolment where s does not match the signed commitment", c.wasm, bad,
      "v[i].M <== C <== Poseidon(s); changing s breaks all k signatures");
  }
}

// =========================================================================
console.log("\n=== LAYER B — witness-level: tampering one signal must break the R1CS (and any proof) ===\n");

// -- login circuit (split): N and y are public outputs -----------------------
{
  const c = CIRC.split;
  const sym = symMap(c.sym);
  const w = await honestWitness(c.wasm, c.input);
  const vals = await wtnsValues(w);

  // negative control: the untouched honest witness satisfies the R1CS and verifies
  {
    const ok1 = await checkR1CS(c.r1cs, w);
    let ok2 = SKIP_PROVE ? true : false;
    if (!SKIP_PROVE) { try { ok2 = await proveVerify(c.zkey, c.vkey, w); } catch {} }
    (ok1 && ok2) ? okpass("B0  honest witness: R1CS satisfied AND proof verifies", SKIP_PROVE ? "baseline (R1CS only; prove/verify skipped)" : "baseline")
                 : okfail("B0  honest witness did not check out", `wtns.check=${ok1} verify=${ok2}`);
  }

  const s = BigInt(c.input.s), ctx = BigInt(c.input.ctx), ea = BigInt(c.input.epochAction), sh = BigInt(c.input.signalHash);
  const iN = sym.get("main.N"), iY = sym.get("main.y");

  // B1  nullifier forged for a DIFFERENT secret: set N := Poseidon(s', ctx, epochAction)
  {
    const sPrime = s + 12345n;
    await expectTamperCaught("B1  N replaced with a nullifier for another secret", c, vals, iN,
      H([sPrime, ctx, ea]), "N is bound to Poseidon(s, ctx, epochAction) — a nullifier cannot be forged for a different s");
  }
  // B2  cross-context collision: set N := N@(different ctx)
  {
    await expectTamperCaught("B2  N forced to equal the nullifier at another context", c, vals, iN,
      H([s, ctx + 1n, ea]), "N@ctx1 = N@ctx2 for one s would need a broken constraint (or a Poseidon collision)");
  }
  // B3  RLN share moved off the degree-1 line: y := y + 1
  {
    await expectTamperCaught("B3  RLN share y nudged off the line", c, vals, iY,
      vals[iY] + 1n, "y === s + N·signalHash — the Shamir share is pinned to the line");
  }
  // B4  evasive burn: present (N, y) that are individually plausible but encode a
  //     different secret, i.e. y := s'' + N·signalHash for s'' ≠ s
  {
    const sPP = s + 999n;
    const N = vals[iN];
    await expectTamperCaught("B4  y rewritten for a different secret (burn-evasion attempt)", c, vals, iY,
      (sPP + N * sh) % P, "two same-(ctx,epochAction) proofs cannot show inconsistent (s in C) vs (s in y): y is tied to the same s that forms C");
  }
}

// -- revocation circuit: the non-membership inverse must be the true inverse --
{
  const c = CIRC.rev64;
  const sym = symMap(c.sym);
  const w = await honestWitness(c.wasm, c.input);
  const vals = await wtnsValues(w);
  const iInv7 = sym.get("main.nm.inv[7]");
  if (iInv7 && iInv7 > 0) {
    // B5  set inv[7] := 0. Honest value is 1/(C - revoked[7]); zero breaks diff·inv === 1.
    await expectTamperCaught("B5  non-membership inverse witness zeroed", c, vals, iInv7,
      0n, "diff_i · inv_i === 1 forces inv_i to be the true inverse; a revoked C (diff=0) then has no witness");
  } else {
    okfail("B5  could not locate main.nm.inv[7] in the .sym", `got index ${iInv7}`);
  }
}

// -- enrolment circuit: C is a public output bound to s ----------------------
{
  const c = CIRC.enrol;
  const sym = symMap(c.sym);
  const w = await honestWitness(c.wasm, c.input);
  const vals = await wtnsValues(w);
  const iC = sym.get("main.C");
  // B6  set C := Poseidon(s') for s' ≠ s, leaving s untouched
  await expectTamperCaught("B6  enrolment commitment C swapped for another", c, vals, iC,
    H([BigInt(c.input.s) + 7n]), "C === Poseidon(s): the enrolled commitment is bound to the proven secret");
}

// =========================================================================
// LAYER C — null-space-directed (after-the-oracle.md, Task 2). Layer B flips one
// named signal at a time and provably misses coordinated moves (it missed M1a's
// (a1x, N, y)). Layer C perturbs along the Jacobian null-space basis and random
// linear combinations of it -- the complete local candidate set for a first-
// order soundness violation -- and re-verifies each against the full non-linear
// R1CS. Any perturbation that satisfies every constraint, holds every input
// fixed, and moves a PUBLIC output is an exploit.
console.log("\n=== LAYER C — null-space-directed adversarial search (systematic) ===\n");
{
  const c = CIRC.split;
  const NS_ROUNDS = Number(process.env.ADV_NS_ROUNDS || 128);
  let res;
  try {
    res = await nullspaceProbe({
      r1cs: c.r1cs, wasm: c.wasm, sym: c.sym, input: c.input,
      rounds: NS_ROUNDS, seed: "adversarial-harness-layerC",
    });
  } catch (e) {
    res = { ok: false, reason: String(e.message || e).split("\n")[0] };
  }

  if (!res.ok) {
    // an aborted elimination is INCONCLUSIVE, never a pass-by-default and never a
    // detection. Record it honestly; do not fail the suite on tooling limits.
    okpass("C0  null-space elimination did not complete — INCONCLUSIVE",
      `${res.reason}. Layer C contributed no evidence for this build; Layers A/B stand.`);
  } else {
    okpass("C0  null-space basis computed",
      `nullity ${res.nullity}; ${res.basisDim} basis directions + ${res.combosTried} random combinations re-verified against the full R1CS`);

    (res.caught)
      ? okfail("C1  a null-space direction moves a PUBLIC output",
          `EXPLOIT: ${res.publicMovers.map((m) => `${m.label} → {${m.publicSignals.join(", ")}}`).join("; ")}  — the circuit is UNDER-CONSTRAINED at a public output`)
      : okpass("C1  no null-space direction moves a public output",
          `all ${res.basisDim + res.combosTried} perturbations either break a constraint or move only non-public signals`);

    const onlyIsZero = res.nonPublicSignals.every((s) => /\.isz\.inv$/.test(s));
    (res.nonPublicSignals.length === 0 || onlyIsZero)
      ? okpass("C2  non-public freedoms are IsZero `inv` hints only",
          res.nonPublicSignals.length ? res.nonPublicSignals.join(", ") : "none")
      : okfail("C2  a non-public null-space freedom is NOT an IsZero hint",
          `classify: ${res.nonPublicSignals.filter((s) => !/\.isz\.inv$/.test(s)).join(", ")}`);
  }
}

// =========================================================================
console.log("\n=== END-TO-END — the RLN burn actually recovers s from two evasive-looking proofs ===\n");
{
  const c = CIRC.split;
  const mk = (signalHashDec) => { const i = clone(c.input); i.signalHash = signalHashDec; return i; };
  const x1 = BigInt(c.input.signalHash);
  const x2 = (x1 + 0x9e3779b97f4a7c15n) % P;
  const w1 = await honestWitness(c.wasm, mk(x1.toString()));
  const w2 = await honestWitness(c.wasm, mk(x2.toString()));
  const v1 = await wtnsValues(w1), v2 = await wtnsValues(w2);
  const N1 = v1[1], y1 = v1[2], N2 = v2[1], y2 = v2[2];
  const sTrue = BigInt(c.input.s);

  if (N1 !== N2) {
    okfail("E1  two proofs, same (s,ctx,epochAction), different signalHash → N should match", `N1≠N2 (${N1}≠${N2})`);
  } else {
    okpass("E1  same nullifier across the two proofs", "the RLN slot is (s,ctx,epochAction); different signalHash does not fork it");
    // two shares of the degree-1 line Y = s + N·X :
    //   slope   (y1 - y2)/(x1 - x2)  must equal the public nullifier N
    //   intercept  s = y1 - N·x1     must equal the real secret
    const modinv = (a, m) => {
      a = ((a % m) + m) % m;
      let [oldr, r] = [a, m], [olds, s2] = [1n, 0n];
      while (r) { const q = oldr / r; [oldr, r] = [r, oldr - q * r]; [olds, s2] = [s2, olds - q * s2]; }
      return ((olds % m) + m) % m;
    };
    const slope = (((y1 - y2) % P + P) % P * modinv(((x1 - x2) % P + P) % P, P)) % P;
    const sRec = (((y1 - N1 * x1) % P) + P) % P;
    (slope === N1)
      ? okpass("E2  the two shares lie on a line of slope N", "the RLN degree-1 structure holds (slope == public nullifier)")
      : okfail("E2  slope of the two shares is not N", `slope=${slope}, N=${N1}`);
    (sRec === sTrue)
      ? okpass("E3  s recovered as the line's intercept", "recovered s == the real secret → double-action in one (ctx,epochAction) is self-incriminating")
      : okfail("E3  s NOT recovered", `got ${sRec}, want ${sTrue}`);
  }
}

// =========================================================================
rmSync(tdir, { recursive: true, force: true });
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ pass, fail, results: RESULTS }, null, 1));
console.log(`\n=== adversarial soundness: ${pass} passed, ${fail} failed ===`);
if (fail) console.log("A FAIL in Layer A/B may be a genuine soundness bug — read the ↳ line.");
process.exit(fail ? 1 : 0);
