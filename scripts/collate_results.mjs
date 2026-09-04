// Collate device benchmark + phone-RSS captures into one Markdown matrix.
//   node scripts/collate_results.mjs results/                 (dir of *.json)
//   node scripts/collate_results.mjs a.json b.json            (explicit files)
//   node scripts/collate_results.mjs < one.json               (stdin)
//   node scripts/collate_results.mjs results/ > DEVICE-MATRIX.md
//
// Ingests two schemas:
//   "sybil-wedge-device-bench/1"  -- from web/index.html "Copy results as JSON" (CPU/latency + in-page memory shim)
//   "sybil-wedge-phone-rss/1"     -- from scripts/measure_phone_rss.mjs (OS-level peak RSS on real Android)
//
// The memory gate (the-memory-wall_UPDATE.md) is only closed by a phone-rss row on
// a <=3 GB device where the tab SURVIVED a proof UNDER LOAD. This script never
// prints "memory wall beaten" unless that exact condition is met.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const blobs = [];
const addFile = (p) => {
  const j = JSON.parse(readFileSync(p, "utf8"));
  (Array.isArray(j) ? j : [j]).forEach((b) => blobs.push({ src: p, b }));
};
if (!args.length) {
  const stdin = readFileSync(0, "utf8").trim();
  if (!stdin) { console.error("no input: pass files/dirs or pipe JSON on stdin"); process.exit(1); }
  const j = JSON.parse(stdin);
  (Array.isArray(j) ? j : [j]).forEach((b) => blobs.push({ src: "stdin", b }));
} else {
  for (const a of args) {
    const st = statSync(a);
    if (st.isDirectory()) for (const f of readdirSync(a)) { if (f.endsWith(".json")) addFile(join(a, f)); }
    else addFile(a);
  }
}
if (!blobs.length) { console.error("no results found"); process.exit(1); }

const cpuRows = [];      // from device-bench
const rssRows = [];      // from phone-rss

for (const { src, b } of blobs) {
  if (b.schema === "sybil-wedge-device-bench/1") {
    const d = b.device || {};
    for (const r of b.results || []) {
      cpuRows.push({
        model: d.model || d.ua?.match(/\(([^)]+)\)/)?.[1]?.slice(0, 40) || "unknown",
        cores: d.cores ?? "?",
        ramGB: d.deviceMemoryGB ?? "?",
        thread: d.crossOriginIsolated ? "multi" : "single",
        rung: r.rung, constr: r.constraints,
        proveP95: r.proveMs?.p95 ?? "?",
        flowP95: r.flowMs?.p95 ?? "?",
        drift: r.throttleDriftPct ?? "?",
        wasmReq: r.memory?.wasmRequestedMB ?? "—",
        workingSet: r.memory?.wasmPeakMB ?? "—",
        verdict: r.verdict || "?",
        when: (b.capturedAt || "").slice(0, 10), src,
      });
    }
  } else if (b.schema === "sybil-wedge-phone-rss/1") {
    rssRows.push({
      model: b.device?.marketName || b.device?.model || "unknown",
      ramMB: b.device?.totalRamMB ?? null,
      android: b.device?.androidRelease ?? "?",
      chrome: (b.device?.chromeVersion || "?").split(".")[0],
      rung: b.run?.rung || "?",
      load: b.load?.mode === "none" ? "fresh" :
        `${b.load?.mode}(${b.load?.ballastReady ?? 0}/${b.load?.backgroundTabs ?? 0}×${b.load?.ballastMbEach ?? 0}MB${(b.load?.apps || []).length ? "+" + b.load.apps.length + "app" : ""})`,
      peakTabRss: b.rss?.peakTabProcessRssMB ?? b.rss?.peakTabProcessPssMB ?? null,
      peakAllChrome: b.rss?.peakAllChromeRssMB ?? b.rss?.peakAllChromePssMB ?? null,
      workingSet: b.workingSetMB ?? null,
      ratio: b.ratioPeakRssToWorkingSet ?? null,
      pctRam: b.budgetFractionOfDeviceRam != null ? +(b.budgetFractionOfDeviceRam * 100).toFixed(1) : null,
      flowP95: b.flowP95Ms ?? null,
      survived: b.tabSurvived === true,
      kill: b.killReason || null,
      lowRam: b.lowRamDevice === true || (b.device?.totalRamMB != null && b.device.totalRamMB <= 3200),
      underLoad: (b.load?.mode && b.load.mode !== "none") && ((b.load?.ballastReady ?? 0) > 0 || (b.load?.apps || []).length > 0),
      when: (b.capturedAt || "").slice(0, 10), src,
    });
  } else {
    console.error(`! ${src}: unrecognised schema "${b.schema}" — skipped`);
  }
}

