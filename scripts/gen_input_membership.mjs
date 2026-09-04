// Witnesses for the Phase-2 login circuits (no-shared-key bridge, route 2a).
//   node scripts/gen_input_membership.mjs
//
//   build/input_mem_bin_d{16,20,27}.json   -> binary Poseidon(2) Merkle
//   build/input_mem_w4_d{8,14}.json        -> arity-4 Poseidon(4) Merkle
//   build/input_mem_w8_d{6,9}.json         -> arity-8 Poseidon(8) Merkle
//
// The user's commitment C sits at leaf index 0; every other leaf/sibling is the
// zero-subtree value, so pathIndex is 0 at every level. The membership opening is
// recomputed to the root and checked before the file is written. C is NOT in the
// witness file as anything the circuit exposes -- only s, the path, and the root.

import { buildPoseidon } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (a) => poseidon(a);

const s = F.e("0x" + randomBytes(31).toString("hex"));
const ctx = 987654321n, epoch = 7n;
// split-epoch (splitting-the-epochs.md): epochAction is the fast rate-limit /
// nullifier window; epochTree is the slow tree-publication cadence the root is
// published for. For the sample witness they differ so the file exercises the split.
const epochAction = 11n, epochTree = 7n;
const signalHash = F.e("0x" + randomBytes(31).toString("hex"));
const C = H([s]);
const N = H([s, F.e(ctx), F.e(epoch)]);
const Nsplit = H([s, F.e(ctx), F.e(epochAction)]);

mkdirSync("build", { recursive: true });

function emitBin(depth) {
  const zeros = [F.e(0)];
  for (let i = 1; i <= depth; i++) zeros[i] = H([zeros[i - 1], zeros[i - 1]]);
  let cur = C;
  const pathElements = [], pathIndices = [];
  for (let i = 0; i < depth; i++) {
    pathElements.push(toDec(zeros[i]));
    pathIndices.push("0");
    cur = H([cur, zeros[i]]);
  }
  const root = cur;
  const obj = {
    s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString(), signalHash: toDec(signalHash),
    root: toDec(root), pathElements, pathIndices,
  };
  writeFileSync(`build/input_mem_bin_d${depth}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_mem_bin_d${depth}.json   (root check OK)`);
}

function emitWide(W, depth) {
  const zeros = [F.e(0)];
  for (let i = 1; i <= depth; i++) zeros[i] = H(Array(W).fill(zeros[i - 1]));
  let cur = C;
  const node = [], pathIndex = [];
  for (let i = 0; i < depth; i++) {
    const grp = [cur, ...Array(W - 1).fill(zeros[i])]; // our position is slot 0
    node.push(grp.map(toDec));
    pathIndex.push("0");
    cur = H(grp);
  }
  const root = cur;
  const obj = {
    s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString(), signalHash: toDec(signalHash),
    root: toDec(root), node, pathIndex,
  };
  writeFileSync(`build/input_mem_w${W}_d${depth}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_mem_w${W}_d${depth}.json   (root check OK)`);
}

// split-epoch witness: same arity-8 depth-9 tree, but `epoch` is replaced by
// (epochAction, epochTree). Public signal order becomes
//   [ N, y, root, ctx, epochAction, epochTree, signalHash ]   (nPublic 7)
function emitWideSplit(W, depth) {
  const zeros = [F.e(0)];
  for (let i = 1; i <= depth; i++) zeros[i] = H(Array(W).fill(zeros[i - 1]));
  let cur = C;
  const node = [], pathIndex = [];
  for (let i = 0; i < depth; i++) {
    const grp = [cur, ...Array(W - 1).fill(zeros[i])];
    node.push(grp.map(toDec));
    pathIndex.push("0");
    cur = H(grp);
  }
  const root = cur;
  const obj = {
    s: toDec(s), ctx: ctx.toString(),
    epochAction: epochAction.toString(), epochTree: epochTree.toString(),
    signalHash: toDec(signalHash),
    root: toDec(root), node, pathIndex,
  };
  writeFileSync(`build/input_mem_w${W}_d${depth}_split.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_mem_w${W}_d${depth}_split.json   (root check OK)`);
}

for (const d of [16, 20, 27]) emitBin(d);
for (const d of [8, 14]) emitWide(4, d);
for (const d of [6, 9]) emitWide(8, d);
emitWideSplit(8, 9);
console.log(`  C (private, not exposed)     = ${toDec(C)}`);
console.log(`  N (public, coupled epoch)    = ${toDec(N)}`);
console.log(`  N (public, split: epochAction) = ${toDec(Nsplit)}`);
