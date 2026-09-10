# Folk-theorem resistance in attester bribery: what rotation does not fix, and what does

**Problem A of `two-mechanisms.md` and `the-attribution-bottleneck.md`.** Reports
**measured** values from `scripts/sim/reporting_race.mjs` and
`scripts/sim/bond_trigger.mjs` (outputs `docs/self-audit/sim_reporting_race.md`,
`sim_bond_trigger.md`), not asserted ones. Builds on
`docs/THEOREM-equilibrium-problem4.md` (**EQ**, Theorem 4) and
`docs/THEOREM-three-attacks.md` (**3A**, Theorems 5–7).

**Lead result: A3's earlier downgrade is WITHDRAWN.** The prior round downgraded
A3 to "conditional — a pre-paid bond `P ≈ B` defeats the race". The follow-up
simulation (`bond_trigger.mjs`) models the bond's *trigger* explicitly and finds
**no enforceable bond exists under anonymous reporting** (Theorem 11): no
trustless attributing predicate; collective forfeiture self-defeats as
`(1−π)^{k−1}`; an attacker-held bond is not a bond. A3 is restored to its
original strength for the regime `f^k ≪ 1`.

| item | claim | status after simulation |
|---|---|---|
| Result A1 | assignment rotation does not convert the game to one-shot | **CONFIRMED** (analytic; the repeated relationship is attacker↔attester) |
| Result A2 | bounded tenure caps bribe amortization at `Rτ` | **CONFIRMED** (analytic; not simulated) |
| Theorem 8 | anonymity defeats trigger strategies | **CONFIRMED, with a stated `f`-boundary** |
| **Theorem 11** | no enforceable loyalty bond exists under anonymous reporting | **CONFIRMED (measured)** — trigger analysis in `bond_trigger.mjs` |
| **Theorem 12** | trigger strategy / reputation / Dark-DAO escrow / loyalty bond all need the same attributable observation | **CONFIRMED (structural)** |
| Result A3 | anonymous reporting + first-reporter bounty ⇒ a leniency race | **RESTORED** (downgrade withdrawn) — the bond that would defeat it cannot be triggered; race is the operative outcome for `f^k ≪ 1` |

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

## 4. Result A3 — the leniency race [RESTORED], and Theorem 11 — no enforceable bond

### 4.0 Lead: the bond that would defeat the race cannot be triggered

The prior round's downgrade of A3 rested on the pre-paid bond `P`. The
reporting-race sim treated `P` as a mechanically-enforced object; it never asked
**how forfeiture is triggered**. `bond_trigger.mjs` models the trigger:

> **Theorem 11 (bond attribution) [CONFIRMED, measured].** A pre-paid loyalty
> bond must be held either trustlessly or by the attacker, and neither survives
> anonymous reporting.

| bond form | can forfeiture be triggered? | does it deter? |
|---|---|---|
| **(a) trustless, attributing** — on-chain predicate identifying the reporter | **No.** Anonymous reporting emits no per-attester identifier; the only predicate that references `i` ("`i`'s signing history correlates with the revoked cohort") is the Theorem 7 leak reduced to a 1-of-`k` guess (Theorem 8), not a clean predicate. | n/a |
| **(b) trustless, collective** — forfeit all `k` bonds if the credential is revoked within `T` | **Yes** — conditions on the public revocation event, no attribution (the Dark-DAO-style escape). | **No.** `−P` now also falls in the "someone else reported" branch, so the effective deterrent on `i`'s silence is `(1−π)^{k−1}·P` where `π` = belief another reports. Measured `P/b` needed to hold all-silent a NE at `B/b=2, δ=0.95`: k=3 — `1.15` at π=0, `2.35` at π=0.3, `12.8` at π=0.7. k=5 — `1.15` at π=0, `4.79` at π=0.3, `>50` at π=0.5. Silence-NE region over the (δ,B,P) grid: **60 % at π=0 → 55.7 % at π=0.1 → 45 % at π=0.3 → 37.3 % at π=0.5.** Any real doubt collapses it. |
| **(c) attacker-held** | Attacker can seize at will. With no attribution he cannot selectively withhold from a reporter: collective seizure = (b); uniform seizure = a flat tax with zero marginal deterrent on reporting. | **No** — it is not a bond. |

**Verdict:** no enforceable bond exists under anonymous reporting. **A3's
downgrade is withdrawn.** The `P ≈ B` result from `reporting_race.mjs` (§4.1)
holds only for a bond that can be triggered, and Theorem 11 shows one cannot be
constructed for `f^k ≪ 1`.

