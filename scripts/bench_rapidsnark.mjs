// Step 2 of the-cpu-wall.md: rapidsnark (native arm64) on-device prove time for
// the IDENTICAL wedge_mem_w8_d9 .zkey + witness, vs the 6,394 ms browser number.
//
//   ADB=... node scripts/bench_rapidsnark.mjs [--runs 20] [--threads N] [--push-dir <staging>]
//
// Pushes the arm64 `prover` + zkey + witness to /data/local/tmp, times N proofs
// on-device with `date +%s%N`, reports COLD (first) separately from warm p95,
// pulls the proof and verifies it with snarkjs on desktop (same vkey) to prove
// the native prover produces a valid, equivalent proof. No circuit/zkey change.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const RUNS = +opt("--runs", "20");
const THREADS = opt("--threads", "");     // "" => let rapidsnark auto-detect
const PUSH_DIR = opt("--push-dir",
  process.env.RAPIDSNARK_PUSH_DIR || join(ROOT, "build", "rapidsnark-push"));
const DEV = "/data/local/tmp/rs";

const ADB = process.env.ADB || "adb";
const serial = opt("--serial", "");
const adb = (args, o = {}) => execFileSync(ADB, [...(serial ? ["-s", serial] : []), ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...o });
const sh = (cmd, o = {}) => adb(["shell", cmd], o);
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1], mean: a.reduce((x, y) => x + y, 0) / a.length }; };
const ms = (n) => n.toFixed(0).padStart(6);

// ---- device + files ----
const model = sh("getprop ro.product.model").trim();
const abi = sh("getprop ro.product.cpu.abi").trim();
const cores = sh("cat /proc/cpuinfo | grep -c ^processor").trim();
console.log(`device: ${model}  ${abi}  ${cores} cores  (rapidsnark v0.0.8 android-arm64 'prover')`);
if (!/arm64/.test(abi)) { console.error("device is not arm64 — wrong binary."); process.exit(2); }

for (const f of ["prover", "c.zkey", "w.wtns", "vkey.json"]) {
  const p = join(PUSH_DIR, f);
  if (!existsSync(p)) { console.error(`missing staged file: ${p}`); process.exit(2); }
}
sh(`mkdir -p ${DEV}`);
console.log("pushing prover + zkey + witness …");
for (const f of ["prover", "librapidsnark.so", "c.zkey", "w.wtns"]) {
  const p = join(PUSH_DIR, f);
  if (existsSync(p)) adb(["push", p, `${DEV}/${f}`]);
}
sh(`chmod 755 ${DEV}/prover`);

// ---- can it even run? (also captures usage / thread info) ----
const first = sh(`cd ${DEV} && LD_LIBRARY_PATH=${DEV} ./prover 2>&1 | head -20; echo RC=$?`, { stdio: ["ignore", "pipe", "pipe"] });
console.log("--- prover (no args) ---\n" + first.trim() + "\n");

// ---- timed runs ----
const envPrefix = THREADS ? `OMP_NUM_THREADS=${THREADS} ` : "";
const one = () => {
  // nanoseconds wall clock around the prove call, on-device
  const out = sh(
    `cd ${DEV} && ${envPrefix}LD_LIBRARY_PATH=${DEV} sh -c 't0=$(date +%s%N); ./prover c.zkey w.wtns proof.json public.json >/dev/null 2>prover.err; rc=$?; t1=$(date +%s%N); echo "${""}NS $((t1-t0)) RC $rc"'`
  );
  const m = out.match(/NS (\d+) RC (\d+)/);
  if (!m) throw new Error("unparseable timing line: " + out.trim() + "\n" + sh(`cat ${DEV}/prover.err`).trim());
  if (m[2] !== "0") throw new Error(`prover exited ${m[2]}: ` + sh(`cat ${DEV}/prover.err`).trim());
  return +m[1] / 1e6; // ms
};

