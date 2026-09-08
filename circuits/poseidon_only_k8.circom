pragma circom 2.1.0;
// Layer A of compositional verification: circomlib Poseidon(8) in isolation --
// the arity-8 Merkle node hash.
include "poseidon.circom";
component main = Poseidon(8);
