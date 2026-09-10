# Theory index — every numbered result, its source, status, and falsification

The theory has ~12 numbered results across ~10 documents with several retractions.
This is the map. **If a document and this index disagree, this index is
authoritative** — fix the document.

Status legend: **proved** (rigorous given stated model) · **grounding argument**
(supported by a physical thesis + resource bound, not a proof) · **conjecture** ·
**measured** (simulation-derived, script cited) · **narrowed** (weaker than first
stated) · **withdrawn**.

Source docs (all under `docs/theory/` after the Task 4 restructure; paths here are
basenames):
`REDUCTION` = REDUCTION-personhood-impossibility.md ·
`TRILEMMA` = THEOREM-asymmetry-trilemma.md ·
`EMPIRICAL` = EMPIRICAL-personhood-systems.md ·
`MOVING-TARGET` = MOVING-TARGET-captcha-analysis.md ·
`EQ` = THEOREM-equilibrium-problem4.md ·
`3A` = THEOREM-three-attacks.md ·
`FOLK` = RESEARCH-folk-theorem-resistance.md ·
`PRIV` = RESEARCH-private-bulk-revocation.md ·
`LESSTHAN` = DISCOVERY-lessthan-hash-soundness.md

---

## Part I — Impossibility

| # | statement (one line) | source | status | falsification | sims |
|---|---|---|---|---|---|
| **Theorem 1** (Reduction) | A digital-only, correct personhood protocol with uniqueness against a machine adversary ⇒ its accept predicate is a human–machine distinguisher with non-negligible (indeed `1−negl`) advantage; holds vs. unbounded adversaries (distributional separation). | REDUCTION §2.2 | **proved** (given the digital-only model, which requirements 3+5 force) | fails if a personhood protocol exists that is digital-only, correct, unique-vs-machine, and whose accept predicate is *not* a distinguisher | — |
| **Corollary 1** | Zero-attester personhood (reqs 1–3, 5) exists only if a *robust* human–machine distinguisher exists. | REDUCTION §2.2 | **proved** (corollary of Thm 1) | a robust distinguisher (advantage bounded away from 0 as machine capability → ∞) | — |
| **Corollary 2** (Exhaustiveness) | The only escapes are: (i) non-digital sensor, (ii) trusted institution, (iii) per-identity expense. Reqs 1, 2, 3, 5 close all three. | REDUCTION §2.3 | **proved** | a fourth escape category | — |
| **Theorem 2** (Asymmetry) | No trusted institution ⇒ `c_A(N) = N·c_H`, i.e. honest per-identity cost = attacker per-identity cost. | TRILEMMA §2 | **proved** (given the no-institution definition); **conditional** on no robust digital same-entity linker (TRILEMMA §5.1 lemma: such a linker ⇒ a robust human–machine distinguisher) | an institution-free mechanism with `c_H ≪ c_A` | — |
| **The Trilemma** | Institution-free / accessible / Sybil-resistant — at most two. | TRILEMMA §3 | **proved** (corollary of Thm 2) | any deployed system in all three corners | — |
| **Corollary 2.1 / 2.2** | An attester *is* a purchased asymmetry; plutocracy is structural, not incidental. | TRILEMMA §2.2–2.3 | **proved** (corollaries) | — | — |
| **Result 2 (unification)** | The Trilemma's escapes = Corollary 2's three escapes (sensor / institution / expense). | TRILEMMA §5 | **proved**, conditional as Thm 2 | a trilemma escape that is none of the three | — |
| **Theorem 3** (Algorithmic ignorance / twenty-watt) | Any challenge a human solves in `T_H ≈ 0.2 s` on `E_H ≈ 4 J` has, under the physical Church–Turing thesis, an algorithm with resources polynomial in `(T_H, E_H)` — so CAPTCHA-class security rests on ignorance of a known-cheap algorithm, not on a complexity barrier. | TRILEMMA §8 | **grounding argument** (PCT is a thesis; brain-energy estimates contested; "polynomial" hides constants) — explicitly *not* a proof | a cognitive challenge with a hardness *argument* (reduction from a standard hard problem), not an empirical validity window | — |
| **Self-defeating property** | A deployed learnable challenge emits the training set that defeats it; security decays with adoption. | TRILEMMA §8.4 | **grounding argument** | a challenge whose solve-instances are not usable training data (moving target) | see MOVING-TARGET |
| **Empirical classification** | All 18 surveyed proof-of-personhood systems sit in one trilemma corner; none in all three; social-graph systems achieve low `c_H` only via a distributed institution and/or a sensor. | EMPIRICAL | **survey** (deployed-system behaviour, cited) | a system genuinely in all three corners | — |
| **Moving-target analysis** | No re-randomised challenge outpaces learning: human-fast-solvability and drift-unlearnability are governed by the same parameter (exploitable structure per instance) in opposite directions. | MOVING-TARGET | **grounding argument** + survey; no counterexample found | a challenge family with a formal human-solvable-but-drift-unlearnable separation | — |

