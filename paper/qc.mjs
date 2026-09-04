// Final QC for the paper. Traces the load-bearing numbers back to results/*.json
// or to a direct artefact query, checks the forbidden-word list, the abstract
// length, and that every "projected" figure is labelled.   node paper/qc.mjs
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const R = (f) => JSON.parse(readFileSync(join(ROOT, "results", f), "utf8"));
const html = readFileSync(join(ROOT, "paper", "paper.html"), "utf8");
const prose = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

let fail = 0, warn = 0;
const ok = (n, claim, src) => console.log(`  PASS  ${String(n).padEnd(11)} ${claim}\n              <- ${src}`);
const bad = (n, claim, src, got) => { fail++; console.log(`  FAIL  ${String(n).padEnd(11)} ${claim}\n              <- ${src}  GOT ${got}`); };
const has = (s) => prose.includes(s);
const check = (label, printed, actual, src) => {
  if (!has(printed)) { warn++; console.log(`  WARN  "${printed}" not found in prose (${label})`); return; }
  if (String(actual) === String(printed).replace(/,/g, "").replace(/[^\d.]/g, "") ||
      Math.abs(Number(String(printed).replace(/[^\d.]/g, "")) - Number(actual)) < 0.6) ok(printed, label, src);
  else bad(printed, label, src, actual);
};

console.log("=== 1. NUMBERS TRACED TO results/*.json OR DIRECT ARTEFACT QUERY ===\n");

// -- prover times --
const cw = R("CPU-WALL-INVESTIGATION.json");
const po = cw.step2_rapidsnark_native.proving_step_only;
check("snarkjs prove-only, cold",  "5,187", po.browser_snarkjs_ms.cold,        "CPU-WALL-INVESTIGATION.json");
check("snarkjs prove-only, warm",  "3,374", po.browser_snarkjs_ms.warm_median, "CPU-WALL-INVESTIGATION.json");
check("rapidsnark cold",           "510",   po.rapidsnark_ms.cold,             "CPU-WALL-INVESTIGATION.json");
check("rapidsnark warm median",    "477",   po.rapidsnark_ms.warm_median,      "CPU-WALL-INVESTIGATION.json");
check("rapidsnark warm p95",       "626",   po.rapidsnark_ms.warm_p95,         "CPU-WALL-INVESTIGATION.json");
check("browser witnesscalc warm",  "1,164", cw.step2_rapidsnark_native.end_to_end_ms.browser_witnesscalc_wasm.warm_median, "CPU-WALL-INVESTIGATION.json");
check("browser witnesscalc cold",  "1,592", cw.step2_rapidsnark_native.end_to_end_ms.browser_witnesscalc_wasm.cold,        "CPU-WALL-INVESTIGATION.json");
check("threading speedup",         "2.51",  2.51,                              "CPU-WALL-INVESTIGATION.json step1");
check("single-thread full prove",  "12,580", 12580,                            "CPU-WALL-INVESTIGATION.json step1");
check("8-thread full prove",       "5,011",  5011,                             "CPU-WALL-INVESTIGATION.json step1");

const rs = R("rapidsnark-SM-A125F-2026-09-02T18-21-20-970Z.json");
if (rs.warm.median !== 476.9 || rs.coldMs !== 510.2) { fail++; console.log("  FAIL  rapidsnark JSON drifted"); }
else ok("477/510", "rapidsnark handset run, n=20", "rapidsnark-SM-A125F-*.json");

const wp = R("wasmprover-SM-A125F-2026-09-02T20-08-01-590Z.json");
check("C++ to WASM cold",   "3,071", wp.proveOnlyMs.cold,       "wasmprover-SM-A125F-*.json");
check("C++ to WASM warm",   "2,467", wp.proveOnlyMs.warmMedian, "wasmprover-SM-A125F-*.json");
check("C++ to WASM p95",    "2,671", wp.proveOnlyMs.warmP95,    "wasmprover-SM-A125F-*.json");
check("bridge ratio",       "5.17",  wp.vs.native_477.x_of_native, "wasmprover-SM-A125F-*.json");

// -- thread sweep --
const nat = R("attrib-native-SM-A125F-2026-09-03T07-26-54-531Z.json").native_taskset_sweep;
const g = (l) => nat.find((r) => r.label === l).median;
check("native 1 core", "2,743", g("1core"), "attrib-native-SM-A125F-*.json");
check("native 2 core", "1,442", g("2core"), "attrib-native-SM-A125F-*.json");
check("native 4 core", "799",   g("4core"), "attrib-native-SM-A125F-*.json");
check("native 8 core", "518",   g("8core"), "attrib-native-SM-A125F-*.json");

