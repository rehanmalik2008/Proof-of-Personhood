# Pricing Personhood

### Part II. Three results, one construction, and a correction to Part I

---

## 0. Status of the claims below

I ran the models before writing this. Everything labelled **Result** is derived and numerically verified; the code is short enough that you should re-run it yourself rather than trust me. Everything labelled **Conjecture** is an argument I find persuasive and cannot prove. Everything labelled **Construction** is engineering built from existing primitives, and the contribution is the composition rather than any new cryptography.

One of the results overturns a claim I made in Part I. That section is retracted below. This is the correct behaviour for a research program and you should expect to do it to yourself repeatedly.

---

## 1. The reframe that makes the problem tractable

Douceur's 2002 result on the Sybil attack is usually quoted as an obstacle. It should be read as an instruction.

The result says: in a distributed system without a trusted authority, an adversary with sufficient resources can always present multiple identities, and no purely local test distinguishes them. There is no cleverness that escapes this. Every proposal that claims to *verify* personhood without a trusted root is either wrong or has smuggled in an authority.

So stop trying to verify personhood. It is not verifiable.

> **Personhood is not a fact to be checked. It is a scarce asset to be priced.**

This is exactly the move Satoshi made and almost nobody notices. Bitcoin does not identify honest nodes. It cannot. Byzantine agreement without synchrony assumptions is impossible, and Satoshi did not solve it. He made dishonesty cost more than it earns, and then made the cost verifiable. The security property is economic, not epistemic.

The corresponding target for personhood is therefore not "one human, one identity." It is two properties:

1. **Costly to mint.** An identity must cost real, non-parallelizable resources to create.
2. **Worthless to resell.** An identity must be economically non-transferable, without any biometric or hardware binding.

Property 1 is well-trodden and, as Result 1 shows, much harder than the literature admits. Property 2 is where I think the actual opening is, and Result 2 is the argument. It rests on an inversion I have not seen stated: **anonymity is what destroys the black market in identities, not what enables it.**

---

## 2. Result 1 — The scaling argument is worthless

### 2.1 Retraction

In Part I, §4.4, I argued that sybil attacks are deterred because attack cost is linear in the number of fake identities while application reward is sublinear, giving a crossover above which attacks lose money. This is the standard argument in the personhood literature. It is wrong, and I should have checked it before writing it down.

### 2.2 The model

Let an attacker create $n$ identities. Cost is linear: $C(n) = \gamma n$, where $\gamma$ is the all-in cost of one identity. Reward has diminishing returns: $R(n) = \beta n^{\alpha}$ with $0 < \alpha < 1$, where $\beta$ is the value of the first fake identity. Profit is $\pi(n) = \beta n^{\alpha} - \gamma n$.

Optimising:

$$\pi'(n) = \alpha\beta n^{\alpha-1} - \gamma = 0 \quad\Longrightarrow\quad n^{*} = \left(\frac{\alpha\beta}{\gamma}\right)^{\frac{1}{1-\alpha}}$$

$$\pi(n^{*}) = n^{*\alpha}\left(\beta - \gamma n^{*\,1-\alpha}\right) = n^{*\alpha}\left(\beta - \alpha\beta\right) = \beta(1-\alpha)\,n^{*\alpha}$$

**Since $\alpha < 1$ and all terms are positive, $\pi(n^{*}) > 0$ always.** There is no value of $\gamma$, however large, at which the continuous attack becomes unprofitable. The crossover I asserted does not exist.

### 2.3 What actually deters

Identities are integers, so the real question is $\max_{n \in \mathbb{Z}^{+}} \pi(n)$. Solving numerically across a wide parameter range gives a single clean answer:

$$\boxed{\ \gamma \;\ge\; \beta \;=\; R(1)\ }$$

