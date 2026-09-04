// after-the-bridge.md Experiment 1 — attribute the 5x.
// On the connected Android, same wedge_mem_w8_d9 zkey+witness, prove-only:
//   (a) native rapidsnark (prebuilt arm64) across CPU-affinity masks via taskset
//       -> taskset 1 core ~= a (slightly pessimistic) proxy for native-1-thread
//   (b) C++->WASM prover (our build) in Chrome, ffiasm ThreadPool forced to
//       nt = 1,2,4,8 via the exported rs_set_nt()
// Reports WASM-1T / native-1T and the multi-thread ratios, plus the note's
// interpretation bands. Verifies every proof against the existing snarkjs vkey.
//
//   ADB=... node scripts/bench_attrib.mjs [--runs 15] [--nruns-native 12] [--port 8092]

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const RUNS = +opt("--runs", "15");
const NRUNS_NATIVE = +opt("--nruns-native", "12");
const PORT = +opt("--port", "8092");
const ADB = process.env.ADB || "adb";
const serial = opt("--serial", "");
const CHROME = opt("--chrome-pkg", "com.android.chrome");
const PUSH_DIR = opt("--push-dir",
  process.env.RAPIDSNARK_PUSH_DIR || join(ROOT, "build", "rapidsnark-push"));
const DEV = "/data/local/tmp/rsattrib";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args) => execFileSync(ADB, [...(serial ? ["-s", serial] : []), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sh = (c) => { try { return adb(["shell", c]); } catch (e) { return (e.stdout || "") + (e.stderr || ""); } };
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: +s[0].toFixed(1), median: +s[(s.length - 1) >> 1].toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) }; };

const WEB = join(ROOT, "web-attrib");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".zkey": "application/octet-stream", ".wtns": "application/octet-stream" };
const REPORTS = [];
const srv = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/__bench")) {
    let b = ""; req.on("data", (d) => b += d); req.on("end", () => { try { REPORTS.push(JSON.parse(b)); } catch {} res.writeHead(204).end(); });
    return;
  }
  try {
    const p = decodeURIComponent(req.url.split("?")[0]);
    const f = join(WEB, (p === "/" ? "/wattrib.html" : p).replace(/\.\.[/\\]/g, ""));
    const body = readFileSync(f);
    res.writeHead(200, { "Content-Type": MIME[f.slice(f.lastIndexOf("."))] || "application/octet-stream", "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin" });
    res.end(body);
  } catch { res.writeHead(404).end("nf"); }
});
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));
console.log(`served web-attrib/ on :${PORT}`);

const model = sh("getprop ro.product.model").trim();
const abi = sh("getprop ro.product.cpu.abi").trim();
const cores = sh("cat /proc/cpuinfo | grep -c ^processor").trim();
console.log(`device: ${model} ${abi} ${cores} cores`);
try { adb(["reverse", `tcp:${PORT}`, `tcp:${PORT}`]); } catch (e) { console.error("adb reverse failed:", e.message); process.exit(2); }
const savedSO = sh("settings get global stay_on_while_plugged_in").trim();
sh("settings put global stay_on_while_plugged_in 7");
sh("settings put system screen_off_timeout 1800000");
sh("input keyevent KEYCODE_WAKEUP");

// ---------- vkey + reference public signals ----------
const vkey = JSON.parse(readFileSync(join(WEB, "vkey.json"), "utf8"));
const refPub = [
  "3070749399094776584196760505023082018184649630143238960904128416177852499177",
  "19332666271411899541136421964054943443744127674624781442058225656512859915598",
  "13602246940248921684134898961957417503014940877664325994882645135088689043629",
  "987654321", "7",
  "227603871070980597066997968355448344591111481581308670827416666081812832821",
];
const verifyProof = async (proofStr, pubStr, tag) => {
  try {
    const proof = JSON.parse(proofStr), pub = JSON.parse(pubStr);
    const ok = await snarkjs.groth16.verify(vkey, pub, proof);
    const ident = JSON.stringify(pub.map(String)) === JSON.stringify(refPub.map(String));
    console.log(`  [${tag}] proof verifies: ${ok}   public signals identical: ${ident}`);
    return { ok, ident };
  } catch (e) { console.log(`  [${tag}] verify error: ${e.message}`); return { ok: "err", ident: "err" }; }
};

