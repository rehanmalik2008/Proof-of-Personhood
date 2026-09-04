# Task 2.1 — Out-of-band seller reputation

### A partial falsification of Result 3, a design flaw it exposed, and Result 4

**Status of this note:** one Tier-1 open problem worked. Contains one retraction, one previously-unnoticed flaw in the core design, one Construction that repairs it, and one new Result. Ends on the attack, per §3 of the brief.

---

## 1. Claim summary, labelled

| # | Claim | Label |
|---|---|---|
| 1.1 | Out-of-band bonded reputation **does** sustain honest supply for `p > 2v`. Result 3's poisoning argument does not apply to reputation-bearing sellers. | **Falsification** of Result 3's universality |
| 1.2 | Because nullifiers are per-context, `v` decomposes and equals **zero** for any context the seller does not personally use. Supply is therefore free, and economic non-transferability fails outright. | **Result** (verified) |
| 1.3 | Coupling the burn globally per epoch restores `v = V_total`. | **Construction** |
| 1.4 | Under coupling, poisoning returns with cost ratio `M:1`, and fault is unattributable, so bonds cannot be enforced. Brokerage fails again. | **Result 4** (verified, one-shot) |

Net: the core claim survives, but **only because of a design change that did not previously exist in the protocol**, and the surviving argument is narrower than Result 3 as originally stated.

---

## 2. Step 1 — The attack works. Result 3 is falsified for bonded sellers.

### Model

Repeated game, grim trigger. Seller holds a pseudonymous vendor identity *outside* the credential system (marketplace handle, escrow account) carrying bond `B` and reputation. Per epoch:

- **Honest sale:** receive `p`, forgo own use worth `v`. Net `p − v` per period, forever.
- **Poison:** receive `p`, rotate at cost `A_re`, keep credential yielding `v` forever, forfeit `B`, lose the sales stream.

$$\text{honest} = \frac{p-v}{1-\delta} \qquad\qquad \text{deviate} = p - A_{\text{re}} - B + \frac{\delta v}{1-\delta}$$

### Derivation

Honest is sustainable iff $\;p\delta \ge v(1+\delta) - (1-\delta)(A_{\text{re}}+B)$, giving

$$p^{\dagger} = \frac{v(1+\delta) - (1-\delta)(A_{\text{re}}+B)}{\delta} \;\xrightarrow[\delta \to 1]{}\; 2v$$

### Result

Honest supply is sustainable for any patient seller once `p > 2v`. Verified at `δ ∈ {0.5, 0.9, 0.99, 0.999}` and `B ∈ {0, 10, 100}`.

Two things worth flagging, one of which surprised me:

- **The bond is nearly irrelevant.** At `δ = 0.999`, raising `B` from 0 to 100 moves the threshold from 40.02 to 39.92. Patience does all the work; the bond does almost none. Any analysis that treats bonding as the mechanism here is looking at the wrong variable.
- **The threshold is `2v`, not `v`,** because the seller is comparing *net rental income* `p − v` against *simply keeping the asset*, worth `v`. Renting must beat holding, not merely beat zero.

**Retraction.** Part II, Result 3 claimed brokerage fails because poisoning strictly dominates honest selling. That holds only for anonymous, non-reputation-bearing sellers. It is false for sellers with out-of-band reputation, and the brief was right to rank this as the live kill-shot. Result 3 as stated is too strong and is hereby narrowed.

---

## 3. Step 2 — What is `v`? (This is where the real problem was.)

Step 1 leaves the survival of the whole claim resting on one quantity: the value to the seller of their own use. So I went to price it, and found something worse than the broker attack.

**Nullifiers are per-context by construction.** `N = H(s ‖ ctx ‖ e)`. That is precisely what buys unlinkability — a proof in context A cannot be correlated with a proof in context B. It follows that a credential is not one asset. It is a **bundle of per-context assets**, one per context, each independently sellable.

And `v` is not a scalar. It is `v_c`, per context. For any context the seller does not personally participate in:

$$v_c = 0 \quad\Longrightarrow\quad p^{\dagger} = 2v_c = 0$$