## Part II — Economics

| # | statement | source | status | falsification | sims |
|---|---|---|---|---|---|
| **Theorem 4** (Optimal attack size) | Under portfolio-wide (bulk) revocation on detection, attacker profit `Π(N) = (1−q)^N N R − kb` is maximised at `N* = −1/ln(1−q) ≈ 1/q`, with max gross revenue `≈ e⁻¹ R/q`. | EQ §3.1 | **proved** (given the model; the bribe fixed-point is self-consistent, EQ §3.1) | detection hazard not independent per attestation (aggregate-trigger monitor ⇒ different `p_d(N)` and `N*`) | — |
| **Corollary 4.1** (Security condition) | `k(S+V) ≥ βmE/q` — linear in `k`, inverse in `q`, capital-independent. With the whistleblower bounty: `k(S+V) + 1.58·k·B ≥ βmE/q` (\$1 bounty ≈ \$1.58 stake). | EQ §3.2, 3A §2.3 | **proved** (corollary) | bulk revocation incomplete (any surviving credential ⇒ unbounded `Π` term) | `reporting_race.mjs` (bounty term) |
| **EQ Result 1** | Per-identity attack cost *decreases* in `N` under fixed-cost corruption (`γ(N) = kb/N`); detection `p_d(N) = 1−(1−q)^N` saturates. The intuitive rising-marginal-cost story is backwards. | EQ §2 | **proved** | — | — |
| **EQ Result 2** | Bulk revocation is load-bearing: without portfolio-wide revocation, `Π(N)` is unbounded at any `γ`. A deployment shipping the R-list without bulk rebuild has an unbounded Sybil economy. | EQ §3 | **proved** | — | — |
| **EQ Result 3** | Security is set by the **cheapest `D`-transversal** of the diversity predicate, not the average attester (min-cost transversal, polynomial — no NP-hardness shield). | EQ §5 | **proved** | a natural `D` whose satisfaction is NP-hard *and* binds at realistic `k` | — |
| **EQ Result 4** | `q` is the dominant unmeasured parameter (appears inversely). `q ≈ 0` without correlation monitoring ⇒ required stake → ∞. | EQ §7 | **argued** | `q` cannot be estimated to an order of magnitude for any deployment | — |
| **Bounded tenure (A2)** | Limiting attester tenure to `τ` caps bribe amortization at `Rτ` credentials: `γ(N) = kb/min(N, Rτ) + c·f⁻ᵏ`, floored at `kb/(Rτ)`. | FOLK §2 | **proved** (analytic; not simulated) | attesters re-enter under fresh identities after `τ` (re-qualification must be identity-bound) | — |

## Part III — Mechanism design