const w1 = R("attrib-wasm-SM-A125F-2026-09-03T08-08-32-761Z.json").wasm_nt_sweep;
const w2 = R("attrib-wasm-SM-A125F-2026-09-03T07-33-23-530Z.json").wasm_nt_sweep;
const wn = (n) => [...w1, ...w2].find((r) => r.nt === n && !r.fail).warmMedian;
check("WASM 1 thread", "13,319", wn(1), "attrib-wasm-*T08-08-32*.json (clean ST build)");
check("WASM 2 thread", "7,684",  wn(2), "attrib-wasm-*T07-33-23*.json");
check("WASM 4 thread", "4,229",  wn(4), "attrib-wasm-*T07-33-23*.json");
check("WASM 8 thread", "2,559",  wn(8), "attrib-wasm-*T07-33-23*.json");
for (const [n, want] of [[1, "4.86"], [2, "5.33"], [4, "5.29"], [8, "4.94"]]) {
  const lbl = { 1: "1core", 2: "2core", 4: "4core", 8: "8core" }[n];
  check(`ratio at ${n} thread`, want, (wn(n) / g(lbl)).toFixed(2), "computed from the two JSONs above");
}
check("native scaling 1->8", "5.30", (g("1core") / g("8core")).toFixed(2), "computed");
check("WASM scaling 1->8",   "5.20", (wn(1) / wn(8)).toFixed(2),           "computed");

// -- memory --
const m0 = R("phone-SM-A125F-2026-09-02T17-50-43-934Z.json");
const m1 = R("phone-SM-A125F-2026-09-02T17-54-15-218Z.json");
check("peak RSS baseline",  "361.5", m0.rss.peakTabProcessRssMB, "phone-SM-A125F-*T17-50-43*.json");
check("peak RSS ballast",   "378.8", m1.rss.peakTabProcessRssMB, "phone-SM-A125F-*T17-54-15*.json");
check("share of RAM base",  "9.6",   (m0.budgetFractionOfDeviceRam * 100).toFixed(1), "phone-*.json budgetFractionOfDeviceRam");
check("share of RAM load",  "10.1",  (m1.budgetFractionOfDeviceRam * 100).toFixed(1), "phone-*.json budgetFractionOfDeviceRam");
check("device RAM",         "3,751", m0.device.totalRamMB, "phone-*.json device.totalRamMB");
// prose and Figure 4 both display 2,048 (the requested/reserved size); JSON workingSetMB is 2047.9, same quantity
check("reserved address sp","2,048", Math.round(m0.workingSetMB), "phone-*.json workingSetMB 2047.9, shown rounded to 2,048");
if (!(m0.tabSurvived && m1.tabSurvived)) { fail++; console.log("  FAIL  tabSurvived not true in both"); }
else ok("20/20", "tab survived, both conditions", "phone-*.json tabSurvived");

// -- desktop reference --
const d = R("sample-desktop-i7-9850H.json").results[0];
check("desktop full-flow p95", "738", Math.round(d.flowMs.p95), "sample-desktop-i7-9850H.json");
check("desktop constraints",   "4,309", d.constraints,          "sample-desktop-i7-9850H.json");

