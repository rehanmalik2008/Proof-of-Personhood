pragma circom 2.1.0;
// Minimal reproducer for a Picus/Veridise empirical finding (see
// docs/self-audit/picus-upstream-report.md). PROPERLY CONSTRAINED baseline:
// a per-context nullifier N = Poseidon(s, ctx, epoch) and a degree-1 RLN
// Shamir share y = s + N*signalHash. Both outputs are uniquely determined by
// the inputs. ~150 R1CS constraints (one Poseidon(3) plus two mul/add rows).
include "poseidon.circom";
template PoseidonRLN() {
    signal input s;
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal output N;
    signal output y;
    component hN = Poseidon(3);
    hN.inputs[0] <== s;
    hN.inputs[1] <== ctx;
    hN.inputs[2] <== epoch;
    N <== hN.out;
    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;
}
component main = PoseidonRLN();
