// Step 3 -- Lever A/B: RSA accumulator membership, verified OUT of the ZK circuit.
//   node scripts/accum_rsa.mjs [setSize] [k]
//
// The ZK circuit (wedge_accum_k*) does NOT prove membership. It exposes
// attKeyCommit / the k attester key-hashes as public IO. Membership of those
// key-hashes in the curated attester set is checked HERE, natively, the way a
// backend verifier would: one modular exponentiation per attester.
//
// This script measures what that costs and what it gives up:
//   - in-circuit membership constraints ....... 0   (the whole point)
//   - accumulator (public) ................... one ~2048-bit integer
//   - per-proof witness payload .............. k * 256 bytes  (before BBF batching)
//   - verifier work ......................... k modexps, timed below
//   - PRIVACY .............................. the verifier sees the k key-hashes,
//        i.e. learns *which* attesters vouched. In-circuit Merkle hides this.
//        Acceptable only for a small curated attester set where that leak is priced in.
//
// Numbers are illustrative (spike): the modulus is generated here with known
// factors; in production N comes from a ceremony that discards p, q, and
// hash-to-prime uses a vetted construction. Primality is Miller-Rabin (probabilistic).

import { randomBytes, createHash } from "crypto";

const SET_SIZE = Number(process.argv[2] ?? 1024);   // curated attester set (Lever D: depth-10 tree == 1024)
const K = Number(process.argv[3] ?? 3);

// ---- bigint helpers --------------------------------------------------------
const bytesToBig = (b) => BigInt("0x" + Buffer.from(b).toString("hex"));
function modPow(base, exp, mod) {
  base %= mod;
  let r = 1n;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}
function isProbablePrime(n, rounds = 24) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n % p === 0n) return n === p;
  }
  let d = n - 1n, r = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; r++; }
  for (let i = 0; i < rounds; i++) {
    const a = 2n + (bytesToBig(randomBytes(16)) % (n - 4n));
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let j = 0n; j < r - 1n; j++) {
      x = (x * x) % n;
      if (x === n - 1n) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}
function randPrime(bits) {
  for (;;) {
    let n = bytesToBig(randomBytes(bits / 8)) | (1n << BigInt(bits - 1)) | 1n;
    if (isProbablePrime(n)) return n;
  }
}
// hash-to-prime: SHA-256(x) -> odd -> next prime  (~256-bit)
function hashToPrime(x) {
  let n = bytesToBig(createHash("sha256").update(String(x)).digest()) | 1n;
  while (!isProbablePrime(n)) n += 2n;
  return n;
}

// ---- build the accumulator ------------------------------------------------
console.log(`RSA accumulator: set size ${SET_SIZE}, k=${K}, modulus 2048-bit\n`);

let t = performance.now();
const N = randPrime(1024) * randPrime(1024);            // p, q discarded (simulated ceremony)
const g = 3n;
console.log(`  modulus generated .......... ${(performance.now() - t).toFixed(0)} ms  (one-time, ceremony)`);

// members: K real-ish key-hashes + padding to SET_SIZE
const members = [];
for (let i = 0; i < SET_SIZE; i++) members.push(bytesToBig(randomBytes(31)));

t = performance.now();
const primes = members.map(hashToPrime);
console.log(`  hash-to-prime x${SET_SIZE} ........ ${(performance.now() - t).toFixed(0)} ms  (one-time per set change)`);

t = performance.now();
let prod = 1n;
for (const e of primes) prod *= e;
const A = modPow(g, prod, N);
console.log(`  accumulator A = g^(prod e) . ${(performance.now() - t).toFixed(0)} ms  (one-time per set change)`);

// witnesses for the first K members (the ones this proof's attesters use)
t = performance.now();
const witnesses = [];
for (let j = 0; j < K; j++) {
  let pj = 1n;
  for (let i = 0; i < SET_SIZE; i++) if (i !== j) pj *= primes[i];
  witnesses.push(modPow(g, pj, N));
}
const wms = performance.now() - t;
console.log(`  ${K} membership witnesses ...... ${wms.toFixed(0)} ms  (prover side, or served pre-computed)`);

// ---- what the backend verifier actually does per proof ------------------
const RUNS = 2000;
t = performance.now();
let okAll = true;
for (let r = 0; r < RUNS; r++) {
  for (let j = 0; j < K; j++) {
    if (modPow(witnesses[j], primes[j], N) !== A) okAll = false;
  }
}
const perProof = (performance.now() - t) / RUNS;
console.log(`\n  VERIFY: ${K} modexps per proof ... ${perProof.toFixed(3)} ms/proof   (median of ${RUNS})   all valid: ${okAll}`);

console.log(`
---------- Step 3 summary ----------
  in-circuit membership constraints : 0        (Merkle was +15,300 at depth 20, k=3)
  circuit now proves                : k EdDSA + scope + diversity + RLN, and exposes
                                      attKeyCommit = Poseidon(kh_0..kh_${K - 1})
  accumulator (public)              : 1 x 256 B
  proof payload growth              : ${K} x 256 B  = ${K * 256} B   (BBF batches k -> ~1)
  verifier extra work               : ~${perProof.toFixed(2)} ms/proof   (was: one Groth16 verify ~<10 ms)
  privacy regression                : verifier learns the ${K} attester key-hashes
                                      -> learns WHICH attesters vouched. Merkle hid this.
  KZG alternative                   : same shape; verifier does 2 pairings (~1-2 ms) instead
                                      of ${K} modexps; needs an SRS (the ptau already has one).
  in-circuit RSA/KZG (rejected)     : 2048-bit modexp / BN254 pairing in-circuit is
                                      millions of constraints -- worse than Merkle. Must be out.
`);
