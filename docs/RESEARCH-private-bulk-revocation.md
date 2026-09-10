# Private bulk revocation: the accumulator is the wrong layer, and churn hides the cohort only partly

**Problem B of `two-mechanisms.md`, `the-attribution-bottleneck.md`, and the
"Two Answers" note.** Reports **measured** values from
`scripts/sim/churn_privacy_ratio.mjs`, `staging_correlation_attack.mjs`,
`reenrollment_gap.mjs`, and `surplus_attestation_leak.mjs` (outputs under
`docs/self-audit/sim_*`), not asserted ones. Builds on
`docs/THEOREM-three-attacks.md` (**3A**, Theorem 7 — the cohort leak,
`|C| ≈ Nk/n`) and `docs/THEOREM-equilibrium-problem4.md` (**EQ**, Theorem 4).

| item | claim | status after simulation |
|---|---|---|
| Result B1 | the binding leak is the timing channel, not the accumulator | **CONFIRMED** — staging-attack AUC ≈ 1 in every cell |
| Theorem 9 | cohort membership leaks through prover behaviour regardless of the accumulator | **CONFIRMED** |
| Result B2 | cohort privacy governed by `\|C\|/(ρN)`; staged revocation to the churn floor hides it | **DOWNGRADED** — uniform randomised staging at ≈ 3× the naive depth, partial (8–15 % residual) |
| Result 2 | staging depth `T = k/(nρ)` is independent of population `N` | **CONFIRMED** |
| Result 3 | pairing revocation with automatic re-enrollment moves the floor `ρ_perm → ρ_gap` (~380×) | **HELD, rescaled to ~3–10×** — a gap co-timing channel imposes a `T_stage` floor of ~30–90 epochs |
| **TA-Result 1** | redundant pre-attestation (`k' > k`) collapses re-enrollment delay to one epoch | **CONFIRMED** — and it removes the gap-length attack of §3A entirely |
| **TA-Result 2** | redundancy + bulk revocation are compatible only under cascading detection | **CONFIRMED** — single-attester revocation + redundancy shields the attacker's portfolio |
| **Falsification #1** | is the surplus / subset switch observable? | **MEASURED** — safe iff Phase-2 does **not** reveal the `k`-subset; conflicts with the grinding-fix "verifier-checked assignment" variant (§3B.3) |
| Theorem 10 | economics ↔ privacy ↔ latency, no config optimises both | **CONFIRMED, softened** by re-enrollment + redundancy |

**Carry-over correction, still holds: do not build the batch-indistinguishable
accumulator.** The accumulator addresses a secondary leak while the timing
channel is binding; nothing in this round changes that.

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

## 3A. Re-enrollment: which churn rate applies [Result 2 CONFIRMED, Result 3 HELD & RESCALED]

`scripts/sim/reenrollment_gap.mjs`. `the-attribution-bottleneck.md` argues that
permanent lockout of an innocent revoked user is a **defect**, not a requirement:
the correct behaviour is **automatic re-enrollment** (obtain `k` fresh
attestations from uncorrupted attesters, resume proving). That changes the
observable from a *permanent stop* (noise floor `ρ_perm ≈ 7.9e-4/day`) to a
*transient gap* (noise floor `ρ_gap ≈ 0.30/day`, ~380× larger).

### 3A.1 Result 2 — the staging depth is population-independent [CONFIRMED]

For the structural cohort, `|C| = Nk/n` and the churn floor is `ρN`, so
`T ≈ |C|/(ρN) = k/(nρ)` — **`N` cancels**. A 10 M-user system needs the same
staging depth as a 100 k one. `n` enters twice: it shrinks the cohort *and*
shortens the staging. `n` is the dominant privacy parameter.

### 3A.2 Result 3 — re-enrollment does help, but a second channel binds

The re-enrolled cohort was run against the same staging-correlation observer, now
with two classifiers: **gap length** (one overlong gap starting in the revocation
window, then resumption) and **gap co-timing** (many members' gaps *ending* in the
same epoch bucket). `recall@1%FPR` = max of the two. Measured (`N=30k`, cohort
5 %, natural-gap distribution mean 10.8 d, **p90 21 d**, p95 38 d):

