# Closing the Broker

### Part III. The open problem resolved, an honest grading, and where the money is

---

## 1. What you asked for, and what I can actually give you

> *[Section removed for publication: business and revenue material, which is out of scope for this repository. The technical content of this note is unchanged. See the repository README for what is and is not published.]*


## 2. Result 3 — The broker dilemma

### 2.1 The attack being defended against

Part II, Result 2 argued that anonymous personhood credentials cannot be rented, because oversubscription is unobservable and rental contracts are unenforceable. I identified the strongest objection myself: a **broker** aggregates credentials from many sellers, builds a pseudonymous reputation as a reliable supplier, and thereby restores the contract enforceability that the protocol removed. If brokers work, non-transferability fails and the whole design collapses back to needing biometrics.

The broker needs two things simultaneously:

- **Durable inventory.** Reputation as a reliable supplier is only sellable if you can actually supply reliably tomorrow. That requires holding credentials that persist.
- **Verifiable inventory quality.** You must know what you hold is real before you promise it.

The claim below is that the design makes these two requirements mutually exclusive.

### 2.2 The poisoning attack

Recall the asymmetry that the root/epoch key hierarchy creates: re-attesting yourself costs $A_{\text{re}} \approx 0$, while minting a new person costs $A_{\text{new}} \gg 0$.

A **poisoner** is anyone who sells the broker a credential, takes payment, and then immediately rotates. Their credential dies in the broker's hands. The poisoner keeps their own personhood intact, because rotation is a refresh, not a surrender.

The broker cannot tell a poisoner from a genuine seller before paying. Credentials are unlinkable and identical by construction — the same property that protects honest users.

Compare a supplier's two strategies. Let $p$ be what the broker pays, $v$ the value of the seller's own honest use of the credential, and $A_{\text{re}}$ the rotation cost.

$$\text{honest sale} = p - v \qquad\qquad \text{poison} = p - A_{\text{re}}$$

Since $A_{\text{re}} \ll v$ by design, **poisoning strictly dominates honest selling at every price**. Verified across $p \in \{10, 50, 200\}$ and $A_{\text{re}} \in \{0, 0.5, 2\}$: poison wins in every cell, and no bounty or subsidy is needed to make it win. The seller is simply better off taking the money and refreshing.

If all rational suppliers poison, the poison fraction $\phi \to 1$. Broker margin is $(1-\phi)p_{\text{sell}} - c_{\text{acq}}$, which goes negative well before $\phi$ reaches 1 — at the tested parameters, insolvency arrives around $\phi = 0.67$. This is an Akerlof lemons collapse with adverse selection driven to totality.

Worth noting how cheap the defence is. A defender wanting to force $\phi$ upward pays $A_{\text{re}}$ per unit of poison while the broker pays $c_{\text{acq}}$ per unit of supply. At $A_{\text{re}} = 0.5$ against $c_{\text{acq}} = 10$, a defender buys twenty units of poison for every genuine unit the broker buys. **The attack on brokers is twenty times cheaper than the brokerage itself**, and the ratio is a free design parameter.

### 2.3 The escrow defence, and why it fails differently

The obvious broker counter: don't pay upfront. Pay the supplier only after a buyer successfully uses the credential.

This works against poisoning. A poisoner who rotates before use produces a failed proof and earns nothing. Poisoning dies.

But it introduces a different fatality. A **genuine** seller can rotate immediately *after* the first successful use — collect payment, refresh, keep their personhood. The broker's inventory therefore has a durability of exactly one use, chosen unilaterally by the seller, and the broker has no recourse because there is still no enforceable contract.

Broker gross margin is linear in durability. With durability pinned at one, the broker is reduced to brokering single-use sales, which Result 2a already bounds: total revenue extractable from any one credential is capped at the value of one honest use, for any level of oversubscription. The broker adds nothing over a direct sale and cannot cover its own discovery and matching costs.

More importantly, one-use inventory cannot support a reputation for reliable supply. The reputation was the entire reason the broker existed.

### 2.4 The dilemma

| Broker strategy | What it gains | What kills it |
|---|---|---|
| Pay upfront | Durable inventory, so reputation is sellable | Poisoning strictly dominates for suppliers; $\phi \to 1$; insolvency |
| Pay on use | Poison earns zero, so poisoning dies | Durability collapses to one use; no inventory; nothing to build reputation on |

