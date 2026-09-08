# The Protocol — Master Specification v1.1

### Consolidated enterprise reference: what it does, what it costs, what it does not do

**v1.1 (`splitting-the-epochs.md`):** the single `epoch` counter is split into `epoch_action` (rate-limit / nullifier window) and `epoch_tree` (tree-publication cadence). Zero added circuit constraints; public signals 6 → 7. The RLN double-use burn binds to `epoch_action` only — verified in `scripts/test_rln_burn.mjs`. Closes the coupled-counter open problem. Everything else in this document is unchanged from v1.0; the prover-time and memory measurements were taken on the constraint-identical pre-split circuit.

**Purpose.** This is the single authoritative document for an enterprise evaluation. It supersedes and consolidates fourteen prior research notes, resolves every retraction, and states every measured number and every open gap in one place. Where an earlier note is contradicted, this document governs.

**Reading guide.** §1–3 are the technical claim. §4 is what was measured on real hardware. §5 is what is *not* protected. §6 is the gap register — the honest list of what must close before production. A reviewer who reads only §5 and §6 has the accurate picture.

**Companion documents** (this one governs wherever they differ): `THREAT-MODEL.md` — per-parameter failure modes and the concrete falsification attacks; `docs/EVALUATION.md` — how to independently verify the core claims in under an hour; `REPRODUCIBLE-BUILDS.md`, `WITNESS-MAINTENANCE.md`, `PHONE-RSS.md`, `integration/README.md` — the subsystem write-ups; `docs/research-history/` — the chronological research record (reasoning + retractions), superseded by this document.

**Status labels used throughout.** `Measured` = observed on real hardware, reproducible. `Proven` = mathematically derived. `Projected` = extrapolated from a measured anchor, not itself measured. `Open` = unresolved; gates production.

---

## 1. The problem and the claim

**Problem.** The internet cannot verify that a request comes from a distinct human. CAPTCHAs are solved by models more reliably than by people. Every proposed fix reintroduces a central authority: biometric registries (non-revocable, single chokepoint), government eID (participation contingent on state permission; excludes the undocumented), or hardware attestation (root of trust becomes Apple/Google/Intel).

**Claim.** A party can prove to any verifier that it is *a distinct human who has not made this claim before in this context*, with:
- **no central registry**
- **no biometrics and no hardware root of trust**
- **no revelation of which human**
- **no linkability across contexts** — not by verifiers, not by colluding verifiers, not by the issuer

**What this is for.** Bot/sybil defense at signup and action gates; any per-capita allocation; any context where "one human, once" is the requirement. **What it is not for:** identifying *who* someone is. It is a personhood primitive, not an identity system.

---

## 2. Architecture

Two phases, deliberately separated so cost lives off the hot path.

**Phase 1 — Enrollment (once per credential lifetime).**
1. Device generates root secret `s`; computes commitment `C = Poseidon(s)`. **`s` never leaves the device.**
2. `k` independent attesters sign `C` blind. Attester categories: social, institutional, temporal (VDF-anchored presence), hardware (WebAuthn — permitted as *one input*, never a root), governmental eID (*one input*, never required).
3. Device proves the `k` signatures in a heavy circuit (13,099 constraints); backend verifies and **appends `C` to an append-only Poseidon Merkle tree** (arity-8, depth 9, capacity 134,217,728).
4. Device caches its membership witness.

**Phase 2 — Proof of personhood (every use, the hot path).**
**Two time counters (v1.1, `splitting-the-epochs.md`).** `epoch_action` is the rate-limit / nullifier window (fast, e.g. 10 min). `epoch_tree` is the tree-publication cadence (slow, e.g. daily), the epoch a given `root` is published for. They are independent public inputs. v1.0 used one counter for all of it; the split costs **zero circuit constraints** and lets a deployment rate-limit tightly without rebuilding the tree tightly.

The circuit proves, with everything private except the outputs:
- `C = Poseidon(s)` — knowledge of the secret behind the leaf
- `C ∈ published tree` — in-circuit membership against the `root` for `epoch_tree` (`C` **never** revealed)
- `N = Poseidon(s, ctx, epoch_action)` — per-context nullifier, bound to `epoch_action` only
- an RLN Shamir share; because `N` has no dependence on `epoch_tree`, the RLN slot is `(ctx, epoch_action)`

**Public output: exactly 7 signals** — `[N, y, root, ctx, epoch_action, epoch_tree, signalHash]` (`nPublic = 7`). The verifier learns **only** that one attested distinct human acted once in this context in this rate-limit window.

