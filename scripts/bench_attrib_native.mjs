// after-the-bridge.md Experiment 1, native half only:
// prebuilt arm64 rapidsnark on the A12, prove-only, across CPU-affinity masks.
// taskset 1-core == slightly-pessimistic proxy for true native-1-thread.
//   ADB=... node scripts/bench_attrib_native.mjs [--nruns 15]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const NRUNS = +opt("--nruns", "15");
const ADB = process.env.ADB || "adb";
const serial = opt("--serial", "");
const PUSH_DIR = opt("--push-dir",
  process.env.RAPIDSNARK_PUSH_DIR || join(ROOT, "build", "rapidsnark-push"));
const DEV = "/data/local/tmp/rsattrib";
const adb = (args) => execFileSync(ADB, [...(serial ? ["-s", serial] : []), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sh = (c) => { try { return adb(["shell", c]); } catch (e) { return (e.stdout || "") + "\n[ERR " + e.status + "] " + (e.stderr || ""); } };
const stat = (a) => {
  if (!a.length) return { min: null, median: null, p95: null, max: null, mean: null, n: 0 };
  const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], median: s[(s.length - 1) >> 1], p95: q(0.95), max: s[s.length - 1], mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), n: a.length };
};

const model = sh("getprop ro.product.model").trim();
const abi = sh("getprop ro.product.cpu.abi").trim();
console.log(`device: ${model} ${abi}`);
for (const f of ["prover", "c.zkey", "w.wtns"]) if (!existsSync(join(PUSH_DIR, f))) { console.error("missing " + f); process.exit(2); }
sh(`mkdir -p ${DEV}`);
for (const f of ["prover", "librapidsnark.so", "c.zkey", "w.wtns"]) {
  const p = join(PUSH_DIR, f); if (existsSync(p)) adb(["push", p, `${DEV}/${f}`]);
}
sh(`chmod 755 ${DEV}/prover`);

// prove N times under a given taskset mask; time each with `date +%s%3N` (ms epoch,
// 13 digits -> safe integer). print raw start/end lines, pair up here.
const timeRuns = (pre, n) => {
  const script = `cd ${DEV} && for i in $(seq 1 ${n}); do date +%s%3N; ` +
    `LD_LIBRARY_PATH=${DEV} ${pre}./prover c.zkey w.wtns proof.json public.json >/dev/null 2>&1; ` +
    `date +%s%3N; done`;
  const lines = sh(script).trim().split(/\r?\n/).map((x) => x.trim()).filter((x) => /^\d{10,}$/.test(x));
  const ms = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const d = Number(lines[i + 1]) - Number(lines[i]);
    if (d > 0 && d < 120000) ms.push(d);
  }
  return ms;
};

const hasTaskset = /Usage|argument|taskset/i.test(sh("taskset 2>&1 | head -2"));
console.log(`taskset available: ${hasTaskset}\n`);
const masks = [["1core", "1"], ["2core", "3"], ["4core", "f"], ["8core", "ff"]];
const rows = [];
for (const [label, mask] of masks) {
  const pre = hasTaskset ? `taskset ${mask} ` : "";
  sh(`cd ${DEV} && LD_LIBRARY_PATH=${DEV} ${pre}./prover c.zkey w.wtns proof.json public.json >/dev/null 2>&1`); // warm
  const ms = timeRuns(pre, NRUNS);
  const s = stat(ms);
  rows.push({ label, mask, ...s, all: ms });
  console.log(`native ${label} (taskset ${mask}): median ${s.median} ms  p95 ${s.p95}  min ${s.min}  max ${s.max}  (n=${s.n})  ${JSON.stringify(ms)}`);
}

// verify last proof
const vkey = JSON.parse(readFileSync(join(ROOT, "web-attrib", "vkey.json"), "utf8"));
const refPub = [
  "3070749399094776584196760505023082018184649630143238960904128416177852499177",
  "19332666271411899541136421964054943443744127674624781442058225656512859915598",
  "13602246940248921684134898961957417503014940877664325994882645135088689043629",
  "987654321", "7",
  "227603871070980597066997968355448344591111481581308670827416666081812832821",
];
let verify = { ok: "err", ident: "err" };
try {
  const proof = JSON.parse(sh(`cat ${DEV}/proof.json`));
  const pub = JSON.parse(sh(`cat ${DEV}/public.json`));
  verify = { ok: await snarkjs.groth16.verify(vkey, pub, proof), ident: JSON.stringify(pub.map(String)) === JSON.stringify(refPub.map(String)) };
} catch (e) { verify.msg = e.message; }
console.log(`\nnative proof verifies: ${verify.ok}   public identical: ${verify.ident}`);

const nat1 = rows.find((r) => r.label === "1core")?.median ?? null;
const out = {
  schema: "after-the-bridge-exp1-native/1", capturedAt: new Date().toISOString(),
  device: { model, abi },
  note: "taskset 1core == slightly-pessimistic proxy for true native-1-thread (8 ffiasm pool threads, condvar-parked, contend on 1 core).",
  native_taskset_sweep: rows, verify,
  native_1T_proxy_ms: nat1,
};
const p = join(ROOT, "results", `attrib-native-${model.replace(/[^\w.-]+/g, "_")}-${out.capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote ${p}`);
