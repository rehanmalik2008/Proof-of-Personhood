// after-the-bridge.md Experiment 1, WASM half only:
// C++->WASM rapidsnark (our build) in Chrome on the A12, prove-only, ffiasm
// ThreadPool forced to nt = 1,2,4,8 via exported rs_set_nt(). One page load per
// nt, no aggressive relaunch (that reloads the page mid-run). Verifies each proof.
//   ADB=... node scripts/bench_attrib_wasm.mjs [--runs 15] [--port 8094]
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const RUNS = +opt("--runs", "15");
const PORT = +opt("--port", "8094");
const NTS = (opt("--nts", "1,2,4,8")).split(",").map(Number);
const TIMEOUT = +opt("--timeout-s", "900") * 1000;
const ADB = process.env.ADB || "adb";
const serial = opt("--serial", "");
const CHROME = "com.android.chrome";
const WEB = join(ROOT, opt("--web", "web-attrib"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args) => execFileSync(ADB, [...(serial ? ["-s", serial] : []), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sh = (c) => { try { return adb(["shell", c]); } catch (e) { return (e.stdout || "") + (e.stderr || ""); } };
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
console.log(`device: ${model} ${abi}`);
try { adb(["reverse", `tcp:${PORT}`, `tcp:${PORT}`]); } catch (e) { console.error("adb reverse failed:", e.message); process.exit(2); }
const savedSO = sh("settings get global stay_on_while_plugged_in").trim();
sh("settings put global stay_on_while_plugged_in 7");
sh("settings put system screen_off_timeout 1800000");

adb(["logcat", "-c"]); let logBuf = "";
const lc = spawn(ADB, [...(serial ? ["-s", serial] : []), "logcat", "-v", "brief", "chromium:E", "*:S"], { stdio: ["ignore", "pipe", "ignore"] });
lc.stdout.on("data", (d) => { logBuf += d; if (logBuf.length > 1e6) logBuf = logBuf.slice(-5e5); });
const crashed = () => /Tab crashed|RENDERER_PROCESS_GONE|lowmemorykiller.*chrome|RenderProcessGone/i.test(logBuf);

const vkey = JSON.parse(readFileSync(join(WEB, "vkey.json"), "utf8"));
const refPub = [
  "3070749399094776584196760505023082018184649630143238960904128416177852499177",
  "19332666271411899541136421964054943443744127674624781442058225656512859915598",
  "13602246940248921684134898961957417503014940877664325994882645135088689043629",
  "987654321", "7",
  "227603871070980597066997968355448344591111481581308670827416666081812832821",
];

const rows = [];
for (const nt of NTS) {
  const before = REPORTS.length;
  sh(`am force-stop ${CHROME}`); await sleep(700);
  sh("input keyevent KEYCODE_WAKEUP");
  const url = `http://localhost:${PORT}/wattrib.html?nt=${nt}&runs=${RUNS}`;
  console.log(`\nnt=${nt}: launching ${url}`);
  sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`);
  const t0 = Date.now();
  let done = null, err = null, sawAutorun = false, relaunches = 0;
  while (!done && !err) {
    const fresh = REPORTS.slice(before);
    if (!sawAutorun && fresh.some((r) => r.kind === "autorun" && r.nt === nt)) { sawAutorun = true; console.log(`  autorun ack (coi=${fresh.find(r=>r.kind==="autorun").coi})`); }
    done = fresh.find((r) => r.kind === "done" && r.nt === nt);
    err = fresh.find((r) => r.kind === "error" && r.nt === nt);
    if (crashed()) { console.error("  TAB CRASHED"); break; }
    if (Date.now() - t0 > TIMEOUT) { console.error(`  TIMEOUT ${TIMEOUT/1000}s`); break; }
    // keep screen on only; relaunch ONCE if no autorun after 25s (never after it started running)
    sh("input keyevent KEYCODE_WAKEUP");
    if (!sawAutorun && Date.now() - t0 > 25000 && relaunches < 2) {
      relaunches++; console.log(`  no autorun yet, relaunch #${relaunches}`);
      sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`);
      await sleep(5000);
    }
    await sleep(2000);
  }
  if (!done) { console.error(`  nt=${nt}: NO RESULT (${err ? "page error: " + err.msg : "timeout/crash"})`); rows.push({ nt, fail: true }); continue; }
  let v = { ok: "no-proof", ident: "no-proof" };
  if (done.proofB64) {
    try {
      const proof = JSON.parse(Buffer.from(done.proofB64, "base64").toString("utf8"));
      const pub = JSON.parse(done.publicJson || "null");
      v = { ok: await snarkjs.groth16.verify(vkey, pub, proof), ident: JSON.stringify(pub.map(String)) === JSON.stringify(refPub.map(String)) };
    } catch (e) { v = { ok: "err:" + e.message, ident: "err" }; }
  }
  rows.push({ nt, gotNT: done.gotNT, setOK: done.setOK, initMs: done.initMs, cold: done.coldMs,
    warmMin: done.warmMin, warmMedian: done.warmMedian, warmP95: done.warmP95, warmMax: done.warmMax,
    n: (done.warmMs || []).length, all: done.warmMs, threadsUnused: done.threadsUnused, verify: v });
  console.log(`  nt=${nt}: cold ${done.coldMs}  warm median ${done.warmMedian}  p95 ${done.warmP95}  min ${done.warmMin}  (setOK=${done.setOK} gotNT=${done.gotNT} n=${(done.warmMs||[]).length})  verify=${v.ok}/${v.ident}`);
}

try { lc.kill(); } catch {}
if (savedSO && savedSO !== "null") sh(`settings put global stay_on_while_plugged_in ${savedSO}`);
sh("settings put system screen_off_timeout 30000");
try { adb(["reverse", "--remove", `tcp:${PORT}`]); } catch {}
sh(`am force-stop ${CHROME}`);
srv.close();

const w1 = rows.find((r) => r.nt === 1 && !r.fail)?.warmMedian ?? null;
const best = rows.filter((r) => !r.fail).sort((a, b) => a.warmMedian - b.warmMedian)[0] ?? null;
const out = {
  schema: "after-the-bridge-exp1-wasm/1", capturedAt: new Date().toISOString(),
  device: { model, abi }, runs: RUNS,
  prover: "rapidsnark C++ -> Emscripten WASM (pthreads+PROXY, generic-C++ field, mini-gmp 64-bit limbs); ffiasm ThreadPool forced via rs_set_nt",
  wasm_nt_sweep: rows,
  wasm_1T_ms: w1, wasm_best: best ? { nt: best.nt, ms: best.warmMedian } : null,
};
const p = join(ROOT, "results", `attrib-wasm-${model.replace(/[^\w.-]+/g, "_")}-${out.capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
console.log("\n════════ WASM nt sweep (A12) ════════");
for (const r of rows) console.log(r.fail ? `  nt=${r.nt}: FAIL` : `  nt=${r.nt}: cold ${r.cold}  warm median ${r.warmMedian}  p95 ${r.warmP95}  (n=${r.n})`);
console.log(`WASM-1T = ${w1} ms   best = nt${best?.nt} ${best?.warmMedian} ms`);
console.log(`\nwrote ${p}`);
