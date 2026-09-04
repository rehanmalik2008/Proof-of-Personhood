// Lever C, Step 2 -- the OUT-OF-CIRCUIT aggregate signature verifier.
//   node scripts/bls_verify.mjs [registrySize] [k] [runs]
//
// k curated attesters BLS-sign the user's commitment C. Their k signatures
// aggregate to ONE. The backend verifier (this script) checks, per proof:
//   (a) one aggregate BLS verification of that signature over C, against the
//       aggregated public key of the k signers;
//   (b) the k signers are in the curated attester registry;
//   (c) their categories satisfy the diversity predicate D.
//
// BLS12-381, short signatures: signature in G1 (48 B), public key in G2 (96 B).
// Same-message aggregation is rogue-key safe only with proof-of-possession at
// registration -- a PoP is checked for every attester when the registry is built.

import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { randomBytes } from "crypto";

const S = bls.shortSignatures;
const REG = Number(process.argv[2] ?? 16);
const K = Number(process.argv[3] ?? 3);
const RUNS = Number(process.argv[4] ?? 5000);
const ms = (n) => n.toFixed(3);
const b2h = (u8) => Buffer.from(u8).toString("hex");

// ---- curated registry (one-time; operator-vetted, with PoP) --------------
const CATS = ["employer", "university", "social", "government", "cooperative"];
const registry = [];
for (let i = 0; i < REG; i++) {
  const sk = S.keygen(randomBytes(48)).secretKey;
  const pk = S.getPublicKey(sk);
  const pkb = pk.toBytes();
  const pop = S.sign(S.hash(pkb), sk);                 // attester signs its own pk
  if (!S.verify(pop, S.hash(pkb), pk)) throw new Error(`PoP failed for attester ${i}`);
  registry.push({ i, sk, pk, pkb: b2h(pkb), cat: CATS[i % CATS.length] });
}
const inRegistry = new Set(registry.map((a) => a.pkb));
const nCat = new Set(registry.map((a) => a.cat)).size;
console.log(`registry: ${REG} attesters across ${nCat} categories, PoP verified for all\n`);

// ---- one proof's attestation set ----------------------------------------
const signers = (() => {
  const seen = new Set(), out = [];
  for (const a of registry) { if (!seen.has(a.cat)) { seen.add(a.cat); out.push(a); } if (out.length === K) break; }
  if (out.length < K) throw new Error("registry lacks K distinct categories");
  return out;
})();

const C = randomBytes(32);                               // the circuit's public output C
const Cpt = S.hash(C);
const partSigs = signers.map((a) => S.sign(Cpt, a.sk));
const aggSig = S.aggregateSignatures(partSigs);
const aggPk = S.aggregatePublicKeys(signers.map((a) => a.pk));

const sigBytes = aggSig.toBytes().length;
console.log(`aggregate signature : ${sigBytes} B   (one, independent of k)`);
console.log(`proof payload add   : ${sigBytes} B sig + ${K} x 2 B registry index = ${sigBytes + K * 2} B`);
console.log(`  (alt: carry k full pubkeys instead of indices = ${sigBytes + K * 96} B)\n`);

// ---- backend verify, per proof: (a) aggregate BLS  (b) in-registry  (c) D ----
function verifyOnce() {
  const okSig = S.verify(aggSig, Cpt, aggPk);
  let inSet = true;
  for (const a of signers) if (!inRegistry.has(a.pkb)) inSet = false;
  const cats = signers.map((a) => a.cat);
  const okD = new Set(cats).size === cats.length && cats.length >= 2;
  return okSig && inSet && okD;
}
if (!verifyOnce()) throw new Error("honest case failed to verify");

// negative controls
const tamper = S.aggregateSignatures([partSigs[0], ...partSigs.slice(0, K - 1)]); // wrong multiset
console.log(`neg control  tampered aggregate rejected : ${!S.verify(tamper, Cpt, aggPk)}`);
console.log(`neg control  wrong C rejected            : ${!S.verify(aggSig, S.hash(randomBytes(32)), aggPk)}\n`);

// ---- timing --------------------------------------------------------------
verifyOnce();
const bench = (fn) => {
  const t = [];
  for (let r = 0; r < RUNS; r++) { const a = performance.now(); fn(); t.push(performance.now() - a); }
  t.sort((x, y) => x - y);
  return { med: t[t.length >> 1], p95: t[Math.floor(t.length * 0.95)], mean: t.reduce((x, y) => x + y) / t.length, min: t[0] };
};
const full = bench(verifyOnce);
const pairOnly = bench(() => S.verify(aggSig, Cpt, aggPk));

console.log(`VERIFY per proof  (a)+(b)+(c), ${RUNS} runs, k=${K}:`);
console.log(`  median ${ms(full.med)} ms   p95 ${ms(full.p95)} ms   mean ${ms(full.mean)} ms   min ${ms(full.min)} ms`);
console.log(`    BLS aggregate verify alone : median ${ms(pairOnly.med)} ms`);
console.log(`    registry + D check         : median ${ms(full.med - pairOnly.med)} ms   (set lookups, ~0)`);
console.log(`
  This is @noble pure-JS BLS12-381 -- the no-native-deps baseline (same choice as
  snarkjs-WASM over rapidsnark). A compiled backend BLS (blst bindings, or the
  EIP-2537 precompile) verifies in ~0.3-1 ms. Either way it is BACKEND-side and
  ~${ms(full.med)} ms is negligible against the 2000 ms phone-proving budget.
  Cost is O(1) in k: one aggregate verify whether k=2 or k=3.`);
