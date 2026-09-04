pragma circom 2.1.0;
include "wedge_full_core.circom";
// Lever D: Merkle depth 20 -> 10  (1,024 attester slots).
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(3, 10, 1, 1, 1, 1, 0);