**Result 3 (Broker Dilemma).** *Under free unilateral rotation and unlinkable credentials, a credential broker must either pay before verifying (and be destroyed by adversarial supply at a cost ratio the protocol designer chooses) or pay after use (and hold no durable inventory, which eliminates the reputation that justified brokerage). No intermediate strategy escapes both, because the broker's inability to distinguish suppliers and the seller's ability to rotate are the same two protocol properties acting on opposite sides of its balance sheet.*

### 2.5 What this actually establishes

Section 3.7 of Part II is closed. Combining Results 2 and 3:

> **Anonymous personhood credentials can be made economically non-transferable without biometrics, without hardware roots of trust, and without any registry — using the privacy properties themselves as the enforcement mechanism.**

This is a security property that the literature generally treats as unattainable. Every deployed approach to non-transferability reaches for a physical binding: an iris, a fingerprint, a secure enclave, a face. The reason is a shared assumption that anonymity and accountability trade off against each other. The argument above says that in this specific market structure they do not — anonymity is *load-bearing* for the accountability, because it is what prevents the black market from forming contracts.

### 2.6 What could still be wrong

Four things I would attack if this were someone else's paper.

1. **Coercion is untouched.** Everything above is about voluntary markets. Force does not respond to price. Free rotation converts theft into occupation, which raises the cost substantially, but coerced credentials remain a real and unsolved harm.
2. **Repeated-game reputation for suppliers.** If a seller can build a persistent pseudonymous reputation *as a seller* across many credentials, poisoning becomes costly to them. I do not think this works, because building that reputation requires linking sales, and the linking is exactly what the protocol prevents. But I have not proved it, and it is the first thing to check.
3. **State-scale brokers don't need margin.** A government running a credential brokerage as an intelligence operation is not solvent-constrained. Every economic argument here is silent against an actor indifferent to losing money.
4. **The model is one-shot and risk-neutral.** Real markets have discounting, partial information, and insurance. Someone should redo this as a proper repeated game before anyone builds on it.

---

## 3. Honest grading

Here is my assessment, which you should weigh against the critique you received, though I think that critique was written before Result 3 existed and would grade differently now.

**What is not a breakthrough.** No new cryptography. BBS+, nullifiers, RLN, VDFs, accumulators, SNARKs all existed. Result 1 is a correction — useful, non-obvious, invalidates a family of deployed arguments, and took twenty minutes.

**What might be.** Results 2 and 3 together are a *security property*, not just an observation: economic non-transferability of anonymous credentials with no physical binding. If that survives adversarial review, it removes the main justification for biometric identity systems, which is a consequential thing to remove. The mechanism is also genuinely counterintuitive in a way that good results usually are — privacy as the enforcement layer rather than the obstacle to it.

**The honest comparison to Satoshi.** He also invented no new cryptography. He composed hashcash, Merkle trees, and public key signatures, and the contribution was an economic security argument about attack cost. Structurally this is the same kind of thing. Whether it is the same *magnitude* depends entirely on whether it survives review and whether anyone builds on it, and those are facts about the future that neither of us has access to.

So: **a candidate result, in the right shape, unreviewed.** That is a genuinely good position and it is not the same as a breakthrough. The distance between them is measured in other people's attempts to break it, and there is exactly one way to cover that distance.

---

## 4. The money, concretely

> *[Section removed for publication: business and revenue material, which is out of scope for this repository. The technical content of this note is unchanged. See the repository README for what is and is not published.]*


## 5. What to do, in order

1. **Call five companies with bot or fraud problems.** Ask one question: what does one successful fake account earn you? Most will not know. That conversation is simultaneously your first sales call, your key research input, and your fastest disproof of the entire project.
2. **Publish Result 3.** Put §2 of this document in front of the anonymous credentials and ZK research communities and ask them to break it. This costs nothing and is the only thing that converts a candidate result into a real one. If it survives six months of that, you have something worth building a decade on. If it dies in three weeks, you have saved a decade.
3. **Only then write the 2,000 lines.**

Note that steps 1 and 2 are free, take under a month, and are the two highest-value actions available to you. The instinct will be to skip to step 3 because building feels like progress. Building is where projects like this go to die quietly.

---

### Verification code

```python
def supplier(p, v_honest, A_re):
    return p - v_honest, p - A_re          # honest sale, poison

for p in (10, 50, 200):
    for A_re in (0.0, 0.5, 2.0):
        h, po = supplier(p, v_honest=20, A_re=A_re)
        assert po > h                       # poison strictly dominates, always

p_sell, c_acq = 30.0, 10.0
for phi in (0.0, 0.4, 0.67, 0.8):
    print(phi, (1-phi)*p_sell - c_acq)      # broker margin goes negative near phi=0.67
```
