pragma circom 2.1.0;
include "wedge_full_core.circom";
// Lever D + E: depth 10, k=2.
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(2, 10, 1, 1, 1, 1, 0);
