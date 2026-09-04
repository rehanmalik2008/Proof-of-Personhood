// ---------------------------------------------------------------------------
// Turnkey OS-level peak-RSS capture for an in-browser Phase-2 proof on a real
// Android device over adb. Closes the last gate in the-memory-wall_UPDATE.md:
// working set (411 MB, in-page shim) -> peak RSS (measured, authoritative).
//
//   node scripts/measure_phone_rss.mjs                       fresh-boot capture, rung w8d9
//   node scripts/measure_phone_rss.mjs --load 4 --load-mb 200   under memory pressure (Task 2)
//   node scripts/measure_phone_rss.mjs --load-apps com.google.android.youtube,com.android.chrome
//   node scripts/measure_phone_rss.mjs --dry-run             print the plan, no device needed
//   node scripts/measure_phone_rss.mjs --replay some-logcat.txt   test the parser offline
//
// Output: results/phone-<model>-<ts>.json  (schema "sybil-wedge-phone-rss/1")
// Fold many with:  node scripts/collate_results.mjs results/
//
// No root required: process RSS/PSS is read via `adb shell dumpsys meminfo <pid>`
// (a system service, works unprivileged). Renderer PIDs come from `adb shell ps`.
// The prover tab is identified as the renderer whose PSS climbs during the proof.
// ---------------------------------------------------------------------------

