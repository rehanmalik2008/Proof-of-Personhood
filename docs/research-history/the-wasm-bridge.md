# The WASM Bridge

### Can C++ prover speed be delivered without an app install?

**The measured position (Galaxy A12, Helio P35, identical zkey/witness, proof byte-verified equivalent):**

| prover | cold | warm median | warm p95 | install |
|---|--:|--:|--:|---|
| browser snarkjs, prove-only | 5,187 ms | 3,374 ms | — | none |
| **rapidsnark native, prove-only** | **510 ms** | **477 ms** | **626 ms** | app/SDK |
| speedup | 10.2× | **7.1×** | — | |
| browser end-to-end (witness+prove) | 6,779 ms | 4,531 ms | — | none |

Step 1 is closed: threading is already on (8 workers, 2.51× measured vs. forced single-thread), COOP/COEP are set, `crossOriginIsolated === true`, and snarkjs simply ships no SIMD build. **There is no unclaimed browser speedup.** The browser path is at its ceiling and misses the 2 s bar by ~3.4×.

The open question: **can the C++ engine's speed be delivered in a browser, preserving zero-install?**

---

## 1. First, a correction to the projection — the baseline error

A tempting chain of reasoning: *"snarkjs-WASM is 6.8 s; C++-compiled-to-WASM is typically 2–4× faster than JS-WASM; therefore ~1.5–3 s."* **This double-counts, and in the optimistic direction.**

The 6,779 ms browser figure is **already multi-threaded WASM** — the agent measured threading delivering 2.51× over forced single-thread (12,580 → 4,531 ms warm). So "2–4× for C++-over-JS" cannot be stacked on a number that already banked its threading win; much of that generic speedup *is* the threading and better codegen already present.

The correct comparison is **C++ compiled to WASM vs. the same C++ running native.** The well-documented gap: WASM typically achieves **~50–80% of native performance** for compute-bound numeric code, with the shortfall coming from bounds-checking, the 32-bit memory model, limited SIMD width vs. native NEON, and no access to some native intrinsics.

> **Result 1 (the honest projection).** *Starting from the **measured** native 477 ms warm / 510 ms cold prove-only, a WASM build of the same C++ prover should land at roughly **1.25–2× the native time → ~600–950 ms warm, ~640–1,020 ms cold** for the proving step. This is a projection from a measured anchor, not a projection from a projection — materially more trustworthy than the 6.8 s-based chain, and materially more favorable.*

So the corrected estimate is **better** than the "1.5–3 s" guess: proving alone likely lands well under 1 s.

---

## 2. The end-to-end number is what actually matters — and it has a second component

Every rapidsnark figure above is **prove-only**. The user-facing time is **witness-calculation + proving**. The agent measured browser witness-calc at ~1,164 ms warm / 1,592 ms cold (WASM witness calculator) and did *not* benchmark a native witness calculator.

This matters enormously for the WASM-bridge idea, because if you port only the prover:

$$
\text{WASM-bridge end-to-end} \approx \underbrace{600\text{–}950\text{ ms}}_{\text{ported prover}} + \underbrace{1,164\text{–}1,592\text{ ms}}_{\text{unported witness-calc}} \approx \mathbf{1.8\text{–}2.5\ s}
$$

