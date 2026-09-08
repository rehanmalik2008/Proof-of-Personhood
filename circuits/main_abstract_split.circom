pragma circom 2.1.0;
// Deployed split-epoch login circuit, Poseidon replaced by its determinism-only
// abstraction (see abstract/poseidon.circom). Same public interface.
include "wedge_membership.circom";
component main {public [root, ctx, epochAction, epochTree, signalHash]} = WedgeMembershipWideSplit(8,9);
