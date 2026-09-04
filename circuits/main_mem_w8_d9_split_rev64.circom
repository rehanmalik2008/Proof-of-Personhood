pragma circom 2.1.0;
include "wedge_revocation.circom";
component main {public [root, ctx, epochAction, epochTree, signalHash, revoked]} = WedgeMembershipWideSplitRevoke(8, 9, 64);
