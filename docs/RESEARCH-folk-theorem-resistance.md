# Folk-theorem resistance in attester bribery: what rotation does not fix, and what does

**Problem A of `two-mechanisms.md`.** Reports **measured** values from
`scripts/sim/reporting_race.mjs` (output `docs/self-audit/sim_reporting_race.md`),
not asserted ones. Builds on `docs/THEOREM-equilibrium-problem4.md` (**EQ**,
Theorem 4) and `docs/THEOREM-three-attacks.md` (**3A**, Theorems 5–7).

Result status is stated up front per item:

| item | claim | status after simulation |
|---|---|---|
| Result A1 | assignment rotation does not convert the game to one-shot | **CONFIRMED** (analytic; the repeated relationship is attacker↔attester) |
| Result A2 | bounded tenure caps bribe amortization at `Rτ` | **CONFIRMED** (analytic; not simulated) |
| Theorem 8 | anonymity defeats trigger strategies | **CONFIRMED, with a stated `f`-boundary** |
| Result A3 | anonymous reporting + first-reporter bounty ⇒ a leniency race | **DOWNGRADED to conditional** — the pre-paid bond defeats the race whenever the attacker can credibly refund it (measured) |

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

## 4. Result A3 — the leniency race, and the bond that defeats it [DOWNGRADED]

### 4.1 What the simulation measured

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

i.e. `P ≳ B − δb + p_d0(S+V)`. **The pre-paid bond defeats the race:** an
attacker who sets `P ≈ B` neutralizes any fixed bounty.

### 4.2 The downgrade, and the residual defense

Result A3 as originally stated ("anonymous reporting + first-reporter bounty ⇒
the `k`-set becomes a leniency race") is **not unconditional**. It holds only
against an attacker who *cannot* post-and-refund bonds.

The bond is paid to the **attacker**, who must be trusted to refund it on
silence. So:

- A briber who **cannot** credibly commit to refunding bonds: the attester
  discounts `P` toward 0 (fear of griefing), the condition reverts to `δb ≥ B`,
  and any `B > δb` breaks the cartel. **The race works.**
- A briber who **can** credibly refund bonds runs a **reputation among
  attesters** — precisely the out-of-band reputation channel that anonymity was
  meant to remove (§5). That channel is observable (attesters must locate and
  transact with the briber) and attackable (sting operations, poisoned
  reputation, forced disclosure). **The race fails, but only by re-creating the
  channel the defender is separately trying to close.**

> **Result A3 (measured).** The leniency race is **conditional**: it destabilizes
> the cartel against an attacker who cannot commit to refunding bonds, and is
> defeated by a pre-paid bond `P ≳ B − δb` against one who can. The defender's
> real lever is therefore **making a credible bond-refund reputation
> unsustainable** — which is the same problem as closing the out-of-band
> reputation channel (§5), not a separate mechanism. State the race as a
> pressure that raises the attacker's coordination burden, not as a guaranteed
> unravelling.

### 4.3 Design implication

Anonymous reporting + first-reporter bounty + immunity remain **worth
specifying** (none is currently in the protocol): they force the attacker to run
a bonded, reputationed side-market instead of a cheap one-shot bribe, and they
compound with bounded tenure (A2) and the bounty term `B` already in EQ Cor 4.1
(`k(S+V) + 1.58kB ≥ βmE/q`, 3A §2.3). But the paper must **not** claim they
"convert the `k`-set into a race" without the "…unless the attacker can post
credible bonds" clause.

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
the Dark DAO limit from `three-attacks.md`, reappearing. And §4.2 shows this same
channel is what an attacker needs to run the bond-refund reputation that defeats
the leniency race, so **closing it does double duty**.

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
3. **Result A3** — already downgraded here. Fails as an unconditional claim
   against any attacker who can post credible refundable bonds; the measured
   boundary is `P ≥ B − δb + p_d0(S+V)`.
4. The `f`-boundary: for `f` near 1 the whole anonymity defense degrades as
   `(1 − f^k)`; measure the realistic corrupt fraction before relying on
   Theorem 8.

---

## 7. Bottom line (Problem A)

Rotation of assignments does not break the cartel — the repeated game is
attacker↔attester (A1). Bounded tenure caps bribe amortization at `Rτ` and
repairs EQ's decaying-cost problem (A2). Anonymous, unattributable reporting
removes the folk-theorem trigger (Theorem 8) for `f` well below 1. The
first-reporter bounty creates a leniency race **only against an attacker who
cannot post credible refundable bonds** (A3, measured `P ≥ B − δb`); against one
who can, the race is defeated, and defeating *that* attacker is the same problem
as closing the out-of-band reputation channel. The honest claim is that
anonymity + bounty + tenure raise the attacker's coordination burden to a
bonded, reputationed side-market — not that they guarantee the cartel unravels.
