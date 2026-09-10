# Folk-theorem resistance in attester bribery: what rotation does not fix, and what does

**Problem A of `two-mechanisms.md`, `the-attribution-bottleneck.md`, and the
"Two Answers" note.** Reports **measured** values from
`scripts/sim/reporting_race.mjs`, `bond_trigger.mjs`, and `amortized_bond.mjs`
(outputs `docs/self-audit/sim_reporting_race.md`, `sim_bond_trigger.md`,
`sim_amortized_bond.md`), not asserted ones. Builds on
`docs/THEOREM-equilibrium-problem4.md` (**EQ**, Theorem 4) and
`docs/THEOREM-three-attacks.md` (**3A**, Theorems 5–7).

**Lead result: Theorem 11's trustless branch is WITHDRAWN, and A3 is recovered in
a bounded form.** A non-attributable bond trigger *does* exist — condition
forfeiture on **revocation** (public, verifiable on-chain) rather than on
**reporting** (anonymous). This is the inverse of the Dark-DAO
escrow-on-non-revocation construction (3A §4). What survives:

1. The trustless trigger is necessarily **collective** (all `k` bonds forfeited
   on revocation, regardless of who filed), so the deterrent scales `(1−π)`
   (measured, `bond_trigger.mjs`).
2. The bond is the **attester's own capital**, bounded by what the corruption
   pays: `P ≲ b` (single corruption) or `P ≲ M·b` (a bond amortised over `M`
   corruptions).
3. Therefore **`B > 2·b` makes reporting dominant for every belief `π`** against
   a singly-posted bond — a design rule the defender can compute, since
   `b ≥ p_d(S+V)` from the bribe micro-foundation (EQ §1).
