pragma circom 2.1.0;
include "wedge_full_core.circom";
// Lever A/B: NO in-circuit Merkle. Circuit exposes attKeyCommit; membership is
// checked by the backend against a public accumulator (scripts/accum_rsa.mjs). k=3.
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(3, 1, 0, 1, 1, 1, 1);
