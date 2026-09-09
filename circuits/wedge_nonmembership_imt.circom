pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// PHASE 1 (the-reduction.md S4.1) -- indexed Merkle non-membership for the
// revocation set, replacing the O(R) brute-force list `NonMembershipList(R)`
// in wedge_revocation.circom.
//
// STRUCTURE. The revoked set is stored as an *indexed Merkle tree* (IMT): a
// sorted linked list embedded in a fixed-depth binary Poseidon(2) tree. Each
// occupied leaf is
//     leaf = Poseidon(3)(val, nextIdx, nextVal)
// where `val` is a revoked commitment, `nextVal` is the SMALLEST revoked value
// strictly greater than `val` (0 = "val is the current maximum"), and `nextIdx`
// is that successor's slot. The list is seeded with the zero record (0,0,0) at
// slot 0, so every value has a predecessor.
//
// NON-MEMBERSHIP. To prove  C is NOT in the revoked set, the prover exhibits the
// unique "low nullifier" record L that would bracket C, with ONE Merkle path:
//     (1) Poseidon(3)(L.val, L.nextIdx, L.nextVal) opens to revRoot          [inclusion]
//     (2) L.val < C                                                          [lower bound]
//     (3) C < L.nextVal   OR   L.nextVal == 0  (L is the current maximum)    [upper bound]
// Adjacency is NOT asserted with a second path -- it is *structural*: L.nextVal
// is by construction the immediate successor of L.val in the set, so (2)+(3)
// place C strictly inside a gap between two adjacent set elements, hence C is
// absent. A dishonest prover cannot fabricate an L: any L with L.val < C whose
// leaf is in the tree has the true set-successor in L.nextVal, and if C were
// actually revoked that successor would be <= C, failing (3).
//
// COST. Independent of R (the number of revoked entries): one Poseidon(3) leaf
// hash + `depth` Poseidon(2) path hashes + two full-width field comparisons.
// Contrast NonMembershipList(R): exactly R constraints, one per revoked entry
// (measured: rev64 +64, rev256 +256, rev1024 +1024 over the 4,309 base).
//
// COMPARISONS are full 254-bit (sound for every element of [0,p), since
// Poseidon outputs are not bounded below 2^252): each operand is bit-decomposed
// with Num2Bits(254) and compared most-significant-bit first. No reliance on
// circomlib LessThan(n<=252), which is unsound on unrestricted field elements.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "comparators.circom";
include "bitify.circom";
include "wedge_membership.circom";     // MerkleBin(depth), Residual*, WedgeMembershipWide*

// out = 1  iff  a < b, for a,b interpreted as integers in [0, 2^254).
// Both operands are range-checked to 254 bits by the Num2Bits components, so the
// comparison is total and sound for every field element (p < 2^254).
template LtField() {
    signal input a;
    signal input b;
    signal output out;

    component ab = Num2Bits(254);            // range-checks a to 254 bits
    component bb = Num2Bits(254);            // range-checks b to 254 bits
    ab.in <== a;
    bb.in <== b;

    // Big-endian scan (Num2Bits emits little-endian: out[i] is bit i).
    // `lt` latches to 1 at the most significant bit where a_i=0, b_i=1 while the
    // higher prefix was still equal; `eqPrefix` drops to 0 at the first differing
    // bit and stays 0, freezing the decision.
    signal lt[255];
    signal eqPrefix[255];
    lt[254] <== 0;
    eqPrefix[254] <== 1;
    signal dd[254];                          // 1 iff the bits differ at position i
    signal dlt[254];                         // 1 iff a_i=0 and b_i=1
    for (var i = 253; i >= 0; i--) {
        dd[i]  <== (ab.out[i] - bb.out[i]) * (ab.out[i] - bb.out[i]);
        dlt[i] <== (1 - ab.out[i]) * bb.out[i];
        lt[i]  <== lt[i + 1] + eqPrefix[i + 1] * dlt[i];
        eqPrefix[i] <== eqPrefix[i + 1] * (1 - dd[i]);
    }
    out <== lt[0];
}