// ==================== (a) NATIVE rapidsnark, taskset affinity sweep ====================
const nativeRows = [];
try {
  for (const f of ["prover", "c.zkey", "w.wtns"]) if (!existsSync(join(PUSH_DIR, f))) throw new Error("missing " + f);
  sh(`mkdir -p ${DEV}`);
  for (const f of ["prover", "librapidsnark.so", "c.zkey", "w.wtns"]) {
    const p = join(PUSH_DIR, f); if (existsSync(p)) adb(["push", p, `${DEV}/${f}`]);
  }
  sh(`chmod 755 ${DEV}/prover`);
  const hasTaskset = /Usage|taskset/i.test(sh("taskset 2>&1 | head -2"));
  console.log(`\nnative: taskset available: ${hasTaskset}`);
  const masks = [["1core", "1"], ["2core", "3"], ["4core", "f"], ["8core", "ff"]];
  for (const [label, mask] of masks) {
    const pre = hasTaskset ? `taskset ${mask} ` : "";
    // one warm, then NRUNS_NATIVE timed
    sh(`cd ${DEV} && LD_LIBRARY_PATH=${DEV} ${pre}./prover c.zkey w.wtns proof.json public.json >/dev/null 2>&1`);
    const script = `cd ${DEV} && for i in $(seq 1 ${NRUNS_NATIVE}); do ` +
      `S=$(date +%s%N); LD_LIBRARY_PATH=${DEV} ${pre}./prover c.zkey w.wtns proof.json public.json >/dev/null 2>&1; ` +
      `E=$(date +%s%N); echo $(( (E - S) / 1000000 )); done`;
    const out = sh(script).trim();
    const ms = out.split(/\s+/).map(Number).filter((x) => x > 0 && x < 60000);
    const s = stat(ms);
    nativeRows.push({ label, mask, ...s, n: ms.length });
    console.log(`  native ${label} (taskset ${mask}): median ${s.median} ms  p95 ${s.p95}  min ${s.min}  (n=${ms.length})`);
  }
  const np = sh(`cat ${DEV}/proof.json`), npub = sh(`cat ${DEV}/public.json`);
  const v = await verifyProof(np, npub, "native");
  nativeRows.verify = v;
} catch (e) { console.error("native sweep failed:", e.message); }

// ==================== (b) C++->WASM, ffiasm ThreadPool nt sweep ====================
adb(["logcat", "-c"]); let logBuf = "";
const lc = spawn(ADB, [...(serial ? ["-s", serial] : []), "logcat", "-v", "brief"], { stdio: ["ignore", "pipe", "ignore"] });
lc.stdout.on("data", (d) => { logBuf += d; if (logBuf.length > 2e6) logBuf = logBuf.slice(-1e6); });
const crashed = () => /Tab crashed|RENDERER_PROCESS|lowmemorykiller.*chrome|SIGABRT|std::bad_alloc|RenderProcessGone/i.test(logBuf);

const wasmRows = [];
for (const nt of [1, 2, 4, 8]) {
  const before = REPORTS.length;
  sh(`am force-stop ${CHROME}`); await sleep(600);
  const url = `http://localhost:${PORT}/wattrib.html?nt=${nt}&runs=${RUNS}`;
  console.log(`\nWASM nt=${nt}: ${url}`);
  sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`);
  const t0 = Date.now();
  let done = null, err = null;
  while (!done && !err) {
    const fresh = REPORTS.slice(before);
    done = fresh.find((r) => r.kind === "done" && r.nt === nt);
    err = fresh.find((r) => r.kind === "error" && r.nt === nt);
    if (crashed()) { console.error("  TAB CRASHED (logcat)"); break; }
    if (Date.now() - t0 > 600000) { console.error("  TIMEOUT (600s)"); break; }
    if ((Date.now() - t0) % 5000 < 400) {
      sh("input keyevent KEYCODE_WAKEUP");
      const fg = sh("dumpsys activity activities | grep -m1 ResumedActivity");
      if (!/com\.android\.chrome/.test(fg)) sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`);
    }
    await sleep(400);
  }
  if (!done) { console.error(`  nt=${nt}: NO RESULT`); wasmRows.push({ nt, fail: true }); continue; }
  const s = { min: done.warmMin, median: done.warmMedian, p95: done.warmP95, max: done.warmMax };
  let v = { ok: "not-checked", ident: "not-checked" };
  if (done.proofB64) v = await verifyProof(Buffer.from(done.proofB64, "base64").toString("utf8"), done.publicJson || "null", `wasm nt=${nt}`);
  wasmRows.push({ nt, gotNT: done.gotNT, setOK: done.setOK, cold: done.coldMs, ...s, n: (done.warmMs || []).length,
    initMs: done.initMs, threadsUnused: done.threadsUnused, verify: v });
  console.log(`  WASM nt=${nt}: cold ${done.coldMs}  warm median ${done.warmMedian}  p95 ${done.warmP95}  min ${done.warmMin}  (setOK=${done.setOK}, n=${(done.warmMs||[]).length})`);
}

