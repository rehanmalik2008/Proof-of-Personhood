// Step A of the-wasm-bridge.md: run the C++->WASM rapidsnark prover in Chrome on
// the connected Android, prove-only, N runs. Serves web-wasm/ (COOP/COEP for
// SharedArrayBuffer/pthreads), adb-reverses, wakes the screen, autoruns
// wasmprove.html, collects the HTTP report, verifies the proof with snarkjs on
// desktop against the existing vkey. No circuit/zkey change.
//
//   ADB=... node scripts/bench_wasmprover.mjs [--runs 20] [--port 8090]

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const RUNS = +opt("--runs", "20");
const PORT = +opt("--port", "8090");
const ADB = process.env.ADB || "adb";
const serial = opt("--serial", "");
const CHROME = opt("--chrome-pkg", "com.android.chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args) => execFileSync(ADB, [...(serial ? ["-s", serial] : []), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sh = (c) => { try { return adb(["shell", c]); } catch { return ""; } };

const WEB = join(ROOT, "web-wasm");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".zkey": "application/octet-stream", ".wtns": "application/octet-stream" };
const REPORTS = [];
const srv = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/__bench")) {
    let b = ""; req.on("data", (d) => b += d); req.on("end", () => { try { REPORTS.push(JSON.parse(b)); } catch {} res.writeHead(204).end(); });
    return;
  }
  try {
    const p = decodeURIComponent(req.url.split("?")[0]); const f = join(WEB, (p === "/" ? "/wasmprove.html" : p).replace(/\.\.[/\\]/g, ""));
    const body = readFileSync(f);
    res.writeHead(200, { "Content-Type": MIME[f.slice(f.lastIndexOf("."))] || "application/octet-stream", "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin" });
    res.end(body);
  } catch { res.writeHead(404).end("nf"); }
});
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));
console.log(`served web-wasm/ on :${PORT}`);

const model = sh("getprop ro.product.model").trim();
const abi = sh("getprop ro.product.cpu.abi").trim();
console.log(`device: ${model} ${abi}`);
adb(["reverse", "--remove-all"]).catch?.(() => {});
try { adb(["reverse", `tcp:${PORT}`, `tcp:${PORT}`]); } catch (e) { console.error("adb reverse failed:", e.message); process.exit(2); }
const savedSO = sh("settings get global stay_on_while_plugged_in").trim();
sh("settings put global stay_on_while_plugged_in 7");
sh("settings put system screen_off_timeout 1800000");
sh("input keyevent KEYCODE_WAKEUP");
sh(`am force-stop ${CHROME}`); await sleep(800);

// logcat for crash detection only
adb(["logcat", "-c"]); let logBuf = "";
const lc = spawn(ADB, [...(serial ? ["-s", serial] : []), "logcat", "-v", "brief"], { stdio: ["ignore", "pipe", "ignore"] });
lc.stdout.on("data", (d) => { logBuf += d; if (logBuf.length > 2e6) logBuf = logBuf.slice(-1e6); });
const killed = () => /Tab crashed|RENDERER_PROCESS|lowmemorykiller.*chrome|SIGABRT|std::bad_alloc|RenderProcessGone|Aw, Snap/i.test(logBuf);

