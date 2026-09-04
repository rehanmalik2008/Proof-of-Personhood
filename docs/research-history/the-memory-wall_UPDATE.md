# The Memory Wall

### Why constraint count was the wrong axis, and what the ~2 GB allocation actually means

---

## UPDATE — the ~2 GB was a default, not an intrinsic cost (partial win, one gate remaining)

**New measurement.** Direct instrumentation of the prover's *working set* across circuit sizes:

| circuit size | prover working set |
|---|--:|
| ~1,000 constraints | 272 MB |
| **4,309 (ours)** | **411 MB** |
| ~25,000 | 945 MB |

**What this overturns (Result 1, corrected).** The earlier ~2 GB figure was **not** intrinsic field scratch — it was snarkjs pre-allocating a large linear memory by default "just in case," independent of circuit size. Result 1 above ("peak memory is fixed regardless of constraint count") is therefore **retracted**: the working set *does* scale with constraint count (272 → 411 → 945 MB), so the constraint-reduction arc *did* help memory after all, not only latency. Good — this is a real and welcome correction, and it is the kind this project makes routinely.

**What this does not yet establish (the remaining gate — do not skip).** The 411 MB is the prover **working set**, which is *necessary* but not *sufficient* for "runs on a \$50 phone in a browser." Four things still sit between 411 MB and "ready," and a due-diligence reviewer will name all four:

1. **Working set ≠ peak RSS.** On top of the 411 MB WASM linear memory, the tab also holds the WASM module, the JS runtime, the witness, the page/DOM, and Chrome's per-tab overhead. Real peak resident memory is typically **1.5–2× the working set → ~600–800 MB**, not 411.
2. **Contiguity.** WASM linear memory is a single contiguous block; a fragmented phone address space can refuse a block that total-free-RAM says should fit.
3. **Per-tab budget, not device RAM.** A \$50 phone gives a browser tab a *fraction* of device RAM under realistic pressure (OS + other apps + Android's low-memory killer). The binding number is "what a tab gets with three other apps open," not device spec.
4. **Was this measured on a real phone?** If the 272/411/945 numbers came from desktop or a memory shim, they are a strong **prediction**, not the **measurement** the gate requires: OS-level RSS (`adb shell dumpsys meminfo`) on an actual ≤3 GB Android during a proof, under load.

**Honest status after this update.** The memory question moved from *"probably fatal (~2 GB)"* to *"probably fine (~411 MB working set → ~600–800 MB projected peak)."* That is a large, genuine improvement and it means the fix — if any is even needed — is small and the **zero-install browser pitch is likely intact.** But "probably fine" is not "ready": the authoritative gate (peak RSS on real cheap hardware under realistic pressure) is still the last unmeasured thing. If that comes back near the projection and the tab survives with other apps open, the memory wall is genuinely beaten and zero-install holds. Writing "beaten" before that measurement would be substituting the working-set number (attractive) for the peak-RSS number (deciding) — the exact substitution this project has caught every time. Run the real-phone RSS test; then declare victory, with evidence.

*(The original analysis below is retained for the reasoning; Result 1 is superseded by this update, and §5's measurement order is now the immediate priority.)*

---

### Why constraint count was the wrong axis, and what the ~2 GB allocation actually means

**The finding (original, now updated above).** Peak-memory instrumentation shows snarkjs 0.7.6 requests a **single ~2048 MB contiguous WASM linear memory** per `fullProve` — BN254 field scratch, one at a time, freed between calls. Desktop flow p95 is a comfortable GO (~700–750 ms; low-end phone projects ~1.5–2 s). But on a 2–3 GB Android, **that allocation request, not the CPU, is the likely failure.**

**Why this is a bigger deal than it first looks.** Every optimization in this project — the Merkle→membership reframe, the 13,099 → 4,309 constraint collapse, the arity-8 tree, the relocation of signatures to Phase 1 — attacked **proving time**. None of it attacked **prover memory**, because the ~2 GB is a property of the *prover implementation's field scratch*, not of the circuit's size. The uncomfortable implication:

> **Result 1 (the axis error).** *Prover peak memory in snarkjs is dominated by fixed field-arithmetic scratch, not by constraint count. A 4,309-constraint circuit and a 13,099-constraint circuit plausibly request the same ~2 GB. Therefore the entire constraint-reduction arc — real and valuable for latency — may have moved the CPU number without moving the binding constraint on a memory-limited device. Constraint count was the right axis for time and the wrong axis for feasibility on cheap phones.*

This is not a retraction of the constraint work (latency is genuinely 3× better and the privacy properties are genuinely won). It is a discovery that **there are two independent gates, and we optimized only one.**

**Status.** `Result` = argued from the instrumented measurement; `Construction` = composition; `Open` = requires measurement on real ≤3 GB hardware. No new cryptography.

---

## 1. Why 2 GB is fatal on the target device, specifically

The failure is not "slow" — it is a hard allocation refusal, and it is worse than the raw number suggests:

- **Contiguity.** A single ~2 GB *contiguous* linear memory is far harder to satisfy than 2 GB of fragmented heap. A 3 GB phone with a fragmented address space can fail an allocation that a naive "3 > 2" comparison says should succeed.
- **The OS budget, not the device spec.** On Android, a browser tab's usable memory is a fraction of device RAM (OS, system services, other apps, and Chrome's own per-tab limits). A "3 GB phone" may offer a tab well under 1 GB before the low-memory killer intervenes. **Device RAM is the wrong number; per-tab budget is the real one.**
- **32-bit WASM ceiling.** WASM32 linear memory caps at 4 GiB total, and browsers impose lower practical per-instance limits. A 2 GB request sits uncomfortably close to hard platform ceilings even where RAM exists.
- **The failure mode is a crash, not a slowdown.** A user on a cheap phone doesn't wait longer — the tab is killed. In UX terms this is categorically worse than a slow proof and cannot be papered over with a spinner.

> **Result 2 (the real threshold).** *The go/no-go for low-end devices is not "does the phone have ≥2 GB" but "does the browser tab get a contiguous allocation of the prover's requested linear memory under realistic OS pressure." The authoritative measurement is OS-level RSS on a real ≤3 GB unit (`adb shell dumpsys meminfo`) during a proof, not `deviceMemory` or in-page JS heap — both of which under-report the binding condition.*

---

## 2. The mitigation ladder — and the crucial property that it is *orthogonal to the circuit*

The best news in this finding: the fix does **not** require touching the 4,309-constraint circuit, the privacy properties, or any of the cryptographic work. The circuit is correct and cheap; the *prover* is the problem. Mitigations, ranked:

**2.1 Swap the prover implementation (highest leverage, no circuit change).**
- **rapidsnark** (native C++ Groth16 prover) — dramatically lower memory and faster than snarkjs for the same `.zkey`/witness. On mobile this means a **native app or a WebView with a native module**, not pure browser WASM. This is the single most likely fix, and it costs the "pure web, zero-install" property — a real product tradeoff to state, not hide.
- **A leaner WASM prover** — witness generation and proving with tighter scratch management. Some Groth16 WASM provers are markedly less memory-hungry than snarkjs 0.7.6; benchmark alternatives before assuming the ~2 GB is intrinsic.

**2.2 Streaming / chunked proving.** Groth16 proving is dominated by multi-scalar multiplications and FFTs whose working sets *can* be processed in chunks with far less peak residency, at some time cost. Whether a given implementation supports this is an implementation question, not a protocol one.

**2.3 Different proof system (composes with the earlier Lever J analysis).** Plonky3/Halo2 provers have different memory profiles; FRI-based systems avoid the large pairing-curve scratch but have their own footprints and bigger proofs. **Do not assume a migration helps memory — measure it.** The proof-system-escape note's caution applies verbatim: the attractive number (constraints, or now, proof-system fashion) is not the deciding number (measured peak RSS on target hardware).

**2.4 Server-assisted proving — REJECTED.** Delegating proving to a server means the server sees the witness (`s`, the membership path), destroying the entire privacy property the project spent its whole arc protecting. **This is the seductive fix and it is disqualifying.** Note it explicitly so no one proposes it later as a "pragmatic compromise": there is no privacy-preserving version of "let the server do the proving" here without a fundamentally different construction (collaborative/MPC proving), which is out of scope and adds its own trust assumptions.

> **Result 3 (orthogonality).** *The memory wall is a prover-implementation problem, not a circuit or protocol problem. It is fixable without altering the 4,309-constraint circuit, the nullifier/RLN construction, the witness-maintenance system, or any privacy property. The likely fix (rapidsnark / native prover) costs the "pure browser, zero-install" deployment mode — which is a product decision, not a cryptographic one. Server-side proving is disqualified as it forfeits witness privacy.*

---

## 3. What this does to the deployment story — the honest product consequence

If the fix is a native prover, the deployment matrix changes and the buyer must be told:

| Deployment mode | Prover | Memory feasible on low-end? | Privacy | Friction |
|---|---|---|---|---|
| Pure web (browser WASM) | snarkjs | **At risk (~2 GB request)** | Full | Zero install |
| Native app / SDK | rapidsnark | Likely fine | Full | App install required |
| WebView + native module | rapidsnark | Likely fine | Full | Platform integration |
| Server-assisted | — | Fine | **Broken** | — (rejected) |

The wedge's original pitch (bot-defense drop-in, browser-based, SDK + endpoint) implicitly assumed **pure web**. If pure-web proving is infeasible on the low-end devices the protocol claims to serve, then either (a) the low-end claim narrows to mid-range-and-up for web, or (b) the deployment requires a native path for low-end users. **Both are acceptable and disclosable; neither can be discovered by the customer in production.** Add this to the disclosures list in the due-diligence document.

---

## 4. The interaction with the equity thesis (the part that matters most)

The project's stated purpose includes serving people on cheap devices — the population most in need of a personhood primitive that doesn't require a passport or a flagship phone. The memory wall attacks **exactly that population**, and it attacks them with a crash rather than a delay.

> **Result 4 (equity gate).** *If the only memory-feasible prover requires a native app, then the "universality" claim (no particular brand of smartphone required) is weakened for the pure-web path, precisely for low-RAM devices. This is not a performance footnote; it is the falsification criterion Part I set out — "if a proof takes eight seconds on a \$60 Android, the protocol excludes the people it claims to serve" — resurfacing as memory rather than time. The honest form of the criterion must now be: **excluded if it does not prove, whether by time or by OOM.***

This should be added to the project's falsification criteria as a first-class item, not a subclause.

---

## 5. What must be measured, and in what order

1. **OS-level RSS on a real ≤3 GB Android** during a proof (`adb shell dumpsys meminfo`), not JS heap, not `deviceMemory`. This is the authoritative number and everything else is inference. Include: does the tab survive; does it survive under realistic background pressure (other apps open).
2. **The same on 2 GB and 4 GB units**, to find the actual threshold rather than assuming one.
3. **rapidsnark (or another lean prover) peak RSS and time** for the same `.zkey` and witness — quantify the fix before committing to a native path.
4. **Alternative WASM provers'** peak memory, to test whether pure-web is salvageable (the outcome that preserves the zero-install pitch).
5. Only then: decide the deployment matrix and update the disclosures.

---

## 6. Falsification

1. If a real ≤3 GB device **completes** the proof in-browser under realistic pressure, the memory wall is less severe than instrumented and pure-web survives — measure before pivoting to native.
2. If **rapidsnark does not materially reduce peak RSS** for this circuit, the "swap the prover" fix fails and the problem is deeper (field-arithmetic scratch may be near-intrinsic for Groth16/BN254) — then the proof-system question reopens on the *memory* axis, not the time axis.
3. If **no prover configuration** fits low-end devices, the honest conclusion is that the protocol serves mid-range-and-up in 2026, and the universality claim must be narrowed in public rather than quietly dropped.
4. If anyone proposes **server-side proving** as the fix, that is a privacy failure, not a solution (§2.4) — reject it explicitly in review.

---

## 7. The un-inflated bottom line

The constraint work was real and won latency and privacy. But it optimized one axis while a second, independent gate went unmeasured — and the instrument, once built, immediately found it. **The circuit is not the problem; the prover is.** The fix is orthogonal to all cryptographic work, likely requires a native prover, and costs the zero-install deployment mode for low-end devices. Nothing here invalidates the protocol; it narrows the claimed deployment envelope and adds one disclosure. The correct response is to measure OS-level RSS on real cheap hardware **before** any further building, because that single number decides whether the low-end universality claim survives — and it is the last unmeasured thing standing between this work and an honest production claim.