The deterrence threshold is exactly the value of the *first* fake identity, and it is **completely independent of $\alpha$**. I swept $\alpha \in \{0.3, 0.5, 0.7, 0.9\}$ and the minimum deterring cost was identical in every case. How fast the returns diminish does not matter at all.

The intuition, once you see it: under high identity cost the attacker's optimum collapses to $n = 1$. Mass sybil attacks were never the binding case. The binding case is one fake identity that pays for itself.

### 2.4 Why this is the most useful thing in this paper

It invalidates an entire family of security arguments, including several deployed ones.

- **Reward caps do not save you.** I tested capping extractable value at $R_{\max}$ and derived a plausible-looking rule ($\gamma > R_{\max}/n_{\text{sat}}$). It failed by a factor of twenty-five in the first test case. Capping aggregate damage does nothing about the single profitable fake.
- **"It doesn't scale for an attacker" is not a security property.** It is a description of the attacker's least interesting strategy.
- **A protocol with one global identity price cannot secure applications of differing value.** If minting costs \$10 and one fake identity in your application earns \$500, you are not protected, no matter how elegant the cryptography.

**Design consequence — graduated assurance.** The protocol must let a verifier demand an arbitrary amount of assurance, priced to its own exposure per identity. Concretely: a verifier specifies a required number of independent attestations $k$, a diversity predicate, and a bonded stake $\sigma$ forfeited on burn. Effective cost becomes $\gamma_{\text{eff}} = k\,A_{\text{new}} + \sigma$, and the verifier tunes it until $\gamma_{\text{eff}} \ge \beta_{\text{local}}$, its own estimate of what one fake account earns.

Personhood is therefore not a boolean. It is a **dial with a price attached**, and the protocol's job is to expose the dial honestly rather than to assert a verdict. Any system that returns "human: true" is lying about a quantity.

---

## 3. Result 2 — Anonymity destroys the rental market

This is the part I think is genuinely new, and it attacks the problem that drives everyone else toward iris scanners.

### 3.1 The problem everyone gives up on

Without biometric or hardware binding, credentials are transferable. Someone poor sells theirs; someone coercive takes one. Camenisch and Lysyanskaya's all-or-nothing non-transferability binds a credential to a high-value secret, so sharing the credential means sharing your bank key. It does not work in practice, because the owner never has to share the key. They can run an **oracle**: keep the secret, answer proof requests on demand. Oracle rental defeats every secret-binding scheme.

So attack the oracle economically instead of cryptographically.

### 3.2 The two structural facts

**Fact A — oversubscription is unobservable.** The seller holds the secret and can serve $m$ buyers simultaneously. No buyer can observe $m$, because the protocol is unlinkable by construction. The seller is strictly better off overselling.

**Fact B — the contract is unenforceable.** A rental agreement over an anonymous credential cannot be enforced. There is no counterparty identity, no court, no reputation attached to the specific credential — attaching one would require linking it across contexts, which is precisely the operation the protocol forbids. The buyer has no recourse whatsoever.

Both facts are consequences of the privacy properties. This is the inversion: **the features that protect the honest user are the same features that make the black market uncontractable.**

### 3.3 The model

Let $v$ be the value of one honest use of a credential in one context in one epoch. The seller rents to $m$ buyers at price $p$ each. Only one buyer can successfully use it in a given (context, epoch), since duplicate nullifiers trigger the burn. A rational buyer facing expected oversubscription $m^{e}$ pays at most $p = v / m^{e}$.

Seller revenue: $m^{e} \cdot p = m^{e} \cdot v/m^{e} = v$.

**Result 2a.** *Total rental revenue is bounded above by $v$, the value of a single honest use, for every level of oversubscription.* Verified across $m \in \{1,2,5,10,50\}$: revenue is exactly $v$ in all cases.

The seller cannot do better by renting than by simply using the credential once. Renting is at best revenue-neutral before costs — and it is not free. It requires operating an oracle continuously, it risks exposure of the root secret, and in most jurisdictions it is illegal. The strategy is dominated.

