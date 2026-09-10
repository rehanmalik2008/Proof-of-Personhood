# Limits of Proof-of-Personhood: Three Impossibility Results and an Equilibrium

**Draft — theory companion to *Proof of Personhood without a Registry* (Paper 1).**
Paper 1 is the protocol: measured, engineering-focused. This paper is the theory
that grew out of it and no longer fits inside it. Every result is labelled
**Theorem** (rigorous given a stated model), **Grounding argument** (a physical
thesis plus a resource bound, not a proof), **Conjecture**, or **Construction**.
Every simulation-derived number is cited to the script that produced it. Every
retraction is in §7 and is not hidden.

Full proofs, models, and per-result falsification criteria are in the source
documents under `docs/theory/`; `docs/theory/THEORY-INDEX.md` is the authoritative map.
This paper states the results and the connective structure.

---

## Abstract

We give three impossibility results for digital-only proof-of-personhood and one
economic characterization of the attester-based alternative.

**(1) Reduction (Theorem 1).** A digital-only, correct personhood protocol that
resists a machine adversary *is* a human–machine distinguisher. Zero-attester
personhood therefore exists only if a *robust* such distinguisher exists
(Corollary 1), for which none is known and — we argue from the physical
Church–Turing thesis (Theorem 3, a grounding argument) — none can exist in
principle.

**(2) Asymmetry (Theorem 2).** With no trusted institution, the honest cost of
one identity equals the attacker's per-identity cost. This yields a **trilemma**:
institution-free, accessible, Sybil-resistant — at most two. All 18 surveyed
proof-of-personhood systems occupy one corner; none occupies all three.

**(3) Attribution bottleneck (Theorem 12).** Every mechanism by which a briber
secures attester loyalty — trigger strategies, reputation ledgers, targeted
punishment — requires attributable observation of an attester's reporting
decision. Anonymous unattributable reporting denies all of them at once.

**Economics (Theorem 4).** Under portfolio-wide revocation on detection, the
attacker's optimal Sybil batch is `N* ≈ 1/q` where `q` is the per-fraudulent-
attestation detection hazard, and the security condition is
`k(S+V) ≥ βmE/q` — linear in `k`, inverse in `q`, independent of attacker
capital. `q` is the dominant parameter and is unmeasured for any deployment.

Mechanism-design results (Theorems 5–11) treat grinding, receipt-freeness,
revocation-privacy, and loyalty bonds. Simulation establishes the numbers.

---

## 1. Model and terms

An **entity** interacts with an enrolment protocol only through a commodity
device (forced by "no biometric sensor" + "no hardware attestation"). A protocol
is **digital-only** if every verifier input is a bit-string and accept/reject is
a function of those bits and public randomness. A protocol has **no trusted
institution** if no party contributes a message derived from out-of-band
knowledge of the enrolling entity. `c_H` is the minimum honest cost of one
credential; `c_A(N)` the minimum attacker cost of `N`; `θ = β·m·E` the deterrence
price (attacker value per fake `β`, monetisable contexts `m`, epochs alive `E`).
A mechanism is **accessible** iff `c_H ≪ θ`, **Sybil-resistant** iff
`c_A := inf_{N≥2} c_A(N)/N ≥ θ`.

---

## Part I — Impossibility

### 2. The reduction

> **Theorem 1 (Reduction).** Let `P` be digital-only, correct
> (`Pr[accept | honest] ≥ 1−negl`), and satisfy uniqueness against a machine
> adversary with no human participant. Then the enrolment predicate
> `D := P_acc(·, ρ)` is a human–machine distinguisher with advantage `1−negl`.
> The statement holds even against a computationally unbounded adversary.
> *(Proof: REDUCTION §2.2.)*

The proof turns on a **distributional**, not computational, separation: a
no-human adversary running the honest enrolment algorithm `N` times produces `N`
transcripts each drawn from the *identical* honest distribution, and no bit
predicate distinguishes a sample of a distribution from another sample of it.
Unbounded compute does not manufacture a sample from a distribution one cannot
query.

> **Corollary 1.** Zero-attester personhood (no institution, strict uniqueness,
> no biometric, no attestation) exists only if a *robust* human–machine
> distinguisher exists — one whose advantage does not vanish as machine
> capability grows.

> **Corollary 2 (Exhaustiveness).** The only escapes from Theorem 1 are
> (i) a non-digital sensor bound to the body, (ii) a trusted institution,
> (iii) replacing "≤ 1 per human" with "cost ≥ c per identity". Requirements
> 1, 2, 3, 5 of the personhood problem close all three. *(REDUCTION §2.3.)*

