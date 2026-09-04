pragma circom 2.1.0;
include "wedge_full_core.circom";
// Lever A/B + E: out-of-circuit accumulator membership, k=2.
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(2, 1, 0, 1, 1, 1, 1);
