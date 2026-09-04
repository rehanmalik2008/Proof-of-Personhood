# Killing the Merkle Cost

### How to prove "k valid attestations" in under 2 s on a normal phone

**Problem.** `WedgeFull` is 29,122 constraints; the depth-20 Merkle inclusion for k=3 attesters is +15,300 (95.5% of the added cost) and ~100% of the added proving time. On a 2019 desktop it is NO-GO at p95 (2.28–2.45 s); on a mid-range phone, ~3–6 s. The signature verifications (~12.6k constraints) are irreducible-ish; **the Merkle path is the whole target.**

**Status.** Labels as before: `Result` = argued and cost-attributed against the measured baseline; `Construction` = composition; `Open` = must be prototyped before trusting. No new cryptography.

---

## 0. Why the Merkle path is expensive, precisely

A depth-20 Poseidon Merkle inclusion is 20 Poseidon hashes per attester. At ~255 constraints/Poseidon and 3 attesters: `3 × 20 × 255 ≈ 15,300`. The cost is *linear in depth × k*. Every lever below attacks one of those three factors — depth, k, or the number of in-circuit hashes per membership — or removes the membership proof from the circuit entirely.

The key realization: **the circuit is proving set-membership the most expensive way possible — recomputing a hash chain per element.** Set-membership has cheaper cryptographic forms. That is the opening.

---

## 1. The four levers, ranked

### Lever A — Replace the Merkle tree with a cryptographic accumulator (the big win) — **Construction**

A Merkle tree proves membership in `O(depth)` in-circuit hashes. **A pairing-based or RSA accumulator proves membership in O(1)** — a single verification, independent of set size, because the witness is a group element and the check is one operation, not a 20-hash climb.

Two concrete options:

- **KZG / polynomial commitment as an accumulator.** Commit to the set of valid attester keys as a polynomial; membership is an opening proof, verified with one pairing check. In-circuit cost is dominated by one pairing (or, better, verified *outside* the circuit — see Lever D). The set can hold millions of attesters with no depth penalty.
- **RSA accumulator (Boneh–Bünz–Fisch batching).** Membership witness is one group element; the in-circuit check is a modular exponentiation, not a hash chain. Crucially, **witnesses for multiple elements batch** — the 3 attester memberships collapse toward the cost of ~1.