| staging `T_stage` | re-enroll delay `D_mean` | recall @1%FPR | reading |
|---:|---:|---:|---|
| 90 (wide) | 2–30 d | ≤ 0.05 | cohort hidden across the plausible range |
| 90 | 45 d | 0.07 | |
| 90 | 60 d | 0.16 | still mostly hidden; `D* > 60 d` |
| 30 | ≤ 21 d | ≤ 0.08 | hidden while `D` within natural p90 |
| 30 | 45–60 d | 0.20–0.31 | length channel separates |
| 7 (tight) | 14 d, synchronized | 0.36 | **fails** — gap-ends cluster |
| 7 | 30 d, spread | 0.25 | **fails** — co-timing fires |

**What the `ρ_gap` substitution gets right:** the *rate*-detection floor does
move to `ρ_gap`, so the per-epoch revocation rate is a non-issue at any feasible
`T_stage`.

**What it misses:** the **gap co-timing channel**. All cohort members' gaps start
in the revocation window and — if re-enrollment delay has low variance — end in a
narrow window too. That cluster is detectable independent of gap *length*.
Spreading it needs a wide `T_stage` (≥ ~90 epochs) or high per-member delay
variance. So re-enrollment does **not** reduce the staging depth to the
sub-day `T ≈ 3k/(nρ_gap)` the note computes; it reduces it from the `ρ_perm`
regime's **~100–340 epochs** (small `n`) to **~30–90 epochs** — roughly
**3–10×**, not 380×.

> **Result 3 (measured).** Pairing bulk revocation with automatic re-enrollment
> converts the timing signal from a permanent stop to a transient gap and removes
> the rate-detection channel, but the gap co-timing channel imposes a residual
> staging floor of ~30–90 epochs. Net: staging depth drops ~3–10× versus the
> `ρ_perm` regime, making Problem B **feasible for small `n`** (previously a dead
> end) at a staging cost of weeks rather than months. Requirements: (i) wide
> staging `T_stage ≳ 90` epochs; (ii) re-enrollment `D` within ~ the natural gap
> p90 (≈ 21 d here); (iii) per-member `D` variance, or rely on (i);
> (iv) re-enrollment shaped identically to fresh enrollment (§3A.3).
>
> **Superseded for the delay concern by §3B:** redundant pre-attestation
> (`k' > k`) collapses `D` to *one epoch* and, for users with surplus, removes
> the gap entirely — so the "does `D` overlap the natural gap distribution"
> question (§3A.2 requirement (ii)) is answered by *there is no gap to measure*.
> Wide staging (requirement (i)) is still needed to spread the re-enrollment
> *completion* cluster.

### 3A.3 Falsification #3 — does re-enrolling produce its own signature?

Re-enrollment = `k` attestation transactions + a tree insertion, clustered after
`t_rev`. If shaped **identically to initial enrollment** — same transaction
types, same insertion path, a fresh unlinkable commitment `C` (the design
already keeps `C` private) — the only residual is the **timing cluster** of
enrollments in `[t_rev, t_rev + T_stage + D]`, which the wide-`T_stage`
requirement (3A.2) already spreads. A distinct "re-enroll" endpoint or flag, or a
linkable new credential, would re-expose the cohort at the enrollment step.
**Normative: one enrollment path, fresh unlinkable `C`, spread completion.**
The `spread=false` (synchronized) rows above show synchronized re-enrollment at
tight staging is recovered (recall 0.36–0.68) — the co-timing signature is real.

### 3A.4 The attacker re-enrolls too

The attacker's fake credentials can also seek fresh attestations — but only from
attesters he has bribed, which costs **fresh corruption** (a new `k`-set, new
bribes `k·b`). That is the intended behaviour and it preserves EQ's logic:
re-enrollment does not give the attacker a free portfolio refresh. Not
separately simulated; the interaction is `γ(N) += k·b` per forced re-enrollment
cycle, on top of the grinding term.