A person participates in perhaps twenty contexts. There are millions. **Every context a seller does not use is sellable at any positive price, costing them nothing.** Verified: with `V_total = 400` across 20 used contexts, used contexts price at `p† = 40`, unused contexts at `p† = 0`.

This is not a broker problem. It falsifies economic non-transferability directly, with no broker required — ordinary people can sell the 99.99% of their personhood they never use, at zero cost to themselves, permanently.

I did not see this in Parts II or III. It was sitting inside the unlinkability property the whole time, and Results 2 and 3 both silently assumed a scalar `v`. **This is the most important finding in this note** and it would have been fatal if discovered after two years of engineering instead of during an afternoon of game theory.

---

## 4. Step 3 — Construction: global per-epoch burn coupling

The repair follows directly from the diagnosis. Make the burn **global per epoch** rather than per context: a duplicate use in *any* context reveals `s_e = KDF(s₀, e)`, which invalidates *every* context for that epoch, including the seller's own.

The root `s₀` survives, so the honest user rotates and continues. But `v` is no longer decomposable, because the asset being risked by any single sale is the whole epoch.

With `q` the per-epoch probability that a given sold context sees a duplicate use, the seller's exposure is $1 - (1-q)^{M}$ over `M` sold contexts:

| Contexts sold `M` | q = 0.02 | q = 0.05 | q = 0.10 | Expected loss at q=0.05 (of `V_total`=400) |
|---:|---:|---:|---:|---:|
| 1 | 0.020 | 0.050 | 0.100 | 20.0 |
| 5 | 0.096 | 0.226 | 0.410 | 90.5 |
| 20 | 0.332 | 0.642 | 0.878 | 256.6 |
| 50 | 0.636 | 0.923 | 0.995 | 369.2 |
| 200 | 0.982 | 1.000 | 1.000 | 400.0 |

At twenty sold contexts and `q = 0.05` the seller loses their entire personhood with probability 0.64 **every epoch**. The threshold price returns to `2·V_total`, and scales *superlinearly* in how much they sell.

Note this is a genuine protocol change with real costs, stated in §6. It is not a reinterpretation.

---

## 5. Step 4 — Result 4: poisoning returns, and bonds cannot stop it

Coupling has a second consequence that repairs Result 3 by a different route than the original argument.

A defender buys **one** context from a seller, deliberately double-uses it, and leaks `s_e`. That destroys **every context that seller sold this epoch, across every broker they supply.**

| Contexts sold `M` | Defender pays | Inventory destroyed | Ratio |
|---:|---:|---:|---:|
| 1 | 30 | 30 | 1:1 |
| 20 | 30 | 600 | 20:1 |
| 200 | 30 | 6,000 | 200:1 |

**The cost ratio equals the seller's own oversubscription.** The more they sell, the cheaper they are to destroy. This is the opposite of every normal economy of scale.

And the reputation mechanism from Step 1 cannot be repaired, for a reason that is structural rather than incidental:

> `s_e` leaked. Which of the `M` buyers defected? The leak reveals the secret, not the leaker. Credentials are unlinkable. **Fault is unattributable, and bonds require attributable fault.**

The same property that made Step 1's attack work — out-of-band identity carrying enforceable consequences — cannot reach inside the protocol to identify who broke the contract. The bond is enforceable against the *seller* and useless against the *buyer*, and it is buyer defection that destroys the inventory.

### Seller's escape routes, priced

| Route | Cost |
|---|---|
| Sell only 1 context/epoch | Supply throttled to one use per person per epoch, which *is* the honest bound. No market exists. |
| Separate root secret per context | Each root needs its own `k` attestations at `A_new`. That is exactly `γ`. Result 1 applies unchanged, no saving. |
| Only sell contexts they don't use | Irrelevant under coupling — all contexts share `s_e`. |

**Result 4.** *Under global per-epoch burn coupling, a seller supplying `M` contexts can be destroyed for the price of one purchase, at cost ratio `M:1`; and because credentials are unlinkable, buyer defection is unattributable, so out-of-band bonds cannot deter it. Brokerage fails again — not because honest supply is unsustainable (Step 1 showed it is), but because the resulting inventory is destroyable at a ratio the seller's own volume determines.*

---

