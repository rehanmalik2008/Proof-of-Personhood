pragma circom 2.1.0;
// Residual-only projection of the Layer B abstraction (the-last-technical-frontier.md,
// Task 1). N and y in the deployed circuit depend ONLY on {s, ctx, epochAction,
// signalHash} -- the Merkle half feeds nothing back (taint_iszero.md). This is
// that sub-circuit with Poseidon replaced by the determinism-only mock
// (abstract/poseidon.circom on the include path). ~4 constraints: small enough
// that the FF-SMT two-witness query is decided SYMBOLICALLY (all inputs free),
// giving an UNCONDITIONAL, universal proof that N and y are uniquely determined.
include "poseidon.circom";
template ResidualAbstract() {
    signal input s;
    signal input ctx;
    signal input epochAction;
    signal input signalHash;
    signal output N;
    signal output y;
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epochAction;
    N <== hN.out;
    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;
}
component main {public [ctx, epochAction, signalHash]} = ResidualAbstract();