### 3. The asymmetry theorem and the trilemma

> **Theorem 2 (Asymmetry).** If `P` has no trusted institution, then
> `c_A(N) = N·c_H` for every `N`; hence `c_A = c_H`. If `P` is also
> Sybil-resistant (`c_A ≥ θ`) it is not accessible. *(TRILEMMA §2.)*

Proof idea: an adversary seeking `N` credentials runs the honest algorithm `N`
times; each attempt is statistically identical to a fresh honest enrolment, so
the protocol cannot price it differently without a predicate separating "the
adversary's i-th" from "a new entity's first" — which is out-of-band entity
knowledge, i.e. an institution. No per-entity state without an institution ⇒ no
economies of scale ⇒ `c_A(N) = N·c_H`.

> **The Trilemma.** No mechanism is simultaneously **institution-free**,
> **accessible**, and **Sybil-resistant**. Any two are achievable.

| corner | systems |
|---|---|
| institution-free + Sybil-resistant (not accessible) | Bitcoin PoW; VDF-chain minting |
| accessible + Sybil-resistant (not institution-free) | attester models (incl. this project); biometric registries |
| institution-free + accessible (not Sybil-resistant) | open signup; plain CAPTCHA; on-chain ML Sybil scoring |

**Corollary 2.1.** An attester *is* a purchased asymmetry — the economic content
of `k`-of-`n` attestation is the right to charge honest users less than
attackers. **Corollary 2.2.** "Stake-linked personhood is plutocratic" is not a
bug in one construction; it is what institution-free Sybil resistance costs
(Theorem 2 in a specific instance).

**Unification (Theorem 2 ⇒ the trilemma's escapes = Corollary 2's escapes).** An
escape needs asymmetric per-identity cost with no institution and no sensor,
which needs a digital "same-entity" linker — and such a linker is at least as
strong as a robust human–machine distinguisher (an honest human enrols once; any
entity emitting ≥ 2 linkable enrolments is a farm). So sensor / institution /
expense is the whole design space. *(TRILEMMA §5.)*

### 4. Grounding: why no robust distinguisher

> **Theorem 3 (Algorithmic ignorance) — Grounding argument, not a proof.**
> A challenge a human solves in `T_H ≈ 200 ms` on `E_H ≈ 4 J` has, under the
> physical Church–Turing thesis, an algorithm with resources polynomial in
> `(T_H, E_H)`. So CAPTCHA-class security rests on *ignorance of a
> known-to-be-cheap algorithm*, not on a complexity barrier. Machine learning is
> a general method for finding such algorithms — which is why the failures have
> been systematic. *(TRILEMMA §8.)*

Caveats, stated: physical Church–Turing is a thesis; brain-energy estimates are
contested; "polynomial" hides constants. Two named residuals: PCT is false
(Penrose–Lucas; no accepted argument), or the polynomial overhead is prohibitive
in a specific domain (the only technically serious one — a quantitative bet the
empirical record has lost every time).

**Self-defeating property.** A deployed learnable challenge emits the labelled
corpus that trains its own solver; security decays in proportion to adoption.
The moving-target counter (re-randomise the target faster than it is learned)
fails: a family complex enough to reset a high-sample-budget learner lacks the
fast-perceptible structure a sub-second human solve needs — the two requirements
pull on the same parameter in opposite directions. *(MOVING-TARGET.)*

**Empirical (EMPIRICAL).** 18 proof-of-personhood systems (BrightID, Proof of
Humanity, Idena, Worldcoin/World ID, Gitcoin Passport, Civic, …) classified into
the trilemma with per-system `c_H`/`c_A` estimates. No counterexample. Social-
graph systems achieve `c_H < c_A` only via bonded vouching (a distributed
institution) and/or a behavioural test (a sensor). Idena — the closest to the
line — rests on a bonded invitation graph and a flip test with a closing
validity window.

---

## Part II — Economics

### 5. The attester-corruption equilibrium

Bribe micro-foundation (kept, verified): corrupting attester `i` is rational iff
the bribe `b_i > p_d·(S_i + V_i)` (stake `S_i`, discounted honest franchise
`V_i`, detection probability `p_d`).

**Correction.** Per-identity attack cost *decreases* in `N`: a bribe is a fixed
cost amortised over unlimited signatures, `γ(N) = kb/N → 0`, and detection
`p_d(N) = 1−(1−q)^N` saturates. The rising-marginal-cost intuition is backwards
(EQ Result 1).

What bounds the attack is **portfolio-wide revocation on detection**:

