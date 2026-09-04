pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Phase-2 LOGIN circuit -- the no-shared-key bridge (the-no-shared-key-bridge.md).
//
// Phase 1 (one-time enrollment, OFF the hot path): the heavy k-signature
// attestation proof over C = Poseidon(s); backend inserts C into a published set.
// Phase 2 (every login): prove only that C is in the set, plus the nullifier + RLN.
//
// This circuit proves, ALL private except N and y:
//   (1) C = Poseidon(s)                     -- know the secret behind the leaf
//   (2) C is a member of the published set  -- IN-CIRCUIT Merkle opening; the path
//                                              and C itself are private witnesses
//   (3) N = Poseidon(s, ctx, epoch)         -- per-context nullifier
//   (4) y = s + N*signalHash                -- RLN degree-1 Shamir share
//
// C is NEVER a public output. Only { N, y } leave the proof. No attester key,
// category, or signature appears anywhere -> full attester-unlinkability AND no
// cross-context linkage (route 2a; route 2b, revealing C to the backend, is rejected).
//
// Falsification #1 gate: composed cost (478 residual + opening) must stay
// under ~4,478 for the O(1) promise to have materialised affordably; the
// sharded shallow binary Merkle (depth 16) is the guaranteed-sound backstop.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "comparators.circom";

// binary Poseidon(2) Merkle inclusion. pathIndices[i] == 0 => cur is the LEFT child.
template MerkleBin(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    signal cur[depth + 1];
    cur[0] <== leaf;
    component h[depth];
    signal d[depth];
    signal l[depth];
    signal r[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        d[i] <== pathElements[i] - cur[i];
        l[i] <== cur[i]          + pathIndices[i] * d[i];
        r[i] <== pathElements[i] - pathIndices[i] * d[i];
        h[i] = Poseidon(2);
        h[i].inputs[0] <== l[i];
        h[i].inputs[1] <== r[i];
        cur[i + 1] <== h[i].out;
    }
    root === cur[depth];
}

// arity-W Poseidon(W) Merkle inclusion. `node[i]` is the ordered W-tuple of
// children at level i (witness); `pathIndex[i]` in [0,W) is the slot holding `cur`.
template MerkleWide(W, depth) {
    signal input leaf;
    signal input root;
    signal input node[depth][W];
    signal input pathIndex[depth];

    signal cur[depth + 1];
    cur[0] <== leaf;
    component h[depth];
    component eq[depth][W];
    signal selAcc[depth][W + 1];
    signal dotAcc[depth][W + 1];
    for (var i = 0; i < depth; i++) {
        selAcc[i][0] <== 0;
        dotAcc[i][0] <== 0;
        for (var j = 0; j < W; j++) {
            eq[i][j] = IsEqual();
            eq[i][j].in[0] <== pathIndex[i];
            eq[i][j].in[1] <== j;
            selAcc[i][j + 1] <== selAcc[i][j] + eq[i][j].out;
            dotAcc[i][j + 1] <== dotAcc[i][j] + eq[i][j].out * node[i][j];
        }
        selAcc[i][W] === 1;          // pathIndex in range, exactly one slot selected
        dotAcc[i][W] === cur[i];     // that slot holds the running hash
        h[i] = Poseidon(W);
        for (var j = 0; j < W; j++) h[i].inputs[j] <== node[i][j];
        cur[i + 1] <== h[i].out;
    }
    root === cur[depth];
}

template Residual() {
    signal input s;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal output C;     // PRIVATE inside the parent -- never wired to a main output
    signal output N;
    signal output y;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;

    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;
}

template WedgeMembershipBin(depth) {
    signal input s;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input root;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal output N;
    signal output y;

    component res = Residual();
    res.s <== s; res.ctx <== ctx; res.epoch <== epoch; res.signalHash <== signalHash;
    N <== res.N;
    y <== res.y;

    component mk = MerkleBin(depth);
    mk.leaf <== res.C;               // C is a private wire, not exposed
    mk.root <== root;
    for (var i = 0; i < depth; i++) {
        mk.pathElements[i] <== pathElements[i];
        mk.pathIndices[i]  <== pathIndices[i];
    }
}

template WedgeMembershipWide(W, depth) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
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
}

// ---------------------------------------------------------------------------
// SPLIT-EPOCH variant (splitting-the-epochs.md). The single `epoch` is split
// into two independent public inputs:
//   epochAction -- the rate-limit / nullifier window   (fast; e.g. 10 min)
//   epochTree   -- the tree publication cadence         (slow; e.g. daily),
//                  the epoch the supplied `root` was published for.
//
// THE INVARIANT (splitting-the-epochs.md S2): the RLN slot -- i.e. the nullifier
// N and therefore the coefficient of the degree-1 RLN line -- binds to
// epochAction ONLY. It must NOT depend on epochTree. If it did, an attacker
// could vary epochTree to escape the double-use burn while acting twice in one
// rate-limit window. The Merkle root binds to epochTree only.
// ---------------------------------------------------------------------------

template ResidualSplit() {
    signal input s;
    signal input ctx;
    signal input epochAction;      // nullifier / RLN slot binds HERE, and only here
    signal input signalHash;
    signal output C;               // PRIVATE inside the parent -- never a main output
    signal output N;
    signal output y;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epochAction;  // NOT epochTree. This is the whole security question.
    N <== hN.out;

    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;                 // RLN degree-1 Shamir share; line is Y = s + N*X
}

template WedgeMembershipWideSplit(W, depth) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;            // the tree root published for epochTree
    signal input ctx;
    signal input epochAction;
    signal input epochTree;
    signal input signalHash;
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

    // epochTree has no in-circuit role by design. It is a verifier-checked public
    // input: the verifier confirms out of circuit that `root` is the published
    // root for `epochTree` and within the staleness window w -- the same
    // "prover-supplied, verifier-checked" shape as ctx and signalHash. circom
    // keeps a declared public input in the statement vector whether or not any
    // constraint references it, so the split adds ZERO constraints: it is a
    // public-input and verifier-policy change, not a new gadget.
}
