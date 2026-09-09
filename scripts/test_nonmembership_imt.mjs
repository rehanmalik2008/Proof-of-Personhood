// Phase 1 tests — indexed Merkle non-membership revocation (the-reduction.md §4.1).
//   node scripts/test_nonmembership_imt.mjs
//
// Requires the circuits built first:  node scripts/build_nonmembership_imt.mjs
//
// Checks, against the real Groth16 circuit wedge_mem_w8_d9_split_revimt20:
//   (1) a non-revoked credential proves & verifies
//   (2) a revoked credential CANNOT produce a witness (non-membership unsat)
//   boundary cases:
//   (3) C below every revoked value        -> low nullifier = seed record (0,·,·)
//   (4) C above every revoked value        -> low nullifier = max record  (·,0,0)
//   (5) C immediately below a revoked value -> low nullifier = its predecessor
//   (6) C immediately above a revoked value
//   adversarial:
//   (7) a revoked C with a forged low nullifier pointing at the wrong gap -> unsat
//
// Exit 0 only if every expectation holds.

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppendOnlyMerkle, H as Hbig } from "./witness_maint.mjs";
import { IndexedMerkleTree } from "./imt.mjs";

const BASE = "wedge_mem_w8_d9_split_revimt20";
const IMT_DEPTH = 20;

