# The asymmetry theorem and the personhood trilemma

**Formalizes `the-asymmetry-theorem.md`.** Builds on
`docs/REDUCTION-personhood-impossibility.md` (cited as **REDUCTION**): its
Theorem 1 (digital-only ⇒ the accept predicate is a human–machine distinguisher,
via a *distributional* separation that holds against unbounded adversaries), its
Corollary 1 (personhood needs a *robust* such distinguisher, of which none is
known), and its Corollary 2 (three escapes: sensor/biometric, institution,
per-identity expense).

Claim status is labelled: **[KNOWN]**, **[THIS WORK]**, **[CONJECTURE]**,
**[OPEN]**. The empirical falsification tests that this theory's survival depends
on are in `docs/EMPIRICAL-personhood-systems.md` (**EMPIRICAL**); §6 here records
their verdict.

---

## 1. Model and cost definitions

**Entities and channels.** An *entity* `𝐄` is a real-world actor: a human, or an
operator running machines. `𝐄` interacts with the enrolment protocol only
through digital channels — this is forced, not assumed: "no trusted institution"
(below) plus the problem's requirements 3 (no biometric sensor) and 5 (no
hardware attestation) leave the verifier reading only commodity-device
bit-strings (REDUCTION §2.1).

**No trusted institution [THIS WORK, def].** The protocol has *no trusted
institution* if its accept/price decision on an enrolment attempt is a function
only of (i) the bit-strings the enrolling entity sends, (ii) public protocol
state (itself a function of past transcripts and public randomness `ρ`), and
(iii) `ρ`. Equivalently: no party contributes a message derived from knowledge of
the enrolling entity that is not already in that entity's own protocol messages.
"Distributed" trust anchors (a quorum of vouchers, a committee) are institutions
under this definition if their messages carry out-of-band entity knowledge; §5.2
and EMPIRICAL §3 test that edge.

**Enrolment.** `enroll()` is one protocol interaction; on success it yields one
credential. The protocol may *price* an attempt: it demands resources
`price(τ, state, ρ) ≥ 0` (compute, locked stake × time-value, fees, mandated
elapsed-time) as a function of the attempt's transcript `τ` and public state. A
strategy's total cost is the sum of `price` over its attempts plus any exogenous
expenditure the strategy is required to make (e.g. evaluating a VDF the protocol
checks but does not itself meter).

**Cost quantities [THIS WORK, def].**

- `c_H` := the minimum cost for an honest entity to obtain **one** credential,
  over all strategies available to it.
- `c_A(N)` := the minimum cost for one adversarial entity to obtain **N** valid
  credentials, `N ≥ 2`.
- `c_A := inf_{N ≥ 2} c_A(N) / N` — the amortized per-identity attacker cost.

**Sybil-resistance threshold.** Write `θ := β·m·E` for the deterrence price of
`the-asymmetry-theorem.md` §1 / paper §4.1. The mechanism is *Sybil-resistant*
iff `c_A ≥ θ`; *accessible* iff `c_H ≪ θ`.

---

## 2. Theorem 2 (the asymmetry theorem)

**Definition (enrolment discrimination) [THIS WORK].** The protocol performs
*enrolment discrimination* if there exist two enrolment attempts with transcripts
`τ₁, τ₂` drawn from the *same* distribution over honest-entity behaviour such
that `E[price(τ₁, ·)] ≠ E[price(τ₂, ·)]` — i.e. the protocol charges differently
for interactions that are statistically identical as honest enrolments,
necessarily by conditioning on something outside the transcript distribution.

> **Theorem 2 [THIS WORK].** If the protocol has no trusted institution, then
> `c_A(N) = N · c_H` for every `N`, hence `c_A = c_H`. Consequently, if it is
> Sybil-resistant (`c_A ≥ θ`) then every honest user pays `c_H ≥ θ`: it is not
> accessible.

### 2.1 Proof

