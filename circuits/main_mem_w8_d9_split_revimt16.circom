pragma circom 2.1.0;
include "wedge_nonmembership_imt.circom";
// Phase-2 login (split epoch) + indexed-Merkle non-membership revocation, IMT depth 16.
component main {public [root, ctx, epochAction, epochTree, signalHash, revRoot]} =
    WedgeMembershipWideSplitRevokeIMT(8, 9, 16);
