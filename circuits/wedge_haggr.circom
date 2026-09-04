pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Lever H -- verify ONE half-aggregate EdDSA-Poseidon signature IN-CIRCUIT.
// Same curve (Baby JubJub) / field as the existing EdDSA-Poseidon circuit.
// NO pairings, NO BLS, NO curve change. Nothing about the attesters leaves the
// proof -> full attester-unlinkability.
//
// Non-interactive half-aggregation (Chalkias-Garillot-Kondi-Nikolaenko style):
//   k sigs (R8_i, S_i) from keys A_i over a common message M.
//   hRAM_i = Poseidon(R8x_i,R8y_i,Ax_i,Ay_i,M)
//   T      = Poseidon(all R8x, all R8y, all Ax, all Ay, M)       (transcript)
//   rho_1  = 1 ;  rho_i = Poseidon(i, T)   for i >= 2            (agg coefficients)
//   S_agg  = sum_i rho_i * S_i   (mod L)   -- prover supplies it
//   sigma_i = rho_i * hRAM_i     (mod L)   -- prover supplies it
//   verify:  S_agg * B8  ==  sum_i rho_i * R8_i  +  sum_i sigma_i * (8*A_i)
//
// GENEROUS-TO-H shortcut (documented): sigma_i and S_agg are taken as witnesses
// with range checks only; the mod-L binding sigma_i == rho_i*hRAM_i is NOT
// enforced here. That UNDER-counts Lever H. If H still loses to k direct
// verifications even under-counted, the gate (Falsification #1) is decisively closed.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "bitify.circom";
include "compconstant.circom";
include "escalarmulany.circom";
include "escalarmulfix.circom";
include "babyjub.circom";
include "comparators.circom";
include "eddsaposeidon.circom";

// (L-1) for Baby JubJub subgroup order, as circomlib's EdDSAPoseidonVerifier uses it
function SUBORDER_MINUS_1() { return 2736030358979909402780800718157159386076813972158567259200215660948447373040; }

template ScalarLT_L(nbits) {         // enforce  in < L  (subgroup order)
    signal input in;
    component b = Num2Bits(nbits);
    b.in <== in;
    component cc = CompConstant(SUBORDER_MINUS_1());
    for (var i = 0; i < 253; i++) cc.in[i] <== (i < nbits) ? b.out[i] : 0;
    cc.in[253] <== 0;
    cc.out === 0;
    signal output bits[nbits];
    for (var i = 0; i < nbits; i++) bits[i] <== b.out[i];
}

template Mul8(/* point */) {
    signal input x; signal input y;
    signal output xout; signal output yout;
    component d1 = BabyDbl(); d1.x <== x;      d1.y <== y;
    component d2 = BabyDbl(); d2.x <== d1.xout; d2.y <== d1.yout;
    component d3 = BabyDbl(); d3.x <== d2.xout; d3.y <== d2.yout;
    xout <== d3.xout; yout <== d3.yout;
}