### 3.4 The rotation option

Now add the mechanism that makes this bite.

**Construction — root/epoch key hierarchy with free re-attestation.** The user holds a root secret $s_0$ that never moves. Proving uses a derived epoch secret $s_e = \mathrm{KDF}(s_0, e)$ together with a fresh attester signature. Renting means surrendering $s_e$ or oracle access to it. At any moment the owner may rotate: re-derive from $s_0$, obtain refreshed attestations, and every sold copy dies instantly.

The critical parameter is $A_{\text{re}}$, the cost of re-attesting yourself, and the design requirement is:

$$A_{\text{re}} \ll A_{\text{new}}$$

This asymmetry is available for free and I have not seen it exploited. An attester who has already met you can re-attest you at near-zero marginal cost — a signature, no new judgement required. An attester being asked to vouch for a *new* distinct person must actually do the hard work. Cheap refresh, expensive mint. The two costs are structurally different and every existing design collapses them into one.

**Result 2b.** *The seller rotates whenever $v > A_{\text{re}}$.* With $A_{\text{re}} \to 0$ this holds always, so the buyer's expected holding period is one epoch regardless of what was promised.

### 3.5 Putting it together

**Proposition (Rental Futility).** Under (i) free unilateral rotation, (ii) unobservable oversubscription, and (iii) unenforceable contracts, an anonymous personhood credential is an asset with the following properties from the buyer's perspective:

- the seller can destroy it at any time, for free, unilaterally;
- the seller cannot commit not to;
- the seller has already been paid;
- the buyer cannot verify how many other buyers exist;
- the buyer has no legal or reputational recourse.

No rational buyer pays a meaningful price for such an asset. **The seller holds a free, unexpirable put option on the buyer's holding.** Markets in assets with that structure do not clear at meaningful prices.

### 3.6 The coercion case, which matters more

Coercion is worse than rental because price is irrelevant under force. Free rotation still helps, and in a specific way worth stating.

If refresh is free and unilateral, a coercer cannot obtain a durable asset by a one-time act of force. They must maintain *continuous* control over the victim across every epoch, forever. This converts a theft into an occupation. Occupations are orders of magnitude more expensive, more visible, and more prosecutable than thefts.

This does not solve coercion. Nothing solves coercion. It changes its cost structure by a large factor, which is the most any protocol can honestly claim.

### 3.7 The strongest objection

**Brokers.** A dealer could aggregate many credentials and build a pseudonymous reputation as a reliable supplier, restoring the trust that Fact B removes.

This is real and I do not have a clean answer. Three partial responses.

First, the broker cannot verify that the underlying owners will not rotate, so the broker bears the rotation risk and must price it into every sale. That raises the price toward the value of honest use, which was the bound anyway.

Second, the broker's reputation is a liability, not just an asset. A reputable broker is a *findable, persistent entity* — exactly the thing the rest of the protocol does not produce. Brokers are attackable by ordinary means: legal, technical, and by honest participants who sell them credentials and then rotate.

Third, and most honestly: this is a live research question and it is the thing I would try hardest to break if I were attacking this design. Treat §3.7 as the top of the open-problems list.

---

## 4. Construction — minting without an authority

Result 1 says identities must cost at least the value of one fake identity in the target application. For a high-value application that could be hundreds of dollars. Where does that cost come from without a central authority?

Two independent sources, feeding one proof format. Applications choose their mix. Neither is required.

### 4.1 Attested minting

The social and institutional attesters from Part I. Cheap for the well-connected, high assurance, but excludes people with thin institutional ties and is vulnerable to attester collusion at state scale.

### 4.2 Sequential-cost minting

The permissionless fallback, for anyone with a computer and no institutions willing to vouch for them.

The user maintains a **verifiable delay function chain** anchored to their root secret. Each step is inherently sequential and unparallelizable. Maintaining $N$ identities requires $N$ separate machines running continuously; you cannot buy your way out with parallelism, only with linear hardware.

