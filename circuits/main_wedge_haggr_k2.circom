pragma circom 2.1.0;
include "wedge_haggr.circom";
component main {public [ctx, epoch, signalHash]} = WedgeAggHalf(2);
