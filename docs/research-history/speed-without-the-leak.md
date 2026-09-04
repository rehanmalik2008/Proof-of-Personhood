# Speed Without the Leak

### Sub-2s mobile proving with full attester-unlinkability

**The situation, stated exactly.** Lever C (the-signature-floor.md) *solved the speed problem*: residual circuit 478 constraints, full-flow ~160 ms desktop / ~0.7 s projected phone — an order of magnitude of headroom. But it solved it by moving the aggregate signature verification **out of the circuit**, which makes the backend learn `C` and *which* attesters vouched. **That is a privacy compromise, and the requirement is now: do not compromise privacy.** So the speed result stands, but the leak-tolerant variant is off the table. This note finds the path that keeps the speed *and* the unlinkability — and names precisely where that becomes impossible so we don't promise what can't be built.

**Status.** `Result` = argued and consistent with the measured 478-constraint residual; `Construction` = composition; `Open` = must be prototyped. No new cryptography.

---

## 0. What "not compromised" must mean, precisely

Pin the requirement before optimizing, or it will drift. Full attester-unlinkability means:

1. **The verifier does not learn which attesters vouched** — not the keys, not the categories-tied-to-keys, not `C` in a form linkable to the attesters.
2. **The user remains unlinkable across contexts** — already provided by the per-context nullifier `N = Poseidon(s, ctx, epoch)`; keep it.
3. **Attesters do not learn where the user later acts** — already provided by blind issuance; keep it.

Lever C fails (1). Everything below must satisfy (1) while preserving the 478-constraint speed win as far as possible.

The insight that makes this tractable: **the leak in Lever C came from verifying the signature *outside* the circuit, where the verifier sees the inputs.** The circuit is the only place computation happens *blind*. So "no leak" forces the membership/attestation check *back inside* the circuit — which is exactly what made it expensive (the k EdDSA verifications, ~12,600 constraints). The whole problem is: **do the attestation check in-circuit (for privacy) but cheaply (for speed).** That is a real tension, not a solved one, and the honest levers are these.

---

## 1. Lever H — verify one *aggregate* signature *in-circuit* (the target) — **Open, highest value**

Lever C aggregated k signatures to one, then verified out-of-circuit (fast but leaky). Lever H aggregates to one, then verifies that **one** signature *inside* the circuit (private but must be cheap enough).

- The cost of k EdDSA verifications was k × 4,207. If aggregation collapses k signatures to **one** verification, the in-circuit signature cost drops from ~12,600 to **one** verification's worth — a 2–3× reduction from the k-factor alone, *without* leaving the circuit.
- Combined with the measured 478-constraint residual, an in-circuit *single* aggregate verification of cost `V` gives a total ≈ `478 + V`. If `V ≈ 4,000` (one EdDSA-class check), total ≈ 4,500 — well under the 13,098 baseline that projected ~2–4 s on phone, plausibly landing sub-2s.

**The hard part (why this is Open, not Result):** the cheap aggregate schemes are pairing-based (BLS), and **a BLS/pairing verification in-circuit over BN254 is millions of constraints** — the Step 3 note already rejected in-circuit pairings, correctly. So Lever H needs a *non-pairing* aggregation, or a proof system where the pairing is native. Two real candidates:

- **Schnorr / EdDSA half-aggregation** (non-interactive half-aggregation of Schnorr signatures): reduces k signatures' verification cost sub-linearly *without* pairings — the in-circuit check of a half-aggregate can be cheaper than k full checks while staying in EdDSA-friendly arithmetic. **This is the most promising line: same curve as the current EdDSA circuit, no pairings, a real constant-to-sublinear saving, fully in-circuit (no leak).**
- **Proof system with native pairings (Halo2/PLONK over a pairing-friendly cycle):** verify BLS aggregate in-circuit where the pairing is a custom gate, not millions of R1CS constraints. Higher risk, bigger rewrite, but potentially the biggest win.

> **Result H (conditional).** If Schnorr half-aggregation reduces the in-circuit cost of k signature verifications below ~2× a single verification, the total circuit lands near 4,500–8,000 constraints — inside the sub-2s-on-phone envelope the 478-residual measurement implies — **with zero privacy leak**, because verification never leaves the circuit. This is the main line and it must be prototyped for its true in-circuit constraint count.

---

## 2. Lever I — recursive proof / folding to amortize the signature cost — **Open**

