pragma circom 2.1.0;
include "wedge_residual.circom";
// Lever C in-circuit residual, k=3. No signatures, no Merkle.
component main {public [ctx, epoch, signalHash]} = WedgeResidual(3);
