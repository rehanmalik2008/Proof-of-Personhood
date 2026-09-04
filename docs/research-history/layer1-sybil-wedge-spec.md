# Layer 1 — The Sybil-Resistance Wedge

### A buildable specification: economics, circuit, proofs, and the software boundary

**Status.** Engineering built from existing primitives (BBS+/anonymous-credential lineage, nullifiers, RLN, Groth16/PLONK). No new cryptography is claimed; the contribution is the composition and the corrected economic argument. Everything labelled **Result** is derived; **Construction** is composition; **Open** is unresolved and must not be built past without closing.

---

## 0. What this document is and is not

This is the spec for the narrowest deployable slice: prove *one distinct human acted once in one context this epoch*, unlinkably, so a platform can reject bots. It is not the whole internet. Layers 2–4 (privacy wrapping, portable reputation, micropayments) are explicitly out of scope and depend on this one shipping first.

The design honors two locked decisions:
- **Enclave-optional.** Attestation diversity is the root of trust. A secure-enclave signature may count as *one* attester, never as sufficient alone. No single vendor becomes the root.
- **Wedge = platform bot-defense**, where the per-account attack value β is low, so the required mint cost γ is low, so the UX is survivable.

---

## 1. The economic core — corrected

### 1.1 The Result 1 floor, restated

**Result 1 (recap).** Sybil deterrence requires per-identity mint cost `γ ≥ β`, where β is the value of one fake identity *in the domain it attacks*, independent of how sublinear aggregate reward is. The binding case is the single profitable fake, not mass minting.

### 1.2 The error a naïve reading makes (and we must not ship)

The tempting statement — "β = $0.50/account, γ = $2–5 to mint, therefore minting-to-sell loses money" — is **wrong**, and the reason is the same context-decomposition that broke the earlier scalar-`v` assumption, now acting on the *cost* side.

γ is paid **once per credential**. But a single credential can produce one valid proof *per context per epoch* (that is the whole point — one identity, many sites). So a spammer who mints one credential monetizes it across **every context it can act in**. If a credential can profitably act in `m` contexts, the attacker's return on one mint is `β·m`, not `β`.

**Result 5 (Context-multiplied attack value).** *A single credential minted at cost γ that can act in `m` monetizable contexts per epoch, over `E` epochs before burn/expiry, yields attacker value `β·m·E`. Deterrence therefore requires*
$$
\boxed{\ \gamma \ \ge\ \beta \cdot m \cdot E\ }
$$
*not `γ ≥ β`. The naïve single-context form is a special case (`m = E = 1`) that does not hold for a credential usable across many contexts over time.*

**Verification (run it):**
```python
beta, m, E = 0.50, 20, 4          # $0.50/context, 20 monetizable contexts, 4 epochs of life
attacker_value = beta * m * E     # = 40.0
gamma_naive = 3.00                # "$2-5 mint cost" — LOSES to the attacker by 13x
assert gamma_naive < attacker_value, "naive gamma is insecure"
gamma_required = beta * m * E     # = 40.0  <-- the real floor
```

At β=$0.50, twenty contexts, four epochs, the real mint-cost floor is **$40**, not $3. Shipping the $3 number gives the attacker a 13× profit.

### 1.3 The two honest fixes (pick per deployment)

The floor `γ ≥ β·m·E` can be met from either side:

**(A) Shrink `m` — context-scoped credentials.** Bind the credential (or the attestation) to a context-class so one credential cannot spray across unbounded contexts. Then `m` is small (ideally 1) and `γ ≥ β·E` suffices. Cost: less "prove once, use everywhere" convenience — a real UX/portability tradeoff, stated openly.

