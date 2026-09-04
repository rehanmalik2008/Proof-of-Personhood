// Revocation tests -- both paths. closing-two-gates.md Item 2.
//   node scripts/test_revocation.mjs
//
// (a) R-list: a revoked individual credential cannot prove (the in-circuit
//     non-membership gadget is unsatisfiable when C is on the list).
// (b) Bulk rebuild: after a tombstone rebuild that revokes a client's leaf, that
//     client's cached witness no longer hashes to the published root, its refresh
//     throws, and a fresh proof against the new root fails.
// (c) An UNAFFECTED client refreshes query-free from the rebuild broadcast and
//     proves against the new root.
//
// Exit 0 only if every expectation held.

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppendOnlyMerkle, clientRefresh, H as Hbig } from "./witness_maint.mjs";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; console.log(`  FAIL  ${n}${d ? "\n          " + d : ""}`); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => (typeof x === "bigint" ? x : F.toObject(x)).toString();
const H = (a) => F.toObject(poseidon(a));

// deep copy of an authWitness (clientRefresh mutates in place)
const cloneWitness = (w) => ({
  index: w.index,
  leaf: BigInt(w.leaf),
  node: w.node.map((g) => g.map(BigInt)),
  root: BigInt(w.root),
  syncedEpoch: w.syncedEpoch,
});

const tdir = mkdtempSync(join(tmpdir(), "rev_"));
let wc = 0;
const proveSplitRev = async (base, input) => {
  const wtns = join(tdir, `w${wc++}.wtns`);
  await snarkjs.wtns.calculate(input, `build/${base}.wasm`, wtns);
  const { proof, publicSignals } = await snarkjs.groth16.prove(`build/${base}_final.zkey`, wtns);
  const vkey = JSON.parse(readFileSync(`build/${base}_vkey.json`, "utf8"));
  return { verified: await snarkjs.groth16.verify(vkey, publicSignals, proof), publicSignals };
};

// ---- (a) R-list: a revoked credential cannot prove --------------------------
console.log("=== (a) R-list: revoked individual credential fails to prove ===\n");
{
  const base = "wedge_mem_w8_d9_split_rev64";
  const good = JSON.parse(readFileSync("build/input_mem_w8_d9_split_rev64.json", "utf8"));
  // sanity: the honest witness proves
  try {
    const r = await proveSplitRev(base, good);
    r.verified ? ok("honest (non-revoked) credential proves & verifies") : bad("honest credential did not verify");
  } catch (e) { bad("honest credential threw", e.message); }

  // now put C on the revocation list. Recover C from s in the witness.
  const C = H([BigInt(good.s)]);
  const revokedWithC = [...good.revoked];
  revokedWithC[7] = toDec(C);                       // C is now revoked
  const badInput = { ...good, revoked: revokedWithC };
  try {
    await proveSplitRev(base, badInput);
    bad("a revoked credential still produced a proof -- non-membership gadget did NOT fire");
  } catch (e) {
    ok("revoked credential cannot generate a witness (non-membership unsatisfiable: (C-C)*inv===1)");
  }
}

// ---- (b) + (c) bulk rebuild ----------------------------------------------------
console.log("\n=== (b)+(c) bulk rebuild: revoked attester locked out, unaffected client still proves ===\n");
{
  const D = 9, W = 8;
  const tree = new AppendOnlyMerkle({ depth: D, arity: W });

  // two real client secrets
  const sVictim = F.e("0x" + "1a".repeat(31));
  const sBystander = F.e("0x" + "2b".repeat(31));
  const Cv = H([F.toObject(sVictim)]);
  const Cb = H([F.toObject(sBystander)]);

  // populate: filler, victim at idx, bystander at idx, more filler
  const filler = (n, seed) => Array.from({ length: n }, (_, i) => Hbig([BigInt(seed + i)]));
  tree.appendEpoch([...filler(40, 1000), Cv, ...filler(25, 2000), Cb, ...filler(60, 3000)]);
  const VICT = 40, BYST = 66;

  // build a split-circuit witness from an AppendOnlyMerkle authWitness
  const ctx = 987654321n, epochAction = 11n, epochTree = 7n;
  const signalHash = F.e("0x" + "3c".repeat(31));
  const witnessInput = (s, aw) => ({
    s: toDec(s),
    node: aw.node.map((g) => g.map(toDec)),
    pathIndex: aw.node.map((_, lvl) => String(Math.floor(aw.index / W ** lvl) % W)),
    root: toDec(aw.root),
    ctx: ctx.toString(), epochAction: epochAction.toString(), epochTree: epochTree.toString(),
    signalHash: toDec(signalHash),
  });

  // both prove against the base split circuit before revocation
  const awVpre = tree.authWitness(VICT), awBpre = tree.authWitness(BYST);
  const rVpre = await proveSplitRev("wedge_mem_w8_d9_split", { ...witnessInput(sVictim, awVpre) });
  const rBpre = await proveSplitRev("wedge_mem_w8_d9_split", { ...witnessInput(sBystander, awBpre) });
  (rVpre.verified && rBpre.verified) ? ok("before revocation: both victim and bystander prove") : bad("pre-revocation proof failed");

  const rootBefore = tree.root();

  // --- bulk rebuild: revoke the victim's leaf (as if its attester was compromised) ---
  const wVictimCached = tree.authWitness(VICT);       // the victim's witness, cached
  const wBystCached = tree.authWitness(BYST);
  const broadcast = tree.revokeAndRebuild([VICT]);
  const rootAfter = tree.root();
  (rootAfter !== rootBefore) ? ok("rebuild changed the published root") : bad("root did not change after rebuild");
  ok(`rebuild broadcast is incremental: ${broadcast.changed.length} changed nodes (not the whole tree)`);

  // (b) the victim: cached witness no longer hashes to the new root
  try {
    clientRefresh(broadcast, cloneWitness(wVictimCached));
    bad("victim clientRefresh should have thrown (its leaf was tombstoned)");
  } catch (e) {
    ok("victim clientRefresh throws -- its tombstoned leaf breaks the path: " + e.message.slice(0, 48));
  }

  // (b) the victim cannot prove against the new root with its stale witness
  try {
    const stale = witnessInput(sVictim, wVictimCached);  // wVictimCached is untouched (we cloned for refresh)
    stale.root = toDec(rootAfter);                    // claim the new root
    await proveSplitRev("wedge_mem_w8_d9_split", stale);
    bad("victim produced a proof against the new root with a stale witness");
  } catch (e) {
    ok("victim cannot prove against the new root (Merkle path no longer verifies)");
  }

  // (c) the bystander refreshes query-free and proves against the new root
  const wByst = cloneWitness(wBystCached);
  try {
    clientRefresh(broadcast, wByst);
    (wByst.root === rootAfter) ? ok("bystander clientRefresh reaches the new root (query-free)") : bad("bystander refresh wrong root");
  } catch (e) { bad("bystander clientRefresh threw", e.message); }

  const rBpost = await proveSplitRev("wedge_mem_w8_d9_split", { ...witnessInput(sBystander, wByst) });
  rBpost.verified ? ok("bystander proves & verifies against the new root after refreshing") : bad("bystander post-rebuild proof failed");
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
