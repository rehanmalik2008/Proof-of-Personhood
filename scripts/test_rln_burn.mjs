// RLN burn invariant test for the split-epoch Phase-2 circuit.
// splitting-the-epochs.md, Step 1 -- written test-first, before the circuit change.
//
//   node scripts/test_rln_burn.mjs
//
// The circuit under test is `wedge_mem_w8_d9_split` (arity-8 depth-9 membership,
// with `epoch` split into `epochAction` and `epochTree`). Public signal order:
//   [ N, y, root, ctx, epochAction, epochTree, signalHash ]
//
// TEST 1  BURN.  Two proofs in the SAME (ctx, epochAction) but DIFFERENT epochTree
//   roots and DIFFERENT signalHash. If the RLN slot is bound to epochAction only,
//   both proofs carry the same N, their (signalHash, y) points lie on one line
//   Y = s + N*X, and s recovers. If the implementer bound the RLN slot to BOTH
//   epochs, N differs, the line is broken, s does NOT recover -> this test FAILS,
//   which is the whole point: it catches the trap.
//
// TEST 2  NO BURN.  Two proofs in DIFFERENT epochAction. Nullifiers differ, so a
//   double-use detector keyed on N never pairs them, and a forced line-recovery
//   from the two points yields something other than s. Legitimate multi-window use.
//
// TEST 3  FRESHNESS (gates Step 4, not Step 3).  The verifier policy rejects a
//   proof whose epochTree root is older than w, regardless of epochAction.
//
// Exit 0 only if every test that can run has passed.

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (f) => join(ROOT, f);

// ---- BN254 scalar field ----
const FP = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (a) => ((a % FP) + FP) % FP;
const modpow = (b, e, m) => { b = ((b % m) + m) % m; let r = 1n; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const inv = (a) => modpow(a, FP - 2n, FP);
// recover the degree-1 polynomial through (x1,y1),(x2,y2): returns { intercept, slope }
const recoverLine = (x1, y1, x2, y2) => {
  const slope = mod((mod(y2 - y1)) * inv(mod(x2 - x1)));
  const intercept = mod(y1 - mod(slope * x1));
  return { intercept, slope };
};

const WASM = P("build/wedge_mem_w8_d9_split.wasm");
const ZKEY = P("build/wedge_mem_w8_d9_split_final.zkey");
const VKEYF = P("build/wedge_mem_w8_d9_split_vkey.json");

let pass = 0, fail = 0, skip = 0;
const ok = (name) => { pass++; console.log(`  PASS  ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`); };
const eq = (name, a, b) => (String(a) === String(b) ? ok(name) : bad(name, `got ${a}\n          exp ${b}`));
const ne = (name, a, b) => (String(a) !== String(b) ? ok(name) : bad(name, `both are ${a}`));

if (!existsSync(WASM) || !existsSync(ZKEY)) {
  console.log("SPLIT CIRCUIT NOT BUILT.");
  console.log("  expected: build/wedge_mem_w8_d9_split.{wasm,_final.zkey}");
  console.log("  run: node scripts/build.mjs   (Step 2 of splitting-the-epochs.md)");
  console.log("\n  This is the test-first red state. Tests 1-3 will run once the circuit exists.");
  process.exit(1);
}

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (arr) => poseidon(arr);

const W = 8, DEPTH = 9;
const s = F.e("0x" + "a3".repeat(31));           // fixed secret, deterministic test
const ctx = 987654321n;

// Build a split-shape witness. `siblingSeed` varies the level-0 sibling group, which
// changes the root -- this is how we get two DIFFERENT epochTree roots for the same C.
function makeSplitWitness({ epochAction, epochTree, signalHash, siblingSeed }) {
  const C = H([s]);
  const zeros = [F.e(0)];
  for (let i = 1; i <= DEPTH; i++) zeros[i] = H(Array(W).fill(zeros[i - 1]));
  let cur = C;
  const node = [], pathIndex = [];
  for (let i = 0; i < DEPTH; i++) {
    // our leaf/hash is in slot 0; siblings are the zero-subtree value, except at
    // level 0 slot 1 where we splice in `siblingSeed` to perturb the root.
    const grp = [cur, ...Array(W - 1).fill(zeros[i])];
    if (i === 0 && siblingSeed !== 0) grp[1] = F.e(siblingSeed);
    node.push(grp.map(toDec));
    pathIndex.push("0");
    cur = H(grp);
  }
  return {
    input: {
      s: toDec(s),
      node, pathIndex,
      root: toDec(cur),
      ctx: ctx.toString(),
      epochAction: String(epochAction),
      epochTree: String(epochTree),
      signalHash: String(signalHash),
    },
    root: toDec(cur),
    C: toDec(C),
  };
}

const vkey = JSON.parse(readFileSync(VKEYF, "utf8"));
const tdir = mkdtempSync(join(tmpdir(), "rlnburn_"));
let wc = 0;
async function proveSplit(input) {
  const wtns = join(tdir, `w${wc++}.wtns`);
  await snarkjs.wtns.calculate(input, WASM, wtns);
  const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!verified) throw new Error("split proof did not self-verify");
  const [N, y, root, ctxo, epochAction, epochTree, signalHash] = publicSignals;
  return { proof, publicSignals, N, y, root, ctx: ctxo, epochAction, epochTree, signalHash, nPublic: publicSignals.length };
}

