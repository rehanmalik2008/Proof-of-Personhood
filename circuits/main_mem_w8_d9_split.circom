pragma circom 2.1.0;
include "wedge_membership.circom";
// Phase-2 LOGIN, split-epoch. Public: root (for epochTree), ctx, epochAction,
// epochTree, signalHash. Outputs: N = Poseidon(s, ctx, epochAction), y = s + N*signalHash.
component main {public [root, ctx, epochAction, epochTree, signalHash]} = WedgeMembershipWideSplit(8,9);