if (!existsSync(`build/${BASE}.wasm`) || !existsSync(`build/${BASE}_final.zkey`)) {
  console.log(`SKIP  build/${BASE}.{wasm,_final.zkey} missing — run: node scripts/build_nonmembership_imt.mjs`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; console.log(`  FAIL  ${n}${d ? "\n          " + d : ""}`); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => (typeof x === "bigint" ? x : F.toObject(x)).toString();
const H = (a) => F.toObject(poseidon(a.map((x) => F.e(x))));

const tdir = mkdtempSync(join(tmpdir(), "imt_"));
let wc = 0;
const vkey = JSON.parse(readFileSync(`build/${BASE}_vkey.json`, "utf8"));

const prove = async (input) => {
  const wtns = join(tdir, `w${wc++}.wtns`);
  await snarkjs.wtns.calculate(input, `build/${BASE}.wasm`, wtns);
  const { proof, publicSignals } = await snarkjs.groth16.prove(`build/${BASE}_final.zkey`, wtns);
  return { verified: await snarkjs.groth16.verify(vkey, publicSignals, proof), publicSignals };
};

// ---- identity set (Phase-2 membership), shared across cases -----------------
const W = 8, D = 9;
const idTree = new AppendOnlyMerkle({ depth: D, arity: W });
const ctx = 987654321n, epochAction = 11n, epochTree = 7n;
const signalHash = F.toObject(F.e("0x" + "3c".repeat(31)));

// one honest secret; C is its Poseidon(1) commitment
const s = F.toObject(F.e("0x" + "1a".repeat(31)));
const C = H([s]);
const filler = (n, seed) => Array.from({ length: n }, (_, i) => Hbig([BigInt(seed + i)]));
idTree.appendEpoch([...filler(50, 1000), C, ...filler(77, 2000)]);
const CIDX = 50;
const aw = idTree.authWitness(CIDX);

const baseInput = (nm) => ({
  s: toDec(s),
  node: aw.node.map((g) => g.map(toDec)),
  pathIndex: aw.node.map((_, lvl) => String(Math.floor(aw.index / W ** lvl) % W)),
  root: toDec(aw.root),
  ctx: ctx.toString(), epochAction: epochAction.toString(), epochTree: epochTree.toString(),
  signalHash: toDec(signalHash),
  revRoot: toDec(nm.revRoot),
  lowVal: toDec(nm.lowVal),
  lowNextIdx: toDec(nm.lowNextIdx),
  lowNextVal: toDec(nm.lowNextVal),
  lowPathElements: nm.lowPathElements.map(toDec),
  lowPathIndices: nm.lowPathIndices.map(toDec),
});

// helper: build an IMT whose revoked values are placed around C
const mkRev = (vals) => {
  const t = new IndexedMerkleTree(IMT_DEPTH);
  t.insertMany(vals);
  return t;
};

// ---- (1) non-revoked credential proves -------------------------------------
console.log("=== (1) non-revoked credential proves & verifies ===\n");
{
  const t = mkRev([C - 5000n, C - 100n, C + 100n, C + 5000n, C + 10n ** 12n]);
  try {
    const nm = t.nonMembershipWitness(C);
    if (!t.verifyPath(H([nm.lowVal, nm.lowNextIdx, nm.lowNextVal]), nm.lowPathElements, nm.lowPathIndices, nm.revRoot))
      bad("out-of-circuit path check failed for the low nullifier");
    const r = await prove(baseInput(nm));
    r.verified ? ok("non-revoked C proves and verifies (revRoot public, list size irrelevant)") : bad("proof did not verify");
  } catch (e) { bad("non-revoked C threw", e.message); }
}

// ---- (2) revoked credential cannot prove ----------------------------------
console.log("\n=== (2) revoked credential cannot generate a witness ===\n");
{
  const t = mkRev([C - 5000n, C - 100n, C + 100n, C + 5000n]);
  t.insert(C); // C is now revoked
  // forge a low nullifier: the record just below C (the predecessor of C in the list)
  const loIdx = t.records.findIndex((r) => r.nextVal === C);
  const lo = t.records[loIdx];
  const { pathElements, pathIndices } = t._pathFor(loIdx);
  const nm = {
    revRoot: t.root(), lowVal: lo.val, lowNextIdx: lo.nextIdx, lowNextVal: lo.nextVal,
    lowPathElements: pathElements, lowPathIndices: pathIndices,
  };
  try {
    await prove(baseInput(nm));
    bad("a revoked C still produced a proof — non-membership gadget did not fire");
  } catch (e) {
    ok("revoked C: witness generation fails (C < lowNextVal is false since lowNextVal == C)");
  }
}

// ---- (3) C below every revoked value -> seed low nullifier ----------------
console.log("\n=== (3) boundary: C below every revoked value (low nullifier = seed record) ===\n");
{
  const t = mkRev([C + 1n, C + 2n, C + 100n, C + 10n ** 9n]);
  const nm = t.nonMembershipWitness(C);
  if (nm.lowVal !== 0n) bad(`expected seed low nullifier (val 0), got ${nm.lowVal}`);
  try {
    const r = await prove(baseInput(nm));
    r.verified ? ok("C below the minimum revoked value proves (bracketed by seed record 0 and the true minimum)") : bad("did not verify");
  } catch (e) { bad("threw", e.message); }
}

// ---- (4) C above every revoked value -> max record (isMax path) -----------
console.log("\n=== (4) boundary: C above every revoked value (low nullifier is the maximum, nextVal = 0) ===\n");
{
  const t = mkRev([C - 10n ** 9n, C - 100n, C - 2n, C - 1n]);
  const nm = t.nonMembershipWitness(C);
  if (nm.lowNextVal !== 0n) bad(`expected max low nullifier (nextVal 0), got ${nm.lowNextVal}`);
  try {
    const r = await prove(baseInput(nm));
    r.verified ? ok("C above the maximum revoked value proves (isMax branch: upper bound is vacuous)") : bad("did not verify");
  } catch (e) { bad("threw", e.message); }
}

// ---- (5)+(6) C adjacent to a revoked value -------------------------------
console.log("\n=== (5) boundary: C exactly one below a revoked value ===\n");
{
  const t = mkRev([C - 10n ** 6n, C + 1n, C + 10n ** 6n]); // C+1 is revoked; C is not
  const nm = t.nonMembershipWitness(C);
  try {
    const r = await prove(baseInput(nm));
    r.verified ? ok("C = (revoked value − 1) proves — sits in the gap (predecessor, C+1)") : bad("did not verify");
  } catch (e) { bad("threw", e.message); }
}
console.log("\n=== (6) boundary: C exactly one above a revoked value ===\n");
{
  const t = mkRev([C - 10n ** 6n, C - 1n, C + 10n ** 6n]); // C-1 is revoked; C is not
  const nm = t.nonMembershipWitness(C);
  if (nm.lowVal !== C - 1n) bad(`expected low nullifier val C-1, got ${nm.lowVal}`);
  try {
    const r = await prove(baseInput(nm));
    r.verified ? ok("C = (revoked value + 1) proves — low nullifier is that revoked value itself") : bad("did not verify");
  } catch (e) { bad("threw", e.message); }
}

// ---- (7) adversarial: revoked C, forged low nullifier at the wrong gap ----
console.log("\n=== (7) adversarial: revoked C with a low nullifier from an unrelated lower gap ===\n");
{
  const t = mkRev([C - 5000n, C - 100n, C + 100n, C + 5000n]);
  t.insert(C);
  // point at the lowest real record (val = C-5000) whose nextVal = C-100, a gap that does NOT contain C
  const loIdx = t.records.findIndex((r) => r.val === C - 5000n);
  const lo = t.records[loIdx];
  const { pathElements, pathIndices } = t._pathFor(loIdx);
  const nm = {
    revRoot: t.root(), lowVal: lo.val, lowNextIdx: lo.nextIdx, lowNextVal: lo.nextVal,
    lowPathElements: pathElements, lowPathIndices: pathIndices,
  };
  try {
    await prove(baseInput(nm));
    bad("forged low nullifier accepted — adjacency not enforced");
  } catch (e) {
    ok("forged low nullifier rejected (C < lowNextVal fails: lowNextVal = C−100 ≤ C)");
  }
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
