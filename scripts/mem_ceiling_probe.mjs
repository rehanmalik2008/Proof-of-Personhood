// One prove under whatever memory ceiling the caller has imposed.
//   node scripts/mem_ceiling_probe.mjs [circuit]
//
// Used by scripts/mem_ceiling_test.sh, which runs this inside a cgroup v2 slice
// with memory.max set and swap disabled. Prints a single JSON line so the shell
// wrapper can collect it. Exits non-zero if the prove did not complete.
//
// This measures the SAME work the phone does: witness calculation followed by a
// Groth16 prove on the deployed split login circuit. The dominant allocation is
// snarkjs/ffjavascript reserving a large WebAssembly.Memory for BN254 field
// scratch, which is exactly the allocation a low-RAM device has to satisfy.

import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2] || "wedge_mem_w8_d9_split";
const B = (p) => join(ROOT, "build", p);

const kb = (s, key) => {
  const m = new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(s);
  return m ? Math.round(+m[1] / 1024) : null;
};
const selfPeak = () => {
  try { return kb(readFileSync("/proc/self/status", "utf8"), "VmHWM"); } catch { return null; }
};

const t0 = Date.now();
const out = { circuit: name, ok: false, proveMs: null, verified: null, peakRssMB: null, error: null };
try {
  const input = JSON.parse(readFileSync(B("input_mem_w8_d9_split.json"), "utf8"));
  const wtns = join(tmpdir(), `memprobe_${process.pid}.wtns`);
  await snarkjs.wtns.calculate(input, B(`${name}.wasm`), wtns);
  const tp = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.prove(B(`${name}_final.zkey`), wtns);
  out.proveMs = Date.now() - tp;
  const vkey = JSON.parse(readFileSync(B(`${name}_vkey.json`), "utf8"));
  out.verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  out.ok = out.verified === true;
} catch (e) {
  out.error = String(e && e.message ? e.message : e).split("\n")[0].slice(0, 160);
}
out.totalMs = Date.now() - t0;
out.peakRssMB = selfPeak();
console.log("PROBE_JSON " + JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
