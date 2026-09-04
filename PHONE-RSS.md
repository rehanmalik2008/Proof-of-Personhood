# Real-device peak-RSS capture — operator runbook

> **Authoritative document:** [`MASTER-SPECIFICATION.md`](MASTER-SPECIFICATION.md)
> §4.1 and §6 gate #3. **The memory gate is still `Open`:** the measured device
> (Galaxy A12) is 3.75 GB; the gate requires a **≤3 GB** device surviving a proof
> under load. The A12 result (peak RSS 361 MB / ~10% of RAM, 20/20 survived) is
> strong evidence, not closure. This runbook is the tool to close it.

**Gate this closes:** the last item in
`docs/research-history/the-memory-wall_UPDATE.md` — turn the **411 MB working set
(predicted, in-page shim)** into **peak RSS (measured, OS-level)** on a real
≤3 GB Android during an in-browser proof, **under realistic memory pressure**.

Everything is built and self-tested against synthetic logcat. It is **push-button
the moment a phone is on the end of a USB cable.** No root required.

---

## One-time setup

1. Install Android **platform-tools** (`adb`) and put it on `PATH` (or `export ADB=/path/to/adb`).
2. On the phone: enable **Developer options → USB debugging**. Plug in, accept the RSA prompt.
3. `adb devices` should list it as `device` (not `unauthorized`/`offline`).
4. From the repo: `npm ci` (exact deps). No build step needed for this — the
   harness artifacts in `web/` are used as-is.

## Capture — fresh boot (best case, not the binding number)

```bash
node scripts/measure_phone_rss.mjs --rung w8d9
```

## Capture — under load (Task 2; THIS is the number the gate needs)

```bash
node scripts/measure_phone_rss.mjs --load 4 --load-mb 200
# 4 background Chrome tabs each holding ~200 MB resident -> the prover tab must
# fit in what's left, i.e. the per-tab budget of a *loaded* phone, not fresh boot.

# organic pressure instead of / on top of ballast:
node scripts/measure_phone_rss.mjs --load 2 --load-apps com.google.android.youtube,com.instagram.android
```

## What it does (all automatic)

1. Serves `web/` locally and `adb reverse`s the port so the phone reaches it at
   `http://localhost:<port>/`.
2. (load mode) Opens N `ballast.html?mb=…` tabs, waits for each `PHONE_BALLAST_READY`.
3. Clears logcat, starts streaming it.
4. `am start`s Chrome at `index.html?autorun=1&rung=w8d9` — the page selects the
   rung and presses Run itself, emitting console sentinels
   (`PHONE_BENCH_START` / `…_ITER` / `…_RESULT_JSON_B64` / `…_DONE|…_ERROR`).
5. From `PHONE_BENCH_START` until `…_DONE` (or a crash line, or `--timeout`),
   samples **`adb shell dumpsys meminfo <pid>`** every `--sample-ms` (250 ms
   default) for every `com.android.chrome*` process. `dumpsys meminfo` is a
   system service → works **without root**; it reports PSS (and RSS on Android 9+).
6. Identifies the **prover renderer** as the sandboxed renderer whose PSS climbed
   most during the window (ballast renderers sit flat at ~`--load-mb`).
7. Decodes the in-page result JSON from the `…_RESULT_JSON_B64` logcat line
   (working set from the WASM shim, flow p95, drift).
8. Writes `results/phone-<model>-<ts>.json` (schema `sybil-wedge-phone-rss/1`) and
   prints a one-line summary.

## Output JSON (`sybil-wedge-phone-rss/1`)

```jsonc
{
  "device": { "model", "totalRamMB", "androidRelease", "abi", "chromeVersion" },
  "lowRamDevice": true,                       // totalRamMB <= 3200
  "run": { "rung", "constraints": 4309, "samples", "durationS", "rssMethod" },
  "load": { "mode": "ballast|apps|ballast+apps|none", "backgroundTabs", "ballastMbEach", "ballastReady", "apps" },
  "rss": {
    "peakTabProcessPssMB": 690.0,            // <- the authoritative number
    "peakTabProcessRssMB": 845.0,
    "peakAllChromePssMB": 1780.2,
    "proverProcessName": "com.android.chrome:sandboxed_process2",
    "proverProcessClimbMB": 480.0,
    "perProcessPeakMB": { "...": ... }
  },
  "workingSetMB": 640.5,                      // in-page WASM shim (the prediction)
  "ratioPeakRssToWorkingSet": 1.08,
  "budgetFractionOfDeviceRam": 0.23,
  "proveP95Ms": 2600, "flowP95Ms": 2700,
  "tabSurvived": true,                        // false => OOM-killed / hung / render crash
  "killReason": null,
  "inPageResult": { ... full sybil-wedge-device-bench/1 payload ... }
}
```

## Collate

```bash
node scripts/collate_results.mjs results/            # markdown: CPU table + OS-RSS table + memory-gate verdict
node scripts/collate_results.mjs results/ > DEVICE-MATRIX.md
```

The **Memory gate — status** block is the point. It prints exactly one of:

- `NO LOW-RAM DEVICE MEASURED` — no ≤3 GB `phone-rss` capture exists. The wall is
  **not beaten**; the 411 MB is still a prediction.
- `MEMORY WALL CONFIRMED on low-RAM hardware` — a ≤3 GB tab was killed.
- `Low-RAM device survived only on a FRESH boot` — not the binding case; re-run with `--load`.
- `beaten for the tested configuration(s)` / `survives-but-marginal` — a ≤3 GB
  device completed a proof **under load**; margin stated; hedged pending more units.

**The script and the collator never print "memory wall beaten" unconditionally.**
It requires a ≤3 GB device, `tabSurvived: true`, and `load.mode != none` with
ballast/apps actually up.

## Troubleshooting

| symptom | fix |
|---|---|
| `no device ready` | `adb devices`; re-accept USB-debugging prompt; try another cable/port |
| `PHONE_BENCH_START not seen in 60s` | Chrome may have blocked the localhost intent — open `http://localhost:<port>/` manually once; ensure Chrome is `com.android.chrome` or pass `--chrome-pkg` |
| `peak tab-process RSS: ?` | `dumpsys meminfo <pid>` returned no TOTAL — older Android; the `all-chrome` PSS and the kill/survive result are still valid |
| multiple devices | `--serial <id>` from `adb devices` |
| want to inspect the tab after | `--keep-open` |
| offline test of the parser | `node scripts/measure_phone_rss.mjs --replay <saved-logcat.txt>` |

## Beyond this gate (from the-memory-wall_UPDATE.md §2, not built here)

If ≤3 GB devices are killed: the fix is a **leaner prover** (rapidsnark native, or
a tighter WASM prover), which is **orthogonal to the 4,309-constraint circuit** and
costs the pure-web deployment mode for low-end users. Server-side proving is
**disqualified** — it forfeits witness privacy. Measure rapidsnark peak RSS for the
same `.zkey`/witness before committing to a native path.