**Residual.** A fully-coordinated attacker who can both commit a
collective-forfeiture contract *and* enforce common knowledge that `π = 0` (no
attester believes any other will report) can hold silence as a **fragile** Nash
equilibrium (the `δb + P ≥ B` boundary still exists at `π = 0`). Enforcing
`π = 0` requires observable coordination among the `k` — the out-of-band channel
Theorem 12 closes.

> **Result A3 (restored).** For `f^k ≪ 1`, anonymous unattributable reporting +
> first-reporter bounty + immunity converts the `k`-set into a leniency race. No
> pre-paid bond defeats it, because no bond can be triggered without either
> attribution (absent by construction) or attacker trust (self-defeating) or
> collective forfeiture (deterrent `(1−π)^{k−1}`, collapses under any doubt).
> The one escape — an attacker enforcing `π = 0` — needs the coordination
> channel that Theorem 12 identifies as the single thing the attester layer must
> deny.

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

i.e. `P ≳ B − δb + p_d0(S+V)`. **This is the region where a *triggerable* bond
would defeat the race** — but §4.0 (Theorem 11) shows no triggerable bond exists
under anonymous reporting, so this grid is the counterfactual, not the operative
result.

### 4.2 Theorem 12 — the attribution bottleneck [CONFIRMED, structural]

> **Theorem 12.** Every mechanism by which an attacker secures attester loyalty
> requires attributable observation of whether a specific attester reported.

| mechanism | what it must observe |
|---|---|
| folk-theorem trigger strategy | who defected, to punish them |
| out-of-band reputation ledger | who stayed loyal, to score them |
| Dark DAO escrow | that a specific attester did not report |
| pre-paid loyalty bond | that this attester triggered forfeiture |

Anonymous, unattributable reporting closes all four at once — they are **one
property to achieve, not four defenses to build**. This makes anonymous
unattributable reporting **the** headline requirement of the attester layer,
above rotation, tenure bounding, or bespoke anti-collusion machinery. Specify it
normatively.

The `f`-boundary carries: Theorem 12 is a statement about `f^k ≪ 1`. When the
attacker controls most of the pool every `k`-set is his and the defector is drawn
from a group he punishes wholesale; anonymity's protection scales `(1 − f^k)`
(§3).

### 4.3 Design implication

Anonymous unattributable reporting + first-reporter bounty + immunity are the
**primary** attester-layer mechanism (none is currently specified). They defeat
the leniency-race counters — bond (Theorem 11), reputation (§5), Dark-DAO escrow
(3A §4) — simultaneously, and compound with bounded tenure (A2) and the bounty
term `B` in EQ Cor 4.1 (`k(S+V) + 1.58kB ≥ βmE/q`, 3A §2.3). The paper may state
"anonymous reporting converts the `k`-set into a leniency race for `f^k ≪ 1`"
without a bond caveat — Theorem 11 removes it.

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
the Dark DAO limit from `three-attacks.md`, reappearing. This is the same channel
Theorem 12 lists: closing it denies the trigger strategy, the reputation ledger,
Dark-DAO escrow, and the `π = 0` coordination an attacker would need to salvage a
collective-forfeiture bond — one property, four defenses.

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
3. **Theorem 11** fails if a bond trigger exists that is verifiable without
   attributing the report — e.g. conditioned on an aggregate statistic that a
   single defection reliably moves. `bond_trigger.mjs` (a) found none; the only
   attribution-free trigger is collective forfeiture, whose deterrent is
   `(1−π)^{k−1}` (b). Attack this first if challenged — it is the load-bearing
   step for A3's restoration.
4. **Result A3 (restored)** fails if Theorem 11 fails, or if `f^k` is not `≪ 1`.
5. The `f`-boundary: for `f` near 1 the whole anonymity defense degrades as
   `(1 − f^k)`; measure the realistic corrupt fraction before relying on
   Theorem 8 or 12.

---

## 7. Bottom line (Problem A)

Rotation of assignments does not break the cartel — the repeated game is
attacker↔attester (A1). Bounded tenure caps bribe amortization at `Rτ` and
repairs EQ's decaying-cost problem (A2). **Anonymous unattributable reporting is
the primary attester-layer mechanism**: it removes the folk-theorem trigger
(Theorem 8), and by Theorem 12 the same property simultaneously denies the
out-of-band reputation ledger, Dark-DAO escrow, and any enforceable loyalty bond.
Theorem 11 (measured) shows the bond that the prior round used to downgrade A3
**cannot be triggered** under anonymous reporting — no attributing predicate,
collective forfeiture self-defeats as `(1−π)^{k−1}`, attacker-held is not a bond
— so **A3's downgrade is withdrawn**: for `f^k ≪ 1` the first-reporter bounty
converts the `k`-set into a leniency race, full stop. The residual is a
fully-coordinated attacker enforcing `π = 0`, which needs the very coordination
channel Theorem 12 says the layer must deny.
