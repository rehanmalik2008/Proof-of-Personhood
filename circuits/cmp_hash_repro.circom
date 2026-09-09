pragma circom 2.1.0;
include "comparators.circom";

// circomlib LessThan(252): documented contract is  out == 1  iff  in[0] < in[1],
// with the (asserted-only-on n<=252, NOT on the inputs) precondition in[i] < 2^n.
template CmpHash() {
    signal input a;
    signal input b;
    signal output lt;            // claims: 1 iff a < b
    component c = LessThan(252);
    c.in[0] <== a;
    c.in[1] <== b;
    lt <== c.out;
}
component main = CmpHash();