**(B) Raise `γ` — price the mint to the worst case.** Set `γ ≥ β·m_max·E` for the largest monetizable context-set a credential could reach. Simple, but at β=$0.50 and wide `m` this pushes γ into the tens of dollars, which starts excluding honest users (Result 1's own failure mode: if the price to be human is too high, you exclude humanity).

**Design rule.** The verifier — not the protocol — sets its required `γ_eff = k·A_new + σ` (attestations × cost each, plus forfeitable stake) to clear *its own* `β·m·E`. The protocol exposes the dial (Result 1); each deployment tunes it. **For the bot-defense wedge, use (A): context-scoped attestation**, because it keeps γ low (good UX) *and* collapses `m→1`, which is the combination the wedge needs.

### 1.4 The wedge numbers, corrected

| Parameter | Value | Note |
|---|---|---|
| β (value of one fake account, one context) | $0.05–$0.50 | platform-specific; measure it, don't guess |
| m (monetizable contexts per credential) | **1** | forced by context-scoping, fix (A) |
| E (epochs of credential life) | 1–4 | epoch = e.g. 1 week |
| **Required γ** | **β · E ≈ $0.05–$2.00** | now genuinely low → good UX |
| k (attestations required) | 2–3 | diversity predicate D |
| A_new (cost per attestation) | ~$0.50–$1.00 effective | social/temporal/enclave mix |

With context-scoping, the wedge economics *do* work at low friction — but only because we corrected `m` to 1 by construction, not by assertion.

---

## 2. The circuit — what it proves, formally

A client-side ZK circuit (Circom or Halo2 → WASM) takes private attestations, emits a public proof. The verifier learns *one attested distinct human acted once here this epoch* and nothing else.

### 2.1 Statement

**Public inputs:** `epoch e`, `context ctx`, `attester_root R` (Merkle root of valid attester keys), `nullifier N`, `rln_share y`.
**Private inputs (witness):** root secret `s`, `k` attestation signatures `{σ_i}` over `C=H(s)`, attester public keys `{pk_i}` with Merkle paths to `R`, category labels `{cat_i}`.

The circuit proves the conjunction:

1. **Commitment.** `C = H(s)`.
2. **k valid attestations.** For each `i∈[k]`: `Verify(pk_i, C, σ_i) = 1` and `pk_i` has a valid Merkle path to `R`.
3. **Diversity predicate `D`.** The categories `{cat_i}` are pairwise distinct across the required axes (organization / jurisdiction / category), and no single `cat` (including `enclave`) satisfies `D` alone. *This is the anti-oligopoly rule enforced in arithmetic, not policy.*
4. **Context-scoping (fix A).** The attestations are bound to the context-class of `ctx` (e.g. a signed `scope` field the circuit checks against `ctx`), enforcing `m→1`.
5. **Nullifier.** `N = H(s ‖ ctx ‖ e)`, output publicly. The verifier rejects any repeat `N` → one action per human per context per epoch.
6. **RLN share.** `y = f(s, e)` a Shamir share bound to `(ctx,e)`. Two proofs in one `(ctx,e)` publish two shares → `s` reconstructable → identity publicly burned. Self-enforcing, no adjudicator.

### 2.2 Soundness (why a bot cannot forge it)

**Result 6 (Wedge soundness).** *Under the security of the signature scheme, the collision-resistance of `H`, the binding of the Merkle accumulator, and the knowledge-soundness of the proof system, a prover who convinces the verifier holds `k` genuine attestations over a single committed secret `s` satisfying `D`, and cannot produce two accepted proofs for the same `(ctx,e)` without revealing `s`.*

**Proof (composition).** Knowledge-soundness of the SNARK yields an extractor recovering a witness `(s,{σ_i},{pk_i},paths,{cat_i})` for any accepting proof. Constraint 2 + accumulator binding force each `pk_i∈R` and each `σ_i` valid — unforgeable by signature security, so the attestations are genuine, not fabricated. Constraint 3 forces `k` distinct categories, so no single compromised attester suffices; minting a fake requires `k` independent attestations (the economic floor of §1). Constraint 5 makes `N` a deterministic function of `(s,ctx,e)`; a second action in `(ctx,e)` reuses `N` (rejected) or changes `s` (a different identity needing its own `k` attestations). Constraint 6: two distinct proofs in one `(ctx,e)` are two evaluations of the degree-1 RLN polynomial → `s` recovered by interpolation → burn. ∎

**What soundness does *not* give:** it does not prevent a *human* from legitimately obtaining `k` real attestations and then renting the credential. That is the non-transferability problem, which the prior research showed is *not* solvable by pure math (the coupling construction failed Blocker A). **The wedge does not need it solved** — see §3.

### 2.3 The honest scope boundary (why the wedge survives what the full protocol didn't)

The whole non-transferability crisis (Results 2–4, Blocker A) was about stopping a *human* from selling their credential. The bot-defense wedge has a different, weaker, *sufficient* requirement:

**Result 7 (The wedge needs deterrence, not non-transferability).** *For bot-defense, the security goal is `γ ≥ β·m·E` (Result 5) — making fake accounts unprofitable to create. Whether a real human could rent their real credential is irrelevant to this goal, because a rented real credential still corresponds to one real human and consumes that human's one-action-per-context-per-epoch budget. Renting redistributes a scarce human action; it does not manufacture bots. Therefore the wedge is secure under Result 1/5 alone, with no non-transferability assumption.*

This is why the wedge is buildable now while the full identity layer is not: **it sidesteps the exact problem that killed the general design.** State this prominently — it is the reason this slice ships.

---

## 3. Performance and falsification thresholds (commit before building)

Pre-commit these kill-conditions; do not move them after measuring.

| Threshold | Kill-condition |
|---|---|
| **Client-side proving** | Secret `s` never leaves device. Server-side proving = disqualified. |
| **Latency** | WASM prover > **2.0 s on a mid-range 2024 Android** = fails; UX drop-off kills the B2B sale. |
| **Proof size** | > 1 KB = re-evaluate (Groth16 ~200B, PLONK ~500B–1KB are fine). |
| **Verify cost** | Backend verify > 10 ms = re-evaluate. |
| **Circuit size** | Estimate constraints *before* coding; `k` signature-verifications dominate. If `k=3` ECDSA-in-circuit blows the 2 s bound, switch to EdDSA/Poseidon-friendly signatures — a real, known constraint. |

**Open (must resolve during build):** whether `k=3` in-circuit signature verifications meet 2.0 s on weak hardware with a WASM prover. This is the single most likely engineering kill and should be prototyped *first*, before any SDK work. Use Poseidon hashing and a SNARK-friendly signature scheme from the start; ECDSA-in-circuit is the usual latency killer.

---

## 4. The software boundary — the 2,000 lines that earn the first check

Build exactly three things. Nothing else.

1. **The ZK circuit** (§2), Circom or Halo2 → WASM. SNARK-friendly primitives (Poseidon, EdDSA). Ships the six constraints above.
2. **A JavaScript SDK** the platform drops into its site: manages the user's on-device secret, requests attestations, generates the proof in-browser, submits `{proof, N, y}`.
3. **A verifier endpoint** (Go or Rust): checks the proof against `R`, rejects duplicate `N` (a simple per-`(ctx,e)` set), reconstructs `s` and publishes a burn if two `y` shares collide.

**Explicitly not now:** no token, no network, no reputation, no payments, no enclave requirement (enclave is one optional attester), no consensus, no mesh. Those are Layers 2–4 and later.

---

## 5. Threat model — stated, with what it does not cover

**Covered:** fabricated attestations (unforgeable, §2.2); single-attester compromise (diversity predicate `D`); double-action per context/epoch (nullifier + RLN burn); cross-context correlation (per-context nullifiers, unlinkable); bot economics (`γ ≥ β·m·E`, Result 5, via context-scoping).

**Not covered (say so to the customer):**
- **Attester collusion at scale** — a large actor standing up `k` nominally-independent attesters satisfying `D`. Mitigated by jurisdictional/organizational diversity in `D`; not eliminated. Sociological, not cryptographic.
- **Human credential renting** — out of scope by Result 7: renting a real credential redistributes a real human's scarce action, it does not create bots. For bot-defense this is acceptable; for one-person-one-vote it would not be.
- **State-scale, margin-indifferent adversaries** — every economic bound assumes a solvency-constrained attacker.
- **Metadata / timing correlation** — unlinkability is per-proof; a verifier that requests a proof at an identifying moment, or correlates timing, breaks it. Deployment discipline, not circuit property.
- **Proving-cost exclusion** — if the prover is slow on cheap phones, the protocol excludes the population it serves. This is falsification threshold #2 and an open engineering risk.

---

## 6. Falsification criteria (write the thresholds now)

The wedge is dead, and you should know within weeks, if any of these hold:
1. `k=3` in-circuit signature verification cannot hit 2.0 s on a mid-range 2024 Android with a WASM prover, and no SNARK-friendly substitution fixes it.
2. Fewer than 3–5 genuinely independent attesters exist for a real target platform's users, making `D` theatre.
3. The measured real `β·m·E` for the target platform exceeds the `γ` honest users will tolerate, i.e. securing it prices out real humans.
4. No platform with a live bot problem will pilot it within the first set of sales conversations (the value proposition is wrong).

---

## 7. Immediate build order

1. **Prototype the circuit's proving time first** (§3 Open). `k=3`, Poseidon, EdDSA, WASM, worst phone you own. If it clears 2 s, proceed; if not, fix primitives or stop. This is the fastest possible disproof and must come before the SDK.
2. **Measure a real `β`** for one target platform (what does one fake account earn there?), compute `β·m·E`, confirm `γ ≥ β·m·E` is achievable at tolerable friction with context-scoping.
3. Only then write the SDK and verifier.
4. Publish the circuit spec + Result 5–7 for adversarial review before selling on it.

---

### Verification code

```python
# Result 5: the real deterrence floor is beta * m * E, not beta.
def secure(gamma, beta, m, E):  return gamma >= beta * m * E
assert not secure(3.00, 0.50, 20, 4)          # naive $3 mint: INSECURE (attacker gets $40)
assert secure(40.0, 0.50, 20, 4)              # priced to worst case: secure but high friction
assert secure(2.00, 0.50, 1, 4)               # context-scoped (m=1): secure AND low friction

# The wedge relies on collapsing m to 1 by construction (context-scoping), not on assertion.
for m in (1, 5, 20):
    floor = 0.50 * m * 4
    print(f"m={m:>2}  required gamma = ${floor:.2f}")   # m=1:$2  m=5:$10  m=20:$40
```