The k signature verifications are independent. **Fold them:** prove each signature verification in a small proof, then recursively aggregate the k proofs into one (Nova/Halo2 folding, already in the broader project's vocabulary). The final circuit the phone runs verifies *one folded proof*, not k signatures.

- **In-circuit cost becomes O(1) in k** — one folded-proof verification plus the 478 residual, regardless of k.
- Fully private: everything stays in the proof system; the verifier learns nothing about attesters.
- **The catch:** folding moves cost from *circuit size* to *prover work per fold*, and the phone does the folding. The question is whether k=2–3 folds on a phone is faster than k=3 direct EdDSA verifications. For small k this may not pay — folding shines at large k, and k here is 2–3. **Likely not the win at this k; include as a measured comparison, not a bet.**

---

## 3. Lever F (still applies) — derive k, because it's linear in the floor — **Result**

Independent of H/I: `k = ⌈max(β·E/A_new, collusion-tolerance)⌉`. Every in-circuit signature saved is ~4,207 constraints. If the economics genuinely permit k=2, that alone removes a third of the signature floor *before* H/I do their work — and it does so with no privacy cost. Derive k from the target application's real β (still unmeasured — this is the number to get). k=2 + Lever H is the most likely sub-2s-private combination.

---

## 4. Lever G revisited — cheaper in-circuit signature primitive — **Open, fallback**

If aggregation (H) and folding (I) both underperform at small k, the last private lever is a signature scheme cheaper *per verification* in-circuit than EdDSA-Poseidon's 4,207 constraints:

- **Poseidon2 / arithmetization-friendly signatures**, or lattice/hash-based schemes tuned for the field — constant-factor wins (maybe 4,207 → ~2,000).
- **Move Groth16 → Halo2/PLONK with lookup tables** for the signature's field ops: lookups can cut the *effective* cost of range checks and modular arithmetic materially. This is a proof-system change with real engineering cost but is the highest-leverage *in-circuit* constant-factor win, and it composes with H.

Constant-factor, not asymptotic. At k=2, turning 2×4,207 into 2×2,000 plus the 478 residual ≈ 4,478 — potentially sub-2s on phone. Worth measuring if H doesn't land.

---

## 5. The honest impossibility boundary (so we don't promise a lie)

State plainly what may not be simultaneously achievable with 2026 primitives:

> **Conjecture (the tight corner).** Full attester-unlinkability (§0) **and** k ≥ 2 independent in-circuit attestations **and** sub-2s p95 on a low-end (\$60-class, single weak core) phone may not be simultaneously achievable. Lever H at k=2 is the most likely escape; if a real-phone prototype of H (or G) at k=2 does not clear ~2 s p95, the honest conclusion is that one of the three constraints must yield: accept the Lever C leak (curated attesters, verifier sees categories), accept k=1 (single attester, weak collusion resistance), or accept a mid-range rather than low-end phone target.

This is not defeatism — it's the same discipline the whole project runs on. The measurements have repeatedly shown the floor is real; we should assume it's real here too until a private prototype clears it, and we should **not sell full-unlinkability + instant-proof-on-any-phone until that number exists.**

---

## 6. The decision, reordered around the non-negotiable

Privacy is now the hard constraint, speed the thing to recover. The path:

1. **Lever F — derive k** from the target β (get the real number). Likely k=2.
2. **Lever H — prototype Schnorr half-aggregation in-circuit** at the derived k. Measure true constraint count and phone p95. This is the main line: private (in-circuit) *and* cheap (aggregated), same curve, no pairings, no rewrite.
3. **If H underperforms → Lever G** (Halo2 + lookups, and/or cheaper signature) as the constant-factor fallback, still fully private.
4. **If G also underperforms at k=2 on a low-end phone → invoke §5**: report honestly that the tri-constraint is infeasible now, and let the *deployment* choose which of {leak, k=1, better phone} to relax — a per-customer decision, not a hidden compromise.

**What ships if H lands:** the residual-circuit speed (measured, real) *plus* in-circuit aggregate verification — full unlinkability, sub-2s on phone, no backend attester leak. That is the wedge you actually wanted, and it is now a well-posed, prototype-able target rather than a hope.

---

## 7. Falsification (commit before building Lever H)

1. If in-circuit Schnorr half-aggregation of k=2 signatures is **not** cheaper than 2 direct EdDSA verifications (i.e. aggregation overhead eats the k-saving at small k), Lever H fails at wedge-scale k — fall to G.
2. If the half-aggregate verification **forces a curve/field change** that breaks the 478-residual's cheapness, the composed total is not 478+V — measure the *composed* circuit, not the parts.
3. If the best fully-private circuit at k=2 exceeds ~2 s p95 on a real low-end phone, §5's tight corner is real — stop promising full-unlinkability + instant proof, and surface the three-way choice to the deployment.