import { execFile, execFileSync, spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nowISO = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- args ------------------------------------------------------------------
const A = process.argv.slice(2);
const flag = (n) => A.includes(n);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const CFG = {
  port: +opt("--port", "8080"),
  rung: opt("--rung", "w8d9"),                 // w8d9 | w4d8 | bin16
  out: opt("--out", ""),
  load: +opt("--load", "0"),                    // Task 2: N ballast tabs
  loadMb: +opt("--load-mb", "150"),
  loadApps: (opt("--load-apps", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
  sampleMs: +opt("--sample-ms", "250"),
  timeoutS: +opt("--timeout", "300"),
  serial: opt("--serial", ""),
  chromePkg: opt("--chrome-pkg", "com.android.chrome"),
  noServe: flag("--no-serve"),
  keepOpen: flag("--keep-open"),
  dryRun: flag("--dry-run"),
  replay: opt("--replay", ""),
  diag: flag("--diag"),                 // launch web/diag.html (prover-capability probe) instead of the RSS bench
  diagST: flag("--single-thread"),      // with --diag: force snarkjs single-thread (hide window.Worker)
};
const RUNG_META = {
  w8d9: { key: "mem w8 d9", constraints: 4309, cap: "134,217,728" },
  w4d8: { key: "mem w4 d8", constraints: 2947, cap: "65,536" },
  bin16: { key: "mem bin d16", constraints: 4363, cap: "65,536" },
};
const RM = RUNG_META[CFG.rung] || RUNG_META.w8d9;

// ---- adb helpers ---------------------------------------------------------
const ADB = process.env.ADB || "adb";
const adbBase = () => (CFG.serial ? [ADB, "-s", CFG.serial] : [ADB]);
function adb(args, { allowFail = false } = {}) {
  try {
    return execFileSync(adbBase()[0], [...adbBase().slice(1), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return "";
    throw new Error(`adb ${args.join(" ")} failed: ${(e.stderr || e.message || "").toString().slice(0, 400)}`);
  }
}
function adbShell(cmd, o) { return adb(["shell", cmd], o); }
function haveAdb() { try { execFileSync(ADB, ["version"], { stdio: "ignore" }); return true; } catch { return false; } }

// ---- logcat sentinel parser (also used by --replay) --------------------
// Returns { start, done, error, resultJson, iters:[], ballastReady, killReason }
function parseLogcat(text) {
  const out = { start: false, done: false, error: null, resultJson: null, iters: [], ballastReady: 0, killReason: null, doneLine: null };
  const KILL = [
    /Tab crashed/i, /RENDERER_PROCESS_(KILLED|CRASHED)/i, /GpuProcessHostUIShim/i,
    /lowmemorykiller/i, /LowMemoryKiller/i, /am_kill.*chrome/i, /ActivityManager:\s*Killing .*chrome/i,
    /Out of memory/i, /FATAL:.*chrome/i, /SIGABRT/i, /mmap.*failed/i, /std::bad_alloc/i,
    /Received signal 6/i, /RenderProcessGone/i,
  ];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw;
    if (/PHONE_BENCH_AUTORUN/.test(line)) out.autorun = true;
    if (/PHONE_BENCH_START/.test(line)) out.start = true;
    if (/PHONE_BALLAST_READY/.test(line)) out.ballastReady++;
    const it = line.match(/PHONE_BENCH_ITER\s+(\S.*?)\s+(\d+)\/(\d+)\s+flowMs=(\d+)/);
    if (it) out.iters.push({ rung: it[1], i: +it[2], n: +it[3], flowMs: +it[4] });
    const b64 = line.match(/PHONE_BENCH_RESULT_JSON_B64\s+([A-Za-z0-9+/=]+)/);
    if (b64 && b64[1]) {
      try { out.resultJson = JSON.parse(Buffer.from(b64[1], "base64").toString("utf8")); } catch { /* keep scanning */ }
    }
    const dm = line.match(/PHONE_BENCH_DONE[^"]*/);
    if (dm) { out.done = true; out.doneLine = dm[0].trim(); }
    const err = line.match(/PHONE_BENCH_ERROR\s+([^"]*)/);
    if (err) out.error = err[1].trim();
    if (!out.killReason) for (const rx of KILL) if (rx.test(line)) { out.killReason = line.trim().slice(0, 240); break; }
  }
  return out;
}

// ---- device facts ------------------------------------------------------
function deviceFacts() {
  const gp = (p) => adbShell(`getprop ${p}`, { allowFail: true });
  let totalRamMB = null;
  const mi = adbShell("cat /proc/meminfo", { allowFail: true });
  const m = mi.match(/MemTotal:\s*(\d+)\s*kB/);
  if (m) totalRamMB = Math.round(+m[1] / 1024);
  let chromeVersion = null;
  const dp = adbShell(`dumpsys package ${CFG.chromePkg} | grep -m1 versionName`, { allowFail: true });
  const cv = dp.match(/versionName=([^\s]+)/);
  if (cv) chromeVersion = cv[1];
  return {
    model: gp("ro.product.model") || "unknown",
    manufacturer: gp("ro.product.manufacturer") || null,
    marketName: gp("ro.product.marketname") || gp("ro.config.marketing_name") || null,
    abi: gp("ro.product.cpu.abi") || null,
    androidRelease: gp("ro.build.version.release") || null,
    sdk: +gp("ro.build.version.sdk") || null,
    totalRamMB,
    chromePkg: CFG.chromePkg,
    chromeVersion,
  };
}

// ---- process sampling (no root, LIGHT) --------------------------------
// ONE `ps` call per sample gives RSS(kB) for every process -- ~0.2 s, negligible
// device load. (dumpsys meminfo is ~0.34 s PER PID and, run every 250 ms across
// ~6 chrome processes, starves the prover -- that is what wedged the first runs.)
function psRssAll() {
  const t = adbShell(`ps -A -o PID,RSS,NAME 2>/dev/null || ps -A -o PID,RSS,ARGS 2>/dev/null`, { allowFail: true });
  const rows = [];
  for (const l of t.split(/\r?\n/)) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    rows.push({ pid: +m[1], rssKB: +m[2], name: m[3].trim() });
  }
  return rows;
}
// kernel-recorded PEAK RSS (VmHWM) for one pid -- readable by `shell` for chrome
// renderers; catches a spike that fell between `ps` samples.
function procPeakRssKB(pid) {
  const t = adbShell(`grep -E 'VmHWM|VmRSS' /proc/${pid}/status`, { allowFail: true });
  const hwm = t.match(/VmHWM:\s*(\d+)\s*kB/);
  const rss = t.match(/VmRSS:\s*(\d+)\s*kB/);
  return { peakKB: hwm ? +hwm[1] : null, nowKB: rss ? +rss[1] : null };
}
// one dumpsys meminfo (PSS + RSS) for a single pid -- used ONCE at the end as a cross-check.
function meminfoPid(pid) {
  const t = adbShell(`dumpsys meminfo ${pid}`, { allowFail: true });
  if (!t) return null;
  let mm = t.match(/TOTAL PSS:\s*(\d+)\s+TOTAL RSS:\s*(\d+)/i);
  if (mm) return { pssKB: +mm[1], rssKB: +mm[2] };
  mm = t.match(/^\s*TOTAL\s+(\d+)/mi);
  return mm ? { pssKB: +mm[1], rssKB: null } : null;
}

// ---- local server: static web/ + POST /__bench report sink -------------
// Chrome for Android does not forward console.log to logcat, so the page POSTs
// its progress + final JSON here (reachable from the phone via `adb reverse`).
const REPORTS = [];   // { kind:"autorun|start|iter|done|error|ballast_ready|ballast_failed", ... }
function startServer(port) {
  const webRoot = join(ROOT, "web");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".zkey": "application/octet-stream" };
  const srv = createServer((req, res) => {
    if (req.method === "POST" && (req.url || "").startsWith("/__bench")) {
      let body = "";
      req.on("data", (d) => { body += d; if (body.length > 8_000_000) req.destroy(); });
      req.on("end", () => {
        try { REPORTS.push(JSON.parse(body)); } catch { /* ignore malformed */ }
        res.writeHead(204).end();
      });
      return;
    }
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = p === "/" ? "/index.html" : p;
      const file = join(webRoot, rel.replace(/^(\.\.[/\\])+/, ""));
      const body = readFileSync(file);
      res.writeHead(200, {
        "Content-Type": MIME[file.slice(file.lastIndexOf("."))] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  return new Promise((ok, err) => {
    srv.once("error", err);
    srv.listen(port, "127.0.0.1", () => ok(srv));
  });
}
const reportsOf = (kind) => REPORTS.filter((r) => r.kind === kind);
const haveReport = (kind) => REPORTS.some((r) => r.kind === kind);

// ---- the run -----------------------------------------------------------
async function main() {
  mkdirSync(join(ROOT, "results"), { recursive: true });

  // ---- offline parser test path ----
  if (CFG.replay) {
    const parsed = parseLogcat(readFileSync(CFG.replay, "utf8"));
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  const plan = [
    `1. serve web/ + POST /__bench on 127.0.0.1:${CFG.port}  (this script's own server)`,
    `2. adb reverse tcp:${CFG.port} tcp:${CFG.port}   (phone localhost -> this host)`,
    `3. wake screen, svc power stayon, dismiss keyguard, force-stop Chrome`,
    CFG.load ? `4. open ${CFG.load} ballast tab(s) @ ${CFG.loadMb} MB each, wait for ballast_ready reports` : "4. (no ballast load)",
    CFG.loadApps.length ? `4b. monkey-launch: ${CFG.loadApps.join(", ")}` : "",
    `5. am start VIEW http://localhost:${CFG.port}/index.html?autorun=1&rung=${CFG.rung}  (${RM.key}, ${RM.constraints} constr)`,
    `6. page POSTs "start" -> sample dumpsys meminfo <chrome pids> every ${CFG.sampleMs} ms`,
    `7. page POSTs "done"{payload} | "error" | logcat OOM-kill | ${CFG.timeoutS}s timeout -> compose output`,
    `8. cleanup: svc power stayon false; adb reverse --remove; ${CFG.keepOpen ? "leave Chrome open" : "am force-stop " + CFG.chromePkg}`,
  ].filter(Boolean);
  console.log("PLAN:\n  " + plan.join("\n  ") + "\n");

  if (CFG.dryRun) { console.log("--dry-run: stopping here (no device touched)."); return; }

  if (!haveAdb()) { console.error("`adb` not found on PATH. Install platform-tools, or set ADB=/path/to/adb."); process.exit(2); }
  const state = adb(["get-state"], { allowFail: true });
  if (!/device/.test(state)) {
    console.error(`no device ready (adb get-state: "${state || "none"}"). Connect a phone with USB debugging enabled` + (CFG.serial ? ` and check --serial ${CFG.serial}` : "") + ".");
    process.exit(2);
  }

  const device = deviceFacts();
  console.log(`device: ${device.manufacturer || ""} ${device.marketName || device.model}  ` +
    `Android ${device.androidRelease} (sdk ${device.sdk})  ${device.abi}  RAM ${device.totalRamMB ?? "?"} MB  Chrome ${device.chromeVersion || "?"}`);
  const lowRam = device.totalRamMB != null && device.totalRamMB <= 3200;
  console.log(lowRam ? "  -> this IS a low-RAM (<=3 GB) device: the measurement the gate needs." :
    "  -> NOT a low-RAM device; useful as a reference row but does not close the gate.");

  // The page reports progress by HTTP POST /__bench, so we ALWAYS run our own
  // server (Chrome for Android does not forward console.log to logcat). --no-serve
  // is not meaningful for phone runs and is ignored here.
  if (CFG.noServe) console.log("note: --no-serve ignored — the phone report channel needs this script's own server.");
  let srv;
  try { srv = await startServer(CFG.port); }
  catch (e) {
    console.error(`could not bind port ${CFG.port} (${e.code || e.message}). Stop any other server on it (e.g. \`node scripts/serve.mjs\`) or pass --port <n>.`);
    process.exit(2);
  }
  console.log(`served web/ + /__bench on http://127.0.0.1:${CFG.port}/`);
  adb(["reverse", "--remove-all"], { allowFail: true });
  adb(["reverse", `tcp:${CFG.port}`, `tcp:${CFG.port}`]);

  // screen must be awake + unlocked AND Chrome must stay foreground for the tab's
  // JS to run at full speed. Save the user's screen settings, force stay-awake.
  const savedStayOn = adbShell("settings get global stay_on_while_plugged_in", { allowFail: true }).trim();
  const savedTimeout = adbShell("settings get system screen_off_timeout", { allowFail: true }).trim();
  adb(["shell", "settings put global stay_on_while_plugged_in 7"], { allowFail: true });   // 1|2|4 = ac|usb|wireless
  adb(["shell", "settings put system screen_off_timeout 1800000"], { allowFail: true });   // 30 min
  adb(["shell", "input keyevent KEYCODE_WAKEUP"], { allowFail: true });
  adb(["shell", "svc power stayon true"], { allowFail: true });
  adb(["shell", "wm dismiss-keyguard"], { allowFail: true });
  await sleep(800);
  const wf = adbShell("dumpsys power | grep -m1 mWakefulness=", { allowFail: true });
  const dl = adbShell("dumpsys trust | grep -m1 deviceLocked=", { allowFail: true });
  console.log(`screen: ${wf.trim() || "?"}   ${dl.trim() || ""}`);
  if (/deviceLocked=1/.test(dl)) {
    cleanupEarly();
    console.error("\nSTOP — the phone is LOCKED (secure lock screen). Unlock it, keep the screen on, and re-run. `wm dismiss-keyguard` cannot bypass a PIN/pattern/password.");
    process.exit(3);
  }
  // fresh Chrome each run (we've seen stale proving tabs from a previous run)
  if (!CFG.keepOpen) { adb(["shell", `am force-stop ${CFG.chromePkg}`], { allowFail: true }); await sleep(800); }

  // logcat stream + rolling buffer — used ONLY for crash/OOM-kill detection now
  adb(["logcat", "-c"], { allowFail: true });
  let logBuf = "";
  const lc = spawn(adbBase()[0], [...adbBase().slice(1), "logcat", "-v", "brief"], { stdio: ["ignore", "pipe", "ignore"] });
  lc.stdout.on("data", (d) => { logBuf += d.toString(); if (logBuf.length > 4_000_000) logBuf = logBuf.slice(-2_000_000); });
  const killScan = () => parseLogcat(logBuf).killReason;

  const restoreScreen = () => {
    try {
      adb(["shell", "svc power stayon false"], { allowFail: true });
      if (savedStayOn && savedStayOn !== "null") adb(["shell", `settings put global stay_on_while_plugged_in ${savedStayOn}`], { allowFail: true });
      if (savedTimeout && savedTimeout !== "null") adb(["shell", `settings put system screen_off_timeout ${savedTimeout}`], { allowFail: true });
    } catch {}
  };
  function cleanupEarly() {
    restoreScreen();
    try { adb(["reverse", "--remove-all"], { allowFail: true }); } catch {}
    if (srv) try { srv.close(); } catch {}
  }
  const cleanup = () => {
    try { lc.kill(); } catch {}
    restoreScreen();
    try { adb(["reverse", "--remove", `tcp:${CFG.port}`], { allowFail: true }); } catch {}
    if (!CFG.keepOpen) adb(["shell", `am force-stop ${CFG.chromePkg}`], { allowFail: true });
    if (srv) try { srv.close(); } catch {}
  };
  process.on("SIGINT", () => { cleanup(); process.exit(130); });

  const load = { mode: "none", backgroundTabs: 0, ballastMbEach: 0, apps: [], ballastReady: 0, appsStarted: [] };
  try {
    // open a URL in Chrome. Single-quote the whole shell command so the phone's
    // /system/bin/sh keeps `&` inside the query string instead of splitting on it.
    const amStart = (u) => adb(["shell", `am start -a android.intent.action.VIEW -d '${u}' -p ${CFG.chromePkg}`]);

    // ---- Task 2: memory pressure ----
    if (CFG.load > 0) {
      load.mode = "ballast"; load.backgroundTabs = CFG.load; load.ballastMbEach = CFG.loadMb;
      for (let i = 1; i <= CFG.load; i++) {
        amStart(`http://localhost:${CFG.port}/ballast.html?mb=${CFG.loadMb}&t=${i}`);
        await sleep(2500);
      }
      for (let w = 0; w < 100 && reportsOf("ballast_ready").length < CFG.load && !reportsOf("ballast_failed").length; w++) await sleep(500);
      load.ballastReady = reportsOf("ballast_ready").length;
      const bf = reportsOf("ballast_failed");
      console.log(`ballast: ${load.ballastReady}/${CFG.load} tab(s) ready @ ${CFG.loadMb} MB` +
        (bf.length ? `  — ${bf.length} FAILED to allocate: ${bf.map((x) => x.message).join("; ")}` : ""));
    }
    if (CFG.loadApps.length) {
      load.mode = load.mode === "ballast" ? "ballast+apps" : "apps"; load.apps = CFG.loadApps;
      for (const pkg of CFG.loadApps) {
        const r = adb(["shell", `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`], { allowFail: true });
        load.appsStarted.push({ pkg, ok: /Events injected: 1/.test(r) });
        await sleep(2500);
      }
      console.log(`apps: ${load.appsStarted.filter((a) => a.ok).length}/${CFG.loadApps.length} launched`);
    }

    // ---- --diag: prover-capability probe, not the RSS bench ----
    if (CFG.diag) {
      REPORTS.length = 0;
      const durl = `http://localhost:${CFG.port}/diag.html?diag=1${CFG.diagST ? "&st=1" : ""}`;
      console.log(`launching DIAG: ${durl}`);
      amStart(durl);
      const dt0 = Date.now();
      while (!haveReport("diag")) {
        if (Date.now() - dt0 > 300_000) throw new Error("no diag report in 300s (check screen on / Chrome foreground).");
        // keep screen awake + chrome foreground during the ~6 proofs
        if ((Date.now() - dt0) % 5000 < 500) {
          adb(["shell", "input keyevent KEYCODE_WAKEUP"], { allowFail: true });
          const fg = adbShell("dumpsys activity activities | grep -m1 ResumedActivity", { allowFail: true });
          if (!/com\.android\.chrome/.test(fg)) amStart(`http://localhost:${CFG.port}/`);
        }
        await sleep(500);
      }
      const d = reportsOf("diag").pop();
      console.log("\n──────── PROVER DIAGNOSTIC ────────");
      console.log(JSON.stringify(d, null, 2));
      const model = (device.marketName || device.model || "device").replace(/[^\w.-]+/g, "_");
      const p = CFG.out || join(ROOT, "results", `diag-${model}${CFG.diagST ? "-ST" : ""}-${nowISO().replace(/[:.]/g, "-")}.json`);
      writeFileSync(p, JSON.stringify({ device, ...d }, null, 2) + "\n");
      console.log(`\nwrote ${p}`);
      cleanup();
      return;
    }

    // ---- launch the bench ----
    REPORTS.length = 0;   // ignore any stale ballast reports; only bench reports from here
    const url = `http://localhost:${CFG.port}/index.html?autorun=1&rung=${CFG.rung}&delay=1500`;
    console.log(`launching: ${url}`);
    amStart(url);

    // wait for START (page loaded + autorun fired). Slow phone + cold Chrome + 688 KB snarkjs.
    const t0 = Date.now();
    const START_WAIT_MS = 150_000;
    while (!haveReport("start")) {
      const dt = Date.now() - t0;
      if (dt > START_WAIT_MS) {
        const got = REPORTS.map((r) => r.kind).join(",") || "(nothing)";
        throw new Error(`no "start" report in ${START_WAIT_MS / 1000}s. Reports received: ${got}. ` +
          (haveReport("autorun")
            ? "Page loaded but Run never fired — check the harness."
            : "Page never reported in — check the screen is ON and unlocked, and that Chrome opened the tab (not a chooser dialog)."));
      }
      await sleep(400);
    }
    console.log(`proof started (${((Date.now() - t0) / 1000).toFixed(1)}s after launch) — sampling RSS every ${CFG.sampleMs} ms…`);

    // ---- sampling loop ----
    const perProc = new Map();     // "name#pid" -> { name, pid, peakPssKB, firstPssKB, lastPssKB, samples }
    let peakSumKB = 0, samples = 0;
    const sampleT0 = Date.now();
    let stop = null, lastIter = 0, lastIterAt = Date.now(), tick = 0, chromeBgSince = 0;
    while (!stop) {
      if (haveReport("done")) stop = "done";
      else if (haveReport("error")) stop = "error";
      else if (killScan()) stop = "kill";
      else if ((Date.now() - sampleT0) / 1000 > CFG.timeoutS) stop = "timeout";
      if (stop) break;

      const it = reportsOf("iter").length;
      if (it > lastIter) { lastIter = it; lastIterAt = Date.now(); process.stdout.write(`\r  iter ${it}/20   `); }

      // every ~5 s: keep screen awake + confirm Chrome still foreground (one cheap call each).
      if (++tick % Math.max(1, Math.round(5000 / CFG.sampleMs)) === 0) {
        adb(["shell", "input keyevent KEYCODE_WAKEUP"], { allowFail: true });
        const fg = adbShell("dumpsys activity activities | grep -m1 ResumedActivity", { allowFail: true });
        if (!/com\.android\.chrome/.test(fg)) {
          if (!chromeBgSince) { chromeBgSince = Date.now(); amStart(`http://localhost:${CFG.port}/`); }
          if (Date.now() - chromeBgSince > 25_000) { stop = "chrome-backgrounded"; break; }
        } else { chromeBgSince = 0; }
      }
      if (lastIter > 0 && Date.now() - lastIterAt > 75_000) { stop = "stalled"; break; }

      // ONE ps call -> RSS(kB) for every chrome process
      let sumKB = 0;
      for (const { pid, rssKB, name } of psRssAll()) {
        if (!/chrome/i.test(name)) continue;
        sumKB += rssKB;
        const k = `${name}#${pid}`;
        const e = perProc.get(k) || { name, pid, firstRssKB: rssKB, peakRssKB: 0, lastRssKB: rssKB, samples: 0 };
        e.peakRssKB = Math.max(e.peakRssKB, rssKB);
        e.lastRssKB = rssKB; e.samples++;
        perProc.set(k, e);
      }
      peakSumKB = Math.max(peakSumKB, sumKB);
      samples++;
      await sleep(CFG.sampleMs);
    }
    const durationS = +((Date.now() - sampleT0) / 1000).toFixed(1);
    process.stdout.write("\n");
    const doneReport = reportsOf("done").pop() || null;
    const errReport = reportsOf("error").pop() || null;
    const killLine = killScan();

    // ---- final pass: kernel VmHWM (true peak RSS) for every chrome pid still alive,
    //      + one dumpsys meminfo on the prover for a PSS cross-check ----
    for (const e of perProc.values()) {
      const p = procPeakRssKB(e.pid);
      if (p.peakKB && p.peakKB > e.peakRssKB) { e.peakRssKB = p.peakKB; e.hwm = true; }
    }
    const procs = [...perProc.values()].map((e) => ({
      name: e.name, pid: e.pid, samples: e.samples, hwm: !!e.hwm,
      peakRssMB: +(e.peakRssKB / 1024).toFixed(1),
      firstRssMB: +(e.firstRssKB / 1024).toFixed(1),
      climbMB: +((e.peakRssKB - e.firstRssKB) / 1024).toFixed(1),
    })).sort((a, b) => b.climbMB - a.climbMB);
    const renderers = procs.filter((p) => /sandboxed_process|:sandbox|:renderer/i.test(p.name));
    const proverProc = (renderers[0] && renderers[0].climbMB > 80) ? renderers[0]
      : procs.find((p) => p.climbMB > 80) || renderers[0] || procs[0] || null;
    let proverPss = null;
    if (proverProc) { const mi = meminfoPid(proverProc.pid); if (mi) proverPss = +(mi.pssKB / 1024).toFixed(1); }

    const inPage = doneReport?.payload || null;           // full sybil-wedge-device-bench/1 payload
    const r0 = inPage?.results?.[0] || {};
    const workingSetMB = r0.memory?.wasmPeakMB ?? r0.memory?.wasmRequestedMB ?? null;
    const tabSurvived = !!(stop === "done" && inPage);
    const killReason = tabSurvived ? null
      : (killLine ? `logcat: ${killLine}`
        : errReport ? `in-page error: ${errReport.message}`
          : stop === "chrome-backgrounded" ? `Chrome left the foreground for >25s during the proof (another app took over / screen slept) — not a memory result. Keep Chrome foreground and the phone untouched, then re-run.`
          : stop === "stalled" ? `proof made no progress for 60s while Chrome was foreground (tab wedged; possible memory thrash — check logcat) at iter ${reportsOf("iter").length}/20`
          : stop === "timeout" ? `no "done" report within ${CFG.timeoutS}s (tab OOM-killed, hung, or backgrounded) at iter ${reportsOf("iter").length}/20`
            : `stopped: ${stop}`);

    const peakTabMB = proverProc ? proverProc.peakRssMB : null;   // RSS (kernel VmHWM where available)
    const out = {
      schema: "sybil-wedge-phone-rss/1",
      capturedAt: nowISO(),
      device,
      lowRamDevice: lowRam,
      run: {
        rung: RM.key, constraints: RM.constraints, capacity: RM.cap,
        url, sampleIntervalMs: CFG.sampleMs, samples, durationS,
        rssMethod: "ps -A -o RSS per sample + /proc/<pid>/status VmHWM final pass (unprivileged, RSS); dumpsys meminfo PSS cross-check on prover pid",
      },
      load,
      rss: {
        peakTabProcessRssMB: peakTabMB,
        peakTabProcessPssMB: proverPss,                       // cross-check (one dumpsys call, post-run)
        peakAllChromeRssMB: +(peakSumKB / 1024).toFixed(1),
        proverProcessName: proverProc?.name ?? null,
        proverProcessClimbMB: proverProc?.climbMB ?? null,
        proverPeakFromKernelHWM: !!proverProc?.hwm,
        perProcessPeakRssMB: Object.fromEntries(procs.map((p) => [p.name, p.peakRssMB])),
      },
      workingSetMB,
      ratioPeakRssToWorkingSet: (peakTabMB && workingSetMB) ? +(peakTabMB / workingSetMB).toFixed(2) : null,
      budgetFractionOfDeviceRam: (peakTabMB && device.totalRamMB) ? +(peakTabMB / device.totalRamMB).toFixed(3) : null,
      proveP95Ms: r0.proveMs?.p95 ?? null,
      flowP95Ms: r0.flowMs?.p95 ?? null,
      throttleDriftPct: r0.throttleDriftPct ?? null,
      tabSurvived,
      killReason,
      iters: reportsOf("iter").length,
      notes: [
        lowRam ? "low-RAM device: this row can close the memory gate IF tabSurvived under load."
               : `NOT a low-RAM device (${device.totalRamMB ?? "?"} MB > 3200): reference only; does not close the gate.`,
        (load.mode === "none") ? "fresh-boot capture (no background pressure) — best case, not the binding number."
                               : `under pressure: ${load.mode} (${load.ballastReady}/${load.backgroundTabs} ballast @ ${load.ballastMbEach}MB${load.apps.length ? ", apps: " + load.apps.join("/") : ""}).`,
        inPage ? null : "in-page result JSON not received — RSS peak still captured; flow p95 / working set unknown.",
      ].filter(Boolean),
      inPageResult: inPage || null,
    };

    const model = (device.marketName || device.model || "device").replace(/[^\w.-]+/g, "_");
    const outPath = CFG.out || join(ROOT, "results", `phone-${model}-${nowISO().replace(/[:.]/g, "-")}.json`);
    writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

    console.log("\n──────── RESULT ────────");
    console.log(`peak prover-renderer RSS:   ${peakTabMB ?? "?"} MB` + (out.rss.proverPeakFromKernelHWM ? " (kernel VmHWM)" : "") +
      `   (${proverProc?.name?.slice(0, 46) || "?"}, climbed ${proverProc?.climbMB ?? "?"} MB)`);
    console.log(`  PSS cross-check:          ${proverPss ?? "?"} MB`);
    console.log(`peak all-chrome RSS (sum):  ${out.rss.peakAllChromeRssMB} MB`);
    console.log(`in-page working set:        ${workingSetMB ?? "?"} MB    ratio peakRSS/working: ${out.ratioPeakRssToWorkingSet ?? "?"}`);
    if (out.budgetFractionOfDeviceRam != null) console.log(`fraction of device RAM:     ${(out.budgetFractionOfDeviceRam * 100).toFixed(1)}%  (of ${device.totalRamMB} MB)`);
    console.log(`flow p95:                   ${out.flowP95Ms ?? "?"} ms   (${out.iters}/20 iterations completed)`);
    console.log(`tab survived:               ${tabSurvived ? "YES" : "NO — " + killReason}`);
    console.log(`load context:               ${out.notes[1]}`);
    console.log(`\nwrote ${outPath}`);
    console.log(`collate:  node scripts/collate_results.mjs results/`);
  } finally {
    cleanup();
  }
}

main().catch((e) => { console.error("\nFAILED: " + (e.stack || e.message)); process.exit(1); });
