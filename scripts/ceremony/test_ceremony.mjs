// ===========================================================================
// End-to-end ceremony-coordinator test  (closing-what-code-can-close.md §3, §6.3)
//
//   node scripts/ceremony/test_ceremony.mjs
//
// The coordinator verifies cryptographic transcripts, so the coordinator itself
// can be wrong. §6.3 of the note requires it be tested against deliberately
// invalid contributions BEFORE it is ever used for a real ceremony -- the same
// mutation-testing discipline, applied to the tool instead of the circuit.
//
// This runs a complete ceremony against a THROWAWAY circuit (a tiny Poseidon
// commitment, nothing to do with the production circuits) with several simulated
// participants, and asserts that every honest contribution is accepted and every
// dishonest one is rejected for the right reason.
//
// It deliberately does NOT touch the production circuit: the circuit changed
// twice in recent work (the epoch split, then revocation), and ceremony-locking
// a circuit that may still change would waste the ceremony.
// ===========================================================================

import * as snarkjs from "snarkjs";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { Coordinator, mpcParams } from "./coordinator.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const require = createRequire(import.meta.url);
const CIRCOM2 = require.resolve("circom2/cli.js");
const NODE = process.execPath;

let pass = 0, fail = 0;
const ok  = (n, why) => { pass++; console.log(`  PASS  ${n}`); if (why) console.log(`          ${why}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL  ${n}`); if (why) console.log(`          ${why}`); };

const WORK = join(ROOT, ".ceremony-test");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "src"), { recursive: true });

// ---- a throwaway circuit, unrelated to anything deployed --------------------
console.log("\n=== 0. throwaway circuit (NOT a production circuit) ===\n");
writeFileSync(join(WORK, "src", "toy.circom"), `pragma circom 2.1.0;
include "poseidon.circom";
// Throwaway ceremony test circuit. Deliberately trivial and deliberately NOT
// any deployed circuit: this exercises the coordinator, not the protocol.
template Toy() {
    signal input a;
    signal output out;
    component h = Poseidon(1);
    h.inputs[0] <== a;
    out <== h.out;
}
component main = Toy();
`);
execFileSync(NODE, [CIRCOM2, "toy.circom", "--r1cs", "--wasm", "--O2", "-o", ".",
  "-l", ".", "-l", join(ROOT, "node_modules", "circomlib", "circuits")],
  { cwd: join(WORK, "src"), stdio: ["ignore", "ignore", "inherit"] });
const R1CS = join(WORK, "src", "toy.r1cs");
const PTAU = join(ROOT, "build", "pot15_final.ptau");
if (!existsSync(PTAU)) { console.error(`missing ${PTAU}`); process.exit(2); }
ok("throwaway circuit compiled", "tiny Poseidon commitment; the production circuits are untouched");

// ---- ceremony ---------------------------------------------------------------
const DIR = join(WORK, "ceremony");
const c = new Coordinator(DIR);
console.log("\n=== 1. coordinator init ===\n");
await c.init({ r1cs: R1CS, ptau: PTAU, circuit: "toy" });
ok("initialised", `head=${c.meta.head}, contributions=${c.meta.headContributions}`);

const contribute = async (fromZkey, out, name) => {
  await snarkjs.zKey.contribute(fromZkey, out, name, randomBytes(32).toString("hex"));
  return out;
};
const P = (f) => join(WORK, f);

// ---- honest participants ----------------------------------------------------
console.log("\n=== 2. three honest participants, in sequence ===\n");
for (const handle of ["alice", "bob", "carol"]) {
  const f = P(`${handle}.zkey`);
  await contribute(c.p(c.meta.head), f, handle);
  const r = await c.submit(f, handle);
  r.accepted
    ? ok(`${handle} accepted`, `contributions now ${c.meta.headContributions}`)
    : bad(`${handle} was rejected but should have been accepted`, r.rep.reasons.join("; "));
}
(c.meta.headContributions === 3)
  ? ok("chain length is 3 after three contributions")
  : bad("unexpected chain length", `got ${c.meta.headContributions}`);