4. The amortised bond (Falsification #3) inflates the required `B` toward `M·b`
   **only without cascading detection**; with it (`amortized_bond.mjs`), the bond
   is forfeit / the batch is scrutinised regardless of the attester's choice, and
   `B > 2b` survives.

| item | claim | status |
|---|---|---|
| Result A1 | assignment rotation does not convert the game to one-shot | **CONFIRMED** (analytic) |
| Result A2 | bounded tenure caps bribe amortization at `Rτ` | **CONFIRMED** (analytic) |
| Theorem 8 | anonymity defeats trigger strategies | **CONFIRMED, with an `f`-boundary** |
| Theorem 11 | a trustless loyalty bond cannot be triggered under anonymous reporting | **TRUSTLESS BRANCH WITHDRAWN** — condition on revocation, not reporting. Attacker-held branch stands. |
| Theorem 12 | trigger strategy / reputation / Dark-DAO escrow / loyalty bond all need attribution | **NARROWED** — bond *forfeiture* is the exception (it conditions on the public revocation event); trigger strategies, reputation ledgers, and targeted punishment still require attribution |
| Result A3 | anonymous reporting + first-reporter bounty ⇒ a leniency race | **RECOVERED, bounded** — survives the bond provided `B > 2b`; `b` is estimable from `p_d(S+V)` |
| Result 3 (bounty bound) | `B > 2b` defeats any rationally-posted bond, ∀`π` | **CONFIRMED (measured)**, conditional on cascading detection vs the amortised bond |

---

## 1. Result A1 — rotation addresses the wrong game [CONFIRMED]

The proposal: mandatory rotation so no attester–enrollee pair meets twice,
turning the repeated game into one-shot.

**The repeated game is attacker↔attester, not attester↔enrollee.** An attacker who
bribes attester Alice has compromised her *permanently* — she stays in the pool,
and every future random assignment that includes her is his to use (he mints
enrollees until an assignment lands in his bribed set — the Theorem 5 grinding
structure with `f = m/n` for a bribed set of size `m`). Rotating *assignments*
leaves the attacker–attester relationship intact; it repeats every time Alice is
drawn, and the folk theorem applies unchanged.

> **Result A1.** Assignment rotation does not one-shot the bribery game. The
> repeated relationship is attacker↔attester and rotation does not touch it.

---

## 2. Result A2 — bounded tenure caps amortization [CONFIRMED, analytic]

The fix operates on **tenure**. Limit an attester's participation to a term `τ`
(then leave the pool or re-qualify). A bribe then buys at most `Rτ` signatures
(`R` = attestation rate). EQ Result 1's failure — `γ(N) = kb/N → 0` — becomes

$$\gamma(N) \;=\; \frac{k\,b}{\min(N,\;R\tau)} \;+\; c\,f^{-k}$$

and once `N > Rτ` the attacker must buy fresh corruption. **Per-identity bribe
cost floors at `kb/(Rτ)` instead of decaying to zero.** Not simulated (the
algebra is immediate); stated at that strength.

Cost: `τ` small enough to bind also churns honest attesters, and re-qualification
has overhead. `τ` trades security against operational burden, and (A2
falsification) **re-qualification must be identity-bound or costly**, or an
attester re-enters under a fresh identity and unbounded amortization returns.

---

## 3. Theorem 8 — anonymity defeats trigger strategies [CONFIRMED, with an `f`-boundary]

Folk-theorem cooperation runs on **trigger strategies**: defect once, be punished
forever. The precondition: defection must be **detected and attributed to the
defector**.

> **Theorem 8.** If whistleblower reports are anonymous and any of the `k`
> attesters on a revoked credential could have filed, the attacker's posterior
> over the defector is at best uniform over `k`. Targeted punishment is
> unavailable; the trigger strategies sustaining the cooperative equilibrium
> cannot be constructed.

**Collective punishment backfires.** The attacker can cut off all `k`, but he
loses `k` bribed attesters per defection and every honest-seeming attester now
carries punishment risk from *others'* defections — which *raises* each one's
incentive to defect.

**The `f`-boundary (measured, `sim_reporting_race.mjs` §"f > 1/k").** Anonymity's
protection scales as `(1 − f^k)`: with probability `f^k` the attacker controls
*all* `k` of a set and punishes everyone cheaply. Measured `1 − f^k`:

| k | f = 0.2 | f = 1/k | f = 0.6 | f = 0.8 | f = 0.95 |
|---:|---:|---:|---:|---:|---:|
| 2 | 0.96 | 0.75 | 0.64 | 0.36 | 0.10 |
| 3 | 0.99 | 0.96 | 0.78 | 0.49 | 0.14 |
| 5 | 1.00 | 1.00 | 0.92 | 0.67 | 0.23 |

For `f` near 1 the bounty is defeated regardless of any bond: `(1 − f^k) → 0`,
collective punishment is cheap, anonymity gives no protection. **Theorem 8 holds
for `f` well below 1 and degrades smoothly as `f → 1`; state it as a boundary
condition, not an unconditional result.**

---

## 4. Result A3 — the leniency race [RECOVERED, bounded], and Theorem 11 corrected

### 4.0 A non-attributable bond trigger exists — condition on revocation, not reporting

The prior round claimed a trustless bond cannot be triggered because forfeiture
needs to attribute the report. **That was wrong.** Condition forfeiture on the
**revocation event** instead: *the attester posts a bond `P`; if the credential
they signed is revoked within `T`, `P` is forfeited.* Revocation is public and
on-chain-verifiable; the contract never asks who reported. It is the exact
inverse of the Dark-DAO escrow-on-non-revocation construction (3A §4), which the
prior work had already written down in the forward direction.

> **Theorem 11 (corrected).** The *trustless* branch is withdrawn — a
> revocation-conditioned bond is trustless and triggerable under anonymous
> reporting. The *attacker-held* branch stands (an attacker who can seize the
> bond at will turns it into a payment, not a commitment).

**But the trustless trigger is necessarily collective**, and three facts bound it:

| fact | consequence |
|---|---|
| conditioning on revocation ⇒ **all `k`** bonds forfeited regardless of who filed | the `(1−π)` deterrent argument applies: reporting dominates iff `B > P·(1−π)`, and as `π → 1` the deterrent vanishes (bond lost anyway ⇒ bounty is free money). Measured (`bond_trigger.mjs`): silence-NE region over the (δ,B,P) grid **60 % (π=0) → 45 % (π=0.3) → 37 % (π=0.5)**; `P/b` to hold silence at `B/b=2, δ=0.95` goes `1.15 → 4.79 (k=5, π=0.3) → >50 (π=0.5)`. |
| `P` is the **attester's own capital**, and no rational attester risks more than the corruption pays | `P ≲ b` for a singly-posted bond (`P ≲ M·b` if amortised over `M` corruptions — §4.4). |
| worst case `π = 0` (attester believes all others stay silent): reporting dominates iff `B > P` | with `P ≲ b`: **`B > b` suffices, `B > 2b` gives comfortable margin, for every `π`.** |

> **Result 3 (the bounty bound) [measured].** Because a rationally-posted loyalty
> bond is bounded by the bribe it protects (`P ≲ b`), a whistleblower bounty
> **`B > 2b`** makes reporting dominant against any bond the attester would
> rationally post, for every belief `π`. The bond does not defeat the leniency
> race — it raises the bounty required to win it, by a factor the defender can
> compute (`b ≥ p_d(S+V)`, EQ §1). Economics stay favourable: the attacker pays
> `b` to every attester on every corruption; the defender pays `B` only on
> realized reports, and raising `B` lifts the attacker's floor one-for-one
> (EQ Cor 4.1: `k(S+V) + 1.58kB ≥ βmE/q`).

> **Result A3 (recovered, bounded).** For `f^k ≪ 1`, anonymous unattributable
> reporting + first-reporter bounty + immunity converts the `k`-set into a
> leniency race, and the race **survives the bond provided `B > 2b`**. The prior
> "downgrade to conditional" and the subsequent "restored, no bond possible" are
> both superseded: a bond *is* possible, it is collective, it is capped at `b`,
> and a computable bounty beats it.

### 4.1 The `reporting_race.mjs` grid (holds for a triggerable bond only)

The `k`-attester leniency game: anonymous reporting; first reporter(s) split
bounty `B` and get immunity (keep franchise `V`, no slash); escrowed bribe `b`
(unit) pays at `T` iff the credential is not revoked, discounted by `δ`; the
attacker pre-collects a bond `P` per attester, refunded on silence, **forfeited
on report**. Symmetric mixed strategy `r` = report probability;
`m ~ Bin(k−1, r)` others also report.

```
E[report_i] = Σ_m Bin(k−1,r;m) [ B/(m+1) + V − P ]
E[silent_i] = (1−r)^{k−1} [ δb + V − p_d0(S+V) ]  +  (1 − (1−r)^{k−1}) [ (1−p_d)V − p_d S ]
```

**Measured result — all-silent is a Nash equilibrium iff**

```
┌─────────────────────────────────────────────┐
│   δ·b + P  ≥  B + p_d0(S + V)                │   (k-INDEPENDENT for the r*=0 NE)
└─────────────────────────────────────────────┘
```

`k` does **not** enter the r*=0 boundary (confirmed across `k ∈ {2,3,5}`); it
affects only the mixed `r*` and how fast the cartel unravels once someone
reports (a MIXED regime appears only at `k=5`, on 4.2 % of the grid).

**Regime shares over the (`δ`, `B/b`, `P/b`) grid** (`δ∈[0.5,0.999]`,
`B/b∈[0.1,10]`, `P/b∈[0,5]`):

| k | % SILENCE | % MIXED | % REPORT | % SILENCE with B ≥ b |
|---:|---:|---:|---:|---:|
| 2 | 59.7 | 0 | 40.3 | 22.6 |
| 3 | 59.7 | 0 | 40.3 | 22.6 |
| 5 | 59.7 | 4.2 | 36.1 | 22.6 |

**Minimum bond `P/b` that restores silence at `δ = 0.95`** (measured, identical
across `k`):

| B/b | 0.1 | 0.5 | 1 | 2 | 3 | 5 | 10 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| min P/b | 0 | 0 | 0.25 | 1.5 | 2.5 | 5 | 10 |

i.e. `P ≳ B − δb + p_d0(S+V)`. **This is the region where a bond would defeat the
race if `P` were unbounded.** §4.0 shows `P ≲ b`, so the operative reading of
this grid is its `P/b ≤ 1` column: silence needs `B/b ≲ 1`, and `B > 2b` clears
it with margin.

### 4.2 Theorem 12 — the attribution bottleneck [NARROWED]

> **Theorem 12 (narrowed).** Trigger strategies, out-of-band reputation ledgers,
> and targeted punishment require attributable observation of whether a specific
> attester reported. **Bond forfeiture is the exception** — a
> revocation-conditioned bond conditions on the public revocation event, not on
> attribution.

| mechanism | needs attribution? |
|---|---|
| folk-theorem trigger strategy (punish the defector) | **yes** |
| out-of-band reputation ledger (score the loyal) | **yes** |
| Dark DAO escrow (verify a specific attester did not report) | **yes** |
| revocation-conditioned loyalty bond | **no** — but it is collective (`(1−π)`) and capped at `b` (§4.0), so `B > 2b` defeats it |

Anonymous unattributable reporting still closes the first three at once, and
neutralises the fourth via the `B > 2b` bound. It remains **the** headline
requirement of the attester layer. The `f`-boundary carries: Theorem 12 is a
statement about `f^k ≪ 1`; anonymity's protection scales `(1 − f^k)` (§3).

### 4.3 Design implication

Anonymous unattributable reporting + first-reporter bounty (`B > 2b`) + immunity
are the **primary** attester-layer mechanism (none is currently specified). They
defeat the leniency-race counters — the revocation-conditioned bond (via `B > 2b`,
Result 3), reputation (§5), Dark-DAO escrow (3A §4) — and compound with bounded
tenure (A2) and the bounty term `B` in EQ Cor 4.1 (`k(S+V) + 1.58kB ≥ βmE/q`).

### 4.4 The amortised bond (Falsification #3) — `amortized_bond.mjs`

If an attester posts **one** bond covering `M` corruptions, the rational cap
rises to `P ≲ M·b` and the naive required bounty rises with it:

| `M` (batch) | `B_required/b`, naive (no batch decay, no cascade) | + independent revocation hazard `h=0.05` | + cascade `casc=0.9` |
|---:|---:|---:|---:|
| 1 | 0.95 | 0.95 | ~0 |
| 3 | 4.75 | 0.33 | ~0 |
| 10 | 18.0 | ~0 | ~0 |
| 30 | 56.0 | ~0 | ~0 |
| 100 | 189.0 | ~0 | ~0 |

**The amortised bond is fragile.** It is forfeited on the *first* revocation
anywhere in the batch, so its still-live probability decays as `(1−h)^{T(M−1)}`
(≈ 0.01 at `M=10, h=0.05, T=10`). And cascading correlation-driven detection
(Result 2 of the "Two Answers" note — revoking one corrupt attester triggers
scrutiny of its anomalous co-signers) forfeits the bond *and* the future income
regardless of the attester's choice, so reporting for bounty + immunity strictly
dominates.

> **Result 3 caveat.** Without cascading detection, an amortised bond breaks
> `B > 2b` and the required bounty scales toward `M·b`. **With** cascading
> detection (already mandatory for redundancy to be safe — see
> `docs/RESEARCH-private-bulk-revocation.md` §3A) the amortised advantage is
> gone. Correlation monitoring now does *triple* duty: it raises `q` (EQ), makes
> redundant pre-attestation safe, and caps the loyalty bond at `b`.

---

## 5. Self-attack: out-of-band reputation [CONFIRMED — same limit as the Dark DAO]

The strongest counter: the attacker keeps a dark-web ledger of which attesters
stayed bought. It **fails against anonymous reporting** for Theorem 8's reason —
he cannot attribute a report, so he can only mark "one of these `k`", a `k`-way
ambiguity that compounds across rounds rather than resolving.

Where it survives: if the attester *voluntarily* proves continued loyalty. By
Theorem 6 (3A §4) an attester **can** prove they signed for the attacker (the
knowledge justifying an attestation is provable) — but **cannot** prove they did
*not* report. The reputation system verifies participation, not loyalty — exactly
the Dark DAO limit from `three-attacks.md`, reappearing. Closing this channel
denies the trigger strategy, the reputation ledger, and Dark-DAO escrow; the
revocation-conditioned bond does not need it (Theorem 12 narrowed) but is beaten
by `B > 2b` instead (§4.0).

---

## 6. Falsification (Problem A)

1. **Theorem 8** fails if reports can be de-anonymized — through timing, through
   the revocation record correlating with a specific attester's signing history
   (this is exactly 3A Theorem 7's cohort leak, so the two are linked: a
   revocation that reveals *which* `k`-set was hit narrows the defector), or
   through a side channel in the reporting mechanism. **Attack this first**;
   `docs/RESEARCH-private-bulk-revocation.md` measures the cohort-leak side.
2. **Result A2** fails if attesters re-enter under fresh identities after tenure
   expiry. Re-qualification must be costly or identity-bound.
3. **Result 3 (`B > 2b`)** fails if attesters rationally post `P ≫ b` — the
   amortised bond (§4.4). Measured: it inflates `B_required` toward `M·b` only
   without cascading correlation-driven detection; with it, the bond decays / is
   scrutinised regardless of the attester's choice and `B > 2b` survives. So
   Result 3 is **conditional on cascading detection being deployed** — which
   Result 2 of the "Two Answers" note already makes mandatory. This is the
   load-bearing dependency; if cascade detection is weak at realistic attacker
   randomisation (the `m ≈ k(N/τ)^{1/k}` counter, `inalienability-and-detection.md`),
   both redundancy safety and `B > 2b` weaken together.
4. **Result A3 (recovered)** fails if `f^k` is not `≪ 1`, or if the bounty cannot
   be funded at `B > 2b` (with `b ≥ p_d(S+V)` this is a concrete number per
   deployment).
5. The `f`-boundary: for `f` near 1 the whole anonymity defense degrades as
   `(1 − f^k)`; measure the realistic corrupt fraction before relying on
   Theorem 8 or 12.

---

## 7. Bottom line (Problem A)

Rotation of assignments does not break the cartel — the repeated game is
attacker↔attester (A1). Bounded tenure caps bribe amortization at `Rτ` (A2).
**Anonymous unattributable reporting is the primary attester-layer mechanism**:
it removes the folk-theorem trigger (Theorem 8), and denies the out-of-band
reputation ledger and Dark-DAO escrow (Theorem 12).

A **non-attributable bond trigger does exist** — condition forfeiture on the
public revocation event, not on the anonymous report (Theorem 11's trustless
branch withdrawn; it is the inverse of the Dark-DAO escrow construction). But it
is necessarily **collective** (deterrent `(1−π)`), and the bond is the
**attester's own capital**, so `P ≲ b`. Therefore a whistleblower bounty
**`B > 2b`** makes reporting dominant for every belief `π` (Result 3), with `b`
computable as `≥ p_d(S+V)`. The amortised bond (post once, cover `M` corruptions)
would push the required `B` toward `M·b` — but only without **cascading
correlation-driven detection**, which the redundancy fix already makes mandatory
(`RESEARCH-private-bulk-revocation.md` §3A) and which therefore does triple duty:
raise `q`, make redundancy safe, cap the bond at `b`.

**Result A3, recovered and bounded:** for `f^k ≪ 1`, anonymous reporting +
first-reporter bounty `B > 2b` + immunity converts the `k`-set into a leniency
race that no rationally-posted bond defeats. The load-bearing dependency is
cascading detection; the residual is `f → 1` (`(1−f^k)` protection).
