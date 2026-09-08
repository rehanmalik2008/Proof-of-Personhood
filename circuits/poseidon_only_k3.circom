pragma circom 2.1.0;
// Layer A of compositional verification (after-the-oracle.md, Task 3->4):
// circomlib Poseidon(3) in isolation -- the nullifier hash arity. Small enough
// that Picus terminates and the two-witness search is instant.
include "poseidon.circom";
component main = Poseidon(3);
