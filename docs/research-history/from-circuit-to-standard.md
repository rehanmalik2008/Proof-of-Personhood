# From Working Circuit to Adoptable Standard

### What "big tech will use this" actually requires — and it is not more cryptography

**Where we are.** The core is measured and sound: fully-private Phase-2 login, 4,309 constraints, 134M scale, query-free witness maintenance, revocation costed, eclipse resistance with an honestly-stated 1-of-N trust assumption. **The cryptography is no longer the bottleneck.** For adoption by large organizations, the remaining work is standards, integration surface, governance, and compliance — the layer where technically-superior protocols usually die (Part I warned of exactly this: "standardized out of existence while being technically superior"). This note maps that layer.

**Status.** `Construction` = composition of existing standards/practices; `Open` = requires external engagement (standards bodies, counsel, auditors), not just code. No new cryptography.

**First, a correction to carry forward.** The witness-maintenance work formally narrowed the trust claim. The honest, defensible phrasing is now: **"no *single* trusted party, given a 1-of-N-honest publication medium (public chain / gossip / multiple independent bulletin boards)."** Every standards document, pitch, and audit response must use this narrowed form. Overclaiming "zero trusted parties" is now falsifiable and will cost credibility with exactly the sophisticated reviewers a big-tech deployment brings.

---

## 0. The adoption reality for large organizations

A big tech company does not adopt a protocol because the math is elegant. It adopts when: (i) it plugs into existing standards its stack already speaks, (ii) it passes security and privacy *review* by adversarial internal teams, (iii) it survives *legal and compliance* review across jurisdictions, (iv) it has a governance story that doesn't make the adopter dependent on a single external party, and (v) there is a migration path that doesn't require a flag-day. This note is organized around those five gates, because any one of them unmet is a no.

---

## 1. Standards integration — speak the languages the stack already speaks — **Construction**

Do not invent a new credential format. Map onto what enterprise identity stacks already implement, so the protocol is a *drop-in*, not a migration.

**1.1 W3C Verifiable Credentials (VC) Data Model.** The attestation issued in Phase 1 should serialize as a W3C VC; the Phase-2 proof as a W3C Verifiable Presentation. This is the lingua franca of digital identity and the thing procurement teams recognize. The unlinkable-nullifier proof becomes a VP with a ZK proof type.

**1.2 OpenID Connect / SIOP (Self-Issued OpenID Provider).** The login flow must expose an OIDC-compatible surface so a relying party integrates it the way it already integrates "Sign in with…" — the nullifier `N` maps to a pairwise, non-correlatable subject identifier (OIDC already has the *concept* of pairwise subject IDs; here it is cryptographically enforced, which is strictly stronger). This is the single highest-leverage integration: it lets a platform adopt with an SDK swap, not a rearchitecture.

**1.3 WebAuthn / Passkeys as an *optional* attester, never the root.** The enclave-optional decision (locked earlier) maps cleanly: a WebAuthn assertion is one attester category in the diversity predicate `D`, satisfying the "hardware as one input, never a root" rule. This gives platforms a familiar on-ramp without ceding the root to Apple/Google.

**1.4 ISO/IEC 18013-5 (mobile driving license / mDL) and eIDAS 2.0 / EUDI interop.** Part I named the EU wallet as the main standardization competitor. The correct posture is **attester-of-attesters**: accept a government eID as *one* attester category, never require it. This makes the protocol *complementary* to state ID rather than competing — which is both the adoption strategy and the legal-durability strategy.

> **Construction 1.** *The protocol ships as a profile over W3C VC/VP + OIDC/SIOP, with WebAuthn and eIDAS as optional attester categories in `D`. It introduces one new proof type (the unlinkable nullifier presentation) into existing containers, so an adopter integrates via SDK and OIDC endpoint, not a rearchitecture. Standards-compatibility is the adoption wedge; novel formats are adoption poison.*

---

## 2. The review gate — what an adversarial internal security/privacy team will demand — **Open**

Before any big tech deployment, an internal red team reviews this. Pre-empt their findings; they are predictable:

- **A public, versioned threat model** stating exactly what is and is not protected — including the narrowed trust claim (§0), the eclipse/1-of-N assumption, the root-staleness window `w`, and the refresh/proof timing-decoupling requirement. A threat model that hides the 1-of-N assumption fails review the moment they find it.
- **Independent security audits** of the circuits (constraint-level soundness — a malformed circuit is the classic ZK failure), the accumulator/tree maintenance, and the nullifier/RLN construction. Budget for 2+ independent audits; ZK bugs are subtle (under-constrained signals silently break soundness).
- **A formal-methods pass** on the circuit's soundness where feasible — big-tech ZK teams increasingly expect this.
- **Privacy review against traffic analysis** — the timing-decoupling and padding requirements from witness-maintenance must be *specified as normative*, not left as advice, because per-proof unlinkability that leaks in traffic fails a privacy review.
- **Formal falsification criteria** (the project already writes these — surface them as a public "security parameters and their meaning" document: `k`, `w`, `R` revocation-list size, staleness window, 1-of-N publication assumption).

> **Open 2.** *The protocol needs a published threat model with the narrowed trust claim, ≥2 independent circuit audits, a formal-soundness pass, and normative (not advisory) traffic-analysis mitigations, before an internal big-tech review will clear it. This is external, funded work — not code — and it gates everything.*

---

## 3. Compliance and legal — the gate that kills silently — **Open**

Large organizations will not deploy an identity primitive that creates regulatory exposure. Address each head-on:

- **GDPR / data minimization.** The design is *unusually strong* here — the verifier learns only `N`, no PII, no `C`. This is a *selling point*: it can reduce the adopter's data-controller obligations, not add them. But: is `N` "personal data" under GDPR (a pseudonymous identifier)? Likely yes, and the right-to-erasure interaction with an append-only tree must be answered (RLN burn + revocation set is the mechanism; get counsel to confirm it satisfies erasure). **Open: a GDPR/erasure legal memo.**
- **Data residency.** The broadcast/bulletin-board and accumulator state must have a residency story for jurisdictions that require it.
- **Age-verification and "know-your-customer-lite" regimes.** The wedge (bot-defense) is low-risk, but adjacent applications (age gating under UK OSA / EU proposals) touch client-side-scanning and age-assurance law. State which applications are in-scope and which invite regulatory attachment (Part I's "name fifty legitimate uses before one that annoys anyone").
- **The entity structure.** Part I already specified this: standards foundation, reference implementation, and any commercial arm legally distinct; a neutral home (e.g. a Swiss association or a foundation under an existing standards umbrella). Big tech adopts standards from neutral bodies far more readily than from a single company — the governance structure *is* an adoption feature.
- **Token caution.** If attester staking uses a token, it is a securities-law surface in every jurisdiction. For big-tech adoption specifically, a token is often a *blocker* (procurement and legal will refuse). Prefer bonded collateral in fiat/stablecoin or a non-token staking mechanism. Treat "does this need a token to function?" as a question to answer *no* if at all possible.

> **Open 3.** *Compliance is a gate, not a formality: a GDPR/erasure memo, a data-residency story, a scoped application list that avoids regulatory attachment, a neutral multi-entity governance structure, and (strongly) a token-free staking mechanism. The data-minimization property is a genuine selling point — lead with it — but the erasure/append-only interaction must be legally closed.*

---

## 4. Governance — why an adopter won't be hostage — **Open**

Big tech will not build on a protocol controlled by one party (that just moves the login-graph monopoly, Part I's original complaint). The governance story must credibly show:

- **Attester-set governance.** Who admits/removes attesters, and how is that resistant to capture (the collusion problem from Part II)? A transparent, multi-stakeholder attester-admission process with public criteria and the diversity predicate `D` enforced in-protocol. **Open: the attester-admission governance model.**
- **Root-publication governance (the narrowed-trust point).** The 1-of-N publication medium must be governed so no single party controls all N. Reuse an existing public medium (a chain, or multiple independent bulletin boards run by different stakeholders) rather than standing up a new trusted publisher.
- **Protocol evolution / versioning.** How circuits and parameters (`k`, `w`, `R`) are updated without a central controller forcing changes — a public change process, reference-implementation neutrality, and backward-compatibility guarantees.
- **The credible-neutrality property** (from the broader project): no admin key, no unilateral parameter change, no fee redirection — stated as governance invariants an adopter can verify.

> **Open 4.** *Adoption requires a governance model where attester admission, root publication (1-of-N), and protocol evolution are demonstrably not controlled by any single party — reusing existing neutral infrastructure rather than creating new trusted roles. Governance is not paperwork here; it is the difference between "a new open standard" and "a new monopoly," and big tech can tell the difference.*

---

## 5. Migration path — no flag-day — **Construction**

Part I's Unilateral Value Test applies: the first adopter must win alone. For big tech:

- **Shadow mode first.** A platform runs the protocol *alongside* its existing bot-defense, comparing signals, with no user-facing change — zero risk, immediate internal evidence. This is the enterprise version of "useful on day one."
- **OIDC drop-in** (§1.2) means the production integration is an endpoint + SDK, not a rearchitecture.
- **Graceful degradation.** If proving fails on a weak device or the staleness window lapses, the platform falls back to its existing defense — the protocol is *additive*, never a hard dependency, until the platform chooses to lean on it.

> **Construction 5.** *The migration is: shadow-mode evaluation → OIDC/SDK production integration → optional deepening, with graceful fallback throughout. No flag-day, additive-not-replacing, first-adopter wins alone. This is the same adoption discipline that made the wedge shippable, applied at enterprise scale.*

---

## 6. The honest sequencing — what to do, and what NOT to do yet

The temptation, with a working circuit, is to chase all five gates at once or to over-build standards before a single real adopter exists. Resist it.

1. **One real design partner, shadow-mode, on the wedge (bot-defense).** Everything else is speculative until one platform runs it against real traffic. This is still the highest-value action, unchanged since Part III's §5.
2. **In parallel, the two cheapest gates:** publish the narrowed-trust threat model (§2) and the OIDC/VC integration profile (§1) — these are the artifacts a design partner's security team will ask for on day one, and they are writing, not research.
3. **Then, gated on a real adopter's interest:** fund the audits (§2), the GDPR memo (§3), and stand up the neutral governance entity (§4). These cost real money and should follow demand, not precede it.
4. **Do NOT** build a token, ship a novel credential format, or claim "zero trusted parties." Each is an adoption blocker or a falsifiable overclaim.

**The un-inflated bottom line.** The cryptography reached a genuinely strong, measured place. "Big tech will use this" is now gated on standards-compatibility (VC/OIDC/WebAuthn), survivable security/privacy/legal review (audits + threat model + GDPR memo), a non-single-party governance model, and a no-flag-day migration — plus the discipline to state the *narrowed* trust claim honestly. None of it is more math. All of it follows one real adopter, not the reverse. The protocol that gets adopted is the one that is boring to integrate, honest about its trust assumptions, neutral in governance, and additive in deployment — which is exactly what Part I predicted and what this project, by staying honest at every gate, is now positioned to be.

---

## 7. Falsification (for the adoption thesis, not the crypto)

1. If no platform will run even a **zero-risk shadow-mode** evaluation, the value proposition is wrong regardless of the cryptography (Part I's cold-start falsification, still governing).
2. If the **OIDC/VC integration** turns out to require a rearchitecture rather than an SDK+endpoint, the "drop-in" adoption thesis fails — prototype the integration surface early.
3. If **counsel finds the append-only tree irreconcilable with right-to-erasure**, the GDPR selling point inverts into a blocker — get the memo before scaling.
4. If **governance cannot avoid a single controlling party** for attester admission or root publication, the protocol reintroduces the monopoly it was built to remove — and sophisticated adopters will see it.
5. If deployment **requires a token** to function, big-tech procurement/legal is likely to refuse — validate a token-free staking mechanism before assuming adoption.