// C is NOT in the indexed-Merkle revoked set rooted at `revRoot`.
template IndexedNonMembership(depth) {
    signal input val;                       // the commitment C (private in parent)
    signal input revRoot;                   // PUBLIC: root of the revoked-set IMT
    signal input lowVal;                    // low-nullifier record (all private)
    signal input lowNextIdx;
    signal input lowNextVal;
    signal input lowPathElements[depth];
    signal input lowPathIndices[depth];

    // (1) inclusion of the low-nullifier leaf
    component lh = Poseidon(3);
    lh.inputs[0] <== lowVal;
    lh.inputs[1] <== lowNextIdx;
    lh.inputs[2] <== lowNextVal;

    component mk = MerkleBin(depth);
    mk.leaf <== lh.out;
    mk.root <== revRoot;
    for (var i = 0; i < depth; i++) {
        mk.pathElements[i] <== lowPathElements[i];
        mk.pathIndices[i]  <== lowPathIndices[i];
    }

    // (2) lowVal < val   (strict; also rules out lowVal == val, i.e. C itself revoked)
    component lo = LtField();
    lo.a <== lowVal;
    lo.b <== val;
    lo.out === 1;

    // (3) val < lowNextVal   unless   lowNextVal == 0  (low record is the maximum)
    component isMax = IsZero();
    isMax.in <== lowNextVal;

    component hi = LtField();
    hi.a <== val;
    hi.b <== lowNextVal;
    // if not max, hi.out must be 1;  if max, this is vacuous
    (1 - isMax.out) * (1 - hi.out) === 0;
}

// ===========================================================================
// Deployed circuit, IMT revocation. Mirrors WedgeMembershipWideSplitRevoke
// (wedge_revocation.circom) but the O(R) list is replaced by the O(depth) IMT.
// Public inputs: [ root, ctx, epochAction, epochTree, signalHash, revRoot ].
// nPublic = 8 (2 outputs + 6 inputs) -- CONSTANT, independent of revoked-set size
// (the R-list variant had nPublic = 7 + R).
// ===========================================================================
template WedgeMembershipWideSplitRevokeIMT(W, depth, revDepth) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;
    signal input ctx;
    signal input epochAction;
    signal input epochTree;
    signal input signalHash;
    signal input revRoot;                   // PUBLIC: revoked-set IMT root
    signal input lowVal;                    // non-membership witness (private)
    signal input lowNextIdx;
    signal input lowNextVal;
    signal input lowPathElements[revDepth];
    signal input lowPathIndices[revDepth];
    signal output N;
    signal output y;

    component res = ResidualSplit();
    res.s <== s; res.ctx <== ctx; res.epochAction <== epochAction; res.signalHash <== signalHash;
    N <== res.N;
    y <== res.y;

    component mk = MerkleWide(W, depth);
    mk.leaf <== res.C;
    mk.root <== root;
    for (var i = 0; i < depth; i++) {
        mk.pathIndex[i] <== pathIndex[i];
        for (var j = 0; j < W; j++) mk.node[i][j] <== node[i][j];
    }

    component nm = IndexedNonMembership(revDepth);
    nm.val <== res.C;
    nm.revRoot <== revRoot;
    nm.lowVal <== lowVal;
    nm.lowNextIdx <== lowNextIdx;
    nm.lowNextVal <== lowNextVal;
    for (var i = 0; i < revDepth; i++) {
        nm.lowPathElements[i] <== lowPathElements[i];
        nm.lowPathIndices[i]  <== lowPathIndices[i];
    }
}

// Non-split variant (single epoch), for completeness / comparison with rev64/256/1024.
template WedgeMembershipWideRevokeIMT(W, depth, revDepth) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal input revRoot;
    signal input lowVal;
    signal input lowNextIdx;
    signal input lowNextVal;
    signal input lowPathElements[revDepth];
    signal input lowPathIndices[revDepth];
    signal output N;
    signal output y;

    component res = Residual();
    res.s <== s; res.ctx <== ctx; res.epoch <== epoch; res.signalHash <== signalHash;
    N <== res.N;
    y <== res.y;

    component mk = MerkleWide(W, depth);
    mk.leaf <== res.C;
    mk.root <== root;
    for (var i = 0; i < depth; i++) {
        mk.pathIndex[i] <== pathIndex[i];
        for (var j = 0; j < W; j++) mk.node[i][j] <== node[i][j];
    }

    component nm = IndexedNonMembership(revDepth);
    nm.val <== res.C;
    nm.revRoot <== revRoot;
    nm.lowVal <== lowVal;
    nm.lowNextIdx <== lowNextIdx;
    nm.lowNextVal <== lowNextVal;
    for (var i = 0; i < revDepth; i++) {
        nm.lowPathElements[i] <== lowPathElements[i];
        nm.lowPathIndices[i]  <== lowPathIndices[i];
    }
}