The arithmetic is favourable. One core running continuously draws roughly 5–10 W, so about 50–90 kWh per year, which is on the order of \$10 of electricity depending on region. Ten million sybils therefore cost on the order of \$100M per year in raw energy alone, plus hardware. Total global energy consumption for a hundred million identities is a rounding error next to Bitcoin's, because the work is sequential rather than parallel — there is no incentive to add more hardware per identity.

**The known weakness, stated plainly.** VDF hardware acceleration is real. Ethereum's VDF programme ran into precisely this. If a specialised ASIC runs the chain $\sigma$ times faster than commodity hardware, sybils get $\sigma$ times cheaper. Mitigation is the standard one and it is unsatisfying: publish the fastest known implementation, assume a bounded speedup, and price with that margin. Any deployment must monitor $\sigma$ as a live security parameter, and $\sigma$ can jump discontinuously when someone tapes out a chip.

### 4.3 Composition

Both paths terminate in the same object: an unlinkable credential over a commitment to $s_0$, provable via the nullifier construction from Part I. A verifier's policy is a predicate over the attestation set — how many, from which categories, with what diversity, backed by what stake. The protocol enforces the proof; it does not opine on the policy.

This matters more than it sounds. **The protocol must never decide who counts as a person.** It supplies verifiable, priced evidence and lets each verifier set its own bar. A protocol that ships a global personhood standard has installed exactly the authority it was built to avoid, and will eventually be captured.

---

## 5. The adoption criterion, which is where these projects actually die

Most protocol proposals fail on distribution, not cryptography. There is a test that predicts this well, and it should be applied as a **design constraint** rather than a marketing afterthought.

> **The Unilateral Value Test:** does the first adopter, with zero counterparties, gain more than they spend?

Check it against history:

| System | Passes? | Outcome |
|---|---|---|
| HTTP | Yes — one server plus one browser is immediately useful | Universal in ~5 years |
| TLS | Yes — one site, one browser, done | Universal |
| Linux | Yes — useful on one machine | Universal |
| Bitcoin | Barely — mining alone is worthless | Took ~10 years and required ideology to bridge the gap |
| Fax, early email, DNSSEC, IPv6 | No | Decades of stall, or subsidised mandates |

Now design for it. A platform deploys the protocol, **runs its own attester**, and immediately gets unlinkable-but-unique accounts inside its own product. That is real value on day one with zero counterparties: bot reduction, account-farming resistance, and a privacy posture it can advertise. It needs nobody's permission and nobody's cooperation.

Portability is a free by-product. The credential the platform issues is already in the universal format, so it *can* be presented elsewhere later. The platform did not do this for the network's benefit and does not need to care.

**This is the whole go-to-market and it is also an architectural requirement.** Self-attestation by a single verifier must be a complete, useful deployment, not a degraded mode. If the design only works at scale, it will never reach scale. Git was useful on one laptop before GitHub existed; that is the pattern to copy.

---

## 6. What "foundational" actually means

A layer is foundational when things get built on top of it that could not exist below it. Payment protocols were foundational because they enabled commerce, not because they moved money. So: what becomes possible above a working personhood layer that is impossible today?

**Portable reputation.**

Right now your reputation is an asset held by platforms and it does not travel. Fifteen years of seller history, driver ratings, community standing, contribution record — all of it is hostage. This is the actual moat around every large platform. It is not the technology and it is not the network effect. It is that leaving costs you your accumulated proof of being reliable.

Unlinkable-but-unique identity dissolves this. You can prove "I hold a credential attesting five years of good standing at some marketplace, and I am a distinct person, and this is my first account here" **without revealing which marketplace, without revealing who you are, and without letting the two platforms correlate you.** Selective disclosure over anonymous credentials already does this; the missing piece was uniqueness, which is what the rest of this paper is about.

