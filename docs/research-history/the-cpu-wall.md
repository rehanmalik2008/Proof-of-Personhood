# The CPU Wall

### What the first real-hardware measurement proved, and whether 6.4 s can become under 2 s

**The measurement (Samsung Galaxy A12, SM-A125F, Helio P35, 3.75 GB, Android 12, Chrome 152, multi-thread):**

| run | peak prover RSS | peak all-Chrome | % device RAM | flow p95 | survived |
|---|--:|--:|--:|--:|:--:|
| baseline | **361.5 MB** | 775.6 MB | 9.6% | **6,394 ms** | YES |
| under 900 MB ballast | **378.8 MB** | 1,248.1 MB | 10.1% | **5,675 ms** | YES |

Two findings, and they point in opposite directions.

---

## 1. The memory wall is effectively dead (with one honest asterisk)

**Result 1 (memory).** *Measured peak prover-renderer RSS is 361–379 MB on a real entry-level phone — close to the 411 MB working-set prediction and ~10% of device RAM — surviving 900 MB of resident background ballast with no OOM and no lowmemorykiller event. The `wasmPeakMB: 2047.9` figure is snarkjs **reserving** address space, of which only ~18% is ever committed. Reserved ≠ resident: the ~2 GB alarm was an artifact of measuring the wrong quantity.*

This vindicates the earlier working-set finding *and* the insistence on measuring OS-level RSS: the in-page `measureUserAgentSpecificMemory` reported only ~21 MB because it misses worker-thread WASM entirely. Neither the in-page number (21 MB, wildly low) nor the reserved number (2048 MB, wildly high) was the truth; only kernel `VmHWM` was.

**The asterisk (keep it).** The A12 is the 3.75 GB variant, above the ≤3 GB bar the memory gate set. The collator correctly still prints `NO LOW-RAM DEVICE MEASURED`. On a 2–3 GB device Chrome caps heaps lower, `MemAvailable` is tighter, and the lowmemorykiller is more aggressive. The honest status: **memory is very likely fine and no longer the binding constraint, but the formal gate stays open until a ≤3 GB unit survives under load.** Do not close it early; do stop treating memory as the primary risk.

---

## 2. The wall moved: CPU is now the binding constraint

**Result 2 (CPU).** *Flow p95 is 5,675–6,394 ms against a 2,000 ms bar — a **3.2× overshoot** on a Helio P35 (entry-level 12nm, ~$110 phone). The failure is not the circuit (4,309 constraints), not memory, and not the protocol; it is Groth16 proving executed in browser WASM on a weak mobile CPU.*

Note the counterintuitive detail: the **loaded run was faster** than the fresh run (5,675 vs 6,394 ms). That is thermal/scheduler noise, and it tells us these measurements have ±10–15% variance — so "6.4 s" should be read as "roughly 5.5–6.5 s," not a precise constant. It does not change the conclusion: we are ~3× over, not ~1.1× over, and closing 3× requires a real intervention, not tuning.

---

## 3. Can the CPU wall be overcome? Yes — and this one has a known fix

Unlike the impossibility walls this project has hit before (CAP, the Byzantine bound, copyable keys), **there is no theorem preventing fast mobile proving.** The 6.4 s is an artifact of a specific, replaceable implementation choice: *interpreted-ish WASM running a general-purpose JS prover*. Four levers, ranked by measured-elsewhere effectiveness and by cost to the project's properties.

### 3.1 Lever A — rapidsnark / native prover (highest leverage, proven, no circuit change)

snarkjs is a JavaScript/WASM Groth16 prover; **rapidsnark** is a native C++ prover consuming the *same* `.zkey` and witness. Reported speedups over snarkjs are commonly **~5–20×** on the same circuit, because it uses optimized assembly field arithmetic, real multithreading, and no WASM/JS overhead.

Applied here: 6.4 s ÷ 5–20× → **~0.3–1.3 s**. That clears the 2 s bar with margin, on this exact phone, with **zero changes to the circuit, the nullifier construction, the witness maintenance, or any privacy property.**

**The cost, stated plainly:** rapidsnark is native code. On mobile this means an **app or a WebView with a native module** — it forfeits the pure-browser zero-install pitch. That is a *product* decision, not a cryptographic one, and it is the same tradeoff the memory-wall note anticipated (§3 deployment matrix) — arriving now for CPU reasons rather than memory reasons.

> **Result 3.** *A native prover is the single highest-leverage fix: a plausible 5–20× on the identical circuit and zkey, landing ~0.3–1.3 s on the measured hardware. It costs the zero-install browser deployment mode for low-end devices and nothing else. This makes the deployment matrix a genuine choice rather than a compromise: web for capable devices, native for weak ones — both with identical cryptography and identical privacy.*

### 3.2 Lever B — WASM SIMD + proper multithreading (keeps zero-install, uncertain magnitude)

Before conceding the browser, check whether the current run is leaving browser performance on the table:
- **WASM SIMD** (128-bit): field arithmetic is the hot loop; SIMD can give meaningful gains and is supported in Chrome on Android. Is the deployed snarkjs build SIMD-enabled? *Unknown — check.*
- **True multithreading** requires `SharedArrayBuffer`, which requires **cross-origin isolation** (`COOP`/`COEP` headers). If those headers aren't set, the "multi-thread" run may silently have been single-threaded. On the A12's 8 cores (4×A53 performance-ish), real threading could give ~2–4×.
- **Thermal/scheduler**: entry-level SoCs throttle; sustained runs matter for real UX.