**Why membership, not signature re-verification.** Phase 2 verifies *no signatures*. This is the central design decision: attestation is proven once at enrollment and carried forward by set membership. It collapsed Phase 2 from 13,099 to **4,309 constraints** and delivered full attester-unlinkability as a structural consequence — Phase 2 contains no attester data, so none can leak. `Proven` + `Measured`.

**Witness maintenance (query-free).** The tree is append-only. Once per `epoch_tree` the backend publishes **one public broadcast object, identical for every client** (appended frontier nodes). Each device recomputes its own path locally. **No per-user query ever occurs** — enforced structurally in code, not by policy. A per-user "give me my path" request would reveal a stable leaf index; the API has no such endpoint.

---

## 3. Security properties (`Proven`)

| Property | Mechanism | Strongest adversary survived |
|---|---|---|
| Sybil resistance | `γ ≥ β·m·E` (see §3.1) + diversity predicate `D` | Economically rational attacker |
| Unforgeability | Fake `C` has no membership witness | Anyone without breaking the accumulator |
| Cross-context unlinkability | Per-context nullifier; `C` never revealed | **Colliding relying parties + the issuer** |
| Attester-unlinkability | No attester data exists in Phase 2 | The verifier itself |
| One-action-per-context-per-`epoch_action` | Nullifier uniqueness; `N` binds to `epoch_action`, not `epoch_tree` | — |
| Double-use burn | RLN: two proofs in one `(ctx, epoch_action)` reveal `s`, for any `epoch_tree` | Self-enforcing, no adjudicator |
| No shared key | Membership replaces MAC/token bridge | Removes the symmetric-key dilemma entirely |

### 3.1 The economic requirement (this is the parameter that must be set per deployment)

Deterrence requires mint cost `γ ≥ β·m·E`, where β = value of one fake identity *in that application*, m = monetizable contexts per credential, E = credential lifetime in epochs. **`γ ≥ β` alone is insufficient** — a credential usable across `m` contexts multiplies the attacker's return. Context-scoped attestation collapses `m → 1`, keeping `γ` low (≈$0.05–$2.00 for bot defense) while remaining secure.

**Consequence:** personhood is a **priced dial, not a boolean.** Each verifier sets `k` and stake to clear its own β. **Any system returning "human: true" without a price attached is misrepresenting a quantity.**

---

## 4. Measured performance (real hardware — Samsung Galaxy A12, Helio P35, 8×A53, 3.75 GB, Android 12, Chrome 152)

### 4.1 Memory — resolved, not a constraint

| metric | value |
|---|--:|
| Peak prover RSS (kernel VmHWM) | **361 MB** baseline / **379 MB** under 900 MB ballast |
| Share of device RAM | **~10%** |
| Tab survived under load | **Yes** (20/20 runs, no OOM, no lowmemorykiller) |

The `wasmPeakMB: 2047.9` figure sometimes reported is **reserved address space**, of which ~18% is committed. Reserved ≠ resident. *(Note: in-page `measureUserAgentSpecificMemory` reports ~21 MB — it misses worker-thread WASM and must not be used.)*

`Open`: the formal memory gate specified a ≤3 GB device; the A12 is 3.75 GB. Memory is very likely fine but the gate is technically open.

### 4.2 Proving time — the deployment-defining measurement

Prove-only, same zkey/witness, proofs byte-verified equivalent across all engines:

| engine | cold | warm median | install |
|---|--:|--:|---|
| snarkjs (browser, deployed today) | 5,187 ms | 3,374 ms | none |
| C++→WASM (rapidsnark compiled) | 3,071 ms | 2,467 ms | none |
| **rapidsnark native** | **510 ms** | **477 ms** | app/SDK |

End-to-end (witness-calc + prove) adds ~1,164 ms warm / ~1,592 ms cold in-browser.

**The optimization search is closed.** Four paths tested, each failed for a measured reason:
- Browser levers: threading already on (2.51× measured), COOP/COEP set, `crossOriginIsolated` true, snarkjs ships no SIMD build → **no unclaimed speedup**
- C++→WASM bridge: **5.17× native** → gate failed
- Field assembly: **ruled out** — the WASM/native ratio is flat ~4.86–5.33× at *every* thread count, so the gap is codegen/runtime, not field arithmetic. Thread-sync overhead would grow with thread count; it does not. **Writing WASM-SIMD field assembly would target the wrong layer.**
- Rust/arkworks-WASM: `ark-ff` has assembly only for x86_64+BMI2+ADX; wasm32 uses the *same* portable scalar CIOS as rapidsnark's generic path, lowering through the same LLVM backend → same layer, ~1.3× best case

