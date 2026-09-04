# The Signature Floor

### Proving k human attestations without k in-circuit signature verifications

**Where we are (measured).** The Merkle path was a red herring. Every membership optimization — depth 20→10, accumulator (in-circuit membership → 0 constraints) — landed the circuit back on the same floor: **~13k constraints ≈ the 3 EdDSA verifications, ~96% of the baseline.** The only rung that cleared 2 s on the contended desktop was `accum_k2` (1795 ms), and it won by *removing a signature*, not by touching membership. The harness's own STOP verdict fired correctly. The wall is now unambiguous and singular:

> **The cost is k in-circuit EdDSA verifications (~4,200 constraints each). To reach sub-2s on a normal phone, you must reduce the number, or the unit cost, of in-circuit signature checks — nothing else moves the floor.**

**Status.** `Result` = argued and consistent with the measured attribution; `Construction` = composition; `Open` = must be prototyped. No new cryptography.

---

## 0. The floor, stated exactly

Baseline `Wedge3` = 13,098 constraints, of which ~12,600 are the 3 EdDSA-Poseidon verifiers (4,207 each) and ~500 is everything else (commitment, nullifier, wiring). Desktop-quiet p95 was ~1.03 s; contended ~2.25 s; estimated phone p95 **~2.1–4.3 s**. So even at the floor, the phone is marginal-to-NO-GO. Membership is solved (accumulator → 0 in-circuit). **k signature verifications are the entire remaining problem.**

Three ways to attack it, in increasing order of payoff and risk: reduce **k**, reduce **cost-per-verification**, or **remove signature verification from the circuit entirely.**

---

## 1. Lever C — one aggregate signature instead of k (the elegant win) — **Construction, Open**

The prior note flagged this; the measurement now makes it the main line, not a gamble.

**BLS aggregation.** k attesters each BLS-sign the user's commitment `C`. The k signatures aggregate into **one** signature, verified against an aggregated public key with **one** pairing check. If the k EdDSA verifications (~12,600 constraints) become one aggregate BLS verification, the signature floor collapses.

**The catch, measured-adjacent and honest:** a BLS/pairing verification *in-circuit* over BN254 is millions of constraints — far worse than EdDSA (the Step 3 note already rejected in-circuit pairings for exactly this reason). So Lever C only pays off if the aggregate verification is done **out of the circuit**, by the backend verifier. That restructures the whole proof:

- **In-circuit:** prove knowledge of secret `s`, `C = Poseidon(s)`, nullifier, RLN, diversity — but **not** the signature checks.
- **Out-of-circuit:** the backend verifies one aggregate BLS signature over `C` from k keys satisfying diversity D, against the public attester set.

**Result C.** *Moving k signature verifications out of the circuit via BLS aggregation removes ~96% of the constraint cost; the in-circuit residual (commitment + nullifier + RLN + diversity ≈ 500–3,000 constraints) proves comfortably sub-2s on a phone. The signature floor is not lowered — it is relocated to the backend, where a single pairing check costs ~1–2 ms.*

