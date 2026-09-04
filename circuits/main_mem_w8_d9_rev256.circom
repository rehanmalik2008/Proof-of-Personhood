pragma circom 2.1.0;
include "wedge_revocation.circom";
component main {public [root, ctx, epoch, signalHash, revoked]} = WedgeMembershipWideRevoke(8, 9, 256);