**The ~5× is a property of today's WASM toolchain, not of this code.** It narrows for free as LLVM codegen, relaxed SIMD, and Memory64 mature; the shared C++ engine picks that up on recompile with no assembly layer to re-audit.

### 4.3 The deployment matrix (`Measured`, and it is the honest product)

| device class | zero-install browser | native SDK |
|---|---|---|
| Entry-level (A12-class, ~$110) | ~4.7 s cold end-to-end (C++→WASM) / ~6.8 s (snarkjs) | **~0.5 s — GO** |
| Mid-range | ~2–4 s | GO |
| Flagship / desktop | ~0.7 s | GO |

**Identical circuit, zkey, nullifier, public signals, and privacy across every cell.** The split is a deployment choice, not a protocol fork.

**Stated target (revised deliberately and on the record):** ≤2 s on mid-range; ≤5 s cold on entry-level, **proven once per `epoch_action`, not per login**. The original 2 s bar assumed per-login proving; with `epoch_action`-scoped nullifiers and RP-side caching, one proof covers a whole rate-limit window. A deployment that wants infrequent proving sets a long `epoch_action`; one that wants tight rate-limiting sets a short one and re-proves that often or uses the native prover. Before the split these were the same knob. Deployments that prove per-login on entry-level devices should use the native SDK.

---

## 5. What is NOT protected (read this section)

- **`N` is personal data.** A pseudonymous identifier under GDPR. The verifier learns nothing else — no name, no `C`, no device ID — but `N` is not anonymous.
- **`N` is scoped to `epoch_action`, not an account key.** It is a per-window *action token*. An RP using `sub` as an account primary key must change that assumption. Persistent pseudonymous accounts would require a second epoch-independent pairwise identifier (~255 constraints; **not built**).
- **Trust is not zero.** The honest claim is: **"no *single* trusted party, given a 1-of-N-honest publication medium."** The 1-of-N clause is now an **enforced client-side check**, not a stated assumption: before proving and before accepting, the client fetches the hash-chained head `head_e = Poseidon(head_{e-1}, root_e, e)` from `N` independent sources, classifies each as agree / lag-on-chain (tolerated within `w`) / disagree, and **fails closed** on any disagreement or below quorum (default 2-of-3). This raises the adversary's bar from "control the client's one root source" to "control every source it queries, at once and consistently"; it does **not** defeat a full eclipse (still detectable post-hoc only — see §6, N6). Independence is normative: the `N` sources **MUST** differ in operator, network path, and ideally trust root; three endpoints on one operator's infrastructure are **one source with three URLs**. A single bulletin-board publisher **is** a trusted (if publicly accountable) party and must be disclosed as such. **"Zero trusted parties" is explicitly retracted.**
- **Bulk-revocation liveness.** Revoking a compromised attester rebuilds the tree without its leaves (§4/Gate 6). Between the rebuild being published and a given client's next refresh, that client cannot prove — its cached witness no longer hashes to the current root. An attester compromise therefore causes a **refresh-window interruption for the whole population**. A liveness cost, not a security one; the price of bulk revocation without a per-user query.
- **Timing correlation.** Unlinkability holds per-proof, not against traffic analysis. Witness refresh **MUST** run on a schedule independent of proving; download sizes **MUST** be padded. This is normative, not advisory.
- **Attester collusion.** `k` colluding independent attesters can mint fakes. Mitigated by `D` across organizations and jurisdictions; a sociological problem, not fully solvable.
- **Credential rental/coercion.** Anonymous credentials are economically resistant to rental (unobservable oversubscription, unenforceable contracts, free rotation) but not *impossible* to rent. For bot-defense this is acceptable — a rented credential still consumes one real human's action budget. **For coordinated-inauthentic-behavior defense it is weaker**: an attacker renting from `P` humans obtains `P` coordinated genuine actions, bypassing `γ`. Security there additionally requires the rental market to be illiquid. **Sell human-presence gating first; coordinated-behavior defense carries this caveat.**
- **State-scale adversaries.** Every economic bound assumes a solvency-constrained attacker.
- **Not post-quantum.** BN254/Groth16. Crypto-agility path exists; migration follows the ecosystem.
- **Trusted setup.** Groth16 requires a per-circuit setup. A compromised setup breaks *soundness* (not privacy). Production requires a public multi-party ceremony or migration to a transparent-setup system.