// ---- adversarial submissions -------------------------------------------------
console.log("\n=== 3. deliberately invalid contributions — each MUST be rejected ===\n");
const headBefore = c.meta.headSha256;

// (a) replay: resubmit the current head unchanged
{
  const f = P("replay.zkey");
  copyFileSync(c.p(c.meta.head), f);
  const r = await c.submit(f, "mallory-replay");
  (!r.accepted && /no contribution was made|expected exactly/.test(r.rep.reasons.join(" ")))
    ? ok("replay of the current head rejected", r.rep.reasons[0])
    : bad("replay was accepted", JSON.stringify(r.rep.reasons));
}

// (b) fork: contribute onto the INITIAL zkey instead of the head. This is the
//     one a naive coordinator misses -- it verifies perfectly on its own.
{
  const f = P("fork.zkey");
  await contribute(c.p("0000_init.zkey"), f, "mallory-fork");
  const chainValidOnItsOwn = await snarkjs.zKey.verifyFromInit(c.p("0000_init.zkey"), PTAU, f);
  const r = await c.submit(f, "mallory-fork");
  if (r.accepted) bad("a fork from the initial zkey was accepted", "the ceremony is a tree, not a chain");
  else ok("fork from the initial zkey rejected", `zKey.verifyFromInit alone says valid=${chainValidOnItsOwn}; ` +
          `rejected on: ${r.rep.reasons.join("; ")}`);
}

// (c) truncation: drop the last contribution (submit an earlier accepted state)
{
  const f = P("truncated.zkey");
  copyFileSync(c.p("0001_alice.zkey"), f);
  const r = await c.submit(f, "mallory-rollback");
  (!r.accepted) ? ok("rollback to an earlier state rejected", r.rep.reasons[0])
                : bad("rollback accepted", "");
}

// (d) corruption: valid structure, flipped bytes inside the proving key
{
  const f = P("corrupt.zkey");
  const buf = Buffer.from(readFileSync(c.p(c.meta.head)));
  await contribute(c.p(c.meta.head), f, "mallory-corrupt");
  const b2 = Buffer.from(readFileSync(f));
  const mp = mpcParams(b2);
  // flip a byte inside the newest contribution record (the delta proof-of-knowledge)
  const off = b2.length - Math.floor(mp.recordsLen / (mp.n * 2));
  b2[off] ^= 0xff;
  writeFileSync(f, b2);
  const r = await c.submit(f, "mallory-corrupt");
  (!r.accepted) ? ok("byte-corrupted contribution rejected", r.rep.reasons[0].slice(0, 110))
                : bad("corrupted contribution accepted", "");
  void buf;
}

// (e) two contributions at once (skipping the coordinator's turn ordering)
{
  const f1 = P("double1.zkey"), f2 = P("double2.zkey");
  await contribute(c.p(c.meta.head), f1, "x1");
  await contribute(f1, f2, "x2");
  const r = await c.submit(f2, "mallory-double");
  (!r.accepted && /expected exactly/.test(r.rep.reasons.join(" ")))
    ? ok("two-contributions-in-one-submission rejected", r.rep.reasons[0])
    : bad("double contribution accepted", JSON.stringify(r.rep.reasons));
}

// (f) garbage
{
  const f = P("garbage.zkey");
  writeFileSync(f, randomBytes(4096));
  const r = await c.submit(f, "mallory-garbage");
  (!r.accepted) ? ok("non-zkey upload rejected", r.rep.reasons[0])
                : bad("garbage accepted", "");
}

(c.meta.headSha256 === headBefore)
  ? ok("head unmoved after six rejected submissions", "a rejected contribution must not advance the ceremony")
  : bad("head moved during the rejection tests", "");
(c.meta.rejected === 6)
  ? ok("all six rejections recorded in the transcript", "rejections are part of the public record")
  : bad("rejection count wrong", `got ${c.meta.rejected}`);