| # | statement | source | status | falsification | sims |
|---|---|---|---|---|---|
| **Theorem 5** (Grinding asymmetry) | Under commit-then-cost-then-assign with per-attempt cost `c`, corrupt fraction `f`, set size `k`: honest enrollee pays `c`, an attacker needing an all-corrupt `k`-set pays `c·f⁻ᵏ` (machine-hours) — no institution, no enrolment discrimination. First non-amortising term in `γ(N)`. | 3A §1 | **proved** (given an unbiasable beacon + commit-before-beacon + no-free-re-roll) | attacker biases the beacon, or re-derives an assignment without re-paying `c` | — (cost table computed in 3A §1.3) |
| **Theorem 6** (Receipt-freeness incompatible with attestation) | Any knowledge `K` sufficient to justify an attestation is sufficient as a Dark-DAO predicate ⇒ receipt-freeness and meaningful attestation cannot coexist. | 3A §4 | **proved** (structural); threshold-ring near-miss investigated and fails against fresh-proof solicitation (3A §4.3) | a threshold scheme with signer-set-hiding output *and* simulatable share transcripts against fresh-proof solicitation | — |
| **Theorem 7** (Revocation–privacy tension) | Bulk revocation (required by Thm 4) reveals the attester cohort; `|C| ≈ Nk/n`, anonymity-set reduction `≈ n/k`. | 3A §3 | **proved** (quantification measured below) | cohort sizes not `≈ Nk/n` under non-uniform attester load | `staging_correlation_attack.mjs` |
| **Theorem 8** (Anonymity defeats trigger strategies) | Anonymous, unattributable reporting ⇒ the attacker's posterior over the defector is uniform over `k`; folk-theorem trigger strategies cannot be constructed. **`f`-boundary**: protection scales `(1−f^k)`. | FOLK §3 | **proved**, with the `f→1` boundary | reports can be de-anonymised (timing; revocation record ↔ signing history — see Thm 7); or `f^k` not `≪ 1` | `reporting_race.mjs` (`f>1/k` slice) |
| **Theorem 9** (Revocation timing lower bound) | Revoked credentials can't produce accepted proofs and non-revoked can ⇒ cohort membership leaks through prover behaviour regardless of the accumulator. | PRIV §1 | **proved**; **measured** AUC ≈ 0.93–1.00 in every staging cell | a construction where revoked users keep producing accepted-then-downstream-rejected proofs (relocates the observer) | `staging_correlation_attack.mjs` |
| **Theorem 10** (Economics–privacy–latency tension) | Immediate bulk revocation maximises economic security (Thm 4) and cohort leakage (Thm 7); staged revocation over `T` reduces leakage and extends attacker revenue by `T` epochs. No config optimises both. | 3A §3, PRIV §4 | **proved**; **quantified** — with re-enrollment the `T_stage` floor is ~30–90 epochs | delayed revocation does not extend attacker revenue proportionally (fakes caught downstream during staging) | `reenrollment_gap.mjs` |
| **Theorem 11** (Bond attribution) — CANONICAL | A non-attributing bond **trigger** exists (collective forfeiture conditioned on the public revocation event, the inverse of Dark-DAO escrow-on-non-revocation). But no non-attributing bond **deters**: the collective trigger's deterrent decays as `(1−π)^{k−1}` in the belief `π` that another of the `k` reports (measured), and `P ≲ b` because the bond is the attester's own capital — so **`B > 2b`** makes reporting dominant for every `π`. Attacker-held bond = a payment, not a commitment. | FOLK §4 | **narrowed** — see retractions | a bond trigger deterring without attribution and without the `(1−π)^{k−1}` decay; or attesters rationally posting `P ≫ b` (amortised bond — defeated by cascading detection, `amortized_bond.mjs`) | `bond_trigger.mjs`, `amortized_bond.mjs` |
| **Theorem 12** (Attribution bottleneck) | Trigger strategies, out-of-band reputation ledgers, and targeted punishment all require attributable observation of an attester's reporting decision — one property to deny. **Bond forfeiture is the exception** (conditions on the public revocation event), but is beaten by `B > 2b` (Thm 11). | FOLK §4.2 | **narrowed** (bond-forfeiture exception added) | any of {trigger strategy, reputation ledger, targeted punishment} operating on a non-attributable signal | — |
| **Result A1** | Assignment rotation does not one-shot the bribery game — the repeated relationship is attacker↔attester, untouched by rotation. | FOLK §1 | **proved** (analytic) | — | — |
| **Result A3** (recovered, bounded) | For `f^k ≪ 1`, anonymous reporting + first-reporter bounty `B > 2b` + immunity converts the `k`-set into a leniency race that no rationally-posted bond defeats. | FOLK §4 | **measured**; conditional on cascading detection (vs the amortised bond) | `f^k` not `≪ 1`; bounty un-fundable at `B > 2b` | `reporting_race.mjs`, `bond_trigger.mjs`, `amortized_bond.mjs` |
| **Result B1** | The binding revocation-privacy leak is the login-failure timing channel, not the accumulator. | PRIV §1 | **proved**; **measured** (AUC ≈ 1) | — | `staging_correlation_attack.mjs` |
| **Result B2** (downgraded) | Cohort privacy via natural churn: uniform randomised staging at ≈ 3× the naive `|C|/(ρ_perm N)` depth + uniform client failure hides ~85–92 % of the cohort, 8–15 % residual. Feasible for `n ≥ ~1,000`; small `n` needs re-enrollment. | PRIV §3 | **measured, downgraded** | staged revocations correlated in any observable way; or non-uniform client failure | `churn_privacy_ratio.mjs`, `staging_correlation_attack.mjs` |
| **Result B2-Result 2** (population independence) | Staging depth `T = k/(nρ)` is independent of `N` (`\|C\| = Nk/n` and `ρN` both scale with `N`). | PRIV §3A.1 | **proved** | — | `churn_privacy_ratio.mjs` |
| **Result B2-Result 3** (re-enrollment) | Automatic re-enrollment moves the *rate*-detection floor `ρ_perm → ρ_gap`, but a **gap co-timing** channel then binds, imposing a `T_stage` floor of ~30–90 epochs. Net staging improvement **~3–10×, not 380×**. Reopens small `n`. | PRIV §3A.2 | **measured** — see retractions | re-enrollment completion cannot be spread (synchronized ⇒ recovered, recall 0.36–0.68); or re-enrollment carries its own on-chain signature | `reenrollment_gap.mjs` |
| **TA-Result 1** (Redundant pre-attestation) | Collecting `k' > k` attestations at enrolment collapses the re-enrollment delay to one epoch; users with surplus have no gap at all. Cost `k'/k` (≈ 1.67× at `k'=5, k=3`). | PRIV §3B.1 | **construction**; **measured** safe-iff-subset-hidden | the active `k`-subset is observable in a Phase-2 proof (AUC ≈ 1 if revealed) ⇒ grinding-fix assignment check must stay in-circuit | `surplus_attestation_leak.mjs` |
| **TA-Result 2** (Cascading detection) | Redundancy + bulk revocation are compatible only under **cascading correlation-driven detection** (revoke `A` ⇒ scrutinise its anomalous co-signers). Correlation monitoring does triple duty: raises `q`, makes redundancy safe, caps the loyalty bond at `b`. | PRIV §3B.2, FOLK §4.4 | **argued**; **measured** (bond cap) | cascade detection fails at realistic attacker randomisation (`m ≈ k(N/τ)^{1/k}` — attacker rotates which bribed attesters sign) | `amortized_bond.mjs` |

