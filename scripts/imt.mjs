// Indexed Merkle Tree (IMT) for O(depth) non-membership proofs -- the-reduction.md S4.1.
//
// A sorted linked list embedded in a fixed-depth binary Poseidon(2) Merkle tree.
// Occupied leaf i holds a record  (val, nextIdx, nextVal)  hashed as
//     leaf_i = Poseidon(3)(val, nextIdx, nextVal).
// Empty leaves are 0. The list is seeded with the zero record (0,0,0) at slot 0,
// so every value has a predecessor ("low nullifier"). `nextVal` is the smallest
// revoked value strictly greater than `val`; nextVal = 0 marks the maximum.
//
// To prove C is NOT revoked: hand the verifier the low-nullifier record L with
// L.val < C <= (L.nextVal or +inf) and one Merkle path. See
// circuits/wedge_nonmembership_imt.circom for the in-circuit checks.
//
// SPARSE representation: only occupied leaves and the internal nodes above them
// are stored; everything else is a precomputed empty-subtree hash. Each insert
// touches O(depth) nodes, so a depth-20 tree costs ~20 Poseidon calls per insert
// rather than 2^20.
//
// Path convention matches MerkleBin in wedge_membership.circom:
//   pathIndices[i] == 0  =>  current node is the LEFT child at level i.

import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
const F = poseidon.F;
export const H = (arr) => F.toObject(poseidon(arr.map((x) => F.e(x))));

export class IndexedMerkleTree {
  constructor(depth) {
    this.depth = depth;
    this.capacity = 2 ** depth;
    // precomputed empty-subtree roots: zeros[l] = root of an all-zero subtree of height l
    this.zeros = [0n];
    for (let l = 1; l <= depth; l++) this.zeros[l] = H([this.zeros[l - 1], this.zeros[l - 1]]);
    // sparse node store: nodes[l] : Map<index, hash>  for non-empty nodes only
    this.nodes = Array.from({ length: depth + 1 }, () => new Map());
    // records[i] = { val, nextIdx, nextVal } for occupied slots
    this.records = [];
    this._setLeaf(0, { val: 0n, nextIdx: 0n, nextVal: 0n }); // seed zero record
  }

  _leafHash(rec) {
    return H([rec.val, rec.nextIdx, rec.nextVal]);
  }

  _node(l, idx) {
    const m = this.nodes[l].get(idx);
    return m === undefined ? this.zeros[l] : m;
  }

  _setLeaf(index, rec) {
    this.records[index] = rec;
    let idx = index;
    let cur = this._leafHash(rec);
    this.nodes[0].set(idx, cur);
    for (let l = 0; l < this.depth; l++) {
      const isLeft = (idx & 1) === 0;
      const sib = this._node(l, isLeft ? idx + 1 : idx - 1);
      const left = isLeft ? cur : sib;
      const right = isLeft ? sib : cur;
      cur = H([left, right]);
      idx >>= 1;
      if (cur === this.zeros[l + 1]) this.nodes[l + 1].delete(idx);
      else this.nodes[l + 1].set(idx, cur);
    }
  }

  root() {
    return this._node(this.depth, 0);
  }

  size() {
    return this.records.length;
  }

  // largest occupied slot whose val is strictly below `x` (the "low nullifier").
  _lowNullifierIndex(x) {
    let best = 0;
    let bestVal = -1n;
    for (let i = 0; i < this.records.length; i++) {
      const v = this.records[i].val;
      if (v < x && v > bestVal) {
        bestVal = v;
        best = i;
      }
    }
    return best;
  }

  has(x) {
    x = BigInt(x);
    return this.records.some((r) => r.val === x);
  }

  // insert a new revoked value, maintaining the sorted linked list.
  insert(x) {
    x = BigInt(x);
    if (x === 0n) throw new Error("0 is the reserved seed value");
    if (this.has(x)) return; // idempotent
    if (this.records.length >= this.capacity) throw new Error("IMT full");
    const loIdx = this._lowNullifierIndex(x);
    const lo = this.records[loIdx];
    const newIdx = this.records.length;
    this._setLeaf(newIdx, { val: x, nextIdx: lo.nextIdx, nextVal: lo.nextVal });
    this._setLeaf(loIdx, { val: lo.val, nextIdx: BigInt(newIdx), nextVal: x });
  }

  insertMany(xs) {
    for (const x of xs) this.insert(x);
  }

  _pathFor(index) {
    const pathElements = [];
    const pathIndices = [];
    let idx = index;
    for (let l = 0; l < this.depth; l++) {
      const bit = idx & 1; // 0 => this node is the LEFT child
      pathElements.push(this._node(l, bit === 0 ? idx + 1 : idx - 1));
      pathIndices.push(BigInt(bit));
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }

  // Non-membership witness for C. Throws if C is actually in the set.
  nonMembershipWitness(C) {
    C = BigInt(C);
    if (this.has(C)) throw new Error(`C is in the revoked set (val=${C})`);
    const loIdx = this._lowNullifierIndex(C);
    const lo = this.records[loIdx];
    if (!(lo.val < C)) throw new Error("low nullifier val not below C");
    if (lo.nextVal !== 0n && !(C < lo.nextVal)) throw new Error("C not below low.nextVal — wrong low nullifier");
    const { pathElements, pathIndices } = this._pathFor(loIdx);
    return {
      lowVal: lo.val,
      lowNextIdx: lo.nextIdx,
      lowNextVal: lo.nextVal,
      lowPathElements: pathElements,
      lowPathIndices: pathIndices,
      revRoot: this.root(),
      lowIndex: loIdx,
    };
  }

  // Verify a path out-of-circuit (mirrors MerkleBin) — used by the self-test.
  verifyPath(leaf, pathElements, pathIndices, root) {
    let cur = BigInt(leaf);
    for (let i = 0; i < this.depth; i++) {
      const pe = BigInt(pathElements[i]);
      const bit = BigInt(pathIndices[i]);
      const l = bit === 0n ? cur : pe;
      const r = bit === 0n ? pe : cur;
      cur = H([l, r]);
    }
    return cur === BigInt(root);
  }
}