---

## 3B. Redundant pre-attestation — collapse the re-enrollment delay ("Two Answers" note)

`3A.2` left a gap: obtaining `k` fresh attestations *reactively* after revocation
is a human-timescale process (days–weeks), longer than a natural usage gap, so
the re-enrolled cohort can be separated by gap **length** unless `D` stays within
the natural p90 (~21 d). The "Two Answers" note closes this by obtaining the
attestations **proactively**.

### 3B.1 The mechanism [TA-Result 1]

Each user collects `k' > k` attestations at enrollment and holds the surplus in
reserve. When attester `A` is revoked, the credential loses one attestation and
retains `k' − 1`. If `k' − 1 ≥ k`, the user **resubmits immediately with
attestations they already hold** — no institutional latency. Re-enrollment delay
collapses from days/weeks to **one tree-update epoch**, a parameter the system
controls. For users with surplus ≥ 1 the interruption need never become
observable: they re-prove at their next ordinary use with a different `k`-subset.

Cost: a one-time enrollment multiplier `k'/k` — at `k=3, k'=5` that is **1.67×**
the attestation burden, paid once, when the user is already engaged. `k'` joins
the parameter set (`k, n, q, β, B, τ, ρ_perm, ρ_gap, gap-p90`).

> **TA-Result 1.** Redundant pre-attestation reduces re-enrollment delay to a
> single epoch, trivially satisfying the gap-length overlap requirement of §3A.
> The gap-length attack is closed by *eliminating the gap*, not by matching the
> natural distribution.

### 3B.2 Cost: redundancy shields the attacker too [TA-Result 2]

If the attacker's fakes also carry `k'` attestations from his bribed set,
revoking one corrupt attester leaves them with `k' − 1 ≥ k` and they **survive**.
Bulk revocation stops destroying his portfolio, and Theorem 4's economic bound —
which depends on portfolio destruction — weakens. This is Theorem 10's tension in
a new place: the mechanism that protects innocent users' privacy also protects
the attacker's inventory.

**Resolution — cascading revocation.** Detecting attester `A` as corrupt must
trigger scrutiny of the attesters who co-signed with `A` at anomalous rates —
the attestation-correlation monitoring already identified (`inalienability-and-detection.md`)
as the primary driver of `q`. If corruption is found in **clusters**, redundancy
does not save the attacker: his whole bribed set is revoked together, so
`k' − j < k` for a fake carrying `j` corrupt signers.

> **TA-Result 2.** Redundancy and bulk revocation are compatible only under
> cascading detection. Single-attester revocation + redundancy leaves the
> attacker intact; **cluster detection + redundancy** protects honest users while
> still destroying correlated corrupt sets. Correlation monitoring does triple
> duty: it raises `q` (EQ), it makes redundancy safe here, and it caps the
> loyalty bond at `b` (`RESEARCH-folk-theorem-resistance.md` §4.4).

### 3B.3 Falsification #1 (now the critical measurement) — is the surplus / subset switch observable?

`scripts/sim/surplus_attestation_leak.mjs`. Measured (`N=40k`, pool `n=100`,
`k=3`):

| scenario | AUC | recall @1%FPR |
|---|---:|---:|
| **A — subsets hidden** (paper Phase-2 reveals only `{N, y}`), `k'=5` | **0.499** | 0.01 |
| **B — subsets revealed** (grinding-fix "verifier-checked assignment" exposes the `k` keys), `k'=5`, no cover rotation | **1.00** | 1.00 |
| B, with background subset-rotation rate 0.005 as cover | 0.995 | 0.61 |
| B, background rotation 0.02 | 0.977 | 0.14 |

**Scenario A — safe.** The active `k`-subset never appears in a Phase-2 proof
(no attester keys, no category labels — paper §2.5, §6). Switching to a spare
subset produces **no proof-content signal**; with `k' − 1 ≥ k` there is no gap
either. AUC = 0.5.

