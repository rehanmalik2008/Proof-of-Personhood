# After the Bridge — Experiment 1: attribute the 5×

**Question:** is the C++→WASM prover's 5× slowdown vs native rapidsnark the
*field arithmetic* (generic C++ vs ARM64 asm → fixable with hand-written SIMD) or
*codegen / threading overhead* (not fixable by any field-arithmetic work)?

> **Answer: codegen. WASM-1-thread ÷ native-1-thread = 4.86×** — the note's
> "≈4–5× ⇒ the gap is codegen/threading, field assembly will not save it" band.
> **Falsification #1 is triggered: do not write WASM-SIMD field assembly.**

---

## Method

Same A12 (SM-A125F), same `wedge_mem_w8_d9` zkey + witness, prove-only, warm median.

- **Native**: prebuilt arm64 rapidsnark (ARM64 asm field arithmetic). Forced to N
  cores with `taskset` — `taskset 1` = a slightly-pessimistic proxy for true
  native-1-thread (the ffiasm pool threads condvar-park, so the overhead of the
  unused pool is ~2–10%, and near-linear scaling below confirms it).
- **WASM**: our Emscripten build (generic C++ field, mini-gmp 64-bit limbs).
  ffiasm `ThreadPool` size forced at runtime via an added exported `rs_set_nt(n)`.
  Two link configs:
  - **`x`** — `-pthread` + `PROXY_TO_PTHREAD` + `ALLOW_MEMORY_GROWTH` (the bridge's
    own config), swept nt = 2/4/8.
  - **`st3`** — **no `-pthread`, no `-fopenmp`, no memory growth** (fixed 640 MB).
    This is the clean single-thread baseline: zero threading tax, so the number is
    pure generic-C++ BN254 field arithmetic on one wasm thread.

Every proof was verified against the existing snarkjs vkey; public signals
identical in every configuration. No circuit / zkey / privacy change.

## Results (A12, warm median, prove-only)

| threads | native (asm) | WASM (generic C++) | WASM ÷ native |
|--:|--:|--:|--:|
| **1** | **2,743 ms** | **13,319 ms**  *(clean `st3`, no threading tax)* | **4.86×** |
| 2 | 1,442 ms | 7,684 ms | 5.33× |
| 4 | 799 ms | 4,229 ms | 5.29× |
| 8 | 518 ms | 2,559 ms | 4.94× |

- native n=15 (±2%); WASM n=12 (nt 2/4/8), n=4 (nt 1, ±0.4%).
- The `x`-config nt=1 (with the `-pthread`+growth tax) **timed out at >90 s/prove** —
  that penalty balloons single-thread compute on the in-order A53. `st3` removes it
  and lands at 13.3 s, which is the honest single-thread field-arithmetic number.

## Interpretation (stated per the note)

**The gap is codegen, not threading, and not something field assembly fixes:**

1. **The ratio is flat across thread counts** — 4.86× / 5.33× / 5.29× / 4.94×.
   If it were WASM thread-sync overhead it would *grow* with thread count. It is
   dead flat.
2. **WASM parallelises as well as native** — scaling 1→8 is **5.20× for WASM vs
   5.30× for native** (both ~65% of an 8× ideal). The thread machinery is fine.
3. **The clean single-thread build — no `-pthread`, no worker pool, no growth
   bounds-checks — is still 4.86× native.** With every threading artefact removed,
   the per-operation cost of WASM-compiled generic-C++ field arithmetic on the
   A53 is ~5× the cost of hand-tuned ARM64 assembly.

Per the note's own bands: **WASM-1T ≈ 4–5× native-1T ⇒ the overhead is
codegen/threading, NOT field arithmetic ⇒ field assembly will not close it.**
The nuance from Experiment 2's survey makes this sharper: the achievable ceiling
for *any* WASM field arithmetic — hand-written, and non-SIMD reduced-radix, which
is the actual state of the art — is only ~1.7× over generic (Mitscha-Baude /
Bain Capital Crypto: "WASM SIMD does not help finite-field Montgomery
multiplication"). A ~1.7× lever cannot close a ~5× gap. A multi-month WASM-SIMD
field-arithmetic effort would land around 2.5–3× native, still far from the bar.

## Consequence

- **Do not write WASM-SIMD (v128) BN254 field assembly.** Experiment 1 says it
  targets the wrong layer; this measurement is the "can save months" one.
- **Thread-count tuning yields nothing** — nt=8 is already the optimum of
  {2,4,8} on the A12's 8 A53s (nt4→nt8 still improves 1.65×); no thrashing.
- Proceed to the note's next branch: **the Rust/arkworks-WASM prover** (different
  codegen — the layer that *is* the culprit) — then, if that fails too, **1.4:
  ship the deployment matrix** (native for entry-level, web for mid-range+).

## Artifacts

```
scripts/bench_attrib_native.mjs        native taskset sweep
scripts/bench_attrib_wasm.mjs          WASM nt sweep (--web, --nts, --timeout-s)
web-attrib/      (x-config prover: -pthread+PROXY, rs_set_nt)
web-attrib-st/   (st3 prover: no -pthread, fixed memory)  <- clean 1-thread baseline
results/attrib-native-SM-A125F-2026-09-03T07-26-54-531Z.json
results/attrib-wasm-SM-A125F-2026-09-03T07-33-23-530Z.json     (nt 2/4/8)
results/attrib-wasm-SM-A125F-2026-09-03T08-08-32-761Z.json     (clean nt=1)
```
