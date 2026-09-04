// Witness inputs for the merkle-cost-ladder circuits. Writes one file per rung:
//   build/input_wf_k3_d20.json   -> wedge_full  (current WedgeFull)
//   build/input_wf_k3_d10.json   -> wedge_d10_k3   (Lever D)
//   build/input_wf_k2_d20.json   -> wedge_d20_k2   (Lever E)
//   build/input_wf_k2_d10.json   -> wedge_d10_k2   (Lever D+E)
//   build/input_wf_k3_d1.json    -> wedge_accum_k3 (Lever A/B, dummy paths)
//   build/input_wf_k2_d1.json    -> wedge_accum_k2 (Lever A/B + E)
//
// One shared secret + 3 attester keypairs; k=2 rungs use the first two. Every
// EdDSA signature is over Poseidon(C, ctx) and self-verified; every real Merkle
// path (depth >= 2) recomputes its root before the file is written.

import { buildPoseidon, buildEddsa } from "circomlibjs";
import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const poseidon = await buildPoseidon();
const eddsa = await buildEddsa();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (a) => poseidon(a);

const s = F.e("0x" + randomBytes(31).toString("hex"));
const ctx = 987654321n;
const epoch = 7n;
const signalHash = F.e("0x" + randomBytes(31).toString("hex"));
const C = H([s]);
const N = H([s, F.e(ctx), F.e(epoch)]);
const msg = H([C, F.e(ctx)]);                       // scoped EdDSA message

const keys = [];
const seen = new Set();
while (keys.length < 3) {
  const prv = randomBytes(32);
  const pub = eddsa.prv2pub(prv);
  const ax = toDec(pub[0]);
  if (seen.has(ax)) continue;
  seen.add(ax);
  const sig = eddsa.signPoseidon(prv, msg);
  if (!eddsa.verifyPoseidon(msg, sig, pub)) throw new Error("signature self-check failed");
  keys.push({ pub, sig });
}
const categories = [11n, 22n, 33n];

function realTree(depth, k) {
  const zeros = [F.e(0)];
  for (let i = 1; i <= depth; i++) zeros[i] = H([zeros[i - 1], zeros[i - 1]]);
  const nodes = Array.from({ length: depth + 1 }, () => new Map());
  for (let i = 0; i < k; i++) nodes[0].set(i, H([keys[i].pub[0], keys[i].pub[1]]));
  for (let lvl = 0; lvl < depth; lvl++) {
    for (const p of new Set([...nodes[lvl].keys()].map((x) => x >> 1))) {
      const l = nodes[lvl].get(2 * p) ?? zeros[lvl];
      const r = nodes[lvl].get(2 * p + 1) ?? zeros[lvl];
      nodes[lvl + 1].set(p, H([l, r]));
    }
  }
  const root = nodes[depth].get(0) ?? zeros[depth];
  const path = (leafIdx) => {
    const pe = [], pi = [];
    let idx = leafIdx;
    for (let i = 0; i < depth; i++) {
      pe.push(nodes[i].get(idx ^ 1) ?? zeros[i]);
      pi.push(idx & 1);
      idx >>= 1;
    }
    return { pe, pi };
  };
  for (let i = 0; i < k; i++) {                     // self-check
    const { pe, pi } = path(i);
    let h = H([keys[i].pub[0], keys[i].pub[1]]);
    for (let j = 0; j < depth; j++) h = pi[j] === 0 ? H([h, pe[j]]) : H([pe[j], h]);
    if (toDec(h) !== toDec(root)) throw new Error(`Merkle self-check failed k${k} d${depth} leaf ${i}`);
  }
  return { root, path };
}

function emit(k, depth) {
  const useTree = depth >= 2;
  const t = useTree ? realTree(depth, k) : null;
  const Ax = [], Ay = [], R8x = [], R8y = [], Sig = [], pe = [], pi = [];
  for (let i = 0; i < k; i++) {
    Ax.push(toDec(keys[i].pub[0]));  Ay.push(toDec(keys[i].pub[1]));
    R8x.push(toDec(keys[i].sig.R8[0])); R8y.push(toDec(keys[i].sig.R8[1]));
    Sig.push(keys[i].sig.S.toString());
    if (useTree) {
      const { pe: e, pi: x } = t.path(i);
      pe.push(e.map(toDec)); pi.push(x.map(String));
    } else {
      pe.push(Array(depth).fill("0")); pi.push(Array(depth).fill("0"));
    }
  }
  const obj = {
    s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString(),
    attesterRoot: useTree ? toDec(t.root) : "0",
    signalHash: toDec(signalHash),
    Ax, Ay, R8x, R8y, Sig,
    scope: Array(k).fill(ctx.toString()),
    category: categories.slice(0, k).map(String),
    pathElements: pe, pathIndices: pi,
  };
  const f = `build/input_wf_k${k}_d${depth}.json`;
  writeFileSync(f, JSON.stringify(obj, null, 2));
  console.log(`wrote ${f}`);
}

// Lever C residual: only s, category, ctx, epoch, signalHash.
function emitResidual(k) {
  const obj = {
    s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString(),
    signalHash: toDec(signalHash),
    category: categories.slice(0, k).map(String),
  };
  const f = `build/input_residual_k${k}.json`;
  writeFileSync(f, JSON.stringify(obj, null, 2));
  console.log(`wrote ${f}`);
}

// Lever C, Step 2: a real aggregate BLS signature over C, for the end-to-end harness.
// The k curated attesters sign C; the harness verifies ONE aggregate signature.
function emitBls(k) {
  const S = bls.shortSignatures;
  const CATS = ["employer", "university", "social"];
  const Cbytes = Buffer.from(F.toObject(C).toString(16).padStart(64, "0"), "hex");
  const Cpt = S.hash(Cbytes);
  const att = [];
  for (let i = 0; i < k; i++) {
    const sk = S.keygen(randomBytes(48)).secretKey;
    att.push({ sk, pk: S.getPublicKey(sk), cat: CATS[i % CATS.length] });
  }
  const aggSig = S.aggregateSignatures(att.map((a) => S.sign(Cpt, a.sk)));
  const aggPk = S.aggregatePublicKeys(att.map((a) => a.pk));
  if (!S.verify(aggSig, Cpt, aggPk)) throw new Error("BLS self-check failed");
  const hx = (u8) => Buffer.from(u8).toString("hex");
  const obj = {
    C: F.toObject(C).toString(),
    aggSig: hx(aggSig.toBytes()),
    aggPk: hx(aggPk.toBytes()),
    signerCategories: att.map((a) => a.cat),
    note: "one aggregate BLS12-381 signature (short: sig in G1, 48 B) over C, from k curated attesters",
  };
  const f = `build/bls_k${k}.json`;
  writeFileSync(f, JSON.stringify(obj, null, 2));
  console.log(`wrote ${f}   (aggSig ${aggSig.toBytes().length} B)`);
}

mkdirSync("build", { recursive: true });
for (const [k, d] of [[3, 20], [3, 10], [2, 20], [2, 10], [3, 1], [2, 1]]) emit(k, d);
for (const k of [2, 3]) emitResidual(k);
for (const k of [2, 3]) emitBls(k);
console.log(`  C=${toDec(C)}  N=${toDec(N)}`);