**Step 1 — the adversary can draw from the honest distribution.** Let `𝒜` be an
adversary (no human, per REDUCTION's model; unbounded compute permitted) seeking
`N` credentials. Consider the strategy: run the *honest* enrolment algorithm `H`
independently `N` times, with fresh independent randomness each time. Each of the
`N` resulting transcripts `τ⁽ⁱ⁾` is, by construction, an independent sample from
the honest enrolment transcript distribution `𝒟_H` — the same distribution a
genuine honest entity's single enrolment produces.

This is where REDUCTION Theorem 1's argument is load-bearing, so state it
explicitly rather than gesturally. "This entity is seeking one identity" versus
"this entity is seeking many" is **not a function of any single transcript**
`τ⁽ⁱ⁾`. It is a property of the entity behind the collection `{τ⁽¹⁾,…,τ⁽ᴺ⁾}`.
A digital-only protocol's `price` and accept decisions are functions of bits and
public randomness (REDUCTION §2.1). The separation between `𝒟_H` and "the
adversary's `i`-th honest-simulated transcript" is therefore not a computational
question an unbounded `𝒜` could be caught by — it is a **distributional**
question, and the two distributions are *identical*: `𝒜` is literally running
`H`. No predicate on bits distinguishes a sample of `𝒟_H` from a sample of
`𝒟_H`.

**Step 2 — no per-attempt asymmetry.** By Step 1, for each `i`,
`E_ρ[price(τ⁽ⁱ⁾, state_i, ρ)]` is taken over the same transcript distribution as
an honest entity's sole enrolment. If the protocol charged `τ⁽ⁱ⁾` more than a
first-time honest enrolment, it would satisfy the definition of enrolment
discrimination: it would be conditioning on something outside `𝒟_H`. The only
such "something" available is knowledge that `τ⁽ⁱ⁾` shares an entity with
`τ⁽¹⁾,…,τ⁽ⁱ⁻¹⁾` — out-of-band entity knowledge — which by the *no trusted
institution* definition is not present. Hence
`E[price(τ⁽ⁱ⁾, state_i, ρ)] = E[price(τ_H, ·)] = c_H` for every `i`.

(*Public state can still make prices rise: a global difficulty that grows with
total enrolment volume, a global per-epoch cap. But such state is a function of
aggregate transcripts, not of entity identity; it raises the price for the
honest entity and the adversary's `i`-th attempt by the same amount. It moves
`c_H` and `c_A` together and creates no gap.*)

**Step 3 — no economies of scale.** Could `𝒜` obtain the `N` credentials for
*less* than `N·c_H` by some non-honest batched strategy? A per-attempt discount
for "an entity that has enrolled before" is, again, a transcript-readable
"same entity as a prior attempt" predicate — the thing a non-institutional
protocol cannot compute (it is the Sybil problem; §5.1). So `c_A(N) ≥ N·c_H`.

**Step 4 — no honest overpayment at equilibrium.** Could `c_A < c_H` — the
adversary having a cheaper route than the honest algorithm? Then rational honest
users adopt that route and `c_H` falls to it. At equilibrium `c_H` is the
minimum cost of one credential by *any* strategy, so `c_H ≤ c_A(1)` and, with
Steps 2–3, `c_H = c_A(N)/N` for all `N`.

Combining: `c_A(N) = N·c_H`, so `c_A = c_H`. If `c_A ≥ θ` then `c_H ≥ θ`. ∎

### 2.2 Corollary 2.1 — an attester is a purchased asymmetry [THIS WORK]

`k`-of-`n` attestation buys exactly the term Theorem 2 forbids to
institution-free protocols: a party that reads honest-vs-adversarial off
out-of-band knowledge of the enrollee and prices accordingly (near-zero for the
vouched, "corrupt `k` attesters" for everyone else). The economic content of
attestation is not verification — it is the *right to charge honest users less
than attackers*. This is why attester systems are cheap for legitimate users and
why no institution-free system can match that on price.

### 2.3 Corollary 2.2 — plutocracy is structural, not incidental [THIS WORK]

The four-problems document treats "stake-linked inalienability makes personhood
plutocratic" as a defect of one binding mechanism. Theorem 2 says it is generic:
any institution-free binding charges honest users `c_H ≥ θ`, and every user
whose liquid net worth is below `θ` is excluded. Plutocracy is the price of
institution-free Sybil resistance, not a fixable bug in the stake variant.

---

## 3. The personhood trilemma

> **Trilemma [THIS WORK].** No mechanism has all three of:
> 1. **Institution-free** — no trusted party in the Sybil-resistance path (§1 def).
> 2. **Accessible** — honest cost `c_H ≪ θ`.
> 3. **Sybil-resistant** — attacker cost `c_A ≥ θ`.
> Any two are simultaneously achievable; all three are not.

**Proof.**
*(1 ∧ 3 ⇒ ¬2):* Theorem 2 gives `c_H = c_A ≥ θ`, so `c_H` is not `≪ θ`.
*(2 ∧ 3 ⇒ ¬1):* `c_H ≪ θ ≤ c_A` means `c_H < c_A`, a per-identity asymmetry.
By the contrapositive of Theorem 2 (its Step 2 is an iff: asymmetry ⇔ enrolment
discrimination ⇔ out-of-band entity knowledge), the protocol has a trusted
institution.
*(1 ∧ 2 ⇒ ¬3):* institution-free gives `c_A = c_H` (Theorem 2); `c_H ≪ θ` then
forces `c_A ≪ θ`, not Sybil-resistant.
Each pair is realised (§4), so none of the three implications can be
strengthened to exclude a corner. ∎

**Two remarks on tightness.**

- The trilemma is about the *Sybil-resistance path*. A system may use an
  institution elsewhere (say, for key recovery) and still count as
  "institution-free" here iff the accept/price decision does not consume
  out-of-band entity knowledge.
- "`≪`" in (2) is deliberately informal (an order of magnitude below `θ`). The
  sharp statement is the equality `c_H = c_A` of Theorem 2; the trilemma is its
  readable corollary.

---

## 4. Classification (summary; full table and per-system justification in EMPIRICAL)

| system | inst-free | accessible | Sybil-resistant | corner |
|---|:--:|:--:|:--:|---|
| Bitcoin PoW | ✓ | ✗ | ✓ | 1+3 |
| VDF-chain minting (Problem 2′) | ✓ | ✗ | ✓ | 1+3 |
| Sybil Wedge (attester model) | ✗ | ✓ | ✓ | 2+3 |
| Worldcoin / World ID (iris) | ✗ | ✓ | ✓ | 2+3 |
| Proof of Humanity, BrightID, Idena, … | ✗ (graph = institution, §5.2) | ✓ | ~ | 2+3 |
| Open signup, no gating | ✓ | ✓ | ✗ | 1+2 |

The decisive line is the social-graph row: the claim that it belongs in "2+3"
with the vouching graph as the institution — not in a fourth all-three corner —
is what EMPIRICAL Task 2 tests, and it is the single point on which the whole
theory stands or falls.

---

## 5. Unification with REDUCTION's three escapes

> **Result 2 [THIS WORK].** An escape from the trilemma (a mechanism that is
> institution-free, accessible, and Sybil-resistant at once) is exactly an
> escape from REDUCTION Corollary 2. The two enumerations — {sensor,
> institution, expense} and {corner 1+2, corner 2+3, corner 1+3} — are one
> trichotomy seen from two sides.

### 5.1 The circularity argument, stated and then attacked hardest

An escape needs **asymmetric per-identity cost with no institution and no
sensor**: `price` higher for an entity seeking many identities than for one
seeking a single identity, computed from digital signals alone.

The only transcript-visible correlate of "seeking many" is *linkability*: this
enrolment attempt is tied to other enrolment attempts by the same entity.
Superlinear pricing in per-entity identity count therefore requires an
equivalence relation **same-entity(·,·)** on enrolment attempts, computable from
digital signals.

**That relation is a Sybil oracle.** Given `same-entity`, bind each equivalence
class to one credential and Sybil resistance is solved outright. So "price
superlinearly in per-entity count" presupposes a solution to the problem it is
being used to solve. Circular. **[THIS WORK]**

**Attack — could `same-entity` be approximated well enough, digitally, without a
sensor or institution?** This is the most likely hiding place for a real
counterexample, so push on it:

- **Lemma (linker ⇒ distinguisher) [THIS WORK].** A *robust* digital
  `same-entity` linker yields a *robust* human–machine distinguisher. Under
  strict uniqueness (requirement 2) an honest human enrols once; any entity
  emitting ≥ 2 linkable enrolment transcripts is a farm, i.e. machine-operated.
  So `D(τ) := "τ is linkable to another enrolment"` separates human from
  machine with the linker's advantage. By REDUCTION Corollary 1 no robust
  human–machine distinguisher is known and the empirical trend is monotone
  degradation (REDUCTION §2.4). Hence **no robust digital `same-entity` linker
  is known either**, and the superlinear-pricing escape is *no easier than* the
  separation REDUCTION already closed — plausibly strictly harder (a linker also
  has to cluster, not just classify).

- **Concrete linker candidates, and why each collapses to sensor / institution /
  expense:**
  - *Network position* (IP, ASN, rate per subnet): bounds identities per
    network position, not per entity; proxies/VMs multiply positions cheaply;
    to the extent it works it trusts the network layer as a weak involuntary
    institution. → institution / not robust.
  - *Device fingerprint / hardware entropy*: a reading of a physical property
    of the device — a sensor (soft attestation). → sensor. Also spoofable.
  - *Behavioural / stylometric clustering of transcripts* (typing dynamics,
    phrasing, timing): a probabilistic distinguisher with an empirical validity
    window that closes as models improve (REDUCTION §2.4); and it is a sensor
    reading of behaviour (a soft biometric). → sensor, not robust.
  - *One-scarce-personal-secret* (phone number, national ID, email age):
    verifiable only via its issuer. → institution.
  - *Superlinear stake on identities registered from one key*: defeated by `N`
    keys; binding `N` keys to one entity needs `same-entity`. → circular.
  - *Social vouching* ("your 1st vouch is easy, your 10th is refused"): the
    vouchers perform the entity-level discrimination; they are a distributed
    institution (§5.2). → institution.
  - *Continuous VDF chain* (`N` identities ⇒ `⌈N/σ⌉` machines): makes
    `c_A(N) = ⌈N/σ⌉·γ_physical`, i.e. **linear** per-identity, not superlinear.
    `c_H = c_A = γ_physical`. This is corner 1+3, the *expense* escape — not a
    trilemma escape. It confirms Result 2 rather than breaking it.

Every non-circular attempt to compute `same-entity` is a sensor, an institution,
or produces only linear (not superlinear) per-identity cost — the expense
corner. **[THIS WORK]**

### 5.2 Is the social graph an institution? (the theory's load-bearing question)

A vouching graph with `c_H < c_A` must be performing enrolment discrimination
(Theorem 2, Step 2 iff). The discrimination is done by the vouchers: they decide,
from out-of-band knowledge ("I know this person"), whom to vouch for. That is the
*no trusted institution* definition's forbidden input, sourced from many parties
instead of one. **Distributed trust is still trust**: a `k`-of-`n` human quorum
supplying "this enrollee is a distinct real person" is an institution by §1's
definition, regardless of decentralization.

The alternative — the graph achieves `c_H < c_A` *without* any voucher using
out-of-band knowledge, purely from graph structure (degree, connectivity,
expansion) — is the SybilGuard/SybilLimit line **[KNOWN]** (Yu et al., SIGCOMM
2006 / S&P 2008). Those have a genuine structural robustness argument, but it is
conditional on a "few attack edges" assumption, and an attack edge is a single
honest user willing to vouch for a stranger — cheap in every real deployment.
When the assumption fails the discrimination fails; when it holds, it holds
*because* honest users are doing out-of-band person-recognition at the edges,
i.e. acting as micro-institutions.

EMPIRICAL §3 works this through for BrightID and for Idena's simultaneous flip
ceremony (the hardest case: it looks institution-free and low-cost). The verdict
there determines whether Theorem 2 survives.

---

## 6. Attacks on the theorems, and the falsification verdict

**On Theorem 2.**
- *"A global proof-of-work makes bots pay more than humans."* No: PoW prices per
  attempt identically for both (REDUCTION §2.1); it raises `c_H = c_A` together.
  Bitcoin is corner 1+3, not a counterexample.
- *"Anonymous rate-limiting (RLN) gives asymmetry."* It bounds *actions per
  credential*, not *credentials per entity*; it does not touch enrolment cost.
- *"CAPTCHA at enrolment is cheap for humans, dear for bots."* Only while a
  robust human–machine distinguisher exists — REDUCTION Corollary 1 says none is
  known. A CAPTCHA gate is the sensor escape (a behavioural reading), with a
  closing empirical window.
- *Status:* survives **conditionally**, on the §5.1 Lemma — no robust digital
  `same-entity` linker — which is at least as strong as REDUCTION Corollary 1's
  open condition.

**On the trilemma.**
- Falsified by any deployed system in all three corners. EMPIRICAL Task 2
  extends the table to every proof-of-personhood system found. **Verdict:
  _pending EMPIRICAL_ — see `docs/EMPIRICAL-personhood-systems.md` §5.** If a
  genuine all-three system is found, this section and everything downstream is
  revised, and that finding leads the report.

**On the unification (Result 2).**
- Falsified by a trilemma escape that is not sensor / institution / expense —
  i.e. robust superlinear-in-entity pricing from digital signals with no sensor
  or institution. §5.1 reduces this to the (open, no-candidate) robust
  `same-entity` linker. *Status:* survives conditionally, same condition as
  Theorem 2.

**Honest bottom line.** Theorems 2 and Result 2 are **conditional impossibilities**
of the same shape as REDUCTION Corollary 1: they hold unless a robust digital
entity-linker exists, for which there is no candidate and an adverse empirical
trend. They are not unconditional. The condition should be stated wherever they
are cited, and the social-graph analysis (EMPIRICAL §3) is the empirical test of
it. §8 gives the condition a principled grounding — a physical thesis plus a
resource bound — which is stronger than the trend but still not a proof.

---

## 7. Design consequence for this project

Under `min`-path acceptance (an identity valid via attester **or** VDF path) the
attacker takes the cheaper path, so effective security is `min(γ_attester,
γ_physical)` — adding the physical path *caps* security rather than raising it
(`the-asymmetry-theorem.md` Result 1). The physical path should therefore be a
**gated backstop**, not a co-equal disjunct:

- attester path: primary — this is where the (purchased) asymmetry lives and the
  only reason the system is accessible;
- physical path: available only under a declared attester-failure condition, or
  globally rate-limited per epoch, or priced `γ_physical ≥ γ_attester`. Each has
  a cost (someone declares the condition — a partial institution; bounded
  recovery throughput; an unaffordable backstop). This is a real design choice
  and belongs in the paper as a stated tradeoff.

Honest claim for Problem 2′: *a gated physical backstop that bounds the
total-attester-collusion failure from `γ = 0` to `γ = γ_physical`, at the cost of
honest users paying the deterrence price whenever the backstop is the live
path.*

---

## 8. Theorem 3 — grounding the conditional (`the-twenty-watt-argument.md`)

**Scope, stated first.** Everything in §§2–7 rests on one assumption: *no robust
human–machine distinguisher exists* (REDUCTION Corollary 1; used here through the
§5.1 linker lemma). §§2.4 and EMPIRICAL justify it **empirically** — CAPTCHA
families keep falling, solvers now beat humans, the trend is monotone. An
impossibility result standing on a trend invites "a better challenge might work."
This section argues the conditional has a **principled grounding**. It is
labelled **[GROUNDING ARGUMENT]**, not **[THIS WORK, proved]**: physical
Church–Turing is a thesis, not a theorem; brain-energy estimates are contested;
and "polynomially related" hides constants. The upgrade is in the *type* of
justification (physical thesis + resource bound, with named residuals) rather
than in certainty.

### 8.1 The resource bound

A deployable cognitive distinguisher is a challenge family `{C_λ}` such that
(i) an honest human on a commodity device solves `C_λ` in short wall-clock time
`T_H` (empirically well under 1 s for challenges actually used; take
`T_H ≈ 200 ms`), (ii) the verifier checks the response efficiently (it runs
inside a protocol), (iii) no machine solves `C_λ`.

Bound the intrinsic cost of (i). A human brain dissipates on the order of
**20 W** total. Take the generous ceiling — the *entire* brain for the *full*
`T_H` — giving `E_H ≈ 20 W · 0.2 s ≈ 4 J`. The true cost of one perceptual
judgement is far below this (a small fraction of the brain, a fraction of the
time). So: the honest solve procedure runs in `≈ 0.2 s` on `≈ 4 J`.

### 8.2 The physical Church–Turing step

**Physical Church–Turing thesis (PCT).** Every physically realizable process is
simulable by a Turing machine with overhead polynomial in the physical resources
(time, energy, volume) the process consumes. PCT is widely accepted in physics
and CS and is the working assumption of complexity theory's physical
interpretation; it is *not* a proved theorem (§8.5).

Under PCT the human's solving procedure **is an algorithm**, and one whose
physical execution costs `≈ 4 J` and `≈ 0.2 s`. By PCT there is a Turing-machine
procedure solving `C_λ` with resources *polynomially related* to `(T_H, E_H)`.

### 8.3 Theorem 3 (algorithmic ignorance) [GROUNDING ARGUMENT]

> **Theorem 3 (informal).** Let `{C_λ}` be solvable by a human in time `T_H`,
> energy `E_H`. Under PCT there exists an algorithm solving `{C_λ}` with
> resources polynomial in `(T_H, E_H)`. Hence **no cognitive distinguisher is
> protected by a complexity barrier** — it is protected only by the fact that a
> known-to-exist, known-to-be-cheap algorithm has not yet been *found*.

**Consequence.** CAPTCHA-class security does not rest on a hardness assumption.
It rests on the claim *"nobody will find an algorithm that a 20 W biological
system runs in 200 ms."* That is a bet against **search**, not a
complexity-theoretic position. Machine learning is a general method for *finding*
algorithms without deriving them, which is exactly why it is the general solvent
for this class and why the failures (§2.4) have been systematic rather than
coincidental.

### 8.4 The self-defeating property [GROUNDING ARGUMENT]

A second, independent structural reason. ML needs training data. **A deployed
cognitive distinguisher emits exactly the training set that defeats it**: every
honest solve is a labelled `(challenge, correct response)` pair for the target
function. The more the challenge is deployed and the more solves it collects, the
faster its solver is learned.

This inverts the usual security scaling. Cryptographic primitives get *safer*
with scrutiny and use; a cognitive distinguisher gets *weaker* with use, at a
rate proportional to its own adoption. A distinguisher popular enough to matter
for an identity layer is generating the corpus that closes its own gap. Security
that decays in proportion to adoption cannot found an identity layer.

(Task 3 — EMPIRICAL-followup — asks whether a challenge can re-randomize its
target function faster than it can be learned, which would break this property.
Verdict recorded in `docs/MOVING-TARGET-captcha-analysis.md`: no viable
construction; a family learnable *in aggregate* is not saved by per-instance
re-randomization, and a family that genuinely re-randomizes the *learnable
structure* also re-randomizes what makes it human-solvable at `T_H`.)

### 8.5 The three escapes from Theorem 3

1. **PCT is false** — human cognition performs non-computable operations
   (the Penrose–Lucas line). A minority philosophical position with no accepted
   supporting argument; named and set aside, not a basis for an identity layer.
   If PCT is rejected on principled grounds, §§8.2–8.4 weaken back to the bare
   empirical claim of §2.4.
2. **The task needs embodiment, not cognition** — a challenge a body passes and a
   program cannot. Verifying embodiment digitally needs a sensor reading a
   physical property = REDUCTION Corollary 2 escape 1 (biometric). Lands where
   the earlier analysis already put it.
3. **The polynomial overhead is prohibitive in a specific domain** — PCT gives a
   *polynomial*, and a large polynomial on a 4 J budget could still be
   expensive. **This is the only technically serious escape.** It is precisely
   what the empirical record tests, and the overhead has repeatedly turned out
   small enough that machines win. It is a quantitative bet, not a barrier, and
   the bet has lost every time it has been placed — but it is not closed in
   principle for every future challenge.

### 8.6 Economic inversion (closes a Theorem 2 escape)

Even granting a residual capability gap: a distinguisher that merely made the
machine path *more expensive* than the human path would still supply asymmetry,
and Theorem 2 would have an escape (§6). Empirically that is already gone —
human CAPTCHA farms price near \$0.001/solve and machine solving is now cheaper
*and* more accurate on the standard families. There is currently no cognitive
challenge where the machine path costs more than the human path. This is
empirical and worth periodic re-measurement (EMPIRICAL falsification #3); if it
flips back, Theorem 2 regains an escape.

### 8.7 What §8 changes

- **Before:** Theorems 1–2 hold unless someone builds a robust distinguisher, and
  empirically nobody has.
- **After:** Theorems 1–2 hold unless human cognition is non-computable (§8.5.1),
  or the simulation overhead is prohibitive in a specific domain (§8.5.3), or a
  sensor is admitted (§8.5.2, = REDUCTION escape 1).

An appeal to a trend becomes an appeal to a standard physical thesis with two
named, testable residuals. Materially stronger foundation, same conclusion — and
it *explains* the §2.4 trend instead of assuming it. Still a grounding argument,
not a proof; cite it as such.

---

## References

Shared with REDUCTION (Douceur IPTPS'02; Nakamoto '08; von Ahn et al.
EUROCRYPT'03; Yu et al. SybilGuard SIGCOMM'06, SybilLimit S&P'08; Boneh et al.
CRYPTO'18). System-specific citations in `docs/EMPIRICAL-personhood-systems.md`.