// ---- honest contribution still works after the attacks ----------------------
console.log("\n=== 4. the ceremony still accepts an honest contribution afterwards ===\n");
{
  const f = P("dave.zkey");
  await contribute(c.p(c.meta.head), f, "dave");
  const r = await c.submit(f, "dave");
  r.accepted ? ok("dave accepted after the rejected attempts", `contributions now ${c.meta.headContributions}`)
             : bad("dave rejected", r.rep.reasons.join("; "));
}

// ---- beacon + finalize ------------------------------------------------------
console.log("\n=== 5. beacon finalization ===\n");
// 64 hex chars = 32 bytes, the shape of a Bitcoin block hash.
const BEACON = "00000000000000000002a1b6f0e0a0b7a8b1c2d3e4f50617283940a1b2c3d4e5";
await c.beacon({ hash: BEACON, iters: 10, source: "stand-in for a future Bitcoin block hash (test only)" });
ok("beacon applied and verified", `2^10 iterations of SHA-256 over ${BEACON.slice(0, 16)}…`);
(c.meta.headContributions === 5)
  ? ok("beacon recorded as the final contribution", "4 human + 1 beacon")
  : bad("unexpected contribution count after beacon", `got ${c.meta.headContributions}`);

for (const [why, args] of [
  ["odd-length hex",        { hash: "abc", iters: 10 }],
  ["non-hex",              { hash: "zzzz", iters: 10 }],
  ["numIterationsExp < 10", { hash: BEACON, iters: 8 }],
]) {
  try { await c.beacon(args); bad(`bad beacon params accepted (${why})`, ""); }
  catch (e) { ok(`bad beacon params rejected (${why})`, e.message); }
}

const finalName = await c.finalize();
ok("finalized", `${finalName}, vkey exported`);

// refuse to accept anything after finalization
try { await c.submit(P("dave.zkey"), "late"); bad("accepted a contribution after finalization", ""); }
catch (e) { ok("post-finalization submission refused", e.message); }

// ---- independent verification of the published transcript -------------------
console.log("\n=== 6. independent transcript verification ===\n");
const v = await c.verifyTranscript();
v.linkOk ? ok("transcript hash-chain intact", "each entry commits to the whole log before it")
         : bad("transcript hash-chain broken", v.problems.join("; "));
v.chainOk ? ok("final zkey verifies from the initial zkey", "zKey.verifyFromInit over the whole ceremony")
          : bad("final chain verification failed", v.problems.join("; "));
(v.problems.length === 0) ? ok("no transcript problems") : bad("transcript problems", v.problems.join("; "));

// tamper-detection on the transcript itself
{
  const raw = readFileSync(c.logPath, "utf8").trimEnd().split("\n");
  const doctored = raw.slice();
  const e = JSON.parse(doctored[3]); e.accepted = true; e.reasons = [];
  doctored[3] = JSON.stringify(e);
  const backup = readFileSync(c.logPath);
  writeFileSync(c.logPath, doctored.join("\n") + "\n");
  const v2 = await c.verifyTranscript();
  writeFileSync(c.logPath, backup);
  (!v2.linkOk) ? ok("doctored transcript entry detected", "rewriting a rejection to an acceptance breaks the hash chain")
               : bad("doctored transcript went undetected", "the append-only claim would be unenforceable");
}

// a proof made with the final key actually verifies
console.log("\n=== 7. the finalized key produces verifying proofs ===\n");
{
  const wasm = join(WORK, "src", "toy_js", "toy.wasm");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve({ a: "12345" }, wasm, c.p(finalName));
  const vkey = JSON.parse(readFileSync(c.p("verification_key.json"), "utf8"));
  (await snarkjs.groth16.verify(vkey, publicSignals, proof))
    ? ok("proof under the ceremony-produced key verifies", "the ceremony output is usable, not just well-formed")
    : bad("proof did not verify under the ceremony key", "");
}

console.log(`\ntranscript: ${c.p("transcript.md")}`);
console.log(`\n=== ceremony coordinator: ${pass} passed, ${fail} failed ===`);
if (!fail) console.log("Coordinator behaves correctly. It has NOT been run against a production circuit.");
process.exit(fail ? 1 : 0);