**Estimated saving:** replaces ~15,300 constraints with something in the low thousands (or near-zero if verified outside the circuit). This is the single highest-leverage change. **Cost:** more complex trusted setup / accumulator maintenance, and witness-update logic when the attester set changes. But the attester set changes rarely (it's a curated list of institutions), so witness staleness is manageable.

> **Result A.** Moving from Merkle to an accumulator changes membership cost from `O(k·depth)` in-circuit hashes to `O(k)` group operations (or `O(1)` batched), removing the dominant term. This alone plausibly returns `WedgeFull` to the baseline's constraint neighborhood.

### Lever B — Move membership verification *out* of the ZK circuit (the near-free win) — **Construction**

Ask what the circuit actually needs to hide. The user must not reveal *which* attesters signed them (unlinkability). But the *attester public keys themselves are public knowledge* — they're a curated list. What must stay private is the *link* between this user and specific attesters.

**The restructure:** the circuit proves "I hold k valid signatures over my committed secret C, from k distinct keys, satisfying diversity D." It outputs a commitment to the *set of signer keys used* — **not** which specific ones, but a blinded/aggregated commitment. Membership of those keys in the attester set is then checked **by the verifier against the public attester list**, outside the circuit, OR proven via a signature aggregation scheme.

This works if you use a signature scheme where the *verifier* can confirm the signers are in the allowed set without the circuit doing Merkle climbs. Which leads to:

### Lever C — BLS signature aggregation (elegant, if the trust model allows) — **Construction**

BLS signatures aggregate: k signatures over the same message become one signature, verified against an aggregated public key with one pairing. If attesters sign the user's commitment `C` with BLS:

- The k=3 signatures aggregate to **one** in-circuit (or out-of-circuit) verification.
- The aggregate public key can be checked against the attester set cheaply.
- **This attacks the 12.6k signature-verification cost too**, not just Merkle — potentially collapsing the *entire* circuit, since EdDSA×3 (the other 96% of the baseline) becomes BLS×1.

**Estimated saving:** potentially the largest of all — it targets *both* the Merkle path *and* the signature verifications, the two dominant costs together. **Cost / Open:** BLS verification in-circuit requires pairing-friendly curves and is itself nontrivial in-circuit; the win only materializes if the aggregate check is done *outside* the circuit (Lever D) or with a pairing-efficient proof system. Diversity predicate D over aggregated keys needs care — aggregation can hide *which* keys signed, which is good for privacy but must not hide *category-distinctness*. **This is the highest-upside, highest-uncertainty lever; prototype before trusting.**

### Lever D — Shrink the tree instead of replacing it (the safe, incremental win) — **Result**

If you keep Merkle, cut the depth. Cost is linear in depth, so:

- **Depth 20 → depth 12** (4,096 attesters, plenty for a curated institutional set): `3 × 12 × 255 ≈ 9,180`, saving ~6,100 constraints (~40% of the Merkle cost).
- **Depth 20 → depth 10** (1,024 attesters — still more than enough; the diversity predicate wants *few* independent attesters, not thousands): saving ~7,650 constraints (~50%).
- **Precompute the top of the tree outside the circuit.** Prove membership only in a depth-10 *subtree*; the subtree root's membership in the full tree is verified by the backend against public data. In-circuit depth drops to ~10 regardless of true set size.

> **Result D.** Attester-set membership does not need depth 20. The diversity predicate D deliberately requires a *small number of independent, curated attesters*; a depth-10 tree (1,024 attesters) is ample. Depth 20 was over-provisioning. This alone saves ~50% of the Merkle cost for zero cryptographic risk — the safe first move.

### Lever E — Drop k from 3 to 2 (the economic-tradeoff win) — **Result, with a caveat**

Merkle and signature costs are both linear in k. k=3 → k=2 removes one full membership proof *and* one signature verification — roughly a third of the *entire* circuit. But k is a *security parameter*: it sets how many independent attesters an attacker must compromise (the diversity predicate D). Dropping to k=2 halves the collusion resistance.

**The honest tradeoff:** by Result 5, the wedge needs `γ ≥ β·m·E`. With context-scoping (m=1) and low β (bot defense), the required `γ` is small, so `k=2` attestations may already clear it. **k=3 was a default, not a derived requirement.** Derive it: compute the minimum k such that `k·A_new ≥ β·E` for the target application. If k=2 suffices economically, the ~9,700-constraint saving is free.

> **Result E.** k is not fixed at 3; it is `k = ⌈(β·E)/A_new⌉` from the economics. For low-β bot defense, k=2 likely suffices, saving ~⅓ of the circuit. Do not pay for k=3 security the application doesn't need.

---

## 2. The recommended combination (and the predicted number)

These levers stack. The honest, low-risk path to sub-2s:

1. **Lever D first (safe, ~50% Merkle saving, zero risk):** depth 20 → 10. `WedgeFull` Merkle cost 15,300 → ~7,650. New total ≈ 21,500 constraints.
2. **Lever E if economics allow (derive k):** k=3 → k=2 removes ~⅓ of the whole circuit. New total ≈ 14,000–15,000 — *back to the baseline neighborhood that already proved ~1 s p95 on desktop.*
3. **Lever A or C as the ambitious follow-on** (accumulator or BLS aggregation) if D+E aren't enough on the real phone — these are the order-of-magnitude wins but carry setup/prototype risk.

**Predicted outcome.** D+E alone should return the circuit to ~14–15k constraints, whose *measured* desktop p95 was ~1.0–1.2 s, implying a mid-range phone p95 of ~2–4 s — still marginal. **To get comfortably under 2 s on a normal phone, D+E is likely necessary but not sufficient; the accumulator (Lever A) is probably required for margin.** State this honestly: the safe levers get you close; the order-of-magnitude win needs the accumulator, which needs a prototype.

> **Result (combination).** No single safe lever reaches sub-2s-on-phone with margin. The path is: D+E to return to the baseline neighborhood (low risk), then Lever A (accumulator) for the order-of-magnitude membership win that buys phone-side margin. Lever C (BLS) is the highest-upside gamble — it attacks membership *and* signatures at once — and should be the parallel research track, not the critical path.

---

## 3. What must be prototyped before trusting any of this

- **Lever A:** in-circuit vs. out-of-circuit accumulator verification cost. If the pairing check must be in-circuit, the win shrinks; if it can be a backend check against a public accumulator, the win is near-total. **Prototype the out-of-circuit variant first.**
- **Lever C:** whether BLS-in-circuit is cheaper than EdDSA×3-in-circuit *including* the pairing cost, or whether it only wins out-of-circuit. Real risk it doesn't pay off in-circuit.
- **Lever E:** the actual `k = ⌈(β·E)/A_new⌉` for a real target platform — needs the measured β you still don't have.

---

## 4. The falsification that still governs everything

None of this matters if the *signature* cost (the other 96% of the baseline, ~12.6k constraints, ~700 ms) can't be beaten and k can't drop — because even with Merkle at zero, EdDSA×3 alone is ~13k constraints ≈ the baseline's ~1 s desktop / ~2–4 s phone. **So the real ceiling is: baseline `Wedge3` itself must clear 2 s at p95 on the target phone.** If the *baseline* is NO-GO on the real phone, no Merkle optimization saves the wedge and the answer is either k=1 (weakens security to one attester — probably unacceptable) or a fundamentally cheaper signature primitive. **Measure the baseline `Wedge3` p95 on the real phone before optimizing anything — that is the true floor, and this whole note is moot if the floor is already over 2 s.**
