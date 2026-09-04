# The WASM Bridge — Step A result

**Question (the-wasm-bridge.md):** can rapidsnark's C++ Groth16 prover, compiled to
WebAssembly, deliver native-class speed in a browser (zero install) on an
entry-level phone?

**Step A gate:** port the *prover only*, measure prove-only in Chrome on the
Galaxy A12, compare to the two anchors, decide before porting anything else.

> **Result: GATE FAILED.** Warm median **2,467 ms** on the A12 — **5.2× native**,
> **~2× past the note's fail threshold** (>1.2 s / >2.5× native). The WASM overhead
> for this workload is far larger than the standard "50–80% of native" band.
> **Per the note's own instruction, stop here — do not port the witness
> calculator.** Native (app/SDK) stays mandatory for entry-level devices.

---

## The build (done — this part worked)

From a machine with **no C/C++ toolchain**: installed Emscripten 6.0.9, and
compiled `iden3/rapidsnark` (v0.0.8 tree) to WASM.

| sub-problem | resolution |
|---|---|
| GMP (the note's flagged hard dependency) | **mini-gmp with 64-bit limbs** (`-DMINI_GMP_LIMB_TYPE="long long"`) + 3 one-line `mpn_and/ior/xor_n` shims — **no autotools GMP cross-compile** |
| field arithmetic | ffiasm **generic C++** (`fr_generic.cpp` / `fr_raw_generic.cpp`), i.e. `USE_ASM=OFF` — there is no WASM equivalent for ffiasm's hand-tuned x86/NEON assembly |
| threading | `-pthread` + `-fopenmp` (Emscripten 6.0.9 supports both); `PROXY_TO_PTHREAD` so the prove runs off the page main thread |
| SIMD | `-msimd128` (browser supports it; ffiasm generic code is not vectorised, so it does little here) |
| output | `prover.wasm` **313 KB** + `prover.js` **123 KB** |

**Cryptographic equivalence — verified.** Run in Node against the identical
`wedge_mem_w8_d9` `.zkey` + witness, the WASM prover's proof **verifies against the
existing snarkjs verification key** and its **public signals are byte-identical** to
snarkjs and to native rapidsnark. Same equivalence bar that validated native
rapidsnark. No circuit, zkey, nullifier, or privacy change.
*(On the A12 run the harness failed to serialise the proof back over HTTP — a
`btoa` bug in the page — so that specific run's proof was not independently
re-verified; the 20 proofs all completed and the build's equivalence is
established from the Node check on the same source.)*

## The measurement — Galaxy A12 (SM-A125F), Chrome 152, `crossOriginIsolated`, 8 pthread workers

| | cold (1st) | warm median | warm p95 | warm min | module init |
|---|--:|--:|--:|--:|--:|
| **C++→WASM prover, prove-only** | **3,071 ms** | **2,467 ms** | 2,671 ms | 2,410 ms | 542 ms |

20 runs, tight (2,410–2,671 ms) — a stable measurement, not noise.

### vs the anchors

| comparison | ratio |
|---|--:|
| vs **native rapidsnark** on the same phone (477 ms warm) | **5.17× slower** (0.19× the speed) |
| vs **browser snarkjs** prove-only on the same phone (3,374 ms) | 1.37× faster |
| vs **browser snarkjs** cold (6,766 ms) | 2.2× faster on cold |

### The gate

The note projected **1.25–2× native (~600–950 ms)**, anchored on the *measured*
477 ms native, with an explicit falsification: *"worse than ~2.5× native (>1.2 s
prove-only) ⇒ WASM overhead is larger than the standard band ⇒ native stays
mandatory."*

Measured **5.17× native / 2,467 ms**. **Fails by ~2×.**

## Why it's this slow (the note's §3.2, confirmed)

The note named the risk exactly: *"rapidsnark's field arithmetic uses hand-optimized
assembly (and on arm64, NEON). WASM SIMD is 128-bit fixed and cannot express all
native intrinsics; assembly paths must be replaced with portable C++… **this is
where the 50–80%-of-native band is won or lost** — a build that falls back to
generic C++ for field arithmetic will sit at the bottom of that band or below."*

This build **had to** fall back to generic C++ (`USE_ASM=OFF`) — there is no
WASM/SIMD port of ffiasm's field asm, and writing one is a research project, not a
port. On top of that, WASM pthreads (Web Workers + SharedArrayBuffer + Atomics
futexes) carry far more synchronisation cost than native threads, and that cost is
worst on a weak in-order CPU where the MSM's fine-grained parallelism is already
marginal. Together these put the build at **~20% of native**, well below the band.

## Consequence

- **Step B is not attempted.** The note is explicit: porting the witness
  calculator only matters *after* the prover port clears its gate. It did not.
- **The deployment matrix stands as `the-cpu-wall.md` §4 left it:** browser
  (snarkjs) for mid-range and up; **native (rapidsnark app/SDK) for entry-level.**
  The WASM bridge does **not** collapse that into "zero-install everywhere" for
  this circuit on this class of device.
- What the bridge *does* buy, measured: **~1.4× over browser snarkjs prove-only,
  ~2× on cold.** Real, but it does not clear the 2 s bar end-to-end (prove alone is
  already 2.5 s warm / 3.1 s cold, before witness calculation) and it does not
  approach native.
- **One engine, two deployments** (the note's Result 3, audit-surface argument)
  remains valid as an *architecture* choice independent of this speed result — but
  it cannot be sold as "native speed without the install."

## Honest falsification status

- **the-wasm-bridge.md falsification #1** — *"worse than ~2.5× native ⇒ native
  stays mandatory for entry-level"* — **triggered.** 5.17× native.
- The optimistic projection (0.9–1.6 s end-to-end if both parts ported) is
  **refuted** for this device/circuit: the prover alone is already 2.5 s.

## Artifacts

```
wasm-bridge/build_wasm.sh     the Emscripten build recipe (needs emsdk + rapidsnark-src)
wasm-bridge/prover.{js,wasm}  the compiled prover
web-wasm/                     wasmprove.html + prover + zkey/witness + vkey (on-device harness)
scripts/bench_wasmprover.mjs  adb-driven: serve + reverse + autorun + collect + verify
results/wasmprover-SM-A125F-*.json   this measurement
```
