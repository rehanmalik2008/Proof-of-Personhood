# Problem 4: the attester-corruption equilibrium and its closed-form bound

**Formalizes `the-equilibrium.md`.** This is Problem 4 of the four-problems
document (formal game-theoretic equilibrium for `γ ≥ β·m·E`), which that
document's own ranking put first for tractability. It is the recommended next
target after `docs/REDUCTION-personhood-impossibility.md` and
`docs/THEOREM-asymmetry-trilemma.md`.

The bribe micro-foundation from the source is kept (it is correct). Three of the
source's four downstream claims are corrected here; the corrections produce a
cleaner closed form than the one originally aimed at, and they show that the
bulk-revocation path built for Gate 6 is load-bearing for the security argument.

Labels: **[KEPT]** from the source, verified · **[CORRECTION]** · **[THIS WORK]**
new result · **[OPEN]** · **[CONJECTURE]**.

---

## 1. The bribe micro-foundation [KEPT — algebra verified]

Attester `i` holds staked collateral `S_i` and a discounted honest franchise
value `V_i` (the present value of future honest attestation revenue). An attacker
offers a bribe `b_i` to sign fraudulent credentials. Detection probability is
`p_d`; on detection the attester's stake is slashed and the franchise is lost.

```
E[U_honest]  = V_i
E[U_corrupt] = b_i + (1 − p_d)·V_i − p_d·S_i
```

Corruption is rational iff `E[U_corrupt] > E[U_honest]`:

```
b_i + (1 − p_d)V_i − p_d S_i > V_i
⇔  b_i − p_d V_i − p_d S_i > 0
⇔  b_i > p_d·(S_i + V_i)                     (★)
```

(★) is the participation constraint: the attacker must pay each targeted attester
at least `p_d·(S_i + V_i)`. This is the source's real contribution and it is
correct.

---

## 2. Correction A — per-identity attack cost is *decreasing* in N [CORRECTION]

The source's later text asserts `dγ/dN > 0` (the N-th fake costs more than the
first). It does not.

**A bribe is a fixed cost, not a per-unit one.** An attester corrupted once signs
arbitrarily many credentials. The attacker pays `k` bribes, then mints freely:

```
γ(N) = k·b / N          →  strictly decreasing in N.
```

Institutional corruption has **economies of scale in the attacker's favour**.

Detection does not rescue this. If each fraudulent attestation carries an
independent detection hazard `q`, then over `N` of them

```
p_d(N) = 1 − (1 − q)^N   ⟶   1   as N → ∞,
```

so the participation bribe `b(N) → (S + V)` — it *saturates* — while `N` grows
without bound, and `γ(N) = k(S+V)/N → 0`.

> **Result 1 [THIS WORK].** Under fixed-cost corruption, per-identity attack cost
> falls with scale and detection probability saturates. No choice of `k`, the
> diversity predicate `D`, or stake `S` makes bulk Sybil attacks expensive per
> unit. A security argument that rests on rising marginal cost is unsound,
> because marginal cost falls.

---

## 3. What bounds the attack: bulk revocation on detection

The bound is on the **revenue** side, and it needs a specific mechanism.

**If detecting a corrupt attester revokes every credential it signed** — the
Gate 6 bulk-rebuild path — then on detection the attacker loses the entire
portfolio, not just future earnings. Let `R := β·m·E` be the lifetime revenue of
one surviving fake identity. Expected attacker profit from an attack of size `N`
through `k` corrupted attesters:

```
Π(N) = (1 − q)^N · N · R  −  k·b                                  (†)
        └ portfolio survives ┘   └ fixed corruption cost ┘
```

Detection risk compounds **multiplicatively** in `N`; revenue grows only
**linearly**. That asymmetry is the whole bound.

### 3.1 Theorem 4 (optimal attack size) [THIS WORK]

Maximize `(1 − q)^N · N` over `N`:

```
d/dN [ (1 − q)^N · N ] = (1 − q)^N · ( 1 + N·ln(1 − q) ) = 0
⇒  N* = −1 / ln(1 − q)  ≈  1/q          (small q)
```

At `N*`, `(1 − q)^{N*} = e^{−1}`, so the attacker's maximum gross revenue is

```
Π_max + k·b  =  (1 − q)^{N*} · N* · R  =  e^{−1} · (R / q) · (1 + o(1)).
```

**Fixed-point consistency of the bribe.** The bribe enters (†) as a constant
`k·b`, yet `b` must satisfy (★) with `p_d` evaluated at the attack size that
actually occurs. This is a rational-expectations fixed point: assume `k·b`
constant → derive `N* ≈ 1/q` → `p_d(N*) = 1 − e^{−1} ≈ 0.632` → the
participation bribe is `b = 0.632·(S + V)`, a constant → consistent with the
assumption. The fixed point exists and is self-consistent; no circularity.

