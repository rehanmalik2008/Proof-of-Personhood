pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Sybil-wedge proving-cost spike -- shippable circuit + the merkle-cost ladder.
//
// Baseline `Wedge3` (wedge_core.circom): C=Poseidon(s); k=3 EdDSA over C; N.
//   -> 13,098 constraints (~96% signature verification). That is the floor.
//
// WedgeParam(k, depth, useMerkle, useScope, useDiversity, useRln, useKeyCommit)
// composes the four previously-omitted groups, each behind a compile-time flag,
// and is parametrised on k (# attestations) and Merkle depth so the optimisation
// ladder from `killing-the-merkle-cost.md` can be measured rung by rung:
//
//   Lever D  -- shrink depth (20 -> 10): `depth` param. Merkle cost is linear in it.
//   Lever E  -- drop k (3 -> 2): `k` param. Merkle AND signature cost linear in k.
//   Lever A/B -- accumulator, verified OUT of circuit: useMerkle=0, useKeyCommit=1.
//               The circuit stops climbing a hash tree and instead exposes
//               attKeyCommit = Poseidon(kh_0..kh_{k-1}), kh_i = Poseidon(Ax_i,Ay_i).
//               The backend verifier checks each kh_i against a public RSA/KZG
//               accumulator natively (one modexp / one pairing) -- see
//               scripts/accum_rsa.mjs. In-circuit membership cost -> ~0.
//               PRIVACY COST: the verifier learns the k attester key-hashes, i.e.
//               *which* attesters vouched. In-circuit Merkle hides that. For a
//               small curated institutional attester set this may be acceptable;
//               it is an economic/privacy call, not a cryptographic one.
//
//   SCOPE: EdDSA message = Poseidon(C, scope_i), constrain scope_i == ctx (m->1).
//   DIVERSITY: k category labels pairwise-distinct (=> >= 2 distinct, no single
//              category satisfies D alone).
//   RLN: y = s + N*signalHash  (a0=s, a1=N=Poseidon(s,ctx,epoch), x=signalHash).
//
// Primitives: Poseidon + EdDSA on Baby JubJub. No ECDSA.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "eddsaposeidon.circom";
include "comparators.circom";

// Binary Merkle inclusion, Poseidon(2) per level.
// pathIndices[i] == 0  =>  current node is the LEFT child at level i.
template MerkleInclusion(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    signal cur[depth + 1];
    cur[0] <== leaf;

    component h[depth];
    signal diff[depth];
    signal left[depth];
    signal right[depth];

    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        diff[i]  <== pathElements[i] - cur[i];
        left[i]  <== cur[i]          + pathIndices[i] * diff[i];
        right[i] <== pathElements[i] - pathIndices[i] * diff[i];
        h[i] = Poseidon(2);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];
        cur[i + 1] <== h[i].out;
    }
    root === cur[depth];
}

template WedgeParam(k, depth, useMerkle, useScope, useDiversity, useRln, useKeyCommit) {
    // ---- private ----
    signal input s;
    signal input Ax[k];
    signal input Ay[k];
    signal input R8x[k];
    signal input R8y[k];
    signal input Sig[k];
    signal input scope[k];                     // used iff useScope
    signal input category[k];                  // used iff useDiversity
    signal input pathElements[k][depth];       // used iff useMerkle
    signal input pathIndices[k][depth];        // used iff useMerkle
    // ---- public ----
    signal input ctx;
    signal input epoch;
    signal input attesterRoot;                 // used iff useMerkle
    signal input signalHash;                   // used iff useRln
    // ---- public outputs ----
    signal output C;
    signal output N;
    signal output y;                           // RLN share      (0 iff !useRln)
    signal output attKeyCommit;                // key commitment  (0 iff !useKeyCommit)

    var P = k * (k - 1) \ 2;                   // # unordered pairs

    // (1) C = Poseidon(s)
    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    // (2) k EdDSA-Poseidon verifications; message is Poseidon(C, scope_i) or C.
    component msg[k];
    component ver[k];
    for (var i = 0; i < k; i++) {
        if (useScope == 1) {
            scope[i] === ctx;
            msg[i] = Poseidon(2);
            msg[i].inputs[0] <== C;
            msg[i].inputs[1] <== scope[i];
        }
        ver[i] = EdDSAPoseidonVerifier();
        ver[i].enabled <== 1;
        ver[i].Ax  <== Ax[i];
        ver[i].Ay  <== Ay[i];
        ver[i].R8x <== R8x[i];
        ver[i].R8y <== R8y[i];
        ver[i].S   <== Sig[i];
        if (useScope == 1) { ver[i].M <== msg[i].out; } else { ver[i].M <== C; }
    }

    // (2b) distinct attester pubkeys (x-coordinate), all P pairs.
    component axeq[P];
    var pa = 0;
    for (var i = 0; i < k; i++) {
        for (var j = i + 1; j < k; j++) {
            axeq[pa] = IsEqual();
            axeq[pa].in[0] <== Ax[i];
            axeq[pa].in[1] <== Ax[j];
            axeq[pa].out === 0;
            pa++;
        }
    }

    // key hashes -- needed as Merkle leaves and/or for the key commitment.
    component kh[k];
    if (useMerkle == 1 || useKeyCommit == 1) {
        for (var i = 0; i < k; i++) {
            kh[i] = Poseidon(2);
            kh[i].inputs[0] <== Ax[i];
            kh[i].inputs[1] <== Ay[i];
        }
    }

    // (3) MERKLE membership of each attester key in attesterRoot.
    if (useMerkle == 1) {
        component incl[k];
        for (var i = 0; i < k; i++) {
            incl[i] = MerkleInclusion(depth);
            incl[i].leaf <== kh[i].out;
            incl[i].root <== attesterRoot;
            for (var j = 0; j < depth; j++) {
                incl[i].pathElements[j] <== pathElements[i][j];
                incl[i].pathIndices[j]  <== pathIndices[i][j];
            }
        }
    }

    // (3') KEY COMMITMENT for out-of-circuit accumulator membership.
    if (useKeyCommit == 1) {
        component hK = Poseidon(k);
        for (var i = 0; i < k; i++) hK.inputs[i] <== kh[i].out;
        attKeyCommit <== hK.out;
    } else {
        attKeyCommit <== 0;
    }

    // (4) DIVERSITY predicate D: k categories pairwise distinct.
    if (useDiversity == 1) {
        component cateq[P];
        var pc = 0;
        for (var i = 0; i < k; i++) {
            for (var j = i + 1; j < k; j++) {
                cateq[pc] = IsEqual();
                cateq[pc].in[0] <== category[i];
                cateq[pc].in[1] <== category[j];
                cateq[pc].out === 0;
                pc++;
            }
        }
    }

    // (5) RLN degree-1 Shamir share.
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;

    if (useRln == 1) {
        signal a1x;
        a1x <== N * signalHash;
        y <== s + a1x;
    } else {
        y <== 0;
    }
}
