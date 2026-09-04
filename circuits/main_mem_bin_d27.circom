pragma circom 2.1.0;
include "wedge_membership.circom";
component main {public [root, ctx, epoch, signalHash]} = WedgeMembershipBin(27);
