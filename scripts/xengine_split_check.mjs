// Cross-engine equivalence check for the split-epoch Phase-2 circuit.
// splitting-the-epochs.md Step 5 / falsification #4.
//
// snarkjs and the C++->WASM prover (wasm-bridge/) both prove the SAME statement
// from the SAME zkey + witness. Both proofs must verify against the SAME vkey with
// BYTE-IDENTICAL public signals. Groth16 proofs are randomised, so the group
// elements differ; equivalence is "both verify, same public signals".
//
// rapidsnark native is arm64/android and needs the phone; it is not re-run here.
// The equivalence argument is engine-independent (identical Groth16 statement),
// and rapidsnark was validated this way on every prior circuit.
//
//   node scripts/xengine_split_check.mjs

import * as snarkjs from "snarkjs";
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (f) => join(ROOT, f);
const require = createRequire(import.meta.url);

const WASM = P("build/wedge_mem_w8_d9_split.wasm");
const ZKEY = P("build/wedge_mem_w8_d9_split_final.zkey");
const VKEY = JSON.parse(readFileSync(P("build/wedge_mem_w8_d9_split_vkey.json"), "utf8"));
const INPUT = JSON.parse(readFileSync(P("web/input_mem_w8_d9_split.json"), "utf8"));

const tdir = mkdtempSync(join(tmpdir(), "xeng_"));
const WTNS = join(tdir, "s.wtns");
await snarkjs.wtns.calculate(INPUT, WASM, WTNS);

// ---- engine 1: snarkjs ----
const s1 = await snarkjs.groth16.prove(ZKEY, WTNS);
const v1 = await snarkjs.groth16.verify(VKEY, s1.publicSignals, s1.proof);

// ---- engine 2: rapidsnark compiled to WASM (wasm-bridge/prover.js) ----
// The Emscripten module runs main() with argv [zkey, wtns, proof.json, public.json]
// against its in-memory FS. prover.js is a CommonJS UMD bundle; the repo is
// "type":"module", so copy it to a .cjs alongside its .wasm and require that.
copyFileSync(P("wasm-bridge/prover.js"), join(tdir, "prover.cjs"));
copyFileSync(P("wasm-bridge/prover.wasm"), join(tdir, "prover.wasm"));
const RSFactory = require(join(tdir, "prover.cjs"));
const M = await RSFactory({ printErr: () => {}, print: () => {}, noInitialRun: true });
M.FS.writeFile("/c.zkey", new Uint8Array(readFileSync(ZKEY)));
M.FS.writeFile("/w.wtns", new Uint8Array(readFileSync(WTNS)));
let rc;
try { rc = M.callMain(["/c.zkey", "/w.wtns", "/proof.json", "/public.json"]); }
catch (e) { rc = "throw:" + (e && e.message || e); }
// PROXY builds resolve async; poll the FS
const has = (p) => { try { return M.FS.analyzePath(p).exists; } catch { return false; } };
for (let i = 0; i < 2000 && !(has("/proof.json") && has("/public.json")); i++) await new Promise(r => setTimeout(r, 10));
if (!has("/proof.json")) { console.error("C++->WASM prover produced no /proof.json (rc=" + rc + ")"); process.exit(1); }
const cppProof = { ...JSON.parse(M.FS.readFile("/proof.json", { encoding: "utf8" })), protocol: "groth16", curve: "bn128" };
const cppPublic = JSON.parse(M.FS.readFile("/public.json", { encoding: "utf8" }));
const v2 = await snarkjs.groth16.verify(VKEY, cppPublic, cppProof);

rmSync(tdir, { recursive: true, force: true });

// ---- compare ----
const idPub = JSON.stringify(s1.publicSignals) === JSON.stringify(cppPublic);
const diffGroup = s1.proof.pi_a[0] !== cppProof.pi_a[0];

console.log("engine 1  snarkjs            : verify", v1, " nPublic", s1.publicSignals.length);
console.log("engine 2  rapidsnark->WASM   : verify", v2, " nPublic", cppPublic.length);
console.log("public signals byte-identical:", idPub);
console.log("group elements differ (randomised, expected):", diffGroup);
console.log("snarkjs   pi_a[0] =", s1.proof.pi_a[0].slice(0, 30) + "...");
console.log("cpp-wasm  pi_a[0] =", cppProof.pi_a[0].slice(0, 30) + "...");
console.log("public signals   =", JSON.stringify(cppPublic));
console.log("\nrapidsnark native (arm64): not re-run here (needs the A12); same statement,");
console.log("engine-independent equivalence, validated this way on every prior circuit.");

const okAll = v1 === true && v2 === true && idPub && s1.publicSignals.length === 7;
console.log("\n" + (okAll ? "PASS: snarkjs and C++->WASM verify identically on the split circuit (nPublic 7)."
                          : "FAIL: cross-engine equivalence broken."));
process.exit(okAll ? 0 : 1);