## Constructions

| name | what it does | source | status |
|---|---|---|---|
| **Commit-then-cost-then-assign** | grinding resistance: commit a nonce, pay a per-attempt VDF cost, derive the `k`-assignment from `H(commit, beacon)` | 3A §1.2 | spec'd; **assignment check must be in-circuit** if redundant pre-attestation is used (TA-Result 1) |
| **Indexed Merkle non-membership** | `O(log R)` revocation non-membership, transparent setup; +8,168 constraints at IMT depth 20 (capacity ~1.05M), constant in `R` | 3A Phase 1 / built: `circuits/wedge_nonmembership_imt.circom` | **built + tested** (7/7), not frozen |
| **VDF-chain minting (Problem 2′)** | institution-free per-identity physical cost; `N` identities ⇒ `⌈N/σ⌉` machines | REDUCTION §3 | spec'd, not built; the hybrid floor is a *gated backstop*, not a co-equal path |
| **Redundant pre-attestation** | `k' > k` at enrolment; survive one attester revocation with no re-enrollment latency | PRIV §3B | **construction**, measured |
| **Cascading revocation** | revoke `A` ⇒ auto-scrutinise anomalous co-signers; the driver of `q` | PRIV §3B.2, inalienability-and-detection.md | spec'd |
| **Full-field comparison `LtField()`** | sound `<` for all of `[0,p)`; replaces circomlib `LessThan(≤252)` on hash outputs | LESSTHAN | **built**, in the IMT circuit |

---

## Retractions and corrections (visible, chronological)

