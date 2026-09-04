pragma circom 2.1.0;
include "wedge_full_core.circom";
// Lever E only: k=2 at full depth 20 (isolates the k saving from the depth saving).
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(2, 20, 1, 1, 1, 1, 0);