**The witness calculator becomes the dominant cost the moment the prover is fast.** Porting rapidsnark alone gets you to *borderline* — right on the 2 s line, failing on cold start. Porting **both** (a C++ witness calculator such as circom's `witnesscalc`, compiled to WASM alongside) is what actually clears it:

$$
\text{both ported} \approx 600\text{–}950 + 300\text{–}600 \approx \mathbf{0.9\text{–}1.6\ s} \quad \text{— clears the bar}
$$

> **Result 2 (the real scope of the port).** *Porting the prover alone is insufficient — it leaves the WASM witness calculator (~1.2–1.6 s) as the new bottleneck and lands at ~1.8–2.5 s, failing cold-start. The bridge must port **both** the prover and the witness calculator to C++-compiled-WASM to reach ~0.9–1.6 s. Any plan that ports only rapidsnark will discover this the hard way; scope it correctly from the start.*

---

## 3. The four real engineering risks (this is why it needs measuring, not assuming)

The idea is sound and the precedent is real — arkworks, Noir, and others ship C++/Rust provers compiled to WASM. But four specific things determine whether the projection holds:

**3.1 Threading in WASM requires `SharedArrayBuffer` — already satisfied, and this is a big deal.** rapidsnark's native speed comes substantially from multithreading. WASM threads work *only* under cross-origin isolation. **The measurement already confirms COOP/COEP are set and `crossOriginIsolated === true` on device** — so the hardest prerequisite for a threaded WASM port is already in place. This is the single most favorable fact for the bridge.

**3.2 SIMD width and intrinsics.** rapidsnark's field arithmetic uses hand-optimized assembly (and on arm64, NEON). WASM SIMD is 128-bit fixed and cannot express all native intrinsics; assembly paths must be replaced with portable C++ or WASM-SIMD equivalents. **This is where the 50–80%-of-native band is won or lost** — a build that falls back to generic C++ for field arithmetic will sit at the bottom of that band or below.

**3.3 The 4 GiB / 32-bit memory model.** Measured peak RSS was 361 MB — comfortably inside WASM32 limits, so **memory is not a barrier for this circuit.** (Memory64 exists but is not needed here.) Another favorable fact.

**3.4 Build complexity and binary size.** Emscripten-compiling rapidsnark (with its GMP/mpz dependencies) is non-trivial; GMP in particular needs a WASM-compatible substitute or careful configuration. Expect real build engineering, and watch the downloaded `.wasm` size — a multi-MB prover download on a cheap phone with a slow connection is its own UX cost that the timing benchmark won't show.

---

## 4. Why this is the right architecture regardless of the exact number

Even if the WASM bridge lands at the pessimistic end (~1.6–2 s, borderline), the architecture is correct for a reason independent of speed:

> **Result 3 (one engine, two deployments).** *A single C++ prover core compiled two ways — native for the SDK/app path, WASM for the browser path — gives one codebase, one set of cryptographic behavior, and one thing to audit. This is materially better than maintaining snarkjs for web and rapidsnark for native, where the two paths could diverge in behavior and each needs separate audit attention. The audit-surface reduction alone justifies the port even before the speed win.*

And it converts the deployment matrix from a *compromise* into a *gradient*:

| device class | browser (C++→WASM) | native (C++) |
|---|---|---|
| entry-level (A12-class) | ~0.9–1.6 s projected — likely GO | ~0.5 s measured — GO |
| mid-range | comfortably GO | GO |
| flagship | GO | GO |

If the projection holds, **zero-install works everywhere**, and native becomes an optimization rather than a requirement for the low end — which restores the original product pitch and the equity claim (Part I's "\$60 Android" criterion) via the web path.

---

## 5. What must be measured, in order

1. **Port the prover first, measure prove-only in-browser on the A12.** Compare to the 477 ms native and the 3,374 ms snarkjs-WASM anchors. This single number validates or kills Result 1's 1.25–2×-of-native band. *Do this before porting anything else.*
2. **Then port the witness calculator** and measure end-to-end. Result 2 says this is mandatory, not optional — but confirm the prover port works before doubling the build effort.
3. **Confirm threading actually engages** in the ported WASM build on device (workers spawning ≠ threads doing useful work — the agent's forced-single-thread comparison is the right technique to reuse).
4. **Measure cold-start, not just warm.** The browser's cold penalty was +50% (6,779 vs 4,531 ms) while native's was +7%. A real user proves **once**, cold. Cold-start is the number that decides UX, and the ported build's cold behavior (including `.wasm` fetch + compile) is unknown.
5. **Measure the `.wasm` download size** and first-load time on a slow connection — a 10 MB prover blob is a real barrier for the exact population this serves.

---

## 6. Falsification

1. If the ported prover lands **worse than ~2.5× native** (>1.2 s prove-only), the WASM overhead is larger than the standard band and the bridge won't clear end-to-end — native stays mandatory for entry-level.
2. If **threading fails to engage** in the ported build, expect ~2.5× regression (per the measured single-thread comparison) and the bridge fails.
3. If the **witness calculator cannot be ported** economically, end-to-end stalls at ~1.8–2.5 s — borderline, fails cold-start, and the honest answer is "browser for mid-range, native for entry-level."
4. If the **`.wasm` payload** is large enough that first-load dominates the user's experience on a slow network, the zero-install win is partly illusory — measure download+compile, not just execution.

---

## 7. The un-inflated bottom line

The idea is right, the precedent is real, and the corrected projection is **more favorable than the original estimate** — not 1.5–3 s, but roughly **0.9–1.6 s end-to-end if both prover and witness calculator are ported**, anchored on a *measured* 477 ms native rather than on a chain of guesses. Two facts already measured make the bridge unusually likely to work: **cross-origin isolation is confirmed on device** (so WASM threads are available — the hardest prerequisite) and **peak RSS is 361 MB** (so the WASM32 memory model is not a constraint).

The two things that decide it are the SIMD/assembly gap in field arithmetic (§3.2) and whether the witness calculator is ported too (§2). Port the prover, measure prove-only against the 477 ms anchor, and the 1.25–2× band is confirmed or refuted in one experiment. If it holds, zero-install works on a \$110 Android and the deployment matrix stops being a compromise — which is exactly the outcome the project has been trying to earn honestly since the first phone measurement.
