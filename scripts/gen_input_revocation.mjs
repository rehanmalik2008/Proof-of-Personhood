// Witnesses for the Step-3 revocation circuits: WedgeMembershipWideRevoke(8,9,R).
//   node scripts/gen_input_revocation.mjs
//   -> build/input_mem_w8_d9_rev{64,256,1024}.json
//
// Same arity-8 depth-9 membership witness as input_mem_w8_d9.json, plus a public
// revocation list `revoked[R]` of R random field elements (none equal to C). The
// non-membership gadget is checked here before the file is written.

import { buildPoseidon } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (a) => poseidon(a);

const W = 8, DEPTH = 9;
const s = F.e("0x" + randomBytes(31).toString("hex"));
const ctx = 987654321n, epoch = 7n;
const signalHash = F.e("0x" + randomBytes(31).toString("hex"));
const C = H([s]);
const Cobj = F.toObject(C);

mkdirSync("build", { recursive: true });

// arity-8 membership witness: C at leaf 0, every sibling the zero-subtree value
const zeros = [F.e(0)];
for (let i = 1; i <= DEPTH; i++) zeros[i] = H(Array(W).fill(zeros[i - 1]));
let cur = C;
const node = [], pathIndex = [];
for (let i = 0; i < DEPTH; i++) {
  const grp = [cur, ...Array(W - 1).fill(zeros[i])];
  node.push(grp.map(toDec));
  pathIndex.push("0");
  cur = H(grp);
}
const root = cur;

for (const R of [64, 256, 1024]) {
  const revoked = [];
  for (let i = 0; i < R; i++) {
    let r = F.e("0x" + randomBytes(31).toString("hex"));
    while (F.toObject(r) === Cobj) r = F.e("0x" + randomBytes(31).toString("hex"));
    revoked.push(r);
  }
  // check the non-membership gadget is satisfiable: C - r_i != 0 for all i
  for (const r of revoked) if (F.toObject(F.sub(C, r)) === 0n) throw new Error("collision");
  const obj = {
    s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString(), signalHash: toDec(signalHash),
    root: toDec(root), node, pathIndex,
    revoked: revoked.map(toDec),
  };
  writeFileSync(`build/input_mem_w8_d9_rev${R}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_mem_w8_d9_rev${R}.json   (R=${R}, non-membership OK, root check OK)`);
}

// split-epoch revocation witnesses (closing-two-gates.md Item 2a):
// same membership + non-membership, but `epoch` -> (epochAction, epochTree).
const epochAction = 11n, epochTree = 7n;
for (const R of [64, 256, 1024]) {
  const revoked = [];
  for (let i = 0; i < R; i++) {
    let r = F.e("0x" + randomBytes(31).toString("hex"));
    while (F.toObject(r) === Cobj) r = F.e("0x" + randomBytes(31).toString("hex"));
    revoked.push(r);
  }
  for (const r of revoked) if (F.toObject(F.sub(C, r)) === 0n) throw new Error("collision");
  const obj = {
    s: toDec(s), ctx: ctx.toString(),
    epochAction: epochAction.toString(), epochTree: epochTree.toString(),
    signalHash: toDec(signalHash),
    root: toDec(root), node, pathIndex,
    revoked: revoked.map(toDec),
  };
  writeFileSync(`build/input_mem_w8_d9_split_rev${R}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_mem_w8_d9_split_rev${R}.json   (split, R=${R}, non-membership OK)`);
}

console.log(`  C (private, not exposed) = ${toDec(C)}`);