If SIMD + genuine cross-origin-isolated threading together yield ~3×, the browser path lands ~2.1 s — borderline, but on the *right side* for mid-range and close for entry-level. **This is the cheapest experiment available and it preserves zero-install, so it must be tested before conceding to native.**

### 3.3 Lever C — proof-system change (the deeper, slower option)

Groth16 proving is MSM+FFT-heavy. Plonky3 / other FRI-based systems have different mobile profiles and some are engineered for fast proving, but: bigger proofs, different memory behavior, a rewrite of the circuit, and re-doing all the constraint work. **This composes with the earlier Lever J analysis and remains the highest-cost, highest-uncertainty path.** Only if A and B both fail.

### 3.4 Lever D — reduce work further (limited headroom left)

The circuit is already 4,309 constraints and signatures are already relocated to Phase 1. Remaining trims (k=2 vs k=3 in Phase 1 doesn't affect Phase 2; shallower tree trades capacity) are small relative to a 3× gap. **Constraint reduction has been mined out; it cannot deliver 3× alone.**

---

## 4. The honest deployment consequence

The measurement forces the deployment matrix from theory into fact:

| device class | browser (snarkjs WASM) | native (rapidsnark) |
|---|---|---|
| Entry-level (A12-class, Helio P35) | **~6 s — NO-GO** | ~0.3–1.3 s projected — GO |
| Mid-range | likely 2–4 s — marginal | GO |
| Flagship / desktop | ~0.7 s — GO | GO |

**Privacy and cryptography are identical across every cell.** The choice is purely install-friction vs. device capability. The honest product statement becomes:

> *Zero-install browser proving works on mid-range and better. Entry-level devices need the native prover (app/SDK) until browser proving improves. Same protocol, same privacy, same guarantees.*

This must be added to the disclosures list in the due-diligence document — a buyer serving entry-level populations must know the pure-web path does not currently cover them.

**And the equity point, restated honestly:** Part I's falsification criterion was *"if a proof takes eight seconds on a \$60 Android, the protocol excludes the people it claims to serve."* We measured **6.4 s on a ~\$110 Android in the browser** — uncomfortably close to that line, and the criterion is not yet cleared for the pure-web path. It *is* plausibly cleared via native (Lever A). So the universality claim survives, but **only with the native path**, and that must be said out loud rather than implied by a desktop number.

---

## 5. What to measure next, in order

1. **Cheapest first — is the browser path being handicapped?** Verify: is `SharedArrayBuffer` actually available (COOP/COEP set)? Is the run genuinely multi-threaded on device, or silently single-threaded? Is SIMD enabled in the deployed snarkjs build? A silently-single-threaded run would mean a "free" 2–4× is sitting unclaimed. **Do this before any port.**
2. **rapidsnark on-device benchmark** (Lever A): same `.zkey`, same witness, native binary via adb, measure wall-clock. This quantifies the fix and decides the deployment matrix with data instead of a range.
3. **A ≤3 GB device** for the still-open memory gate (now low-priority, since memory measured at ~10% RAM — but the gate is formally open).
4. **Sustained/thermal behavior**: 20 back-to-back proofs already show drift; a real user proves once, so *cold-start* p95 may matter more than sustained. Worth separating cold vs. warm numbers.

---

## 6. Falsification

1. If enabling SIMD + cross-origin-isolated threading yields **<1.5×**, browser proving cannot close a 3× gap and the native path is mandatory for entry-level — stop hoping and ship the matrix.
2. If rapidsnark yields **<3×** on this circuit, the "native fixes it" assumption is wrong and the proof-system question (Lever C) reopens on the CPU axis.
3. If neither path clears 2 s on entry-level hardware, the honest conclusion is that the protocol serves **mid-range and above in 2026**, and the universality claim must be publicly narrowed rather than quietly dropped.
4. If cold-start (single proof, fresh tab) is materially worse than the 20-run p95, the real-user number is worse than measured — report cold-start separately.

---

## 7. The un-inflated bottom line

The first real-hardware measurement did exactly what it was supposed to: it **killed one fear and confirmed another.** Memory — the thing we spent a whole note dreading — is a non-issue at ~10% of device RAM under load; the 2 GB alarm was reserved address space, not resident memory. CPU — which we had projected optimistically at 1.5–2 s — is the real wall at ~6.4 s, a 3.2× miss on entry-level hardware.

**Crucially, this wall is engineering, not physics.** Every previous wall in this project was a theorem (CAP, Byzantine bounds, copyable keys, R1CS scalar-mult cost). This one is an implementation choice with a known, proven fix that touches no cryptography and no privacy property: a native prover, plausibly 5–20×, landing comfortably under the bar. The price is the zero-install browser experience on the weakest devices — a product tradeoff to disclose, not a security compromise.

So: **yes, the CPU problem can be overcome.** Check the free browser levers first (SIMD, real threading — possibly 2–4× sitting unclaimed), then benchmark rapidsnark to convert a projection into a number. The protocol, the circuit, the privacy, and the maintenance system all stand unchanged. What changed is that the deployment story is now honest and measured rather than assumed — which is precisely what the first contact with real hardware is for.
