pragma circom 2.1.0;
include "wedge_full_core.circom";
// WedgeFull, current: k=3, Merkle depth 20, all groups. (== wedge_ship)
component main {public [ctx, epoch, attesterRoot, signalHash]} = WedgeParam(3, 20, 1, 1, 1, 1, 0);