const url = `http://localhost:${PORT}/wasmprove.html?autorun=1&runs=${RUNS}`;
console.log("launching:", url);
sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`);

const t0 = Date.now();
const have = (k) => REPORTS.some((r) => r.kind === k);
while (!have("done") && !have("error")) {
  if (killed()) { console.error("\nTAB CRASHED (logcat). Last:", logBuf.split(/\r?\n/).filter((l) => /chrom|kill|snap/i.test(l)).slice(-4).join("\n")); break; }
  if (Date.now() - t0 > 420000) { console.error("\nTIMEOUT (420s) with no report. reports:", REPORTS.map((r) => r.kind).join(",")); break; }
  if ((Date.now() - t0) % 5000 < 400) { sh("input keyevent KEYCODE_WAKEUP"); const fg = sh("dumpsys activity activities | grep -m1 ResumedActivity"); if (!/com\.android\.chrome/.test(fg)) sh(`am start -a android.intent.action.VIEW -d '${url}' -p ${CHROME}`); }
  await sleep(400);
}

const done = [...REPORTS].reverse().find((r) => r.kind === "done");
const err = [...REPORTS].reverse().find((r) => r.kind === "error");

// cleanup
try { lc.kill(); } catch {}
sh("svc power stayon false");
if (savedSO && savedSO !== "null") sh(`settings put global stay_on_while_plugged_in ${savedSO}`);
sh("settings put system screen_off_timeout 30000");
try { adb(["reverse", "--remove", `tcp:${PORT}`]); } catch {}
sh(`am force-stop ${CHROME}`);
srv.close();

if (!done) {
  console.error("\nNO RESULT. " + (err ? `page error @${err.where}: ${err.msg}` : "(no error report either)"));
  process.exit(1);
}

console.log("\ndone report timings:", JSON.stringify({ cold: done.coldMs, median: done.warmMedian, p95: done.warmP95, min: done.warmMin, n: (done.warmMs || []).length, init: done.initMs, threadsUnused: done.threadsUnused }));
console.log("proofB64 present:", !!done.proofB64, "  publicJson present:", !!done.publicJson);

// verify the proof on desktop against the existing snarkjs vkey (best-effort)
let verifyOK = "not-checked", pub = null;
try {
  const vkey = JSON.parse(readFileSync(join(WEB, "vkey.json"), "utf8"));
  const proof = JSON.parse(Buffer.from(done.proofB64 || "", "base64").toString("utf8"));
  pub = JSON.parse(done.publicJson || "null");
  verifyOK = await snarkjs.groth16.verify(vkey, pub, proof);
} catch (e) { console.error("verify/parse issue:", e.message); verifyOK = "parse-error: " + e.message; }
let refPub = [];
try { const t = readFileSync(join(WEB, "ref_public.json"), "utf8"); refPub = t.trim() ? JSON.parse(t) : []; } catch {}

const ANCHOR_NATIVE = 477, ANCHOR_SNARKJS_PROVE = 3374, ANCHOR_SNARKJS_COLD = 6766;
const out = {
  schema: "wasm-bridge-stepA/1", capturedAt: new Date().toISOString(),
  device: { model, abi },
  prover: "rapidsnark C++ -> Emscripten WASM (pthreads + SIMD, mini-gmp 64-bit limbs)",
  circuit: "wedge_mem_w8_d9 (4,309 constr) — identical zkey + witness",
  runs: RUNS,
  moduleInitMs: done.initMs,
  pthreadWorkers: { running: done.threadsRunning, unused: done.threadsUnused, hardwareConcurrency: done.hardwareConcurrency },
  proveOnlyMs: { cold: done.coldMs, warmMin: done.warmMin, warmMedian: done.warmMedian, warmP95: done.warmP95, warmMax: done.warmMax, all: done.warmMs },
  proofVerifiesWithSnarkjsVkey: verifyOK,
  publicSignalsIdentical: (refPub.length && pub) ? JSON.stringify(refPub.map(String)) === JSON.stringify(pub.map(String)) : "no-ref",
  vs: {
    native_477: { speedup_warm: +(ANCHOR_NATIVE / done.warmMedian).toFixed(2), x_of_native: +(done.warmMedian / ANCHOR_NATIVE).toFixed(2) },
    snarkjs_prove_3374: { speedup_warm: +(ANCHOR_SNARKJS_PROVE / done.warmMedian).toFixed(2) },
    snarkjs_cold_6766: { speedup_cold: +(ANCHOR_SNARKJS_COLD / done.coldMs).toFixed(2) },
  },
  gate_note_projection: "1.25–2× native (~600–950 ms); FAIL if worse than ~2.5× native (>1200 ms)",
  gate_result: done.warmMedian <= 1200 ? "PASS (within/near the projected band)" : "FAIL (WASM overhead beyond the standard band)",
};
const p = join(ROOT, "results", `wasmprover-${model.replace(/[^\w.-]+/g, "_")}-${out.capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(p, JSON.stringify(out, null, 2) + "\n");

console.log("\n════════ C++→WASM PROVER, on-device (Step A) ════════");
console.log(`module init:   ${done.initMs} ms`);
console.log(`pthread pool:  running=${done.threadsRunning}  unused=${done.threadsUnused}  (hc=${done.hardwareConcurrency})`);
console.log(`prove-only:    COLD ${done.coldMs} ms   |   warm median ${done.warmMedian} ms   p95 ${done.warmP95}   min ${done.warmMin}`);
console.log(`proof verifies (snarkjs vkey): ${verifyOK}   public signals identical: ${out.publicSignalsIdentical}`);
console.log(`vs native 477 ms:   ${out.vs.native_477.x_of_native}× native   (${out.vs.native_477.speedup_warm}× — >1 = faster than native)`);
console.log(`vs snarkjs prove 3374 ms:  ${out.vs.snarkjs_prove_3374.speedup_warm}×`);
console.log(`GATE (${out.gate_note_projection}):  ${out.gate_result}`);
console.log(`\nwrote ${p}`);