> **Theorem 4 (Optimal attack size).** With bulk revocation, attacker profit
> `Π(N) = (1−q)^N · N · R − k·b` (with `R = βmE`) is maximised at
> `N* = −1/ln(1−q) ≈ 1/q`, giving max gross revenue `Π_max + kb ≈ e⁻¹ R/q`.
> *(EQ §3.1.)*

> **Corollary 4.1 (Security condition).**
> `k(S+V) ≥ βmE/q` — linear in `k`, inverse in `q`, capital-independent, with
> `S+V` (stake **plus** franchise) as the security budget. With a whistleblower
> bounty `B`: `k(S+V) + 1.58·k·B ≥ βmE/q` — \$1 of bounty ≈ \$1.58 of stake,
> paid only on realized reports. *(EQ §3.2; 3A §2.3.)*

**Result 2 (load-bearing revocation).** Without portfolio-wide revocation,
`Π(N)` loses the `(1−q)^N` factor and is unbounded at any `γ`. A deployment
shipping an individual-revocation list without bulk rebuild has an unbounded
Sybil economy regardless of `γ ≥ βmE` compliance.

**Result 3 (cheapest transversal).** Attester selection is a min-cost transversal
of the diversity predicate `D` (polynomial — no NP-hardness shield). Security is
set by the `k` **cheapest** attesters satisfying `D`; one under-staked attester
in a required category caps the system. Pair `D` with a per-category `S_i+V_i`
floor.

**Result 4 (`q`).** `q` is the dominant parameter (appears inversely) and has
never been estimated for this or any comparable system. `q ≈ 0` without
attestation-correlation monitoring ⇒ required stake → ∞. `q` belongs in the
falsification criteria alongside `β`.

**Bounded tenure.** Limiting attester tenure to `τ` caps amortization at `Rτ`
credentials: `γ(N) = kb/min(N, Rτ) + c·f⁻ᵏ`, floored at `kb/(Rτ)`. Analytic;
re-qualification must be identity-bound (FOLK §2).

---

## Part III — Mechanism design

### 6.1 Grinding (Theorem 5)

If attester assignment is a VRF over enrollee-chosen input and aborting is free,
an attacker re-rolls until an all-corrupt `k`-set appears (`f⁻ᵏ` attempts).

> **Construction (commit-then-cost-then-assign).** Commit a nonce; pay a
> per-attempt VDF cost keyed to the commitment; derive the `k`-assignment from
> `H(commit, y_vdf, beacon)` with `beacon` unbiasable and unknown at commit time.
> A re-roll needs a fresh commitment and a fresh VDF evaluation.

> **Theorem 5 (Grinding asymmetry).** Under this construction with per-attempt
> cost `c`, corrupt fraction `f`, set size `k`: honest enrollee pays `c` once; an
> attacker needing an all-corrupt `k`-set pays `c·f⁻ᵏ` in expectation
> (**machine-hours** — VDFs parallelise across chains). No institution, no
> enrolment discrimination. It is the first **non-amortising** term in `γ(N)`.
> *(3A §1.)*

Cost (3A §1.3, 30 s VDF): at `f=0.1, k=5` ≈ 833 machine-hours per fake; at
`k=3, f=0.2` ≈ 1 machine-hour — grinding protection is meaningful only at `k ≥ 5`
and/or low `f`. **The assignment check must be verified in-circuit** (≈ 6.8k–11.2k
constraints), not by revealing the `k` signer keys, if redundant pre-attestation
(§6.5) is used — otherwise the subset switch after a revocation is observable
(`surplus_attestation_leak.mjs`: AUC ≈ 1 revealed vs 0.5 hidden).

### 6.2 Receipt-freeness (Theorem 6)

> **Theorem 6.** Any knowledge `K` sufficient to justify an attestation is
> sufficient as a Dark-DAO predicate (the attester proves knowledge of `K` and
> of having acted on it). Receipt-freeness and meaningful attestation cannot
> coexist. *(3A §4.)*

Threshold *ring* signatures give signer-set-hiding output plus historical
non-attribution, but lose to a Dark DAO that solicits a *fresh* proof of
capability bound to the attester's registered key. Blocking that needs
coordinator-supplied blinding the attester never learns — a trusted institution
(MACI-class), excluded. The Dark-DAO defence is **economic**, not cryptographic.

### 6.3 Revocation–privacy (Theorems 7, 9, 10)

> **Theorem 7 (Revocation–privacy tension).** Bulk revocation (required by
> Theorem 4) reveals the attester cohort: with `n` attesters, `k` per credential,
> random assignment, `|C| ≈ Nk/n` and the anonymity-set reduction is `≈ n/k`.
> *(3A §3.)*