---

## 6. Gap register — what gates production

**Hard gates (no production deployment until closed; all are fundable external work):**

| # | Gate | Why it blocks | Status | Path to close |
|---|---|---|---|---|
| 1 | ≥2 independent circuit audits | Under-constrained signals silently break ZK soundness | `Open` — audit-*ready*, not audit-*ed*, and after v1.2 understood as *further* from closure than it looked. Self-audit (`docs/SELF-AUDIT.md`): a linear-time **structural forward-determination walk** (`scripts/forward_determination.mjs`) shows every signal and both public outputs uniquely determined by the inputs except 72 `IsZero` `<--` hints proved to influence no public output — no solver, no `Poseidon` assumption, no linearization bound. Corroborated by a **56-point two-witness search** (its 9 free directions == the 9 hints free at the deployed witness), a **taint proof** of the hints, a **finite-field SMT proof** (cvc5+CoCoALib) that `N`, `y` are determined with every input symbolic, circomspect (clean), a manual footgun pass, and a 27-check adversarial harness. **Picus and cvc5-FF both stall on any circuit with a real `Poseidon`** (packaged upstream). Mutation testing: of 10 injected bugs, one (M1a, a freed nullifier) is a genuine under-constraint; forward-determination detects that bug class structurally (an unconstrained output never enters the determined set). No soundness bug in the deployed circuits; makes an external audit cheaper and better targeted; not independent review, and a determination proof is one failure mode an audit examines, not all. |
| 2 | GDPR right-to-erasure legal memo | Append-only tree vs. deletion; blocks EU deployment | `Open` | One data-protection counsel engagement. Scoped, fundable, no research content. |
| 3 | Measured p95 + RSS on a ≤3 GB device | Formal memory gate | `Open` (A12 at 3.75 GB is strong evidence, not closure). **Simulated-ceiling evidence added (v1.2):** under a hard cgroup cap with swap disabled the prover completes and verifies down to **336 MB** and is OOM-killed at **320 MB** (`docs/self-audit/mem_ceiling_results.txt`). Simulated on desktop x86; a memory ceiling is not a device. | Acquire one handset with ≤3 GB RAM and re-run the existing on-device harness. Cheap, fast, no new code. |
| 4 | IP indemnification + liability structure | Enterprise contracts require it | `Open` | Standard commercial/legal structuring; follows a design partner. |
| 5 | Trusted-setup ceremony (or transparent migration) | Soundness assumption | `Open, disclosed` — current setup is spike-only. **Coordinator built and tested (v1.2)**: sequential pipeline, `verifyFromInit` + byte-exact extends-head check, hash-chained append-only transcript, beacon finalization; 27 assertions incl. 6 adversarial submissions (`docs/CEREMONY.md`). **Circuit set frozen for v1.2** (`CIRCUIT-FREEZE.md`, cross-checked against `artifacts.lock.json`); **run-book written** (`docs/CEREMONY-RUNBOOK.md`). **Ceremony not run** — needs genuinely independent human contributors; shipped keys stay evaluation-only until it is. | Run the ceremony against the frozen circuits with a pre-announced beacon and contributors independent of each other and the project. Infrastructure exists and is frozen against a target; the remaining step is recruiting independent contributors. |
| 6 | Attester-level revocation mechanism | RLN covers double-use *only*, not attester compromise | `Closed` (v1.1) — **both** paths implemented, measured, tested: see below | — |

