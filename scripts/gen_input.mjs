// Generate a valid witness input for one circuit variant.
//   node scripts/gen_input.mjs 3   -> build/input_k3.json   (Wedge3, the real benchmark)
//   node scripts/gen_input.mjs 1   -> build/input_k1.json   (Wedge1)
//   node scripts/gen_input.mjs 0   -> build/input_k0.json   (CommitOnly)
//
// All k signatures are EdDSA-Poseidon on Baby JubJub over the SAME message
// C = Poseidon(s), matching the circuit. Signatures are self-verified before writing.

import { buildPoseidon, buildEddsa } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const K = parseInt(process.argv[2] ?? "3", 10);
if (![0, 1, 3].includes(K)) {
  console.error("usage: node scripts/gen_input.mjs [0|1|3]");
  process.exit(1);
}

const poseidon = await buildPoseidon();
const eddsa = await buildEddsa();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();

// random field element comfortably below the BN254 scalar field (31 bytes)
const s = F.e("0x" + randomBytes(31).toString("hex"));
const ctx = 987654321n;
const epoch = 7n;

const C = poseidon([s]);                        // C = Poseidon(s)
const N = poseidon([s, F.e(ctx), F.e(epoch)]);  // N = Poseidon(s, ctx, epoch)

const input = { s: toDec(s), ctx: ctx.toString(), epoch: epoch.toString() };

if (K > 0) {
  const Ax = [], Ay = [], R8x = [], R8y = [], S = [];
  const seen = new Set();
  while (Ax.length < K) {
    const prv = randomBytes(32);
    const pub = eddsa.prv2pub(prv);
    const axd = toDec(pub[0]);
    if (seen.has(axd)) continue;                 // keep pubkeys distinct (circuit enforces it at k=3)
    seen.add(axd);
    const sig = eddsa.signPoseidon(prv, C);
    if (!eddsa.verifyPoseidon(C, sig, pub)) throw new Error("self-check failed: invalid signature");
    Ax.push(axd);                Ay.push(toDec(pub[1]));
    R8x.push(toDec(sig.R8[0]));  R8y.push(toDec(sig.R8[1]));
    S.push(sig.S.toString());
  }
  Object.assign(input, { Ax, Ay, R8x, R8y, S });
}

mkdirSync("build", { recursive: true });
const out = `build/input_k${K}.json`;
writeFileSync(out, JSON.stringify(input, null, 2));
console.log(`wrote ${out}   (k=${K})`);
console.log(`  C = ${toDec(C)}`);
console.log(`  N = ${toDec(N)}`);
