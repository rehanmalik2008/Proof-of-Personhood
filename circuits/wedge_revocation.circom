pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// STEP 3 -- attester-level revocation as an IN-CIRCUIT non-membership check.
//
// Phase-2 login (wedge_membership.circom, WedgeMembershipWide(8,9), 4,309 constr)
// PLUS: prove the private commitment C is NOT in a revocation set of R entries.
//
// Revocation mechanism = a published list of revoked commitments {r_0..r_{R-1}}
// (compromised-attester output, or individually burned credentials). The circuit
// proves  C != r_i  for every i, via the standard non-zero gadget:
//     inv_i <-- 1/(C - r_i) ;  (C - r_i) * inv_i === 1
// which is unsatisfiable exactly when C == r_i. Cost: R constraints + R witness
// inversions. C stays a private witness (never an output) -- same privacy as the
// base circuit; only N, y leave the proof.
//
// The revoked list is PUBLIC input here (verifier ships R field elements). A
// production system would instead commit it as one root (KZG / sorted-Merkle)
// and prove non-membership against that -- O(depth) hashes, ~255 constr/hash,
// crossover near R ~ 40. Both are measured in bench_revocation.mjs.
//
// >>> SUPERSEDED for large R by wedge_nonmembership_imt.circom (the-reduction.md
// >>> Phase 1): an indexed Merkle tree gives non-membership at cost INDEPENDENT
// >>> of R (measured +8,168 constraints at IMT depth 20, capacity ~1.05M) and
// >>> nPublic = 8 constant instead of 7 + R. Raw-constraint crossover ~R 8,200;
// >>> the IMT wins on verifier bandwidth / vkey size immediately. See
// >>> docs/self-audit/nonmembership_imt.md. This file is kept for the small-R
// >>> regime and as the measured baseline.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "comparators.circom";
include "wedge_membership.circom";

template NonMembershipList(R) {
    signal input val;
    signal input revoked[R];

    signal inv[R];
    signal diff[R];
    for (var i = 0; i < R; i++) {
        diff[i] <== val - revoked[i];
        inv[i] <-- diff[i] != 0 ? 1 / diff[i] : 0;
        diff[i] * inv[i] === 1;          // 1 constraint; unsatisfiable iff val == revoked[i]
    }
}

// Base Phase-2 membership (arity-W, depth) + non-membership of C against R revoked.
template WedgeMembershipWideRevoke(W, depth, R) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal input revoked[R];            // PUBLIC: the revocation list
    signal output N;
    signal output y;

    // --- base membership (identical to WedgeMembershipWide) ---
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

    // --- added: C is not revoked ---
    component nm = NonMembershipList(R);
    nm.val <== res.C;                    // C is the same private wire; not exposed
    for (var i = 0; i < R; i++) nm.revoked[i] <== revoked[i];
}

// ---------------------------------------------------------------------------
// SPLIT-EPOCH variant (splitting-the-epochs.md): same base as
// WedgeMembershipWideSplit + non-membership of C against R revoked commitments.
// Public inputs: [ root, ctx, epoch_action, epoch_tree, signalHash, revoked[R] ].
// nPublic = 7 + R. The RLN slot binds to epoch_action only; epoch_tree has no
// in-circuit role (verifier-checked). See closing-two-gates.md Item 2(a).
// ---------------------------------------------------------------------------
template WedgeMembershipWideSplitRevoke(W, depth, R) {
    signal input s;
    signal input node[depth][W];
    signal input pathIndex[depth];
    signal input root;
    signal input ctx;
    signal input epochAction;
    signal input epochTree;
    signal input signalHash;
    signal input revoked[R];            // PUBLIC: the revocation list
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

    component nm = NonMembershipList(R);
    nm.val <== res.C;
    for (var i = 0; i < R; i++) nm.revoked[i] <== revoked[i];
}