**Verified and closed:**
- **Multi-source root consistency (v1.1):** the client cross-checks the hash-chained head across `N` independent sources before proving and before accepting; distinguishes disagreement (attack → fail closed), lag (mirror behind but chain-consistent within `w` → tolerated), and unreachable (below quorum → fail closed; 2-of-3 reachable is the documented minimum). `integration/lib/root_consistency.mjs`, wired into the OP prover and RP verifier; `scripts/test_root_consistency.mjs` 11 assertions, `integration/run.mjs` 13 assertions. Independence of sources is normative (§5). Full eclipse (all `N` sources) remains detectable post-hoc only.
- **Attester-level revocation — both paths (Gate 6, v1.1):** *(a) Individual:* in-circuit non-membership of `C` against a published list of `R` elements in the split circuit; constraint delta measured at exactly `+R` — 4,373 / 4,565 / 5,333 constraints for `R` = 64 / 256 / 1,024 vs. the 4,309 baseline; nPublic `7+R`; prove-time delta +21 / +20 / +123 ms on an i7-9850H. *(b) Bulk:* tombstone rebuild at an `epoch_tree` boundary (revoked leaves → 0, indices not compacted) published through the existing broadcast. **Measured, not estimated:** the rebuild broadcast is incremental — 9 KB to 1.2 MB at 10k–200k occupancy and 1–10 % revocation, ∝ revoked×depth not tree size, 6–39× smaller than full republication (0.35–7 MB); an unaffected client recomputes its witness in 2.4–5.1 ms (vs. the 122 ms month-offline baseline). `scripts/bench_revocation_split.mjs`, `scripts/bench_bulk_rebuild.mjs`, `scripts/test_revocation.mjs` 9 assertions. Liveness cost disclosed (§5, bulk-revocation liveness).
- Reproducible builds: byte-identical artifacts across clean rebuilds; deployed WASM SHA-256 matches audited source. SBOM (CycloneDX, 129 components), pinned toolchain.
- OIDC/VC integration: **drop-in confirmed, 13/13 assertions**, real HTTP + real proofs. `N` maps to a cryptographically-enforced pairwise (sector-scoped) OIDC `sub`; even the OP that generated every proof cannot correlate them. Integration = one `verifyVP()` call (~80 LoC, two constant-time freshness checks) + a `/roots` poll + a `(sub, epoch_action)` dedupe. Three assertions show a tree republish neither resets the rate limit nor rotates `sub`; the last three run the multi-source root-consistency check end to end (forged mirror → `502`, restored → `200`, below quorum → `502`). **No custom protocol.**
- Witness maintenance: query-free refresh implemented and load-tested. Broadcast 4.7 KB per `epoch_tree` at 1k enrollments, 447 KB at 100k. Month-offline catch-up: 13.1 MB, 122 ms recompute, **zero upstream per-user calls.**
- Cryptographic equivalence across all three prover engines (snarkjs / C++→WASM re-verified on the split circuit; rapidsnark native validated pre-split on the A12, equivalence engine-independent).
- Rate-limit / tree-cadence decoupling (v1.1): `epoch` split into `epoch_action` + `epoch_tree`, zero added constraints, one added public signal. The RLN burn binds to `epoch_action` only; `scripts/test_rln_burn.mjs` recovers `s` from two proofs in one action window that cite different tree roots. Closes the coupled-counter open problem.

**Evidence, not closure — Gate 1 stays `Open`:**
- Self-audit of the constraint system (`docs/SELF-AUDIT.md`, v1.0-v1.2). Methods on the deployed circuits:
  - **forward-determination (structural)** (`scripts/forward_determination.mjs`): a linear-time walk of the constraint graph, no solver, no field reasoning. On an `--O1` build of the deployed circuit every signal is uniquely determined by division except the 72 `IsZero.inv` `<--` hints; **`N` and `y` are determined** with no `Poseidon` assumption and no linearization bound. Detects the `<--` bug class (M1a) structurally — an unconstrained output never enters the determined set. `docs/self-audit/forward_determination.md`. **This is the primary determination result; the three below corroborate.**
  - **two-witness search** (`scripts/two_witness_search.mjs`, tool-independent): no second satisfying witness moves a public output, within a stated bound (Jacobian null space at the honest witness + exact non-linear re-check). Now run at **56 structurally diverse honest witnesses** (`scripts/two_witness_multipoint.mjs`) — null-space dimension a stable 9 at every point, no public-output move at any point; those 9 free directions are exactly the 9 hints free at the deployed witness (cross-check with forward-determination). The `IsZero`-hint freedoms are **proved benign** by a taint analysis (`scripts/taint_iszero.mjs`).
  - **compositional verification** (`scripts/compositional_verify.mjs`): circomlib `Poseidon` is uniquely determining in isolation (Layer A); with every `Poseidon` replaced by a determinism-only relation the 217-constraint circuit is uniquely determined (Layer B). Reduces the whole-circuit question to the single assumption that circomlib `Poseidon` uniquely determines its output.
  - **finite-field SMT** (`scripts/ff_smt_two_witness.mjs`, cvc5 1.3.4 + CoCoALib, `QF_FF`): the two-witness query posed exactly, no linearization. On the residual projection of the abstraction (`N`, `y` and their inputs, `Poseidon` mocked), **all inputs symbolic → UNSAT in 0.13 s**: an unconditional universal proof that `N` and `y` are uniquely determined. On the full 217-constraint abstraction, UNSAT at 6 concrete points (exact, per-point); the fully symbolic query does not terminate, and neither does any query over a real `Poseidon` permutation (same S-box wall as Picus). Layer A stays an assumption, now known beyond both tools. `docs/self-audit/ff_smt.md`.
  - **circomspect** 0.9.0: nothing on the instantiated entrypoints; two explained WARNING classes on the symbolic templates.
  - **Picus** 138b151 (Veridise, SMT): returns *properly constrained*, but **not validated as an oracle for this circuit** — it returns *unknown* on a small Poseidon+RLN circuit with a freed output and does not terminate on the full one (or on the abstraction, or on `Poseidon(8)` alone). Packaged for the maintainers in `docs/self-audit/picus-upstream-report.md`. Its verdict counts only alongside the two-witness search.
  - **27-check adversarial witness harness** (`scripts/test_soundness_adversarial.mjs`, in `npm test`), including a null-space-directed Layer C (`scripts/nullspace_harness.mjs`) that catches the coordinated multi-signal under-constraint the old signal-at-a-time layer missed.
  Mutation testing (`scripts/mutation_test.mjs`, `docs/self-audit/mutation_table.md`): 10 injected bugs. Filtered to genuine signal-level under-constraints by two-witness search, the denominator is **1** (M1a, a freed nullifier — under-constrained and exploitable; circomspect catches it syntactically, the old harness layer missed it, the null-space-directed layer catches it, Picus gives no verdict). The other 9 are equivalent mutants, wrong-but-deterministic functions, or input-set widenings. **No soundness bug in the deployed circuits.** Unique determination is one soundness property; it does not establish that the circuit computes the intended function (nullifier correctness, RLN burn semantics, logic errors in *what* is constrained), which is what an external audit additionally checks. This work makes an audit faster and better-targeted; it does not predict its outcome, is not an independent audit, and does not close Gate 1.