| what was said | corrected to | where |
|---|---|---|
| "zero trusted parties" | "no single trusted party, given a 1-of-N-honest publication medium" — root equivocation prevented only under 1-of-N honesty; detectable after the fact always | paper §6; predates the theory line |
| Problem 3 needs an `O(1)` accumulator, "Low tractability" | `O(log R)` sorted/indexed Merkle non-membership is sufficient and built | 3A Phase 1 |
| **A3**: "anonymous reporting + bounty ⇒ leniency race" (unconditional) | → downgraded to "conditional, a bond `P ≈ B` defeats it" → restored "no bond can be triggered" → **final: recovered bounded, survives iff `B > 2b`** | FOLK §4 (three revisions) |
| **Theorem 11**: "a trustless bond cannot be triggered under anonymous reporting" (commit `4009065`) vs "trustless branch withdrawn, a trigger exists" (commit `85a80a4`) | **canonical**: a non-attributing *trigger* exists (collective, revocation-conditioned); no non-attributing bond *deters* (`(1−π)^{k−1}` decay; `P ≲ b`); `B > 2b` dominates | FOLK §4.0, THEORY-INDEX Part III |
| author's `(1−π)` deterrent | `(1−π)^{k−1}` (per-attester belief; the `(1−π)` form is the `k=2` case), measured by `bond_trigger.mjs` | FOLK §4.0 |
| re-enrollment: `T ≈ 3k/(nρ_gap)` (sub-day), ~380× improvement | `T_stage` floor ~30–90 epochs from the gap co-timing channel; **net ~3–10×, not 380×** | PRIV §3A.2 |
| build the batch-indistinguishable accumulator | **do not** — measured AUC ≈ 1 (Theorem 9); it addresses a secondary leak while the timing channel is binding | PRIV §1, §6 |
| Theorem 3 as a proof | Theorem 3 is a **grounding argument** (physical thesis + resource bound), not a proof; two named residuals (PCT false; prohibitive polynomial overhead) | TRILEMMA §8, paper §4.4 |

---

## Simulation scripts → what each measured

| script | measures | headline |
|---|---|---|
| `scripts/sim/churn_privacy_ratio.mjs` | `ρ_perm`, `ρ_gap`, staging depth `|C|/(ρN)` | `ρ_perm ≈ 7.9e-4/day`; structural `T = k/(nρ)`, `N`-independent; real per-member privacy needs ~10× the naive depth |
| `scripts/sim/staging_correlation_attack.mjs` | cohort recovery vs staging mode / `T` / horizon | AUC ≈ 1 always (Thm 9); uniform staging with `\|C\|/T` below the attrition floor hides the bulk; correlated staging only delays; 8–15 % residual |
| `scripts/sim/reporting_race.mjs` | `k`-attester leniency game equilibrium | all-silent is a NE iff `δb + P ≥ B + p_d0(S+V)`, `k`-independent; `f→1` scales `(1−f^k)` |
| `scripts/sim/bond_trigger.mjs` | bond-trigger existence + deterrence | non-attributing trigger exists (collective); deterrent `(1−π)^{k−1}`; silence-NE region 60 %→37 % as `π` 0→0.5 |
| `scripts/sim/reenrollment_gap.mjs` | re-enrolled cohort vs a gap-length + gap-co-timing observer | wide staging (`T_stage ≥ 90`) hides for `D_mean ≤ 30 d`; tight staging fails; net ~3–10× |
| `scripts/sim/amortized_bond.mjs` | does an amortised bond break `B > 2b`? | yes naively (`B_req ~ M·b`); no with cascading detection (`casc=0.9` ⇒ `B_req ~ 0`) |
| `scripts/sim/surplus_attestation_leak.mjs` | is the `k'>k` surplus / subset switch observable? | invisible iff Phase-2 hides the `k`-subset (AUC 0.5); AUC ≈ 1 if revealed |
| `scripts/repro_lessthan_hash.mjs` | circomlib `LessThan(252)` on hash outputs | certifies `p−1 < 1` with a satisfying witness; 66.9 % of Poseidon outputs `≥ 2²⁵²` |

---

## Open problems

1. **Robust human–machine distinguisher** (Corollary 1) — none known; Theorem 3
   argues none exists in principle, as a grounding argument.
2. **Robust digital same-entity linker** (Theorem 2 condition) — none known; at
   least as hard as (1).
3. **`q` and `w`** unmeasured for any real deployment (EQ Result 4; FOLK §6).
4. **Threshold scheme with signer-set-hiding + simulatable share transcripts**
   (Theorem 6) — investigated, none found; a counterexample reopens the Dark-DAO
   defence.
5. **`O(1)` transparent accumulator** — genuinely open in accumulator theory; the
   system does not need it (`O(log R)` suffices).
6. **Cascade detection at realistic attacker randomisation** (`m ≈ k(N/τ)^{1/k}`)
   — the load-bearing dependency for redundancy safety and the bond cap.
7. **Trusted-setup ceremony** with ≥5 genuinely independent contributors
   (Gate 5) — not run; keys evaluation-only.