console.log(`timing ${RUNS} runs${THREADS ? ` (OMP_NUM_THREADS=${THREADS})` : " (auto threads)"} …`);
const times = [];
let cold = null;
for (let i = 0; i < RUNS + 1; i++) {
  const t = one();
  if (i === 0) { cold = t; console.log(`  COLD (run 0): ${t.toFixed(0)} ms`); }
  else { times.push(t); process.stdout.write(`\r  warm ${i}/${RUNS}: ${t.toFixed(0)} ms      `); }
}
process.stdout.write("\n");
const S = stat(times);

// ---- pull the proof + verify with snarkjs (same vkey) ----
adb(["pull", `${DEV}/proof.json`, join(PUSH_DIR, "rs_proof.json")]);
adb(["pull", `${DEV}/public.json`, join(PUSH_DIR, "rs_public.json")]);
const proof = JSON.parse(readFileSync(join(PUSH_DIR, "rs_proof.json"), "utf8"));
const pub = JSON.parse(readFileSync(join(PUSH_DIR, "rs_public.json"), "utf8"));
const vkey = JSON.parse(readFileSync(join(PUSH_DIR, "vkey.json"), "utf8"));
const ok = await snarkjs.groth16.verify(vkey, pub, proof);
let pubMatch = "n/a";
try {
  const ref = JSON.parse(readFileSync(join(PUSH_DIR, "ref_public.json"), "utf8"));
  pubMatch = JSON.stringify(ref) === JSON.stringify(pub) ? "identical to snarkjs" : "DIFFERS from snarkjs";
} catch {}

const browserBaselineMs = 6394;       // flow p95 from the-cpu-wall.md
const browserWarmMedianMs = 5011;     // diag warm median
const browserColdMs = 6766;           // diag cold

const out = {
  schema: "rapidsnark-phone-bench/1",
  capturedAt: new Date().toISOString(),
  device: { model, abi, cores: +cores },
  rapidsnark: { version: "v0.0.8", asset: "rapidsnark-android-arm64", threads: THREADS || "auto" },
  circuit: "wedge_mem_w8_d9 (4,309 constr) — IDENTICAL .zkey + witness, no change",
  runs: RUNS,
  coldMs: +cold.toFixed(1),
  warm: { min: +S.min.toFixed(1), median: +S.median.toFixed(1), p95: +S.p95.toFixed(1), max: +S.max.toFixed(1) },
  proofValidatesWithSnarkjsVkey: ok,
  publicSignals: pubMatch,
  vsBrowser: {
    browser_flowP95_ms: browserBaselineMs,
    browser_warmMedian_ms: browserWarmMedianMs,
    browser_cold_ms: browserColdMs,
    speedup_warmMedian: +(browserWarmMedianMs / S.median).toFixed(2),
    speedup_vs_flowP95: +(browserBaselineMs / S.p95).toFixed(2),
    speedup_cold: +(browserColdMs / cold).toFixed(2),
    clears_2s_bar_warm_p95: S.p95 < 2000,
    clears_2s_bar_cold: cold < 2000,
  },
};
const outPath = join(ROOT, "results", `rapidsnark-${model.replace(/[^\w.-]+/g, "_")}-${out.capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

console.log("\n──────── RAPIDSNARK ON-DEVICE ────────");
console.log(`cold (first run):     ${ms(cold)} ms`);
console.log(`warm median:          ${ms(S.median)} ms   p95 ${ms(S.p95)} ms   min ${ms(S.min)}  max ${ms(S.max)}`);
console.log(`proof verifies (snarkjs vkey): ${ok}   public signals: ${pubMatch}`);
console.log(`\nvs BROWSER snarkjs on the same phone:`);
console.log(`  warm:  ${browserWarmMedianMs} ms -> ${S.median.toFixed(0)} ms   =  ${out.vsBrowser.speedup_warmMedian}x`);
console.log(`  cold:  ${browserColdMs} ms -> ${cold.toFixed(0)} ms   =  ${out.vsBrowser.speedup_cold}x`);
console.log(`  2s bar: warm p95 ${S.p95 < 2000 ? "CLEARS" : "MISSES"} (${S.p95.toFixed(0)} ms)   cold ${cold < 2000 ? "CLEARS" : "MISSES"} (${cold.toFixed(0)} ms)`);
console.log(`\nwrote ${outPath}`);