**The privacy cost, stated plainly (this is the real tradeoff).** If the backend verifies the aggregate signature over `C`, the backend learns `C` (or a value tied to it) and *which* aggregated key signed — i.e. the same "which attesters vouched" leak the RSA-accumulator rung already incurred. **BLS aggregation and out-of-circuit membership have the *same* privacy regression**: they trade unlinkability-of-attesters for proving speed. For a *small curated attester set* (the wedge's actual design — a handful of institutional attesters, not millions), this leak is often acceptable: knowing "an employer + a university + a social attester vouched" does not identify *which employer* if there are many, and does not link the user across contexts (the nullifier still does the per-context unlinkability). But it is a real reduction and must be priced per deployment.

**Open (prototype before trusting):** whether the *in-circuit residual* after removing signatures is truly small, and whether diversity predicate D can be enforced over aggregated keys without re-introducing per-key in-circuit work. D over an aggregate is the subtle part: aggregation hides which keys signed, but D needs to prove the keys were *categorically distinct*. This may require the backend to check D (it sees the keys) rather than the circuit — which is fine if the backend is the verifier anyway.

---

## 2. Lever F — derive k from economics, don't default it — **Result**

The measurement showed k=2 vs k=3 is the difference between NO-GO and GO. So k must be *derived*, not assumed. From Result 5, the wedge needs `γ ≥ β·m·E`, and `γ = k·A_new` (k attestations at cost A_new each, with context-scoping m=1). Therefore:

$$
k \;=\; \left\lceil \frac{\beta \cdot E}{A_{\text{new}}} \right\rceil
$$

**Result F.** *k is not a free parameter to set at 3 for comfort. It is the smallest integer such that k attestations cost at least what one credential earns over its life. For low-β bot defense (β ≈ \$0.05–\$0.50), modest E, and A_new ≈ \$0.50–\$1.00, k=2 frequently suffices — and k=2 is the difference between clearing and missing the 2 s bar. Paying for k=3 is paying for security the application's economics do not require.*

The caveat the measurement can't give you: k also sets **collusion resistance** (how many independent attesters an attacker must compromise to satisfy D). k=2 means two colluding attesters mint fakes. Whether that's acceptable is a *per-application* judgment, not a proving-speed one — but for a curated attester set where compromising two independent institutions is genuinely hard, k=2 is defensible. **Derive k from `max(economic floor, collusion-tolerance floor)`, then measure that k on the phone.**

---

## 3. Lever G — a cheaper in-circuit signature primitive (the fallback) — **Open**

If out-of-circuit aggregation (Lever C) is rejected because the attester-leak is unacceptable for a deployment that needs full unlinkability, the only remaining move is a signature scheme cheaper *in-circuit* than EdDSA-Poseidon's 4,207 constraints.

Candidates, honestly bracketed:
- **Poseidon-based / algebraic signatures** designed for in-circuit verification may beat generic EdDSA, but the saving is a constant factor, not an order of magnitude — it might turn 4,207 into ~2,000, moving k=3 from ~12,600 to ~6,000. That could be the margin on a phone, but it does not collapse the floor the way aggregation does.
- **Lookup-based acceleration (Plonkish/Halo2 custom gates + lookups)** for the signature's field operations can cut effective cost materially versus R1CS/Groth16. Switching proof systems (Groth16 → Halo2/PLONK with lookups) is itself a real cost but may be the highest-leverage *in-circuit* win that preserves full privacy.

**Open.** Neither is quantified here; both are constant-factor, not asymptotic. Lever G is the path *only if* full attester-unlinkability is a hard requirement that forbids Lever C. Prototype G's best candidate against the k derived in Lever F.

---

## 4. The decision tree (this replaces the Merkle ladder)

The membership question is closed. The signature question forks on **one requirement**: does the deployment need attesters to remain unlinkable to the verifier?

- **If NO (small curated attester set, leak acceptable):** → **Lever C (BLS aggregate, out-of-circuit)** + **Lever F (derived k).** This collapses the floor and is the recommended main line. In-circuit residual is small; sub-2s-on-phone is very likely. *Prototype the in-circuit residual size and out-of-circuit D check.*
- **If YES (full attester-unlinkability required):** → **Lever F (derived k, likely k=2)** + **Lever G (cheaper in-circuit signature and/or Halo2+lookups).** This is constant-factor optimization on the floor and is *marginal* — it may clear a phone at k=2 but has little headroom. If it doesn't clear, the honest conclusion is that full-unlinkability + k≥2 + sub-2s-on-cheap-phone is not simultaneously achievable with 2026 primitives, and one of the three must give.

**The un-inflated bottom line.** The wedge is proven-buildable at speed *if* the deployment tolerates the attester-visibility leak (Lever C). If it requires full attester-unlinkability, sub-2s on a low-end phone at k≥2 is **an open question that the measurements suggest is marginal**, and you should find that out with a Lever G prototype before promising it. Do not sell full-unlinkability + instant-phone-proof until it's measured; that is the claim most likely to be false.

---

## 5. What this does to the product

The speed constraint just made a *product* decision for you, honestly:

- The **fast, shippable wedge** is the curated-attester, leak-tolerant variant (Lever C). Its security (Result 5/F) is intact; its privacy is "attesters visible to verifier, user unlinkable across contexts" — which is *still far better than the status quo* (platforms currently see everything). Sell this first.
- The **full-unlinkability wedge** (Lever G) is a slower, later, possibly-infeasible-on-cheap-phones variant. Treat it as research, not roadmap, until a phone p95 exists.

This is the same pattern the whole program has followed: the honest, narrower thing ships; the maximal thing is gated on a measurement you don't have yet. The floor didn't kill the wedge — it chose which wedge.

---

## 6. Falsification (commit before building Lever C)

1. If the **in-circuit residual** after removing signature checks (commitment + nullifier + RLN + diversity, no sigs) is **not** under ~4,000 constraints, Lever C's win is smaller than claimed — measure it first, before building the BLS backend.
2. If **diversity predicate D cannot be enforced without per-key in-circuit work**, the signatures partially return and the floor partially returns — check this in the residual measurement.
3. If, for the full-unlinkability variant, **no in-circuit signature primitive at k=2 clears ~2 s p95 on a real mid-range phone**, then full-unlinkability + instant proof is not achievable now — stop promising it and ship only the Lever C variant.
