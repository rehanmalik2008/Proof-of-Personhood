# Private bulk revocation: the accumulator is the wrong layer, and churn hides the cohort only partly

**Problem B of `two-mechanisms.md`.** Reports **measured** values from
`scripts/sim/churn_privacy_ratio.mjs` and `scripts/sim/staging_correlation_attack.mjs`
(outputs `docs/self-audit/sim_churn_privacy.md`, `sim_staging_attack.md`), not
asserted ones. Builds on `docs/THEOREM-three-attacks.md` (**3A**, Theorem 7 —
the cohort leak, `|C| ≈ Nk/n`) and `docs/THEOREM-equilibrium-problem4.md`
(**EQ**, Theorem 4).

| item | claim | status after simulation |
|---|---|---|
| Result B1 | the binding leak is the timing channel, not the accumulator | **CONFIRMED** — staging-attack AUC ≈ 1 in every cell (a revocation event is always detectable) |
| Theorem 9 | cohort membership leaks through prover behaviour regardless of the accumulator | **CONFIRMED** |
| Result B2 | cohort privacy governed by `\|C\|/(ρN)`; staged revocation to the churn floor hides it | **DOWNGRADED** — hides only under uniform randomised staging at ≈ 3× the naive depth, and only *partially* (a 1%-FPR observer still fingers 8–15 % of members) |
| Theorem 10 | economics ↔ privacy ↔ latency, no config optimises both | **CONFIRMED and quantified** — staging depth `T ≳ 3\|C\|/(ρ_perm N)` epochs of extended attacker revenue |

**Carry-over correction, now measured: do not build the batch-indistinguishable
accumulator.** Result B1 is confirmed — the accumulator addresses a secondary
leak while the timing channel remains the binding one. And Task 1+2 show cohort
privacy is *partly* achievable through churn (uniform staging), so the
accumulator work is unnecessary either way: if churn hides the cohort the
accumulator is redundant; if it does not (small `n`), a hidden batch structure
would not have saved it, because the login-failure timing channel is untouched.

---

## 1. Result B1 / Theorem 9 — the timing channel is the binding leak [CONFIRMED]

> **Theorem 9 (timing lower bound).** In any revocation mechanism where revoked
> credentials cannot produce accepted proofs and non-revoked ones can, cohort
> membership leaks through prover behaviour. After a revocation at epoch `T`,
> revoked-cohort members stop producing accepted proofs while non-members
> continue. An observer of proof acceptance learns the cohort regardless of the
> accumulator's hiding properties.

**Confirmed by simulation.** In `sim_staging_attack.mjs`, the ROC AUC of the
"stopped producing proofs" signal for cohort membership is **≈ 0.93–0.9988 in
every cell** — staging mode, depth `T`, and observation horizon do not bring it
near 0.5. A bulk revocation is always *detectable*. What staging can affect is
whether individual members are *identifiable*; that is Result B2's question, and
it lives entirely at the application layer.

> **Result B1.** The binding privacy constraint is the login-failure timing
> channel, not the accumulator. Effort on hiding batch structure in the
> accumulator addresses a secondary leak while the primary one is open. **Do not
> build it.**

---

## 2. Task 1 — the churn rate `ρ` and the privacy ratio, measured

### 2.1 Usage model (`sim_churn_privacy.mjs`)

Epoch = 1 day (the tree-publication / staging cadence). Two churn quantities,
because they bound two different observers:

| quantity | meaning | central (per day) | band | analogue |
|---|---|---:|---|---|
| `ρ_gap` | an active user is simply silent this epoch (intermittent / seasonal) | 0.30 | 0.15–0.50 | DAU/MAU ≈ 0.15–0.5 (Sequoia / a16z engagement benchmarks) |
| `ρ_perm` | user stops proving **permanently** (device loss no-recovery, disengagement) | **7.9 × 10⁻⁴** | 4.4 × 10⁻⁴ – 1.4 × 10⁻³ | 15 / 25 / 40 %/yr engaged-user attrition (AppsFlyer, Adjust retention benchmarks; SaaS logo churn; phone loss/theft 2–3 %/yr) |

A *naive one-epoch* observer's noise floor is `ρ_gap N` (huge — trivially
defeated, not binding). A *patient* observer waits out the intermittent gaps, so
its noise floor is `ρ_perm N` — **`ρ_perm` is the number that decides Result B2.**
Gaussian attrition model cross-checked by Monte Carlo at `N = 10⁶`: mean 790
(expected 790), std 28.1 (expected 28.1).

### 2.2 Staging depth (central `ρ_perm = 7.9e-4`)

`T_naive = |C| / (ρ_perm N)` — the source's Result B2 depth, hides from a
one-epoch observer only. `T_10%` — depth for a per-member "did they ever return"
classifier to fall below 10 % precision (real per-member privacy).