> **Theorem 9 (Timing lower bound).** Revoked credentials cannot produce accepted
> proofs; non-revoked can. So cohort membership leaks through prover behaviour
> **regardless of the accumulator**. Measured: AUC ≈ 0.93–1.00 for "stopped
> producing proofs" as a cohort detector, every staging cell
> (`staging_correlation_attack.mjs`). **Do not build a batch-indistinguishable
> accumulator** — it addresses a secondary leak.

> **Theorem 10 (Economics–privacy–latency).** Immediate bulk revocation maximises
> economic security and cohort leakage; staged revocation over `T` reduces
> leakage and extends attacker revenue by `T` epochs. No config optimises both.

**Measured mitigation (PRIV).** Uniform randomised staged revocation +
uniform client failure hides ~85–92 % of the cohort at `T ≳ 3·|C|/(ρ_perm N)`
epochs, leaving an 8–15 % identifiable residual; `T = k/(nρ)` is
population-independent. **Correlated staging only delays.** Pairing revocation
with **automatic re-enrollment** moves the *rate*-detection floor `ρ_perm → ρ_gap`,
but a **gap co-timing** channel then binds: `T_stage` floor ~30–90 epochs, net
improvement **~3–10×, not the ~380× first claimed** (`reenrollment_gap.mjs`).

### 6.4 Anonymous reporting (Theorems 8, 11, 12)

> **Theorem 8 (Anonymity defeats trigger strategies).** If reports are anonymous
> and any of the `k` could have filed, the attacker's posterior over the defector
> is uniform over `k`; folk-theorem trigger strategies cannot be constructed.
> **`f`-boundary:** protection scales `(1−f^k)` — for `f → 1` every `k`-set is
> the attacker's and he punishes wholesale. *(FOLK §3.)*

> **Theorem 11 (Bond attribution) — canonical.** A non-attributing bond
> **trigger** exists: collective forfeiture conditioned on the **public
> revocation event** (the inverse of Dark-DAO escrow-on-non-revocation). But no
> non-attributing bond **deters**: (i) the collective trigger forfeits all `k`
> bonds regardless of who filed, so the deterrent decays as `(1−π)^{k−1}` in the
> belief `π` that another of the `k` reports (measured, `bond_trigger.mjs`:
> silence-NE region 60 %→45 %→37 % as `π` 0→0.3→0.5); (ii) the bond is the
> attester's **own capital**, so `P ≲ b` (`P ≲ M·b` if amortised over `M`).
> Hence a bounty **`B > 2b`** makes reporting dominant for every `π` against any
> rationally-posted bond, with `b ≥ p_d(S+V)` computable. The *attacker-held*
> bond is a payment, not a commitment. *(FOLK §4.)*

The amortised bond (`P ≲ M·b`) pushes the required `B` toward `M·b` **only
without cascading detection**; with it (`amortized_bond.mjs`) the bond is forfeit
/ the batch scrutinised regardless of the attester's choice and `B > 2b`
survives.

> **Theorem 12 (Attribution bottleneck) — narrowed.** Trigger strategies,
> out-of-band reputation ledgers, and targeted punishment all require
> attributable observation of an attester's reporting decision — one property to
> deny. **Bond forfeiture is the exception** (it conditions on the public
> revocation event), but is beaten by `B > 2b` (Theorem 11). Anonymous
> unattributable reporting is therefore **the** headline requirement of the
> attester layer. *(FOLK §4.2.)*

> **Result A3 (recovered, bounded).** For `f^k ≪ 1`, anonymous reporting +
> first-reporter bounty `B > 2b` + immunity converts the `k`-set into a leniency
> race that no rationally-posted bond defeats. Load-bearing dependency: cascading
> detection (vs the amortised bond). Residual: `f → 1`.

### 6.5 Redundant pre-attestation and cascading revocation

> **Construction (redundant pre-attestation, `k' > k`).** Collect `k'`
> attestations at enrolment. On revocation of one attester, resubmit immediately
> with the `k' − 1 ≥ k` held in reserve. Re-enrollment delay → one epoch; users
> with surplus have no observable gap. Cost: `k'/k` (≈ 1.67× at `k'=5, k=3`),
> once, at enrolment. *(PRIV §3B.1.)*

**TA-Result 2 (cascading detection).** Redundancy shields the attacker's
portfolio unless revocation **cascades** over the compromised attester's
anomalous co-signers. Correlation monitoring then does *triple* duty: it raises
`q` (Theorem 4), makes redundancy safe, and caps the loyalty bond at `b`
(Theorem 11). It is the load-bearing dependency for all three; it fails if the
attacker rotates which bribed attesters sign (`m ≈ k(N/τ)^{1/k}`).