// ---------- cleanup ----------
try { lc.kill(); } catch {}
sh("svc power stayon false");
if (savedSO && savedSO !== "null") sh(`settings put global stay_on_while_plugged_in ${savedSO}`);
sh("settings put system screen_off_timeout 30000");
try { adb(["reverse", "--remove", `tcp:${PORT}`]); } catch {}
sh(`am force-stop ${CHROME}`);
srv.close();

// ---------- attribution ----------
const nat1 = nativeRows.find((r) => r.label === "1core")?.median ?? null;
const nat8 = nativeRows.find((r) => r.label === "8core")?.median ?? null;
const w1 = wasmRows.find((r) => r.nt === 1 && !r.fail)?.median ?? null;
const wBest = wasmRows.filter((r) => !r.fail).reduce((b, r) => (b == null || r.median < b.median ? r.median : b), null);
const wBestNt = wasmRows.filter((r) => !r.fail).sort((a, b) => a.median - b.median)[0]?.nt ?? null;

const ratio1T = (nat1 && w1) ? +(w1 / nat1).toFixed(2) : null;
const ratioMT = (nat8 && wBest) ? +(wBest / nat8).toFixed(2) : null;

let interpretation = "inconclusive";
if (ratio1T != null) {
  if (ratio1T <= 2.5) interpretation = `WASM-1T ~= ${ratio1T}x native-1T  => the gap is FIELD ARITHMETIC (generic C++ vs asm). Hand-written WASM-SIMD field arithmetic is justified (note bands: 1.5-2x => field-arith).`;
  else if (ratio1T >= 3.5) interpretation = `WASM-1T ~= ${ratio1T}x native-1T  => the gap is CODEGEN/THREADING overhead, NOT field arithmetic. Field assembly will NOT close it (note bands: 4-5x => codegen/threading). Do not write field assembly.`;
  else interpretation = `WASM-1T ~= ${ratio1T}x native-1T  => between the note's bands (2.5-3.5x). Ambiguous; a true native-1T build (NDK, asm, ThreadPool(1)) is needed to disambiguate.`;
}

const out = {
  schema: "after-the-bridge-exp1/1", capturedAt: new Date().toISOString(),
  device: { model, abi, cores: +cores },
  note: "taskset 1core native == slightly-pessimistic proxy for true native-1-thread (8 pool threads, condvar-parked, contend on 1 core; ~2-10% overhead).",
  anchors: { native_warm_ms: 477, cpp_wasm_warm_ms: 2467, snarkjs_prove_warm_ms: 3374 },
  native_taskset_sweep: nativeRows,
  wasm_nt_sweep: wasmRows,
  attribution: {
    native_1T_proxy_ms: nat1, native_8core_ms: nat8,
    wasm_1T_ms: w1, wasm_best_ms: wBest, wasm_best_nt: wBestNt,
    "WASM-1T / native-1T": ratio1T,
    "WASM-best / native-8core": ratioMT,
    interpretation,
  },
};
const p = join(ROOT, "results", `attrib-${model.replace(/[^\w.-]+/g, "_")}-${out.capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
console.log("\n════════ ATTRIBUTION (Experiment 1) ════════");
console.log(`native  1core(proxy-1T) ${nat1} ms   8core ${nat8} ms`);
console.log(`WASM    nt=1 ${w1} ms   best nt=${wBestNt} ${wBest} ms`);
console.log(`WASM-1T / native-1T   = ${ratio1T}`);
console.log(`WASM-best / native-8  = ${ratioMT}`);
console.log(interpretation);
console.log(`\nwrote ${p}`);