| \|C\| | N | attrition/epoch | T_naive (d) | T_10% (d) | \|C\| > attrition/epoch? |
|---:|---:|---:|---:|---:|:--:|
| 1,000 | 100,000 | 79 | 12.7 | 114 | yes |
| 1,000 | 1,000,000 | 790 | 1.3 | 11.4 | yes |
| 10,000 | 1,000,000 | 790 | 12.7 | 114 | yes |
| 30,000 | 1,000,000 | 790 | 38.0 | 342 | yes |
| 30,000 | 10,000,000 | 7,900 | 3.8 | 34.2 | yes |
| 30,000 | 100,000 | 79 | 380 | 3,418 | yes |

**Structural cohort `|C| = Nk/n` ⇒ `T_naive = k/(nρ_perm)`, independent of N:**

| k | n = 100 | n = 300 | n = 1,000 | n = 3,000 | n = 10,000 |
|---:|---:|---:|---:|---:|---:|
| 3 | 38 d | 12.7 d | 3.8 d | 1.3 d | 0.4 d |
| 5 | 63 d | 21 d | 6.3 d | 2.1 d | 0.6 d |
| `T_10%` (k=3) | 342 d | 114 d | 34 d | 11 d | 3.4 d |

### 2.3 Verdict on Result B2's premise (falsification #2: "is `ρN ≪ |C|`?")

**`ρ_perm N` is not ≪ `|C|` for realistic large deployments — so B2 is not dead
— but the naive depth is misleadingly small.** At `T_naive` the per-member
classifier precision is exactly **0.5** (staged rate = attrition floor): the
observer knows half of every "stopped" user is a cohort member. Real per-member
privacy needs `T ≈ 10 × T_naive`, which is:

- **feasible** (days–weeks) for large `n` (≥ ~1,000) or small targeted cohorts in
  large populations;
- **infeasible** (≈ a year) for small `n` (≤ ~100), where `|C| = Nk/n` is a few
  percent of the population — and the Theorem 10 economic cost over ~340 epochs
  is prohibitive regardless.

---

## 3. Task 2 — the staging-correlation attack, measured

`sim_staging_attack.mjs`: `N = 40,000`, `ρ_perm = 7.9e-4` (⇒ attrition floor
31.6 permanent stops/epoch), `ρ_gap = 0.30`, 8 seeds/cell. Observer has full
per-epoch accept/silent history; classifier = silent-run-length since last
accepted proof (information-optimal under uniform client failure). Adaptive
observer calibrates its threshold to 1 % FPR on a known pilot cohort, then
attacks the real one.

**Decisive table — adaptive observer, `|C| = 2,000` (5 % of N):**

| staging mode | T | staged rate/epoch | above floor? | recall | precision | members fingered | anon-set/member |
|---|---:|---:|:--:|---:|---:|---:|---:|
| burst | 1 | 2,000 | yes | 1.00 | 0.84 | 2,000 | 2,392 |
| index (correlated) | 30 | 66.7 | yes | 0.40 | 0.67 | 798 | 1,188 |
| index | 90 | 22.2 | no | 0.14 | 0.42 | 284 | 677 |
| index | 180 | 11.1 | no | 0.08 | 0.29 | 162 | 559 |
| **uniform** | 30 | 66.7 | yes | 0.41 | 0.68 | 824 | 1,219 |
| **uniform** | 90 | 22.2 | **no** | 0.14 | 0.41 | 282 | 679 |
| **uniform** | 180 | 11.1 | **no** | 0.08 | 0.28 | 162 | 564 |

Doubling the observation horizon (300 → 600 epochs) changes these by < 0.01:
benign permanent quitters are a *permanent, equal-rate decoy pool*, so a patient
observer gains essentially nothing once the staged rate is below the floor.

### 3.1 Does staging hide, or merely delay?

**Both, depending on the regime:**

- **Correlated staging (burst, or index-order) — only delays.** Recovered at high
  precision at every `T` and horizon. If the staged revocations share *any*
  observable structure (ordering, index locality, timing regularity), a patient
  observer reconstructs the cohort.
- **Uniform randomised staging with staged rate `|C|/T` above the attrition
  floor — only delays.** Recall 0.4, precision 0.68 at `T = 30`: the cohort is
  still largely recovered.
- **Uniform randomised staging with `|C|/T` below the attrition floor
  (`T ≥ 3 × |C|/(ρ_perm N)`) — genuinely hides the bulk.** Recall collapses to
  0.08–0.14 at precision 0.28–0.42, and does not recover with more observation.
  The un-fingered majority of the cohort is mixed indistinguishably into benign
  permanent attrition.

**But it is partial, not perfect.** Even in the good regime a 1 %-FPR observer
still fingers **8–15 %** of members — those revoked early, or in the same epoch
as a benign-quit cluster. Cohort privacy is *reduced to a residual*, not
eliminated.