*(If instead the bribe is modelled as adjusting continuously with `N` during the
attacker's own optimization, `k·b(N) = k(1−(1−q)^N)(S+V)`, the stationary
condition gains a term and `N* ≈ 1/q − k(S+V)/R`. Near the security boundary of
§3.2 that is a constant-factor shift (`N*` about `0.4/q`); the scaling
`N* = Θ(1/q)` and every qualitative conclusion below are unchanged. The
fixed-point model above is the cleaner statement and is used henceforth.)*

### 3.2 Corollary 4.1 (the security condition) [THIS WORK]

The attack is unprofitable iff `Π_max < 0`, i.e. `k·b > e^{−1}·R/q`. Substituting
the participation bribe `b = (1 − e^{−1})(S + V) ≈ 0.632(S + V)`:

```
0.632 · k(S + V)  >  0.368 · R / q
```

```
┌─────────────────────────────────────────────┐
│   k·(S + V)   >   0.58 · β·m·E / q           │   (security condition)
└─────────────────────────────────────────────┘
```

Safe design rule, with margin (`0.58 < 1`):

```
   k·(S + V)  ≥  β·m·E / q .
```

**Shape of the bound** — and why it is more useful than the `k`-clique form the
source targeted:

- **Linear in `k`.** Adding attesters helps proportionally, not exponentially.
- **Inverse in `q`.** The per-attestation detection hazard is the dominant
  parameter; halving `q` doubles the required stake-plus-franchise.
- **Independent of attacker capital.** A well-funded attacker faces the same
  unprofitability; the constraint binds on expected value, not budget.
- **`S + V` is the security budget** — stake *plus* franchise value. An attester
  with no stake but a large honest revenue stream is still deterred; a brand-new
  attester with neither is not.

> **Result 2 [THIS WORK].** Economic security under attester corruption rests on
> **bulk revocation**, not on rising marginal cost. Without portfolio-wide
> revocation on detection, `Π(N)` in (†) loses the `(1−q)^N` factor, grows
> without bound, and no parameter choice deters a large attacker. The Gate 6
> bulk-rebuild path — built for operational reasons — is what makes the economics
> close at all. **A deployment shipping the R-list for individual revocation but
> omitting bulk rebuild has an unbounded Sybil economy regardless of its
> `γ ≥ β·m·E` compliance.** This converts an engineering decision into a security
> requirement, and the paper should state it.

---

## 4. Correction B — `dβ/dN < 0` is application-specific [CORRECTION]

The source assumes `β` strictly decreases in `N` by dilution. That holds for
**fixed-pool** distributions and nothing else:

| application | `β(N)` |
|---|---|
| Airdrop, quadratic funding, fixed-pool UBI | **decreasing** — dilution, as the source assumes |
| Spam, ad fraud, fake-account abuse | **≈ constant** — each account extracts independently |
| Review manipulation, astroturfing, coordinated review | **possibly increasing** — threshold effects; the 100th fake post is worth more than the 1st |