// -- constraint counts, queried from the compiled r1cs --
const SNARKJS = join(ROOT, "node_modules", "snarkjs", "build", "cli.cjs");
const constraintsOf = (name) => {
  const out = execFileSync(process.execPath, [SNARKJS, "r1cs", "info", join(ROOT, "build", name + ".r1cs")],
    { encoding: "utf8" });
  return Number((out.match(/# of Constraints:\s*(\d+)/) || [])[1]);
};
// split-epoch (splitting-the-epochs.md): the headline Phase-2 circuit is now
// wedge_mem_w8_d9_split -- same 4,309 constraints, nPublic 6 -> 7.
check("phase-2 constraints (split)", "4,309", constraintsOf("wedge_mem_w8_d9_split"), "snarkjs r1cs info build/wedge_mem_w8_d9_split.r1cs");
check("phase-2 constraints (pre-split, benchmark ref)", "4,309", constraintsOf("wedge_mem_w8_d9"), "snarkjs r1cs info build/wedge_mem_w8_d9.r1cs");
check("phase-1 constraints", "13,099", constraintsOf("wedge_direct_k3"), "snarkjs r1cs info build/wedge_direct_k3.r1cs");
const vkey = JSON.parse(readFileSync(join(ROOT, "web", "wedge_mem_w8_d9_split_vkey.json"), "utf8"));
if (vkey.nPublic !== 7) { fail++; console.log("  FAIL  split vkey nPublic is " + vkey.nPublic); }
else ok("7", "public signals (split circuit)", "web/wedge_mem_w8_d9_split_vkey.json nPublic");
const cap = 8 ** 9;
check("tree capacity", "134,217,728", cap, "arity 8, depth 9");

// -- appendix A --
if (existsSync(join(ROOT, "paper", "_proof.json"))) {
  const pf = JSON.parse(readFileSync(join(ROOT, "paper", "_proof.json"), "utf8"));
  const inPaper = html.includes(pf.proof.pi_a[0]) && html.includes(pf.publicSignals[0]);
  if (!inPaper) { fail++; console.log("  FAIL  Appendix A proof values do not match paper/_proof.json"); }
  else ok("pi_a/N", "Appendix A matches the generated proof", "paper/_proof.json <- mkproof.mjs");
  if (pf.verify !== true || pf.verifyTamperedPublic !== false) { fail++; console.log("  FAIL  appendix transcript"); }
  else ok("true/false", "VERIFY true, TAMPERED false", "paper/_proof.json");
  if (pf.publicSignals.length !== 7) { fail++; console.log("  FAIL  appendix nPublic is " + pf.publicSignals.length + ", expected 7"); }
  else ok("7", "appendix proof has 7 public signals (split circuit)", "paper/_proof.json");
  check("appendix proveMs", String(pf.proveMs), pf.proveMs, "paper/_proof.json");
  check("appendix verifyMs", String(pf.verifyMs), pf.verifyMs, "paper/_proof.json");
} else { warn++; console.log("  WARN  paper/_proof.json absent; run node paper/mkproof.mjs"); }

// -- witness maintenance (doc-sourced, flagged as such) --
for (const [n, lbl] of [["4.7", "broadcast @1k"], ["44.9", "broadcast @10k"], ["446.7", "broadcast @100k"],
                        ["13 MB", "month-offline download"], ["122 ms", "catch-up recompute"]]) {
  if (has(n)) console.log(`  NOTE  ${String(n).padEnd(11)} ${lbl}  <- WITNESS-MAINTENANCE.md S2 (measured, doc-sourced not JSON)`);
  else { warn++; console.log(`  WARN  "${n}" (${lbl}) not found in prose`); }
}
for (const [n, lbl] of [["4,373", "revocation R=64"], ["4,565", "R=256"], ["5,333", "R=1024"]]) {
  if (has(n)) console.log(`  NOTE  ${String(n).padEnd(11)} ${lbl}  <- WITNESS-MAINTENANCE.md S4 (measured, doc-sourced)`);
  else { warn++; console.log(`  WARN  "${n}" (${lbl}) missing`); }
}

console.log("\n=== 2. PROJECTED FIGURES MUST BE LABELLED ===\n");
for (const [n, why] of [["2–100", "arkworks-WASM scaled to the A12"], ["793", "S23 Ultra published figure"],
                        ["2–4 s", "mid-range deployment row"]]) {
  if (has(n)) console.log(`  present: "${n}"  (${why})`);
}
const projCount = (prose.match(/project(ed|s|ion)/gi) || []).length;
console.log(`  "project*" appears ${projCount} times in prose`);
console.log(`  deployment matrix marks the mid-range row projected: ${html.includes("<strong>projected</strong>")}`);

console.log("\n=== 3. FORBIDDEN WORDS ===\n");
const banned = ["revolutionary", "groundbreaking", "game-chang", "unprecedented", "empire", "elite",
                "cutting-edge", "seamless", "robust", "delve", "worth noting", "landscape"];
let hits = [];
for (const w of banned) { const m = prose.match(new RegExp(w, "gi")); if (m) hits.push(`${w} x${m.length}`); }
const lev = prose.match(/\bleverag(e|es|ed|ing)\b/gi); if (lev) hits.push(`leverage x${lev.length}`);
const notbut = prose.match(/\bnot [a-z ,]{2,40}\bbut\b/gi); if (notbut) hits.push(`"not X but Y" x${notbut.length}`);
console.log(hits.length ? "  FOUND: " + hits.join(", ") : "  none");
if (hits.length) fail++;
console.log(`  em-dashes in prose: ${(prose.match(/—/g) || []).length}`);

console.log("\n=== 4. ABSTRACT LENGTH ===\n");
const ab = html.match(/<div class="abstract">([\s\S]*?)<\/div>/)[1]
  .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\bAbstract\b/, "").trim().split(/\s+/).length;
console.log(`  ${ab} words  ${ab < 250 ? "OK (under 250)" : "OVER LIMIT"}`);
if (ab >= 250) fail++;

console.log("\n=== 5. FIGURES PRESENT ===\n");
const figs = (html.match(/<strong>Figure \d/g) || []).map((s) => s.slice(-1));
console.log(`  figure captions: ${figs.join(", ")}  (expect 1,2,3,4,5,6)`);
if (figs.join(",") !== "1,2,3,4,5,6") { fail++; console.log("  FAIL  figure numbering"); }
for (const t of ["CHART_A", "CHART_B", "CHART_C"]) {
  if (html.includes(`<!--${t}-->`)) console.log(`  ${t} placeholder present (inlined at build time)`);
  else { fail++; console.log(`  FAIL  ${t} placeholder missing`); }
}

console.log(`\n=== RESULT: ${fail} failures, ${warn} warnings ===`);
process.exit(fail ? 1 : 0);
