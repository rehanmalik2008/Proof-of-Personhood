// Witnesses for the Lever H gate: fully-private, everything-in-circuit.
//   node scripts/gen_input_haggr.mjs
//
//   build/input_direct_k{1,2,3}.json  -> residual + k DIRECT EdDSA-Poseidon verifs
//   build/input_haggr_k{2,3}.json     -> residual + ONE in-circuit half-aggregate verif
//
// The half-aggregate (Chalkias-Garillot-Kondi-Nikolaenko style) is computed here and
// the verification equation is checked with real Baby JubJub EC ops before writing.

import { buildEddsa, buildPoseidon } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const eddsa = await buildEddsa();
const poseidon = await buildPoseidon();
const bj = eddsa.babyJub;
const F = poseidon.F;
const L = bj.subOrder;                          // Baby JubJub prime subgroup order
const o = (x) => F.toObject(x);                 // field elt -> bigint
const dec = (x) => o(x).toString();
const mod = (a, m) => ((a % m) + m) % m;

const s = F.e("0x" + randomBytes(31).toString("hex"));
const ctx = 987654321n, epoch = 7n;
const signalHash = F.e("0x" + randomBytes(31).toString("hex"));
const C = poseidon([s]);
const categories = [11n, 22n, 33n];

// k attester EdDSA-Poseidon signatures over C
const K = 3;
const att = [];
for (let i = 0; i < K; i++) {
  const prv = randomBytes(32);
  const pub = eddsa.prv2pub(prv);
  const sig = eddsa.signPoseidon(prv, C);
  if (!eddsa.verifyPoseidon(C, sig, pub)) throw new Error("sig self-check failed");
  att.push({ pub, sig });
}

mkdirSync("build", { recursive: true });

function emitDirect(k) {
  const a = att.slice(0, k);
  const obj = {
    s: dec(s), ctx: ctx.toString(), epoch: epoch.toString(), signalHash: dec(signalHash),
    category: categories.slice(0, k).map(String),
    Ax: a.map((x) => dec(x.pub[0])), Ay: a.map((x) => dec(x.pub[1])),
    R8x: a.map((x) => dec(x.sig.R8[0])), R8y: a.map((x) => dec(x.sig.R8[1])),
    S: a.map((x) => x.sig.S.toString()),
  };
  writeFileSync(`build/input_direct_k${k}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_direct_k${k}.json`);
}

function emitHaggr(k) {
  const a = att.slice(0, k);
  const Ax = a.map((x) => x.pub[0]), Ay = a.map((x) => x.pub[1]);
  const R8x = a.map((x) => x.sig.R8[0]), R8y = a.map((x) => x.sig.R8[1]);
  const Sarr = a.map((x) => BigInt(x.sig.S));    // sig.S is already a scalar (bigint)

  // hRAM_i = Poseidon(R8x_i,R8y_i,Ax_i,Ay_i,C)   (used as a full scalar, no mod)
  const hram = a.map((_, i) => o(poseidon([R8x[i], R8y[i], Ax[i], Ay[i], C])));

  // transcript T = Poseidon(all R8x, all R8y, all Ax, all Ay, C)
  const tin = [...R8x, ...R8y, ...Ax, ...Ay, C];
  const T = poseidon(tin);

  // rho_1 = 1 ; rho_i = low 253 bits of Poseidon(i+1, T)
  const MASK253 = (1n << 253n) - 1n;
  const rho = a.map((_, i) => (i === 0 ? 1n : o(poseidon([BigInt(i + 1), T])) & MASK253));

  // sigma_i = rho_i * hRAM_i mod L ;  S_agg = sum rho_i S_i mod L
  const sigma = a.map((_, i) => mod(rho[i] * hram[i], L));
  const Sagg = mod(a.reduce((acc, _, i) => acc + rho[i] * Sarr[i], 0n), L);

  // verify the aggregate equation with real EC ops:
  //   S_agg*B8  ==  sum rho_i*R8_i  +  sum sigma_i*(8*A_i)
  const P = (pt, sc) => bj.mulPointEscalar(pt, sc);
  const ADD = (p, q) => bj.addPoint(p, q);
  let rhs = [R8x[0], R8y[0]];                        // rho_1 * R8_1  (rho_1 = 1)
  for (let i = 1; i < k; i++) rhs = ADD(rhs, P([R8x[i], R8y[i]], rho[i]));
  for (let i = 0; i < k; i++) rhs = ADD(rhs, P(P([Ax[i], Ay[i]], 8n), sigma[i]));
  const lhs = P(bj.Base8, Sagg);
  if (o(lhs[0]) !== o(rhs[0]) || o(lhs[1]) !== o(rhs[1]))
    throw new Error(`half-aggregate equation FAILED to verify at k=${k}`);

  const obj = {
    s: dec(s), ctx: ctx.toString(), epoch: epoch.toString(), signalHash: dec(signalHash),
    category: categories.slice(0, k).map(String),
    Ax: Ax.map(dec), Ay: Ay.map(dec), R8x: R8x.map(dec), R8y: R8y.map(dec),
    Sagg: Sagg.toString(),
    sigma: sigma.map(String),
  };
  writeFileSync(`build/input_haggr_k${k}.json`, JSON.stringify(obj, null, 2));
  console.log(`wrote build/input_haggr_k${k}.json   (aggregate verified: 1 point-eq over ${k} sigs)`);
}

for (const k of [1, 2, 3]) emitDirect(k);
for (const k of [2, 3]) emitHaggr(k);
console.log(`  C = ${dec(C)}`);
