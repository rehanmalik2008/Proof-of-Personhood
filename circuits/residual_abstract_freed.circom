pragma circom 2.1.0;
// POSITIVE CONTROL for ff_smt_two_witness.mjs: residual_abstract with the y
// binding downgraded to <-- so y is genuinely under-constrained. The FF-SMT
// two-witness query must return SAT (a second witness moving the public output
// y). Confirms the encoding is not spuriously UNSAT.
include "poseidon.circom";
template ResidualAbstractFreed() {
    signal input s; signal input ctx; signal input epochAction; signal input signalHash;
    signal output N; signal output y;
    component hN = Poseidon(3);
    hN.inputs[0] <== s; hN.inputs[1] <== ctx; hN.inputs[2] <== epochAction;
    N <== hN.out;
    signal a1x; a1x <== N * signalHash;
    y <-- s + a1x;
}
component main {public [ctx, epochAction, signalHash]} = ResidualAbstractFreed();