> **Result B2 (measured).** Cohort privacy through natural churn is achievable
> only under all of: (i) **uniform randomised** staging over the cohort,
> interleaved with the benign churn stream; (ii) staging depth
> **`T ≳ 3 × |C|/(ρ_perm N)`** (≈ `3k/(nρ)` epochs for the structural cohort —
> ~11 days at `n = 3,000`, ~114 days at `n = 300`, a year at `n = 100`);
> (iii) **uniform client failure** (identical proof sizes, failure modes, retry
> patterns for revoked and active users — a normative client requirement). Under
> those conditions ~85–92 % of the cohort is indistinguishable from ordinary
> attrition; the remaining ~8–15 % is fingered at ≈ 30–40 % precision. It is a
> **strong partial mitigation**, not the clean "hides in churn" the source
> asserted, and not `n/k`-anonymity (3A) — the timing residual dominates.

---

## 4. Theorem 10 — economics ↔ privacy ↔ latency [CONFIRMED, quantified]

> **Theorem 10.** Immediate bulk revocation maximises economic security
> (Theorem 4) and maximises cohort leakage (Theorem 7). Staged revocation over
> `T` epochs reduces the leakage to the churn residual (§3) and extends attacker
> revenue by up to `T` epochs. `T` is a direct trade between the two, with no
> configuration optimising both.

**Quantified.** The privacy-effective depth measured in §3 is
`T ≳ 3 × |C|/(ρ_perm N)` epochs — for the structural cohort, `T ≳ 3k/(nρ_perm)`:

| n | T (privacy-effective, k=3) | extended attacker revenue factor |
|---:|---:|---|
| 100 | ~114 days | `(1 + Tλ)` with `T ≈ 114` — prohibitive |
| 1,000 | ~11 days | modest |
| 3,000 | ~4 days | small |
| 10,000 | ~1 day | negligible |

Attacker revenue under staging (3A / EQ): roughly
`(1−q)^N · N · R · (1 + Tλ)` for a collection-rate factor `λ`, carried into the
`k(S+V) + 1.58kB ≥ βmE/q` condition. **Cohort privacy is a disclosed parameter
`T`, priced against the economic bound — not a leak to be cryptographically
eliminated.** The design pressure is toward **large `n`**: it shortens the
privacy-effective staging depth *and* lowers `f` (EQ) *and* shrinks `|C| = Nk/n`
(3A) — the same lever three ways.

---

## 5. Falsification (Problem B)

1. **Theorem 9** fails if a construction exists where revoked users keep
   producing accepted proofs that are treated as revoked only downstream —
   pushing the functional distinction past the observation point. The simulation
   confirms that as long as the *acceptance* signal differs, AUC ≈ 1; such a
   construction would just relocate the observer to the downstream check.
2. **Result B2** — already downgraded. Fails as a clean claim: it requires 3×
   the naive depth, uniform staging, and uniform client failure, and even then
   leaves an 8–15 % identifiable residual. It is dead for small `n` (`≤ ~100`),
   where the privacy-effective depth is ~a year and its economic cost
   prohibitive.
3. **Theorem 10's quantification** fails if delayed revocation does not extend
   attacker revenue proportionally — e.g. if fakes are caught downstream by other
   means during staging. Measure the downstream detection rate before assuming
   `(1 + Tλ)`.
4. **`ρ_perm` band.** All of §2–3 uses the central `7.9e-4/day`. At the low end
   (`4.4e-4`, retention-optimised) every staging depth roughly doubles; at the
   high end (`1.4e-3`) it roughly halves. A deployment must measure its own
   `ρ_perm` — it is now a **privacy parameter** alongside `n`, and belongs in the
   falsification register (3A §5) next to `q`, `β`, `w`, `τ`, `B`.

---

## 6. Bottom line (Problem B)

The accumulator is the wrong layer: even perfect batch-update indistinguishability
leaks the cohort through proof-failure timing (Theorem 9, AUC ≈ 1 measured).
**Do not build the batch-indistinguishable accumulator.** The real mechanism is
hiding the cohort inside natural permanent attrition — governed by
`|C|/(ρ_perm N)` — via **uniform randomised staged revocation at ≈ 3× the naive
depth, with uniform client failure**. Measured, that hides ~85–92 % of the
cohort and leaves an 8–15 % identifiable residual; it works for large `n`
(≥ ~1,000) and is a dead end for small `n`. It trades directly against
Theorem 4's economic bound (Theorem 10): the staging depth is a disclosed
parameter priced against `k(S+V) + 1.58kB ≥ βmE/q`, and the design answer is
**large `n`**, which shortens the required depth, lowers `f`, and shrinks the
cohort at once. Cohort privacy is a managed residual, not an eliminable leak.