**Construction (indexed Merkle non-membership).** `O(log R)` revocation
non-membership, transparent setup, no trapdoor: +8,168 constraints at IMT depth
20 (capacity ~1.05 M), constant in `R`, vs `+R` constraints *and* `+R` public
inputs for the brute-force list. Built and tested (`circuits/wedge_nonmembership_imt.circom`,
7/7). Uses a full-field comparison gadget because circomlib `LessThan(≤252)` is
unsound on hash outputs (§8).

---

## 7. Retractions and corrections

Chronological; also in `docs/theory/THEORY-INDEX.md`.

1. **"Zero trusted parties" → "no single trusted party, given 1-of-N-honest
   publication."** Root equivocation is prevented only under 1-of-N honesty
   across the client's root sources; always detectable after the fact. (Predates
   the theory line; Paper 1 §6.)
2. **Problem 3: "needs an `O(1)` accumulator" → `O(log R)` sorted/indexed Merkle
   non-membership suffices** and is built.
3. **Result A3: three revisions.** unconditional leniency race → "conditional, a
   bond `P ≈ B` defeats it" → "restored, no bond can be triggered" → **final:
   recovered bounded, survives iff `B > 2b`**.
4. **Theorem 11: two commits stated opposite headlines** (`4009065` "no
   enforceable bond" vs `85a80a4` "trustless branch withdrawn") on identical
   mechanics. **Canonical:** a non-attributing *trigger* exists; no
   non-attributing bond *deters*; `B > 2b` dominates.
5. **`(1−π)` → `(1−π)^{k−1}`** for the collective-forfeiture deterrent (the
   `(1−π)` form is the `k=2` case), per `bond_trigger.mjs`.
6. **Re-enrollment: `T ≈ 3k/(nρ_gap)` (sub-day), ~380× → `T_stage` floor ~30–90
   epochs, net ~3–10×.** The gap co-timing channel binds; the `ρ_gap`
   substitution removes only the rate-detection channel.
7. **"Build the batch-indistinguishable accumulator" → do not.** Measured AUC ≈ 1
   (Theorem 9).
8. **Theorem 3 is a grounding argument, not a proof** (physical thesis + resource
   bound; two named residuals).

---

## 8. Ecosystem finding: `LessThan` on hash outputs

Independent of the personhood results. circomlib `LessThan(n)` is sound only when
both inputs are `< 2ⁿ`; the precondition is asserted on `n` but never on the
inputs, and is undocumented at the point of use. A stock `LessThan(252)` fed
`a = p − 1, b = 1` produces a **satisfying witness asserting `p − 1 < 1`**.
Measured: **66.9 %** of BN254 field elements (and of sampled Poseidon(1) outputs)
are `≥ 2²⁵²`. At risk: sorted/indexed-Merkle non-membership, commitment range
checks, nullifier ordering — invisible to honest-path testing. Reproducer:
`scripts/repro_lessthan_hash.mjs`. Filed to iden3/circomlib, 0xPARC/zk-bug-tracker
(see `docs/filings/`). Safe patterns: a range-checked 252-bit domain (state the
~126-bit birthday cost), or a full-field 254-bit comparison (`LtField()`,
`docs/DISCOVERY-lessthan-hash-soundness.md`).

---

## 9. Open problems

1. A **robust human–machine distinguisher** (Corollary 1) — none known; Theorem 3
   argues none exists, as a grounding argument.
2. A **robust digital same-entity linker** (Theorem 2's condition) — none known;
   ≥ as hard as (1).
3. **`q`** (detection hazard) and **`w`** (per-attester defection probability) —
   unmeasured for any real deployment.
4. A **threshold scheme with signer-set-hiding output and simulatable share
   transcripts** (Theorem 6) — investigated, none found.
5. An **`O(1)` transparent accumulator** — open in accumulator theory; not needed.
6. **Cascade detection at realistic attacker randomisation** — the load-bearing
   dependency for redundancy safety and the bond cap.

---

## References

Shared with Paper 1 (Douceur IPTPS'02; Nakamoto '08; von Ahn et al. EUROCRYPT'03;
Yu et al. SybilGuard SIGCOMM'06 / SybilLimit S&P'08; Boneh et al. VDF CRYPTO'18;
Wesolowski EUROCRYPT'19; Killourhy–Maxion DSN'09; Searles et al. USENIX Sec'23;
Borge et al. EuroS&PW'17; Aztec indexed Merkle tree note). Per-section citations
in the source documents. Simulation scripts under `scripts/sim/`; the
`LessThan` reproducer at `scripts/repro_lessthan_hash.mjs`.
