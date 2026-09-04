# After the Bridge — Experiment 2 + the endpoint

Experiment 1 (`AFTER-THE-BRIDGE-EXP1.md`) settled the attribution: **WASM-1-thread ÷
native-1-thread = 4.86×, flat ~5× at every thread count, and WASM parallelises as
well as native (1→8 scaling 5.2× vs 5.3×).** The gap is WASM codegen / runtime,
not field arithmetic and not thread coordination. Falsification #1 fired: **do not
write WASM-SIMD field assembly** — it targets the wrong layer.

The decision tree's next branch on the 4–5× outcome is *"try 1.2 (a Rust prover,
different codegen); if still failing → 1.4 ship the deployment matrix."*

---

## Experiment 2 — the Rust / arkworks-WASM prover (scoped check, not a full build)

### Is there an off-the-shelf WASM prover that beats 2,559 ms on the A12?

**No, and there is a concrete reason it cannot.**

1. **No prebuilt bundle exists.** `mopro`'s browser/WASM target is **Halo2-only**
   ("Mopro primarily supports the PSE Halo2"); its circom-Groth16 wasm-bindgen
   path is a one-off benchmark (issue #290), not a shipped feature. `circom-compat`
   issue #4 (compile to WASM + JS bindings) has no working solution, branch, or npm
   package. `philsippl/ark-circom-tmp` has no wasm build. Running arkworks-Groth16
   against our exact `wedge_mem_w8_d9.zkey` in a browser means building
   ark-circom + wasm-bindgen + wasm-bindgen-rayon from scratch (3–6 h).

2. **arkworks' field arithmetic is the same layer we already measured.** Source
   check of `ark-ff`'s Montgomery backend (`montgomery_backend.rs`): the only
   assembly path is `cfg(all(feature="asm", target_feature="bmi2",
   target_feature="adx", target_arch="x86_64"))`. **For wasm32 it is portable
   scalar Rust — u64 limbs, unrolled CIOS** — byte-for-byte the same technique as
   rapidsnark's `fr_raw_generic.cpp`. No `core::arch::wasm32`, no `v128`, no
   simd128. Rust-frontend vs C++-frontend both lower through the *same LLVM wasm
   backend*. Experiment 1's 5× is a property of "scalar field arithmetic compiled
   to WASM, run in a browser on an A53" — which is exactly what arkworks-WASM also
   is.

3. **The measured data agrees.** The only real arkworks-circom-Groth16 browser
   numbers (mopro, issue #290):
   - Samsung **S23U** (flagship, ~3–5× the A12's per-core throughput):
     Semaphore-32 **793 ms** (1.3× snarkjs), SHA256 **980 ms** (2.4×).
   - macOS: arkworks-wasm **779 ms** vs snarkjs 1,462 ms for SHA256 (our C++→WASM
     beats snarkjs by ~1.4× → ~1,000 ms equivalent, i.e. arkworks-wasm is ~1.3×
     ahead of our build there — an MSM/impl-detail margin, not a codegen-class
     margin).
   - Scaling the macOS ratio and the S23U→A12 gap: **arkworks-WASM ≈ 1,900–2,100 ms
     on the A12** in the best case — a ~1.3× nudge over our 2,559 ms, still ~4×
     native, still short of the 1.2 s prove-only bar (and of the 2 s end-to-end
     bar once witness calculation is added).

**Verdict: branch 1.2 fails.** A different WASM *codegen frontend* does not fix a
WASM *backend + runtime* constant factor. Not worth the 3–6 h build to confirm a
~1,950 ms estimate that already misses the bar; the source check is a real check,
not a guess.

---

## The endpoint (note §1.4 / §4) — the deployment matrix, taken deliberately

Every path to "zero-install native-class proving on entry-level" has now been
tested and has failed **honestly and for a measured reason**:

| path | result | evidence |
|---|---|---|
| Free browser levers (threads, SIMD flags) | no unclaimed speedup — threading already on, 2.5× short | `the-cpu-wall.md` Step 1 |
| C++→WASM bridge (rapidsnark → Emscripten) | 5.17× native, gate failed | `THE-WASM-BRIDGE-STEPA.md` |
| Hand-written WASM-SIMD field arithmetic | wrong layer — gap is codegen, not field arith | `AFTER-THE-BRIDGE-EXP1.md` (4.86×, flat) |
| Rust / arkworks-WASM (different codegen) | same layer — `ark-ff` wasm path is scalar CIOS, no SIMD; best-case ~1,950 ms | Exp 2 above |

**The shippable answer, already measured:**

- **Entry-level (Galaxy A12 class, ~2020 budget, 8× in-order A53):** native
  rapidsnark via an app / embeddable SDK. Prove-only **477–518 ms**, full flow
  clears the 2 s bar with margin. RSS 361 MB — fine.
- **Mid-range and up:** zero-install browser (snarkjs today; the C++→WASM engine
  is a drop-in upgrade where cross-origin isolation is available — ~1.4× on
  prove-only, ~2× cold — but it is not required to ship).
- **One circuit, one zkey, one vkey, identical nullifier + public signals across
  all three engines** (snarkjs / rapidsnark / C++→WASM all verified equivalent).
  The split is a deployment choice, not a protocol fork.

This is not a failure state. It is the outcome `the-cpu-wall.md` predicted, now
confirmed by exhausting the alternatives. The correct next move is **product, not
profiling**: put the working thing in front of one real design partner.

### Why the entry-level gap is not permanent, and needs no further work from us

The ~5× is a property of today's **WASM toolchain + browser runtime** for this
workload, not of our code or our circuit:

- **WASM codegen** for wide-integer arithmetic keeps improving in LLVM / V8.
- **Relaxed SIMD** (`fma`, `i64x2` widening/`relaxed_*` ops, `dot`) and any future
  wider-vector proposal narrow the fixed-128-bit penalty that caps WASM field
  multiplication today.
- **Memory64** removes the 32-bit-heap pressure; **JSPI** removes some pthread
  glue cost.

Our architecture already benefits automatically: **the engine is one C++ codebase
— recompile and the entry-level tier moves toward zero-install on its own**, no
re-audit of a hand-rolled assembly layer that Experiment 1 says we should never
write in the first place.

---

## Appendix — scoped reality of hand-written WASM-SIMD (v128) BN254 field arithmetic

Included because the note asks for it *"only if both fail"* — both failed. But
Experiment 1 **contraindicates** this work (the gap is not in this layer), so this
is "here is what it would cost and why the ceiling still misses," not a plan to
execute.

**What it is.** Not ARM assembly (unavailable in-browser). A BN254 F_r / F_q
modular-arithmetic layer in WASM `v128` intrinsics (`i64x2` / `i32x4` lanes):
Montgomery multiply, add/sub-with-carry, conditional subtract — the hot loop of
MSM and NTT.

**The core obstacle — no 64×64→128 widening multiply in WASM.** `i64x2.mul`
returns only the low 64 bits per lane. Montgomery multiplication of 254-bit
values must therefore be decomposed into **≤26–29-bit limbs** so partial products
fit in 52–58 bits and can accumulate in 64-bit lanes without carry loss — a
reduced-radix schoolbook/CIOS with ~9–10 limbs instead of 4×64. `i32x4.mul` gives
four 32×32→32 lo results (need `i64x2.extmul_low/high_i32x4` for 32×32→64), so a
realistic layout is ~two field elements' worth of limbs across `v128` lanes with
hand-scheduled carry propagation. This is the same reduced-radix strategy
Mitscha-Baude's `montgomery` library uses — and note that library is **not even
SIMD**: its benchmarks show scalar reduced-radix (29-bit limbs, 9×i64) beats
every simd128 attempt in browsers, and Bain Capital Crypto's write-up concludes
outright that *"WASM SIMD does not help finite-field Montgomery multiplication."*
So the honest version of this appendix is: the best available technique is
**scalar reduced-radix**, expected ~1.3–1.7× over ffiasm's generic 64-bit CIOS.

**Differential testing (a wrong carry silently yields invalid proofs).**
Reuse the existing equivalence harness: (1) per-op vectors — 10⁶ random
`(a,b)` for `mul`, `add`, `sub`, `inv`, `toMontgomery`, checked against a
reference (mini-gmp / snarkjs `ffjavascript`), plus edge cases (0, 1, p−1,
2²⁵⁴−1, values in [p, 2²⁵⁶)); (2) whole-prove equivalence — every proof from the
new backend must `groth16.verify` against the current snarkjs vkey with
byte-identical public signals, the same gate that validated native rapidsnark and
the C++→WASM bridge; (3) a fuzz loop over random witnesses. CI fails on the first
mismatch. Constant-time is not required (proving, not signing) which removes one
class of difficulty.

**Realistic ceiling.** Even done well: ~1.3–1.7× on the field-multiply portion of
prove time → single-thread WASM from ~13.3 s to perhaps ~9–10 s on the A12 →
8-thread from ~2.56 s to perhaps ~1.7–2.0 s prove-only. That would *graze* the 2 s
prove bar, **not** clear the note's 1.2 s target, and end-to-end (add witness
calc) stays above 2 s. It does **not** approach native's 477 ms — WASM's
fixed-width integer ops cap it well short. Effort: a **multi-week to multi-month**
specialist task (correct reduced-radix field arithmetic + carry scheduling +
exhaustive differential testing), by people who overlap exactly with the auditors
you would then need.

**Recommendation: do not do it.** Experiment 1 says the bottleneck is not this
layer; the achievable gain (~1.5×) cannot close a 5× gap; and the same 1.5× will
arrive for free as WASM codegen and SIMD proposals mature. Ship the deployment
matrix; recompile the shared engine as the toolchain improves.