**Scenario B — the cohort is re-exposed at re-proof.** If the `k` signer
identities are public (which the grinding-resistance construction's
*verifier-checked assignment* variant, `3A §1.3` of `THEOREM-three-attacks.md`,
does), then a subset change between consecutive proofs whose *dropped element* is
the revoked attester is a direct per-user signal. AUC ≈ 1; background rotation
adds false positives but does not hide the cohort.

> **Falsification #1 verdict [measured].** Redundant pre-attestation (TA-Result 1)
> is **safe only if the active `k`-subset is not revealed by Phase-2 proofs** —
> a direct conflict with the grinding-resistance construction's verifier-checked
> variant. **Resolution:** keep the assignment check **in-circuit**
> (`THEOREM-three-attacks.md` §1.3, the ≈ 6.8k–11.2k-constraint variant), so the
> proof attests "my `k` signers were correctly derived from `(commit, beacon)`"
> *without revealing which `k`*. Then grinding resistance and subset-switch
> privacy coexist; the price is the added constraints. The verifier-checked
> variant (0 added constraints, keys revealed) **forecloses TA-Result 1** and
> must not be used if redundancy is deployed.

---

## 4. Theorem 10 — economics ↔ privacy ↔ latency [CONFIRMED, quantified]

> **Theorem 10.** Immediate bulk revocation maximises economic security
> (Theorem 4) and maximises cohort leakage (Theorem 7). Staged revocation over
> `T` epochs reduces the leakage to the churn residual (§3) and extends attacker
> revenue by up to `T` epochs. `T` is a direct trade between the two, with no
> configuration optimising both.

**Quantified — two regimes.** Without re-enrollment (permanent lockout) the
privacy-effective depth is `T ≳ 3k/(nρ_perm)`; **with re-enrollment** (§3A) the
gap co-timing channel sets `T_stage ≳ ~90` epochs, roughly `n`-independent in
that range:

| n | T without re-enrollment (`ρ_perm`, k=3) | T with re-enrollment (co-timing floor) |
|---:|---:|---:|
| 100 | ~114 days (prohibitive) | **~90 days** |
| 1,000 | ~11 days | ~90 days |
| 3,000 | ~4 days | ~30–90 days |
| 10,000 | ~1 day | ~30 days |

Re-enrollment helps *most* at small `n` (114 d → 90 d and now feasible), and is
roughly neutral or slightly worse at large `n` (the co-timing floor exceeds the
`ρ_perm` depth there — so at `n ≥ 3,000` permanent staging at `3k/(nρ_perm)` may
already be shorter, and re-enrollment's value is then the *innocent-user*
treatment, not additional privacy).

Attacker revenue under staging (3A / EQ): roughly
`(1−q)^N · N · R · (1 + Tλ)` for a collection-rate factor `λ`, carried into the
`k(S+V) + 1.58kB ≥ βmE/q` condition. **Cohort privacy is a disclosed parameter
`T`, priced against the economic bound — not a leak to be cryptographically
eliminated.** The design pressure is toward **large `n`**: it shortens the
`ρ_perm`-regime staging depth, lowers `f` (EQ), and shrinks `|C| = Nk/n` (3A) —
the same lever three ways.

---

## 5. Falsification (Problem B)

1. **Theorem 9** fails if a construction exists where revoked users keep
   producing accepted proofs that are treated as revoked only downstream —
   pushing the functional distinction past the observation point. The simulation
   confirms that as long as the *acceptance* signal differs, AUC ≈ 1; such a
   construction would just relocate the observer to the downstream check.
2. **Result B2** — downgraded. Without re-enrollment it requires 3× the naive
   depth, uniform staging, and uniform client failure, and leaves an 8–15 %
   residual; dead for small `n` (`≤ ~100`) on economic cost. **Re-enrollment
   (Result 3) reopens small `n`** at a ~90-epoch staging cost.