const line = (c) => "| " + c.join(" | ") + " |";
console.log(`# Sybil-wedge Phase-2 — device matrix\n`);
console.log(`Collated from ${blobs.length} capture(s): ${cpuRows.length} CPU/latency row(s), ${rssRows.length} OS-RSS row(s).\n`);

// ---------------- CPU / latency ----------------
if (cpuRows.length) {
  cpuRows.sort((a, b) => String(a.model).localeCompare(b.model) || String(a.rung).localeCompare(b.rung));
  const H = ["device", "cores", "RAM GB", "thread", "rung", "constr", "prove p95", "flow p95", "drift %", "wasm req MB", "working set MB", "verdict", "date"];
  console.log(`## CPU / latency (in-browser, web/index.html)\n`);
  console.log(`\`flow p95\` GO = < 2000 ms. \`working set MB\` is the in-page WASM linear-memory shim (a **prediction** of RAM need). \`wasm req MB\` is snarkjs's up-front contiguous request (~2048). A GO here is a **CPU** GO only — the memory question is the OS-RSS table below.\n`);
  console.log(line(H)); console.log(line(H.map(() => "---")));
  for (const r of cpuRows) console.log(line([r.model, r.cores, r.ramGB, r.thread, r.rung, r.constr, r.proveP95, r.flowP95, r.drift, r.wasmReq, r.workingSet, `**${r.verdict}**`, r.when]));
  console.log();
}

// ---------------- OS-level peak RSS ----------------
const OOM_PCT = 80;   // peak tab RSS >= this % of device RAM => "approached OOM"
console.log(`## OS-level peak RSS (real Android, scripts/measure_phone_rss.mjs)\n`);
if (!rssRows.length) {
  console.log(`_No phone-RSS captures yet._ Run \`node scripts/measure_phone_rss.mjs --load 4\` with a device attached.\n`);
} else {
  rssRows.sort((a, b) => (a.ramMB ?? 1e9) - (b.ramMB ?? 1e9) || String(a.model).localeCompare(b.model));
  const H = ["device", "RAM MB", "Android", "rung", "load", "peak tab RSS MB", "all-chrome MB", "working set MB", "ratio", "% dev RAM", "flow p95", "tab survived", "date"];
  console.log(`\`peak tab RSS MB\` = PSS of the prover's renderer process (\`dumpsys meminfo\`, unprivileged). \`ratio\` = peak RSS ÷ predicted working set. \`load\` = fresh boot vs N ballast tabs / apps held resident.\n`);
  console.log(line(H)); console.log(line(H.map(() => "---")));
  for (const r of rssRows) {
    const flags = [];
    if (!r.survived) flags.push("💀 KILLED");
    else if (r.pctRam != null && r.pctRam >= OOM_PCT) flags.push(`⚠ ${r.pctRam}% RAM`);
    console.log(line([
      r.model + (r.lowRam ? " ⭐≤3GB" : ""), r.ramMB ?? "?", r.android, r.rung, r.load,
      r.peakTabRss ?? "?", r.peakAllChrome ?? "?", r.workingSet ?? "?", r.ratio ?? "?",
      r.pctRam ?? "?", r.flowP95 ?? "?",
      (r.survived ? "YES" : "NO") + (flags.length ? " " + flags.join(" ") : ""), r.when,
    ]));
  }
  console.log();
  // explicit flag lists
  const killed = rssRows.filter((r) => !r.survived);
  const nearOom = rssRows.filter((r) => r.survived && r.pctRam != null && r.pctRam >= OOM_PCT);
  if (killed.length) console.log(`**Tab KILLED on:** ${killed.map((r) => `${r.model} (${r.ramMB} MB, load=${r.load}${r.kill ? ", " + r.kill.slice(0, 80) : ""})`).join("; ")}\n`);
  if (nearOom.length) console.log(`**Approached OOM (peak ≥ ${OOM_PCT}% device RAM):** ${nearOom.map((r) => `${r.model} — ${r.pctRam}%`).join("; ")}\n`);
}

