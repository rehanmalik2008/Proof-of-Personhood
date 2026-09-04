pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Sybil-wedge proving-cost spike -- core templates
//
// Question this benchmark exists to answer:
//   can a client-side Groth16 proof of
//     (1) C = Poseidon(s)
//     (2) k=3 EdDSA-Poseidon signature verifications over C, distinct pubkeys
//     (3) N = Poseidon(s, ctx, epoch)
//   be generated in-browser (WASM) in < 2.0 s on mid-range mobile hardware?
//
// Deliberately OMITTED (out of scope for the order-of-magnitude question):
//   Merkle-path membership of attester keys, the full diversity predicate,
//   and the RLN Shamir-share constraint. The dominant cost is the k signature
//   verifications; that is what we measure.
//
// Primitives are SNARK-friendly only: Poseidon hashing, EdDSA on Baby JubJub
// (NOT ECDSA -- ECDSA-in-circuit is the expected latency killer we are avoiding).
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "eddsaposeidon.circom";
include "comparators.circom";

// commit_only: the fixed Poseidon cost with ZERO signatures.
// Subtracting this from Wedge3 attributes the cost to the 3 EdDSA verifications.
template CommitOnly() {
    signal input s;
    signal input ctx;
    signal input epoch;
    signal output C;
    signal output N;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;
}

// Wedge1: commitment + nullifier + exactly ONE EdDSA verification.
// (Wedge1 - CommitOnly) = marginal cost of one signature verification.
template Wedge1() {
    signal input s;
    signal input ctx;
    signal input epoch;
    signal input Ax[1];
    signal input Ay[1];
    signal input R8x[1];
    signal input R8y[1];
    signal input S[1];
    signal output C;
    signal output N;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component v0 = EdDSAPoseidonVerifier();
    v0.enabled <== 1;
    v0.Ax  <== Ax[0];
    v0.Ay  <== Ay[0];
    v0.R8x <== R8x[0];
    v0.R8y <== R8y[0];
    v0.S   <== S[0];
    v0.M   <== C;          // all k signatures are over the same committed value C

    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;
}

// Wedge3: the real thing being benchmarked. k = 3.
template Wedge3() {
    signal input s;                 // private: root secret, never leaves device
    signal input ctx;              // public: context / domain identifier
    signal input epoch;           // public: epoch counter
    signal input Ax[3];           // public: attester public keys (Baby JubJub)
    signal input Ay[3];
    signal input R8x[3];          // signature R8 point per attester
    signal input R8y[3];
    signal input S[3];            // signature scalar per attester
    signal output C;              // public: commitment, bound into the proof
    signal output N;              // public: nullifier N = Poseidon(s, ctx, epoch)

    // (1) C = Poseidon(s)
    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    // (2) verify k = 3 EdDSA-Poseidon signatures over C
    component v[3];
    for (var i = 0; i < 3; i++) {
        v[i] = EdDSAPoseidonVerifier();
        v[i].enabled <== 1;
        v[i].Ax  <== Ax[i];
        v[i].Ay  <== Ay[i];
        v[i].R8x <== R8x[i];
        v[i].R8y <== R8y[i];
        v[i].S   <== S[i];
        v[i].M   <== C;
    }

    // pairwise-distinct public keys (compare x-coordinates).
    // Cheap stand-in for the real diversity predicate, which is out of scope here.
    component e01 = IsEqual();
    e01.in[0] <== Ax[0];
    e01.in[1] <== Ax[1];
    e01.out === 0;

    component e02 = IsEqual();
    e02.in[0] <== Ax[0];
    e02.in[1] <== Ax[2];
    e02.out === 0;

    component e12 = IsEqual();
    e12.in[0] <== Ax[1];
    e12.in[1] <== Ax[2];
    e12.out === 0;

    // (3) N = Poseidon(s, ctx, epoch)
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;
}
