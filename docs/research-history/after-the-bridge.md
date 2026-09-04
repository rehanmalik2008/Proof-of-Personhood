# After the Bridge

### Where the 5× actually went, why assembly is probably the wrong first move, and the decision tree that ends the search

**The measured wall (Galaxy A12, prove-only, warm):** native rapidsnark 477 ms · browser snarkjs 3,374 ms · **C++→WASM 2,467 ms (5.17× native)**. The WASM bridge is refuted for this circuit/device: generic-C++ field arithmetic (no WASM port of ffiasm's asm) plus WASM pthread futex overhead on an in-order A53 lands at ~20% of native, below the 50–80% band. Believe it; do not retry the bridge as-is.

The question now: **is hand-written assembly the answer, or is the project about to spend months optimizing the wrong layer?** This note attributes the 5× before anyone writes a line of asm, because *you optimize what you measured, and the bridge result does not yet tell us where the 5× lives.*

---

## 0. The critical unknown that decides everything: where is the 5× spent?

rapidsnark's prove time is two very different kinds of work:

- **MSM (multi-scalar multiplication)** — elliptic-curve point additions. Embarrassingly parallel. Dominated by field arithmetic. **This is what ffiasm's assembly accelerates.**
- **NTT/FFT** — over the scalar field. Also field-arithmetic-heavy, also parallel.
- **Thread coordination** — dividing work across cores and synchronizing.

The 5× gap has **two candidate causes with completely different fixes**, and the bridge experiment did not separate them:

1. **Scalar field arithmetic** being generic-C++ instead of asm → fixed by assembly (the expensive path you're considering).
2. **WASM threading overhead** (Workers + SharedArrayBuffer + Atomics futexes) being far heavier than native pthreads on a weak in-order core → **not fixed by any amount of field-arithmetic assembly.**

> **Result 0 (measure before you build).** *The 5× is some mix of (1) generic field arithmetic and (2) WASM thread-sync overhead. Assembly fixes only (1). If a large fraction of the 5× is (2), then writing WASM-SIMD field assembly — a multi-month research effort — recovers only part of the gap and still misses the bar. The single most important next measurement is a **single-threaded** comparison: native-1-thread vs. WASM-1-thread, prove-only. If WASM-1-thread is ~1.5–2× native-1-thread, the field arithmetic is the problem and asm is worth it. If WASM-1-thread is already ~4–5× native-1-thread single-threaded, the overhead is threading/codegen and asm will not save it. **This one experiment decides whether the assembly plan is founded or futile, and it costs an afternoon.***

**Do not start the assembly work until Result 0 is measured.** Everything below is conditional on it.

---

## 1. The cheaper paths that were skipped (try these before asm)

The investigation jumped from "port rapidsnark to WASM" straight to "write assembly." Between them sit options with far better effort-to-payoff, all preserving zero-install:

### 1.1 A WASM-SIMD field-arithmetic library that already exists — **check first, days not months**
ffiasm's *specific* asm has no WASM port, but the project may not need to write one from scratch. Newer proving stacks (the Rust/arkworks/Noir ecosystems, and mobile-focused ZK efforts) have invested in **WASM-SIMD-optimized BN254 field arithmetic**. Before writing asm, survey whether a drop-in WASM field library (or a Rust prover compiled to WASM with SIMD field ops) already beats 2,467 ms. **Using someone else's already-written, already-audited SIMD field code is strictly better than writing your own assembly.** This is the highest-payoff, lowest-risk move and it was skipped.

### 1.2 A Rust prover (arkworks / halo2 / Nova-family) compiled to WASM — **the real contender**
rapidsnark is C++; the *fastest WASM provers in production today are generally Rust* (arkworks-based), because the Rust ZK ecosystem has poured effort into WASM-SIMD field arithmetic and wasm-bindgen threading. A Rust Groth16 prover (arkworks `groth16`) over the same BN254 zkey, compiled to WASM with SIMD + threads, is the experiment most likely to beat both snarkjs and the C++→WASM build **without hand-written asm**. This is a port, not a research project, and it targets exactly the layer (SIMD field arithmetic) that the C++ build had to leave generic.

### 1.3 Reduce the proving *work*, not the per-op speed — **partially mined, some left**
The circuit is 4,309 constraints; MSM size scales with it. But proving cost also depends on the **proof system**. A switch to a system with a cheaper mobile prover (Plonky3's ecosystem is engineered for fast proving; some systems have smaller MSMs or FFT-free proving) attacks the total work rather than the per-multiply speed. Higher cost (re-do the circuit) but it is the only lever that changes the *shape* of the cost, not just the constant. Consider only if 1.1/1.2 fail.

### 1.4 Accept the deployment matrix — **the honest default**
Native for entry-level, browser for mid-range+, is already a *working, measured, shippable* answer. It is not a failure; it is the outcome the-cpu-wall.md predicted. The entire assembly/Rust effort is about *upgrading* entry-level from "native app required" to "zero-install" — a real product win, but **not a blocker to shipping.** Frame all further optimization as an enhancement to an already-viable product, not a prerequisite. This framing matters: it stops the perfect (zero-install everywhere) from blocking the good (ship native for the low end now).

---

## 2. If (and only if) Result 0 says field arithmetic is the culprit: the assembly plan

Suppose the single-thread test shows WASM-1-thread ≈ 1.5–2× native-1-thread — i.e. the field arithmetic *is* the gap and threading overhead is modest. Then hand-optimized WASM-SIMD field arithmetic is justified. Here is the honest scope, because "go to assembly" is easy to say and large to do.

**2.1 What you are actually writing.** Not x86/ARM assembly — **WASM SIMD intrinsics** (`v128`), the portable 128-bit vector ops. You are writing a BN254 F_r (scalar field) and F_q (base field) modular-arithmetic layer using `i64x2` / `i32x4` lanes: Montgomery multiplication, add/sub with carry, reduction — the hot loop of both MSM and NTT.

**2.2 Why it is hard, stated plainly.**
- WASM SIMD is **fixed 128-bit** — two 64-bit lanes. Native NEON/AVX2 offer wider vectors and richer carry/multiply-high intrinsics; WASM lacks a 64×64→128 widening multiply, so Montgomery multiplication must be decomposed into narrower limbs, costing extra ops. **This is the structural reason WASM field arithmetic caps below native even when hand-written** — you may recover to the 50–80% band but likely not to native parity.
- Correctness is unforgiving: a single wrong carry silently produces wrong proofs. Requires exhaustive differential testing against a reference (the existing snarkjs/native output — you already have the equivalence harness, reuse it).
- It is genuinely a **multi-week-to-multi-month specialist effort**, and the pool of people who can write correct constant-time SIMD field arithmetic is small (and overlaps exactly with the auditors you'll later need).

**2.3 The realistic ceiling.** Even done well, WASM-SIMD field arithmetic targets the **50–80%-of-native band** the note named — so ~600–950 ms prove-only *if threading overhead is also tamed*. That clears the 2 s prove bar with margin and, with a ported witness calculator, plausibly lands end-to-end ~0.9–1.6 s. **But it will not reach the 477 ms native number** — WASM's fixed-width SIMD caps it. The honest promise of the assembly path is "clears the bar with zero-install," not "matches native."

**2.4 The threading half.** If Result 0 shows threading overhead is *also* significant, then asm alone is insufficient and you must additionally reduce WASM thread-sync cost: coarser-grained work division (fewer, larger chunks per worker to amortize futex cost), or tuning the worker count down on weak in-order cores where 8 threads on 8 A53s may thrash. Measure thread-count sweeps — the A12 run used 8 workers by default and never swept.

---

## 3. The decision tree (this ends the search, one way or the other)

```
Result 0: single-thread native vs single-thread WASM, prove-only
│
├─ WASM-1T ≈ 1.5–2× native-1T  → field arithmetic is the gap
│     │
│     ├─ 1.1 Does an existing WASM-SIMD BN254 field lib / Rust-arkworks-WASM
│     │      prover already beat 2,467 ms?
│     │        ├─ YES → use it. Done. Zero-install, no asm written. ✅
│     │        └─ NO  → 2. Write WASM-SIMD field arithmetic (multi-week,
│     │                    ceiling ~600–950 ms, clears bar, not native parity)
│     │
│     └─ (in parallel) sweep thread count; coarsen work division
│
└─ WASM-1T ≈ 4–5× native-1T  → overhead is threading/codegen, NOT field arith
      │
      ├─ asm will NOT save it → do not write field assembly
      ├─ try 1.2 (Rust prover, different codegen) and thread-count tuning
      └─ if still failing → 1.4: ship the deployment matrix
                            (native entry-level, web mid-range+). Honest, done.
```

**Every branch terminates.** Either an existing library or a Rust port clears it (best case, no asm), or hand-written WASM-SIMD field arithmetic clears the bar at sub-native speed (expensive but bounded), or nothing does and the deployment matrix — already measured and shippable — is the answer. There is no branch where the search runs forever, which is the point: this note is designed to *end* the optimization question, not extend it.

---

## 4. Falsification / stopping conditions

1. If **Result 0** shows WASM-1-thread is ~4–5× native-1-thread, **do not write field assembly** — it targets the wrong layer. This single measurement can save months.
2. If an **existing WASM-SIMD field library or Rust-arkworks-WASM prover** beats 2,467 ms off the shelf, the entire assembly plan is moot — check this before writing anything.
3. If hand-written WASM-SIMD field arithmetic, after real effort, does **not** clear ~1.2 s prove-only, WASM's fixed-width SIMD ceiling is binding for this circuit and the assembly path has failed — ship the deployment matrix and stop.
4. If **none** of the paths clears 2 s end-to-end on entry-level, the honest, final answer is: **native app/SDK for entry-level, zero-install web for mid-range and up.** This is a viable product, not a failure — stop optimizing and go get a design partner.

---

## 5. The un-inflated bottom line

The WASM bridge failed honestly and for exactly the predicted reason. But "go to assembly" is premature by two experiments. **First, measure where the 5× lives (Result 0, one afternoon)** — assembly only helps if the field arithmetic is the culprit, and the bridge result does not yet tell us that. **Second, before writing any assembly, check whether an existing WASM-SIMD field library or a Rust-arkworks prover already clears it** — using audited, already-written SIMD code beats hand-rolling your own by every measure.

If both point to hand-written WASM-SIMD field arithmetic, it is a real, bounded, multi-week specialist effort with a ceiling of ~50–80% of native — enough to clear the 2 s bar with zero-install, **not** enough to match the 477 ms native number. And if even that fails, the deployment matrix that already exists — native for the cheapest phones, web for everything else — is a measured, shippable, honest product, and the correct move at that point is to stop optimizing and put the working thing in front of a real customer.

The discipline that got the project here says the same thing it always has: **don't spend months optimizing a layer you haven't yet proven is the bottleneck.** Measure Result 0 first. It decides everything, and it costs an afternoon against a potential multi-month misdirection.
