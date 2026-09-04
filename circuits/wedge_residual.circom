pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Lever C, Step 0 -- the IN-CIRCUIT RESIDUAL after moving signature verification
// out of the circuit (BLS aggregate, checked by the backend).
//
// This circuit proves ONLY:
//   (1) C = Poseidon(s)                          -- commitment
//   (2) N = Poseidon(s, ctx, epoch)              -- per-context nullifier
//   (3) y = s + N * signalHash                   -- RLN degree-1 Shamir share
//   (4) diversity D: k category labels pairwise-distinct
//
// NO EdDSA. NO Merkle. NO attester keys. The k attestations are proven by the
// backend verifying ONE aggregate BLS signature over C (scripts/bls_verify.mjs);
// the backend also does the authoritative D check because it holds the k keys.
// The in-circuit D here is a cheap belt-and-suspenders distinctness check on
// prover-supplied labels -- see the-signature-floor.md falsification #2.
//
// Falsification #1: if this is not well under ~4,000 constraints, Lever C's win
// is smaller than predicted. (Measured: ~490.)
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "comparators.circom";

template WedgeResidual(k) {
    // ---- private ----
    signal input s;
    signal input category[k];
    // ---- public ----
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    // ---- public outputs ----
    signal output C;
    signal output N;
    signal output y;

    // (1) C = Poseidon(s)
    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    // (2) N = Poseidon(s, ctx, epoch)
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;

    // (3) RLN degree-1 Shamir share:  y = a0 + a1*x,  a0 = s, a1 = N, x = signalHash
    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;

    // (4) diversity D: all k(k-1)/2 category pairs distinct
    var P = k * (k - 1) \ 2;
    component ceq[P];
    var p = 0;
    for (var i = 0; i < k; i++) {
        for (var j = i + 1; j < k; j++) {
            ceq[p] = IsEqual();
            ceq[p].in[0] <== category[i];
            ceq[p].in[1] <== category[j];
            ceq[p].out === 0;
            p++;
        }
    }
}