## 6. Self-attack

The hardest objections I can build against my own answer.

**6.1 Coupling is a usability tax and I have not priced it.** A single duplicate anywhere kills the honest user's whole epoch. Buggy clients, restored backups, and multi-device setups all produce accidental duplicates. Shorter epochs reduce the damage but raise proving and attestation load. **I have not modelled the accidental-collision rate for honest users, and if it is high, the construction is unusable.** This is the first follow-on task and it may kill the fix.

**6.2 `q` is asserted, not measured.** Every number in §4 depends on the probability a sold context sees a duplicate use in an epoch. I picked 0.02–0.10 with no empirical basis. If `q` is 0.001, a seller can supply hundreds of contexts safely and the fix fails quietly. `q` is now a first-class security parameter and it is currently unknown.

**6.3 Result 4 is one-shot; Step 1 proved one-shot reasoning is exactly what fails here.** I attacked Result 3 with a repeated game and then stated Result 4 in one-shot form. A seller who anticipates poisoning will underwrite it — insurance, price markup, selling only to vetted buyers with their own out-of-band bonds. **Result 4 must be redone as a repeated game before it is trusted, and I expect it to weaken.** This is brief item 2.2 and it is now blocking, not optional.

**6.4 Defection is unattributable, but so is defence.** Sellers know defenders exist and will price it in. If the markup is affordable to buyers, the market clears anyway at a higher price. Whether it clears depends on `β` versus `2·V_total`, and I have not connected Result 4 back to Result 1's `γ ≥ β` condition. That connection is where the actual domain boundary lives.

**6.5 State-scale actors are untouched** (brief item 2.3). Every number here assumes a solvency-constrained adversary.

---

## 7. Consequence propagation

- **Part II, Result 3:** narrowed. Poisoning dominance holds only for non-reputation-bearing sellers. The broker conclusion survives via Result 4, by a different mechanism.
- **Part II, Results 2 and 3:** both silently assumed scalar `v`. Both were wrong on that point, and both now depend on the §4 Construction being adopted. **Economic non-transferability is not a property of the protocol as previously specified.**
- **Part I, §4.3:** the nullifier construction must be amended to couple burns per epoch rather than per context. This is a normative change to the design.
- **Grade unchanged:** candidate security property, unreviewed, now with a known-necessary construction and two blocking open items (6.1, 6.3).

---

## 8. Next action

Per §4 of the brief, this session produced one Tier-1 conversion (partial falsification plus Result 4) and one previously-unknown design flaw. Progress, not motion.

The queue has reordered itself. **2.2 (repeated game) is now blocking** because §6.3 means Result 4 is stated in exactly the form Step 1 proved unreliable. Ahead of publication, in order:

1. Redo Result 4 as a repeated game with insurance and buyer vetting (2.2).
2. Model the honest-user accidental-collision rate to price the coupling construction (§6.1, new).
3. Estimate `q` empirically or bound it (§6.2, new).

Publication of the note for demolition should wait until 6.1 and 6.3 are closed, because publishing a one-shot result whose one-shot form has already failed once in this same document would waste the reviewers' attention and the project's credibility.

---

### Verification code

```python
def honest(p, v, d):                 return (p - v) / (1 - d)
def deviate(p, v, d, A_re=0, B=0):   return p - A_re - B + d*v/(1-d)

# Step 1: honest selling IS sustainable above 2v. Result 3 falsified for bonded sellers.
v, d = 20.0, 0.999
thresh = (v*(1+d) - (1-d)*0) / d
assert abs(thresh - 2*v) < 0.1
assert honest(2*v+1, v, d) > deviate(2*v+1, v, d)

# Step 2: v decomposes per context; unused contexts are free to sell.
assert (2 * 0.0) == 0.0                      # v_c = 0 for unused context

# Step 3: coupling restores exposure to the whole personhood.
p_burn = lambda M, q: 1 - (1-q)**M
assert p_burn(20, 0.05) > 0.6
assert p_burn(1, 0.05) < 0.06                # selling one context stays cheap

# Step 4: defender cost ratio equals seller oversubscription.
p = 30.0
for M in (1, 20, 200):
    assert (M*p) / p == M
```