The bot-defence wedge is row 2; the coordinated-inauthentic-behaviour case
(already the paper's weaker application, §6) is row 3. Importing universal
dilution would credit the deployment with a favourable term it does not have.

**State `β(N)` as a per-application input; treat constant `β` as the conservative
default.** Theorem 4 was derived with constant `R = βmE`, so: under decreasing
`β` the bound is strictly easier; under increasing `β` it is harder and the
coordinated-behaviour case needs its own treatment (the multiplicative-in-`N`
revenue term in (†) becomes super-linear, which can eliminate the interior
`N*` — worth a dedicated note).

---

## 5. Correction C — the attacker's optimization is polynomial, not NP-hard [CORRECTION]

The source frames attester selection as a **minimum-weight `k`-clique** problem,
implying computational hardness helps the defender.

It is not a clique problem. Corrupted attesters need **no relationship to each
other**. The attacker needs `k` attesters jointly satisfying the diversity
predicate `D`. If `D` is "one attester from each of `k` distinct categories," the
attacker's problem is a **minimum-cost transversal**: take the cheapest attester
in each category. Greedy, linear time. For richer `D` (distinct organizations
*and* jurisdictions) the structure is matroid intersection or min-cost
assignment — both polynomial.

> **Result 3 [THIS WORK].** No computational hardness protects the defender in
> attester selection. The attacker solves the selection exactly and cheaply.
> Security comes entirely from the cost levels `b_i`, never from the difficulty
> of choosing whom to bribe. Any argument leaning on the attacker's planning
> complexity is unsound.

**Design consequence.** The security budget is set by the `k` **cheapest**
attesters satisfying `D`, not the average:

```
k·(S + V)   ⟶   Σ_{i ∈ cheapest D-transversal} (S_i + V_i).
```

A single under-staked attester in a required category caps the entire system's
security. The diversity predicate should therefore be paired with a per-category
minimum on `S_i + V_i`, enforced at attester onboarding.

---

## 6. Correction D — `N* < ε` is unattainable and is the wrong target [CORRECTION]

The source proposes proving the designer can force `N* < ε` for arbitrarily
small `ε`. Impossible: `N* = −1/ln(1−q) ≥ 1` for every `q ∈ (0, 1]`. Optimal
attack size cannot be tuned below one identity.

The correct, achievable target is **unprofitability at the optimum**,
`Π(N*) < 0` — exactly Corollary 4.1. Under it the rational attacker mints
**zero** fakes, not because `N*` is small but because the best achievable profit
is negative. Conflating "small `N*`" with "unprofitable attack" would yield a
theorem that is both false and unnecessary.

---

## 7. The parameter nobody has measured: `q` [THIS WORK]

Corollary 4.1 makes `q` — the per-fraudulent-attestation detection hazard — the
dominant security parameter. It appears *inversely*: it matters more than `k`,
`S`, or `V`.

It has never been estimated for this system or a comparable one. `β` is at least
acknowledged as unmeasured (paper falsification criterion 3); `q` is not on the
list.

**`q` depends on** whistleblowing rates inside corrupted institutions;
correlation detection across the attester graph (does the system notice the same
`k` attesters co-signing unusually often?); audit cadence; and the observability
of attestation patterns. Each is an unmade design choice.

> **Result 4 [THIS WORK].** `q` belongs in the paper's falsification criteria
> alongside `β`. The bound `k(S+V) ≥ βmE/q` is unfalsifiable without an estimate
> of `q`. A deployment that does not instrument detection has `q ≈ 0`, which
> sends required stake to infinity. **Correlation monitoring across the attester
> graph is not an operational extra — it is what makes `q > 0` and the bound
> finite.**

---

## 8. What goes in the paper (§4 economics, after §4.4)

A short subsection, with derivation:

1. Per-identity attack cost **decreases** in `N` under fixed-cost corruption
   (Result 1) — stated against the intuitive marginal-cost story.
2. Bulk revocation on detection is the bound: `Π(N) = (1−q)^N N R − kb`,
   `N* ≈ 1/q`, max gross revenue `≈ R/(e·q)` (Theorem 4).
3. Design rule `k(S+V) ≥ βmE/q` — linear in `k`, inverse in `q`, independent of
   attacker capital (Corollary 4.1).
4. Security is set by the **cheapest `D`-transversal**, not the average attester;
   pair `D` with a per-category `S_i+V_i` floor (Result 3).
5. `q` and `β` are both unmeasured; both are falsification criteria (Result 4).
6. One sentence making the revocation dependency explicit: **omitting bulk
   rebuild leaves an unbounded Sybil economy at any `γ`** (Result 2).

Derivable in a few pages, survives scrutiny, and explains *why* the system's own
revocation mechanism is a security requirement rather than an operational nicety.

---

## 9. Falsification

1. **Theorem 4** fails if the detection hazard is not independent per
   attestation — e.g. if detection fires on an aggregate pattern rather than
   individual events, `p_d(N)` takes a different form and `N*` shifts. Model both
   an independent-hazard and an aggregate-trigger monitor and report which fits a
   real design. **[OPEN]**
2. **Corollary 4.1** fails if bulk revocation is incomplete: any credential that
   survives attester revocation restores an unbounded term in `Π`.
3. **Result 3** fails if a natural diversity predicate `D` exists whose
   satisfaction is genuinely NP-hard *and* whose hardness binds at realistic `k`.
   Expectation: none does, and leaning on it would be unsound regardless. One
   literature search warranted. **[OPEN]**
4. If **`q` cannot be estimated even to an order of magnitude** for any plausible
   deployment, the bound is unusable in practice and the paper must say so rather
   than present an unfalsifiable inequality.
5. The **increasing-`β`** (coordinated-behaviour) case is not covered by
   Theorem 4 and needs its own treatment; if the interior `N*` disappears there,
   the security story for that application is different. **[OPEN]**

---

## 10. Bottom line

The bribe micro-foundation `b_i > p_d(S_i + V_i)` is correct. The marginal-cost
story built on it runs backwards: bribes amortize, detection saturates,
per-identity cost falls with scale. What bounds the attack is **portfolio-wide
revocation on detection**, which gives `N* ≈ 1/q`, maximum attacker revenue
`≈ R/(e·q)`, and the design rule

```
k·(S + V)  ≥  β·m·E / q .
```

Linear in `k`, inverse in `q`, capital-independent. It is the Section-11-shaped
closed form Problem 4 was reaching for, it is cleaner than the `k`-clique target,
and it makes two things explicit that the original framing could not: the
bulk-revocation path is load-bearing for security, and `q` is an unmeasured
parameter more important than any currently tracked.