// ---------------- the memory-gate verdict ----------------
console.log(`## Memory gate — status\n`);
const lowRamCaps = rssRows.filter((r) => r.lowRam);
const lowRamSurvivedUnderLoad = lowRamCaps.filter((r) => r.survived && r.underLoad);
const lowRamSurvivedFresh = lowRamCaps.filter((r) => r.survived && !r.underLoad);
const lowRamKilled = lowRamCaps.filter((r) => !r.survived);

if (!lowRamCaps.length) {
  console.log(`> **NO LOW-RAM DEVICE MEASURED.** No \`sybil-wedge-phone-rss/1\` capture from a ≤3 GB Android exists yet.`);
  console.log(`> Until one does, the memory wall is **not** beaten — the 411 MB working set is a prediction, not a measured OS peak RSS on the population the protocol claims to serve.`);
  console.log(`> Next: attach a ≤3 GB phone and run \`node scripts/measure_phone_rss.mjs --load 4 --load-mb 200\`.`);
} else if (lowRamKilled.length && !lowRamSurvivedUnderLoad.length) {
  console.log(`> **MEMORY WALL CONFIRMED on low-RAM hardware.** ${lowRamKilled.length} ≤3 GB capture(s) had the tab killed during the proof.`);
  console.log(`> The pure-web path does not fit these devices as-is. See the-memory-wall_UPDATE.md §2 (swap prover / native path) — the circuit is fine, the prover is the problem.`);
} else if (lowRamSurvivedUnderLoad.length) {
  const worst = lowRamSurvivedUnderLoad.slice().sort((a, b) => (b.pctRam ?? 0) - (a.pctRam ?? 0))[0];
  console.log(`> **Low-RAM device survived a proof under load.** ${lowRamSurvivedUnderLoad.length} capture(s): ` +
    lowRamSurvivedUnderLoad.map((r) => `${r.model} (${r.ramMB} MB, peak ${r.peakTabRss} MB = ${r.pctRam}% RAM, load=${r.load})`).join("; ") + ".");
  console.log(`>`);
  if (worst.pctRam != null && worst.pctRam >= OOM_PCT) {
    console.log(`> Margin is thin (worst ${worst.pctRam}% of device RAM). Call it **survives-but-marginal**, not "beaten" — one more app open could flip it. Widen the device set before any public claim.`);
  } else {
    console.log(`> On this evidence the memory wall is **beaten for the tested configuration(s)**: a ≤3 GB Android completed an in-browser proof with background pressure and peak RSS at ${worst.pctRam ?? "?"}% of device RAM. Broaden to 2 GB units and more Chrome versions before generalising.`);
  }
} else {
  console.log(`> **Low-RAM device survived only on a FRESH boot** (${lowRamSurvivedFresh.map((r) => r.model).join(", ")}), not under load.`);
  console.log(`> Fresh-boot survival is the best case, not the binding one. Re-run with \`--load 4 --load-mb 200\` before declaring the wall beaten.`);
}

// ---------------- roll-up ----------------
const head = cpuRows.filter((r) => r.rung === "mem w8 d9" && typeof r.flowP95 === "number");
if (head.length) {
  const ps = head.map((r) => r.flowP95).sort((a, b) => a - b);
  console.log(`\n**mem w8 d9 (4,309 constr) CPU:** flow p95 ${ps[0]}–${ps[ps.length - 1]} ms across ${head.length} config(s); ` +
    `${head.filter((r) => r.verdict === "GO").length}/${head.length} CPU-GO.`);
}