template EdDSAHalfAggVerify(k) {
    signal input Ax[k];
    signal input Ay[k];
    signal input R8x[k];
    signal input R8y[k];
    signal input M;
    signal input Sagg;                 // prover: sum_i rho_i S_i mod L
    signal input sigma[k];             // prover: rho_i * hRAM_i mod L  (mod-L binding omitted; see header)

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    // hRAM_i = Poseidon(R8x_i,R8y_i,Ax_i,Ay_i,M)
    component hram[k];
    for (var i = 0; i < k; i++) {
        hram[i] = Poseidon(5);
        hram[i].inputs[0] <== R8x[i];
        hram[i].inputs[1] <== R8y[i];
        hram[i].inputs[2] <== Ax[i];
        hram[i].inputs[3] <== Ay[i];
        hram[i].inputs[4] <== M;
    }

    // transcript T = Poseidon(all R8x, all R8y, all Ax, all Ay, M)
    component T = Poseidon(4 * k + 1);
    for (var i = 0; i < k; i++) {
        T.inputs[i]           <== R8x[i];
        T.inputs[k + i]       <== R8y[i];
        T.inputs[2 * k + i]   <== Ax[i];
        T.inputs[3 * k + i]   <== Ay[i];
    }
    T.inputs[4 * k] <== M;

    // rho_1 = 1 ;  rho_i = low 253 bits of Poseidon(i, T)   (hash-to-scalar by truncation)
    component rhoH[k];
    component rhoTrunc[k];
    signal rhoBits[k][253];
    for (var i = 0; i < 253; i++) rhoBits[0][i] <== (i == 0) ? 1 : 0;
    for (var i = 1; i < k; i++) {
        rhoH[i] = Poseidon(2);
        rhoH[i].inputs[0] <== i + 1;      // domain-separated index
        rhoH[i].inputs[1] <== T.out;
        rhoTrunc[i] = Num2Bits(254);
        rhoTrunc[i].in <== rhoH[i].out;
        for (var b = 0; b < 253; b++) rhoBits[i][b] <== rhoTrunc[i].out[b];
    }

    // range checks: S_agg < L (strict), sigma_i < 2^253 (loose; generous to H -- see header)
    component saggBits = ScalarLT_L(253);
    saggBits.in <== Sagg;
    component sigBits[k];
    for (var i = 0; i < k; i++) {
        sigBits[i] = Num2Bits(253); sigBits[i].in <== sigma[i];
    }

    // RHS-A: sum_i sigma_i * (8*A_i)
    component m8[k];
    component mulA[k];
    for (var i = 0; i < k; i++) {
        m8[i] = Mul8();
        m8[i].x <== Ax[i];
        m8[i].y <== Ay[i];
        mulA[i] = EscalarMulAny(253);
        for (var b = 0; b < 253; b++) mulA[i].e[b] <== sigBits[i].out[b];
        mulA[i].p[0] <== m8[i].xout;
        mulA[i].p[1] <== m8[i].yout;
    }
    // RHS-R: rho_1*R8_1 (= R8_1) + sum_{i>=2} rho_i * R8_i
    component mulR[k];
    for (var i = 1; i < k; i++) {
        mulR[i] = EscalarMulAny(253);
        for (var b = 0; b < 253; b++) mulR[i].e[b] <== rhoBits[i][b];
        mulR[i].p[0] <== R8x[i];
        mulR[i].p[1] <== R8y[i];
    }

    // accumulate RHS = R8_1 + sum_{i>=2} rho_i R8_i + sum_i sigma_i 8A_i
    signal accx[2 * k];
    signal accy[2 * k];
    accx[0] <== R8x[0];
    accy[0] <== R8y[0];
    component add[2 * k - 1];
    var t = 0;
    for (var i = 1; i < k; i++) {
        add[t] = BabyAdd();
        add[t].x1 <== accx[t]; add[t].y1 <== accy[t];
        add[t].x2 <== mulR[i].out[0]; add[t].y2 <== mulR[i].out[1];
        accx[t + 1] <== add[t].xout; accy[t + 1] <== add[t].yout;
        t++;
    }
    for (var i = 0; i < k; i++) {
        add[t] = BabyAdd();
        add[t].x1 <== accx[t]; add[t].y1 <== accy[t];
        add[t].x2 <== mulA[i].out[0]; add[t].y2 <== mulA[i].out[1];
        accx[t + 1] <== add[t].xout; accy[t + 1] <== add[t].yout;
        t++;
    }

    // LHS = S_agg * B8
    component lhs = EscalarMulFix(253, BASE8);
    for (var b = 0; b < 253; b++) lhs.e[b] <== saggBits.bits[b];

    lhs.out[0] === accx[t];
    lhs.out[1] === accy[t];
}

// Composed: the proven 478-constraint residual + in-circuit half-aggregate verify.
template WedgeAggHalf(k) {
    signal input s;
    signal input category[k];
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    // half-aggregate witness
    signal input Ax[k];
    signal input Ay[k];
    signal input R8x[k];
    signal input R8y[k];
    signal input Sagg;
    signal input sigma[k];
    // public outputs
    signal output C;
    signal output N;
    signal output y;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component hN = Poseidon(3);
    hN.inputs[0] <== s; hN.inputs[1] <== ctx; hN.inputs[2] <== epoch;
    N <== hN.out;

    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;

    var P = k * (k - 1) \ 2;
    component ceq[P];
    var p = 0;
    for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) {
        ceq[p] = IsEqual();
        ceq[p].in[0] <== category[i]; ceq[p].in[1] <== category[j];
        ceq[p].out === 0; p++;
    }

    component agg = EdDSAHalfAggVerify(k);
    for (var i = 0; i < k; i++) {
        agg.Ax[i] <== Ax[i];  agg.Ay[i] <== Ay[i];
        agg.R8x[i] <== R8x[i]; agg.R8y[i] <== R8y[i];
        agg.sigma[i] <== sigma[i];
    }
    agg.M <== C;
    agg.Sagg <== Sagg;
}

// Comparison baseline for the gate: the same 478-residual + k DIRECT EdDSA-Poseidon
// verifications over C. Also fully private (everything in-circuit).
template WedgeDirect(k) {
    signal input s;
    signal input category[k];
    signal input ctx;
    signal input epoch;
    signal input signalHash;
    signal input Ax[k];
    signal input Ay[k];
    signal input R8x[k];
    signal input R8y[k];
    signal input S[k];
    signal output C;
    signal output N;
    signal output y;

    component hC = Poseidon(1);
    hC.inputs[0] <== s;
    C <== hC.out;

    component hN = Poseidon(3);
    hN.inputs[0] <== s; hN.inputs[1] <== ctx; hN.inputs[2] <== epoch;
    N <== hN.out;

    signal a1x;
    a1x <== N * signalHash;
    y <== s + a1x;

    var P = k * (k - 1) \ 2;
    component ceq[P];
    var p = 0;
    for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) {
        ceq[p] = IsEqual();
        ceq[p].in[0] <== category[i]; ceq[p].in[1] <== category[j];
        ceq[p].out === 0; p++;
    }

    component v[k];
    for (var i = 0; i < k; i++) {
        v[i] = EdDSAPoseidonVerifier();
        v[i].enabled <== 1;
        v[i].Ax <== Ax[i];  v[i].Ay <== Ay[i];
        v[i].R8x <== R8x[i]; v[i].R8y <== R8y[i];
        v[i].S <== S[i];      v[i].M <== C;
    }
}