3. **Result 3** — the gap-length concern is superseded by **TA-Result 1**
   (redundant pre-attestation collapses `D` to one epoch). What remains: fails if
   re-enrollment *completion* cannot be spread (synchronized completion at tight
   staging is recovered, recall 0.36–0.68), or if re-enrollment carries its own
   on-chain/network signature (falsification #3 — one enrollment path, fresh
   unlinkable `C`).
4. **TA-Result 1 (Falsification #1, the critical measurement)** fails if the
   active `k`-subset is observable in a Phase-2 proof. Measured: safe when hidden
   (AUC 0.5), fully recovered when revealed (AUC ≈ 1). **The grinding-resistance
   construction must therefore keep its assignment check in-circuit** (§3B.3), not
   verifier-checked.
5. **TA-Result 2** fails if cascading correlation detection cannot identify
   clusters at realistic attacker randomisation — the `m ≈ k(N/τ)^{1/k}` counter
   (`inalienability-and-detection.md`): the attacker rotates *which* of his
   bribed attesters sign each fake. If cascade detection is weak, redundancy
   shields the attacker's portfolio and Theorem 4's bound weakens.
6. **Theorem 10's quantification** fails if delayed revocation does not extend
   attacker revenue proportionally. Measure the downstream detection rate before
   assuming `(1 + Tλ)`.
7. **`ρ_perm` / `ρ_gap` / natural-gap-p90 / `k'` bands.** §2–3 use central
   `ρ_perm = 7.9e-4`, `ρ_gap = 0.30`; §3A uses a natural-gap p90 of 21 d from a
   Beta(1.3, 4) engagement model; §3B recommends `k' = 5` at `k = 3`. All are
   deployment-specific **privacy parameters** and belong in the falsification
   register (3A §5) next to `q`, `β`, `w`, `τ`, `B`, `n`.

---

## 6. Bottom line (Problem B)

The accumulator is the wrong layer: even perfect batch-update indistinguishability
leaks the cohort through proof-failure timing (Theorem 9, AUC ≈ 1 measured).
**Do not build the batch-indistinguishable accumulator.**

The mechanism is hiding the cohort inside natural churn via **uniform randomised
staged revocation with uniform client failure**, and pairing it with **automatic
re-enrollment** (also the correct treatment of innocent revoked users). Measured:

- Without re-enrollment, staging hides the cohort against the *permanent*-attrition
  floor `ρ_perm` at `T ≳ 3k/(nρ_perm)` — ~85–92 % hidden, 8–15 % residual;
  feasible for `n ≥ ~1,000`, prohibitive for `n ≤ ~100`.
- With re-enrollment, the signal becomes a transient gap: the rate-detection
  channel moves to `ρ_gap` (~380× more headroom), but a **gap co-timing** channel
  imposes a `T_stage` floor of **~30–90 epochs** roughly independent of `n`. Net
  staging cost drops ~3–10× and **small `n` becomes feasible** (weeks, not
  months).
- **Redundant pre-attestation (`k' > k`, TA-Result 1)** collapses the
  re-enrollment *delay* to one epoch and, for users with surplus, removes the gap
  entirely — so the gap-length question disappears. Cost: `k'/k` ≈ 1.67×
  enrollment attestation burden at `k'=5, k=3`; and it **shields the attacker's
  portfolio** unless revocation **cascades** over correlated co-signers
  (TA-Result 2). It is **safe only if Phase-2 proofs do not reveal the active
  `k`-subset** — which forces the grinding-resistance assignment check to stay
  **in-circuit** (Falsification #1, measured: AUC 0.5 hidden vs ≈ 1 revealed).

Result 2: the depth `T = k/(nρ)` is **population-independent**. Theorem 10's
economics–privacy trade is real but softened by re-enrollment + redundancy. The
design answer remains **large `n`** (shorter depth, lower `f`, smaller `|C|`),
plus **cascading correlation-driven detection** — now load-bearing for `q`, for
redundancy safety, and for the loyalty-bond cap. Cohort privacy is a managed,
disclosed residual, not an eliminable leak.
