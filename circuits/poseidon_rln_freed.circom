pragma circom 2.1.0;
// Same circuit as poseidon_rln.circom with ONE change: the RLN share binding
// `y <== s + a1x` is downgraded to `y <-- s + a1x` (assignment, no constraint).
// `y` is now genuinely under-constrained: the tool-independent two-witness
// search (scripts/two_witness_search.mjs) finds a second satisfying witness
// that agrees on every input and differs at `y`.
//
// OBSERVED Picus behaviour on this ~150-constraint circuit: "Cannot determine
// whether the circuit is properly constrained" (exit 0), in ~11 s -- i.e. no
// verdict on a genuine, minimal under-constraint, because the deduction does
// not propagate uniqueness through the Poseidon(3) permutation feeding `N`,
// which `y` depends on. On a Poseidon-free 2-signal under-constraint Picus
// returns exit 9 correctly in ~2 s.
include "poseidon.circom";
template PoseidonRLNFreed() {
    signal input s;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal output N;
    signal output y;
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;
    signal a1x;
    a1x <== N * signalHash;
    y <-- s + a1x;
}
component main = PoseidonRLNFreed();
