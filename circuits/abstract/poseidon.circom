pragma circom 2.1.0;
// ===========================================================================
// DETERMINISM-ONLY abstraction of Poseidon  (after-the-oracle.md, Task 4, Layer B)
//
// Compiled with `-l circuits/abstract` placed BEFORE circomlib on the include
// path, so `include "poseidon.circom"` inside wedge_membership.circom resolves
// to THIS file instead of the real permutation. Every Poseidon(n) instance in
// the circuit is replaced by a single deterministic relation
//     out === sum_i (i+1) * inputs[i]
// The specific coefficients carry no meaning: the ONLY property this abstraction
// asserts is the one the composition argument uses -- `out` is a deterministic
// function of `inputs` (equal inputs => equal output). It deliberately does NOT
// model Poseidon's algebraic behaviour or its collision/pre-image resistance.
//
// Layer A separately establishes that the REAL circomlib Poseidon R1CS uniquely
// determines `out` from `inputs` (two-witness search + Picus on Poseidon alone).
// Layer A (real Poseidon is uniquely determining) + Layer B (the circuit is
// uniquely determined GIVEN that) = a whole-circuit result, obtained where the
// monolithic Picus run does not terminate.
// ===========================================================================
template Poseidon(nInputs) {
    signal input inputs[nInputs];
    signal output out;
    var acc = 0;
    for (var i = 0; i < nInputs; i++) acc += (i + 1) * inputs[i];
    out <== acc;
}