---

## 7. Governance and adoption posture

**Structure.** Neutral standards foundation (spec, reference implementation, conformance criteria, mark governance) legally distinct from any commercial entity. **The foundation's genuine independence is the adoption asset** — big tech adopts neutral standards far more readily than one company's protocol.

**License.** Apache-2.0 + patent grant, committed irrevocably. No BSL/SSPL, no future relicense. (Procurement now actively screens for relicense risk.)

**No token.** Attester staking, if used, is bonded collateral — not a token. A token converts this into a securities-law project in every jurisdiction and is a procurement blocker.

**Standards posture — attester-of-attesters.** Government eID (eIDAS 2.0/EUDI), WebAuthn/Passkeys, and platform attestation are consumed as *optional attester categories*, never as roots and never as requirements. This makes the protocol **complementary** to state and platform identity rather than competing — which is simultaneously the adoption strategy and the anti-displacement strategy.

**The structural anti-capture property.** The diversity predicate `D` requires attestations from *independent* organizations and jurisdictions. **A single vendor cannot satisfy `D` alone — its own attesters are not independent of each other.** Any single-company fork must therefore either include external attesters (participating in a network it does not control) or drop `D` (making its variant cryptographically weaker, demonstrably). **The security rule itself penalizes centralized capture.** This is a property of the design, not a marketing claim, and it is the strongest argument for the neutral standard over any proprietary variant.

---

## 8. Falsification criteria (stated in advance)

The protocol should be considered refuted if:
1. Credentials trade on an open market at a stable price for more than one quarter → economic non-transferability has failed.
2. Fewer than 3–5 genuinely independent attesters exist in a target jurisdiction → `D` is theatre.
3. Measured β for a target application exceeds the `γ` honest users tolerate → securing it prices out real humans.
4. A circuit audit finds an under-constrained signal permitting forged proofs.
5. No platform adopts even a zero-risk shadow-mode evaluation within 12 months → the value proposition is wrong regardless of the cryptography.

---

## 9. Honest status

**What exists:** a measured, working, privately-proving personhood system with reproducible builds, drop-in OIDC/VC integration, query-free witness maintenance, a closed prover-optimization search, and a documented deployment matrix.

**What does not exist:** independent review, an audit, a production deployment, a design partner, a measured real-world β, and closure on the five remaining hard gates (Gate 6, attester-level revocation, closed in v1.1).

**The honest grade: a complete, measured, unreviewed engineering system with a candidate security property.** Not a validated standard — validation is conferred by adversaries who fail to break it and adopters who build on it, and neither has yet occurred. Every remaining hard gate in §6 is fundable work that follows a design partner. **The single action that unlocks them is one platform running shadow-mode.** There is no remaining cryptography on the critical path.
