# Real-device benchmark harness

> ## ⚠ The proving keys in this directory are EVALUATION ONLY
>
> `*_final.zkey` here come from a **throwaway single-contribution** Groth16
> trusted setup. A compromised setup breaks **soundness** (forged proofs become
> possible); it does not break privacy. They exist so you can run the demo and
> reproduce the benchmarks in one step. **Do not use them for anything real.**
> Production requires a public multi-party ceremony or migration to a
> transparent-setup proof system — MASTER-SPEC §6 gate 5 (`Open`),
> [`../supply-chain/TRUSTED-SETUP.md`](../supply-chain/TRUSTED-SETUP.md),
> and the `NOTICE` file.

> **Authoritative document:** [`../MASTER-SPECIFICATION.md`](../MASTER-SPECIFICATION.md)
> §4. The harness's built-in verdict (`GO = full-flow p95 < 2000 ms`, below) is a
> **per-run engineering threshold**, not the product target. The target was
> revised — ≤2 s on mid-range; ≤5 s cold on entry-level, **proven once per epoch,
> not per login**; entry-level per-login proving uses the native SDK
> (MASTER-SPEC §4.3). The `< 2 s` banner is still a useful signal, but read it
> against §4.3, not as pass/fail for the product.

`web/index.html` — the instrument that turns the deferred low-end-phone p95 (and
the peak-RAM unknown) into a measured number across a device matrix. Track 3 (SRE / operational review) of the enterprise-review gates.

## Run it on a phone

```bash
node scripts/serve.mjs 8080          # COOP/COEP on -> multi-thread on localhost
# OR
NO_ISOLATION=1 node scripts/serve.mjs 8080   # force single-thread everywhere
```

On the phone (same Wi-Fi), open `http://<LAN-IP>:8080/` in Chrome. Over plain
LAN http the phone is **not** a secure context, so snarkjs runs **single-threaded**
— the deliberately conservative low-end number. Press **Run selected**, wait for
the 20 runs, press **Copy results as JSON**, paste into a file under `results/`.

## What it captures

| field | meaning |
|---|---|
| `flowMs.p95` | full-flow (WASM prove + Groth16 verify) p95 over 20 back-to-back runs. **Engineering threshold: < 2000 ms** (not the product target — see the banner above and MASTER-SPEC §4.3). |
| `proveMs.*` | prover-only min / median / p95 / max |
| `throttleDriftPct` | mean(last 5) vs mean(first 5); > 15 % ⇒ thermal throttling, p95 is a warm-device number |
| `memory.wasmRequestedMB` | contiguous WebAssembly linear memory the prover asks for at instantiation. **snarkjs 0.7.6 ≈ 2048 MB.** On a 2–3 GB phone this single allocation — not the CPU — is the likely failure. |
| `memory.wasmPeakMB` | largest `buffer.byteLength` observed (single-thread: real; multi-thread: shared-memory reservation) |
| `memory.peakRamEstimateMB` + `peakRamSource` | best estimate the browser allowed: `measureUserAgentSpecificMemory` (authoritative) if present, else `wasm request + JS heap` |
| `memory.peakJSHeapMB` | `performance.memory` — JS heap only, **excludes WASM** (so it looks tiny; not the RAM number) |
| `device.*` | model (UA-CH `getHighEntropyValues`), cores, `deviceMemory` GB, screen, network, threading, UA string |

## The finding this harness surfaced

"flow p95 GO" and "OOMs on the device" can **both** be true. snarkjs 0.7.6 /
ffjavascript instantiates a single `WebAssembly.Memory({initial: 32767})` ≈
**2 GB** for BN254 field scratch, per `fullProve` call (freed between calls, not
concurrent). Whether the OS commits that eagerly or lazily is engine-dependent;
on a low-RAM Android unit the allocation request itself can be refused. So the
harness reports **"CPU GO"**, not "GO", and flags the memory risk separately —
the authoritative memory answer is *does the tab survive on the real ≤3 GB unit*,
confirmed with OS RSS (`adb shell dumpsys meminfo <pkg>`).

A production deployment should also evaluate a leaner prover (rapidsnark,
Halo2, Plonky3) whose memory footprint is a fraction of snarkjs-WASM — that is a
prover-implementation choice, orthogonal to the 4,309-constraint circuit.

## Authoritative OS-level RSS (real Android)

The in-page numbers above are a **prediction**. The measurement the memory gate
needs is OS peak RSS on a real ≤3 GB phone, under load. That is **`PHONE-RSS.md`**
+ **`scripts/measure_phone_rss.mjs`** — push-button over `adb`, no root:

```bash
node scripts/measure_phone_rss.mjs --load 4 --load-mb 200
```

This harness supports it via `index.html?autorun=1&rung=w8d9[&delay=ms]` — the page
selects the rung, presses Run, and emits `console.log` sentinels
(`PHONE_BENCH_START` / `_ITER` / `_RESULT_JSON_B64` / `_DONE`) that the adb wrapper
reads from `logcat`. `web/ballast.html?mb=150` is the memory-pressure page opened
in background tabs for the `--load` mode.

## Collate many devices

```bash
node scripts/collate_results.mjs results/            # dir of *.json (both schemas)
node scripts/collate_results.mjs results/ > DEVICE-MATRIX.md
```

Emits a **CPU/latency** table (from this harness) + an **OS-RSS** table (from
`measure_phone_rss.mjs`) + a **Memory-gate verdict** that prints
`NO LOW-RAM DEVICE MEASURED` until a ≤3 GB unit survives a proof under load, and
never declares the wall beaten before that.