The second-order consequence is large and specific: **platform lock-in based on hostage reputation ends.** Not by regulation, not by antitrust litigation, not by breaking anything up. By making the hostage portable. Switching costs collapse across marketplaces, gig platforms, social networks, and lending simultaneously, and competition has to happen on service quality instead.

That is the closest thing here to a claim about reshaping anything, and I would rather state it in that narrow, checkable form than in a grand one. A protocol that ends reputation hostage-taking would be a genuinely significant piece of infrastructure. It would not reshape humanity. Almost nothing does, and the projects that describe themselves that way have a poor record.

---

## 7. Honest odds and the failure modes

Four ways this dies, in rough order of probability.

1. **Broker markets restore rental liquidity** (§3.7) and the non-transferability argument fails. This is the most likely technical failure and the first thing to test.
2. **Result 1 makes the required identity price too high for valuable applications.** If one fake account in a lending market earns \$5,000, the identity must cost \$5,000, which excludes most of humanity. Personhood proofs may simply not be the right tool above some value threshold, and the honest conclusion would be to bound the protocol's claimed domain rather than stretch it.
3. **State digital identity standardises first** and the protocol becomes technically superior and commercially irrelevant. The counter is interoperating as an attester-of-attesters early, which means engaging with standards bodies you will find tedious.
4. **VDF speedup discontinuity** collapses the permissionless minting path overnight, leaving only attested minting, which recentralizes.

Any one of these is fatal and you should try to trigger all four deliberately in the first six months. The good news is that they are cheap to test: three of the four are spreadsheet and literature work, not engineering.

---

## 8. What to do this week

The most valuable thing in this document is Result 1, and it took twenty minutes of arithmetic that I should have done before writing Part I.

So:

1. **Re-derive Result 1 yourself.** Do not take my word for it. Then apply it to whatever specific application you would target first, with real numbers: what does one fake account earn there? That number is your identity price floor and it determines whether the project is viable at all.
2. **Try to break Result 2** by designing the broker market of §3.7 as adversarially as you can. If you can construct a liquid, rotation-resistant market in rented credentials, the non-transferability claim is dead and you have saved yourself years.
3. **Write down $A_{\text{re}}$ and $A_{\text{new}}$ for three real attester types.** If you cannot make the ratio large in practice, §3.4 is theoretical furniture.
4. Only then write code.

The pattern to internalise: I made a confident structural argument in Part I, checked it, and it was wrong in a way that changed the design. That will happen to you repeatedly, and the speed at which you let it happen is most of your edge over people with more resources. The failure mode is not being wrong. It is being wrong slowly, in public, after raising money on it.

---

### Verification code

Everything in §2 and §3 comes from the following. Run it, change the parameters, and try to make my claims fail.

```python
import numpy as np

def best_attack(alpha, beta, gamma, Rmax=None, nmax=5_000_000):
    """beta = value of first fake identity; gamma = cost per identity."""
    n = np.arange(1, nmax)
    R = beta * n**alpha
    if Rmax is not None:
        R = np.minimum(R, Rmax)
    pi = R - gamma*n
    i = int(np.argmax(pi))
    return n[i], pi[i]

# Result 1: deterrence threshold is beta, independent of alpha.
for alpha in (0.3, 0.5, 0.7, 0.9):
    lo, hi = 0.01, 10_000
    for _ in range(60):
        mid = (lo + hi)/2
        lo, hi = (mid, hi) if best_attack(alpha, 100, mid, nmax=200_000)[1] > 0 else (lo, mid)
    print(f"alpha={alpha}: min deterring cost = {hi:.2f}  (value of first sybil = 100)")

# Result 2a: rental revenue is capped at one honest use, for any oversubscription.
v = 100.0
for m in (1, 2, 5, 10, 50):
    print(f"m={m:>3}  price={v/m:7.2f}  seller revenue={m*(v/m):7.2f}")
```
