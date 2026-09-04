pragma circom 2.1.0;
include "wedge_core.circom";

// k = 3 : the configuration the go/no-go decision is about.
component main {public [ctx, epoch, Ax, Ay]} = Wedge3();