// deterministic distinct signalHashes / epochs for the test
const h1 = (F.toObject(H([F.e(11)]))).toString();
const h2 = (F.toObject(H([F.e(22)]))).toString();
const h3 = (F.toObject(H([F.e(33)]))).toString();

console.log("=== TEST 1  BURN: same (ctx, epochAction), different epochTree roots ===\n");
try {
  const wa = makeSplitWitness({ epochAction: 100, epochTree: 5, signalHash: h1, siblingSeed: 0 });
  const wb = makeSplitWitness({ epochAction: 100, epochTree: 9, signalHash: h2, siblingSeed: 424242 });
  const pa = await proveSplit(wa.input);
  const pb = await proveSplit(wb.input);

  eq("public signal count is 7", pa.nPublic, 7);
  eq("vkey nPublic is 7", vkey.nPublic, 7);
  ne("the two epochTree roots genuinely differ", pa.root, pb.root);
  eq("epochAction matches across the two proofs", pa.epochAction, pb.epochAction);
  eq("epochTree differs across the two proofs (5 vs 9)", `${pa.epochTree}/${pb.epochTree}`, "5/9");

  // THE INVARIANT: N binds to epochAction only, so it is identical despite the
  // different epochTree and different root.
  eq("nullifier N is identical (bound to epochAction, NOT epochTree)", pa.N, pb.N);

  // RLN line recovery from the two (signalHash, y) points.
  const { intercept, slope } = recoverLine(BigInt(pa.signalHash), BigInt(pa.y), BigInt(pb.signalHash), BigInt(pb.y));
  eq("recovered line intercept == s  (BURN FIRES)", intercept.toString(), F.toObject(s).toString());
  eq("recovered line slope == N", slope.toString(), pa.N);
} catch (e) { bad("TEST 1 threw", e.message); }

console.log("\n=== TEST 2  NO BURN: different epochAction (legitimate multi-window use) ===\n");
try {
  const wa = makeSplitWitness({ epochAction: 100, epochTree: 5, signalHash: h1, siblingSeed: 0 });
  const wc2 = makeSplitWitness({ epochAction: 101, epochTree: 5, signalHash: h3, siblingSeed: 0 });
  const pa = await proveSplit(wa.input);
  const pc = await proveSplit(wc2.input);

  ne("nullifiers differ across epochAction windows", pa.N, pc.N);
  eq("same epochTree root (only the action window moved)", pa.root, pc.root);

  // A detector keyed on N never pairs these. If someone force-runs line recovery
  // on the two points anyway, it must NOT yield s.
  const { intercept } = recoverLine(BigInt(pa.signalHash), BigInt(pa.y), BigInt(pc.signalHash), BigInt(pc.y));
  ne("forced line recovery does NOT yield s (no burn)", intercept.toString(), F.toObject(s).toString());
} catch (e) { bad("TEST 2 threw", e.message); }

console.log("\n=== TEST 3  FRESHNESS: epochTree root older than w is rejected (gates Step 4) ===\n");
const FRESHNESS = P("integration/lib/freshness.mjs");
try {
  if (!existsSync(FRESHNESS)) throw new Error("ERR_MODULE_NOT_FOUND");
  const { checkFreshness } = await import(pathToFileURL(FRESHNESS).href);
  const cfg = { currentEpochTree: 10, currentEpochAction: 100, w: 3, actionRecency: 2 };

  const stale = checkFreshness({ epochTree: "1", epochAction: "100" }, cfg);
  eq("stale epochTree (10-1 >= w=3) is rejected, epochAction current", stale.ok, false);

  const staleBothOld = checkFreshness({ epochTree: "1", epochAction: "50" }, cfg);
  eq("stale epochTree rejected regardless of epochAction", staleBothOld.ok, false);

  const fresh = checkFreshness({ epochTree: "9", epochAction: "100" }, cfg);
  eq("epochTree within w and epochAction current is accepted", fresh.ok, true);

  const staleAction = checkFreshness({ epochTree: "9", epochAction: "90" }, cfg);
  eq("fresh epochTree but epochAction older than actionRecency is rejected", staleAction.ok, false);
} catch (e) {
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(e.message)) {
    skip += 4;
    console.log("  SKIP  integration/lib/freshness.mjs not present yet (Step 4)");
  } else { bad("TEST 3 threw", e.message); }
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== ${pass} passed, ${fail} failed, ${skip} skipped ===`);
if (fail === 0 && skip === 0) console.log("ALL GREEN.");
else if (fail === 0) console.log("Tests 1-2 green; Test 3 pending Step 4.");
process.exit(fail ? 1 : 0);
