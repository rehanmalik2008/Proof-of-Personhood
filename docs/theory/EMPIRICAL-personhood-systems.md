# Empirical test of the asymmetry theorem: every proof-of-personhood system in the trilemma

**Task 2 of `the-asymmetry-theorem.md`.** Companion to
`docs/theory/THEOREM-asymmetry-trilemma.md` (**TRILEMMA**) and
`docs/theory/REDUCTION-personhood-impossibility.md` (**REDUCTION**). This is the part
that decides whether Theorem 2 survives: if a deployed system is genuinely
institution-free **and** accessible **and** Sybil-resistant, Theorem 2 and the
trilemma are falsified and TRILEMMA must be revised from the top.

**Verdict up front:** **no counterexample found.** Every system surveyed sits in
one of the three trilemma corners. The social-graph systems (BrightID, Idena,
Circles, PoH) achieve low honest cost only where a vouching graph or a
behavioural test performs enrolment discrimination — a *distributed institution*
and/or a *sensor* in TRILEMMA's terms. Idena's synchronized flip ceremony is the
closest to the line; §3.3 works out why it does not cross it. Details and the
one partial ambiguity (Idena at low `θ`) below.

Labels: **[KNOWN]** deployed/documented behaviour; **[ANALYSIS]** this work's
placement argument; **[CONJECTURE]** cost estimates.

---

## 1. Cost model recap

From TRILEMMA §1: `θ = β·m·E` is the deterrence price; a system is *accessible*
iff honest per-identity cost `c_H ≪ θ`, *Sybil-resistant* iff amortized attacker
per-identity cost `c_A ≥ θ`. Theorem 2: institution-free ⇒ `c_H = c_A`. For each
system below I estimate `c_H` and `c_A` (the cost to an operator of the `N`-th
identity, amortized) and place it.

"Institution" is TRILEMMA §1's definition: any party — one or a quorum — whose
message into the accept/price decision carries knowledge of the enrolling entity
not contained in that entity's own protocol messages. A human vouching "I know
this is a distinct real person" is such a message.

---

## 2. Classification table

| # | system | mechanism | inst-free | accessible `c_H` | Sybil-resistant `c_A` | corner | note |
|--|--|--|:--:|--|--|--|--|
| 1 | **Bitcoin PoW** | hash-rate | ✓ | ✗ — miner pays electricity | ✓ `c_A` = electricity ≥ reward | **1+3** | reference point; not personhood |
| 2 | **VDF-chain minting** (Problem 2′) | continuous sequential chain | ✓ | ✗ `c_H = γ_physical` | ✓ `c_A = ⌈N/σ⌉·γ_physical` | **1+3** | REDUCTION §3; linear, not superlinear |
| 3 | **Sybil Wedge** (this project, attester model) | `k`-of-`n` attestation + context scoping | ✗ attesters | ✓ `c_H ≈ $0.05–2` (paper §4.2) | ✓ `c_A` = corrupt `k` attesters | **2+3** | the asymmetry is purchased (TRILEMMA Cor 2.1) |
| 4 | **Worldcoin / World ID** | iris scan at the Orb + biometric dedup service | ✗ Orb operator + dedup DB | ✓ free scan, `c_H ≈` travel to an Orb | ✓ `c_A` = defeat iris liveness/dedup per identity | **2+3** | sensor escape (REDUCTION Cor 2, escape 1) |
| 5 | **Humanity Protocol** | palm-vein scan + zk | ✗ scan operator + dedup | ✓ free scan | ✓ per-identity biometric spoof | **2+3** | sensor escape |
| 6 | **GoodDollar** | FaceTec liveness + face dedup | ✗ dedup service | ✓ free selfie | ~ face-spoof arms race | **2+3** | sensor; `c_A` uncertain vs high `θ` |
| 7 | **Proof of Humanity** (Kleros) | video + deposit + member vouch + Kleros arbitration | ✗ vouchers + Kleros court | ✓ deposit refundable, `c_H ≈` time + gas | ✓ `c_A` = bribe voucher + survive challenge | **2+3** | vouch + court = institution |
| 8 | **BrightID** | connection parties + graph analysis (+ Aura verifiers) | ✗ connectors / Aura corps (§3.2) | ✓ `c_H ≈` 1 h of time | ~ `c_A ≈` price of one attack edge (§3.2) | **2+3**, weak `c_A` | graph = distributed institution |
| 9 | **Idena** | invitation graph + synchronized flip ceremony | ✗ invite graph + flip test (§3.3) | ✓ `c_H ≈` 10–20 min/epoch, net-positive | ~ `c_A` = defeat flips **or** hire humans/epoch | **2+3**, `c_A` time-boxed | hardest case; §3.3 |
| 10 | **Circles UBI** | web-of-trust vouching for a UBI token | ✗ vouchers | ✓ `c_H ≈` get 3 trusts | ✗ `c_A` low — trust is cheap to farm | **1+2** (fails 3) | graph is institution *and* still not Sybil-resistant at scale |
| 11 | **Pseudonym parties** (Borge et al. 2017) | physical simultaneous gathering | ✗ other attendees observe you | ✓ `c_H ≈` attend an event | ✓ `c_A` = be bodily present `N` times at once (impossible) | **2+3** | non-digital observation = sensor (people as sensors) |
| 12 | **Civic** | validator KYC | ✗ Civic + ID issuer | ✓ one-time KYC | ✓ per-identity forged government ID | **2+3** | explicit institution |
| 13 | **BABT** (Binance Account Bound Token) | Binance KYC → SBT | ✗ Binance + ID issuer | ✓ if already a Binance user | ✓ per-identity KYC | **2+3** | explicit institution |
| 14 | **zkPassport / OpenPassport** | NFC government passport + zk | ✗ passport issuer | ✓ own a passport | ✓ per-identity real passport | **2+3** | institution = the state |
| 15 | **Gitcoin Passport** | weighted sum of "stamps" (BrightID, ENS, Google, POAP, …) | ✗ inherits from stamps | ✓ collect free stamps | ~ `c_A` = farm enough cheap stamps to clear a score | **2+3** (weighted) | meta-aggregator; Sybil resistance = that of its institutional stamps |
| 16 | **Optimism Citizen House / AttestationStation** | council-curated attestations | ✗ the council | ✓ get attested | ✓ council refuses duplicates | **2+3** | small explicit institution |
| 17 | **Nomis / Trusta Labs / on-chain ML Sybil scoring** | behavioural clustering of on-chain activity | ✓ *claims* no institution | ✓ normal usage scores fine | ✗ probabilistic; adversary adapts (§4) | **1+2** (fails 3) | attempted digital `same-entity` linker; not robust |
| 18 | **Open signup / plain CAPTCHA** | none / bot filter | ✓ | ✓ | ✗ (CAPTCHA window closing, REDUCTION §2.4) | **1+2** | baseline |

Every row lands in `1+2`, `1+3`, or `2+3`. **No row is `1+2+3`.**

---

## 3. The decisive question: is the social graph an institution?

TRILEMMA §5.2: a vouching graph with `c_H < c_A` must be doing enrolment
discrimination (Theorem 2, Step 2 iff). The question is whether the
discrimination is done by *parties with out-of-band entity knowledge*
(institution) or purely by *graph structure* (a possible escape).

### 3.1 The two exhaustive cases

For any institution-free-looking graph system, exactly one holds:

- **(A) `c_A ≈ c_H`** — the graph does not actually raise attacker cost. Then the
  system is **not Sybil-resistant** at any meaningful `θ`: corner 1+2. No
  falsification (it fails requirement 3 of the trilemma).
- **(B) `c_A ≫ c_H`** — the graph does raise attacker cost. Then *something* is
  separating honest enrollees from Sybil enrollees. Candidates:
  - **(B1) vouchers using out-of-band knowledge** ("I have met this person") —
    a distributed institution by definition. Corner 2+3. No falsification.
  - **(B2) pure graph structure** (degree, expansion, mixing time) with no
    voucher judgement — the SybilGuard/SybilLimit model **[KNOWN]**. This is the
    only route to a genuine escape. It requires the "few attack edges"
    assumption: honest users almost never connect to Sybils. An attack edge is
    one honest user willing to vouch for a stranger — priced at a small bribe in
    every real deployment. When the assumption holds it holds *because honest
    users are individually doing person-recognition at the edges* — micro-
    institutions (B1 again). When it fails, `c_A` collapses to (A).

So (B2) is not a stable third option: it is (B1) when it works and (A) when it
does not. **[ANALYSIS]**

### 3.2 BrightID — worked

**[KNOWN]** Honest path: join a ~20–60 min video "connection party", get
connected to other participants who confirm you are a distinct live human;
BrightID's graph algorithm (and, in Aura, a corps of trained verifiers) then
scores you. No fee.

- `c_H` **[CONJECTURE]** ≈ opportunity cost of ~1 hour ≈ **$5–25**. No money.
- `c_A` per identity **[CONJECTURE]**: to add a Sybil into the honest region an
  operator needs an *attack edge* — one existing verified human connecting to
  the fake on a call. Price of that edge: a bribe to a verified user, or the
  amortized cost of defeating video liveness for a virtual-camera fake (an
  arms race Aura verifiers actively fight). Realistically **$1–10** per identity
  in low-wage markets, possibly less at volume.

`c_A` is not clearly `> c_H` — it may be *below* it. BrightID is best read as
**corner 2+3 with a weak `c_A`**: the connectors/Aura verifiers are the
distributed institution (B1), and even with them the Sybil-resistance is thin.
Documented BrightID Sybil incidents are consistent with this. **Not a
counterexample** — either the graph is the institution, or the system is not
Sybil-resistant.

### 3.3 Idena — the hardest case

**[KNOWN]** structure. To be *validated* for an epoch you must: (1) hold an
invitation from an existing validated identity (per-identity invite quota is
small, e.g. 1–2 per epoch, and grows with your own good behaviour); (2) appear
at the **synchronized validation ceremony** — a single short window (minutes),
the same wall-clock moment for everyone, roughly once per epoch; (3) correctly
order a set of "flips" (image-story puzzles) under time pressure; (4) have the
flips *you* authored judged solvable by others. Pass ⇒ validated, earn
rewards (honest participation is net-positive). Miss the ceremony or fail ⇒ lose
status.

It looks institution-free (no company, no KYC, no biometric) and low-cost
(minutes per epoch, you get paid). Work out the costs.

**Honest participant.**
- Time: ~10–20 min per epoch for the ceremony + flip authoring.
- Money: ≈ 0; rewards exceed costs for honest participants by design.
- `c_H` **[CONJECTURE]** ≈ **$5–15 of time per epoch**, net often negative
  (profitable). Accessible: yes.

**Attacker seeking `N` identities.** Each identity independently needs (1)+(2)+(3)+(4):

- **(2) synchronized ceremony.** One person cannot hand-solve `N` flip-sets in
  the same 2-minute window. This forces the attacker to either
  - **(3a) solve flips programmatically** — a machine solving an image-sequence
    puzzle. This is precisely a human–machine distinguisher (REDUCTION §2.4)
    with a *closing empirical window*: flip-solving ML has improved; Idena
    periodically hardens flips in response. Cost per identity = amortized
    solver-engineering, trending **down** as multimodal models improve.
  - **(3b) hire `N` humans** to each sit the ceremony for one identity at the
    synchronized moment. Cost ≈ `N` × (one ceremony's worth of a low-wage
    worker's time) ≈ **$1–5 per identity per epoch** **[CONJECTURE]**, recurring
    every epoch.
- **(1) invitations.** `N` identities need `N` invitations, drawn from a
  quota-limited pool held by validated identities whose *own rewards fall if
  their invitees fail*. Buying invitations is buying the cooperation of bonded
  validated users — **[ANALYSIS]** a distributed institution with skin in the
  game. This is the enrolment-discrimination term.

**Placement.** Idena's `c_A > c_H` holds *because* (i) the flip test rejects
non-humans for free-to-humans (a sensor / behavioural distinguisher) and (ii)
the bonded invitation graph rejects Sybils at the edge (a distributed
institution). Strip both and `c_A` falls to ~a small recurring bribe, i.e. `c_A
≈ c_H` (corner 1+2, not Sybil-resistant). With both, it is **corner 2+3**, and
its Sybil-resistance is **time-boxed** by the flip window: as flip-solvers
improve, (3a) → 0 and `c_A` collapses to the (3b)/(1) social cost.

**The one honest ambiguity.** Idena's `c_A` (recurring ~$1–5/identity/epoch via
3b, plus invitation scarcity) may clear a *low* `θ` (bot defence, `β` in cents)
while the flip window holds, and clearly fails a *high* `θ` (financial-account
defence). So Idena is "corner 2+3, marginally, with a decaying sensor." It is
**not** a system sitting stably in all three corners: its institution-free
appearance is the invitation graph's decentralization plus the flip test's
current validity, and both are load-bearing.

### 3.4 Circles UBI

Web-of-trust: an account is "trusted" once ≥ N existing accounts trust it. The
trust edges are B1 vouchers. But trust is cheap to farm (no ceremony, no test),
so `c_A` is low: **corner 1+2**, fails Sybil-resistance. The graph is an
institution *and* an ineffective one.

---

## 4. Attempted digital `same-entity` linkers (row 17)

On-chain behavioural Sybil scoring (Nomis, Trusta, Gitcoin's own analyses)
*claims* the escape TRILEMMA §5.1 rules out: raise attacker cost with no
institution, purely from digital signals, by clustering addresses that "behave
like one entity." Per TRILEMMA §5.1's Lemma this is at least as hard as a robust
human–machine distinguisher, and empirically it behaves exactly like one:

- probabilistic, with false-positive/false-negative rates that matter;
- an **empirical validity window** — published heuristics get evaded within
  months (fund from fresh CEX withdrawals, randomize timing/amounts, use
  distinct dApp mixes);
- monotone degradation as adversaries automate mimicry.

It is the REDUCTION §2.4 pattern in a new domain. Placed **1+2** (not
Sybil-resistant against an adaptive adversary). Not a counterexample; a
confirmation that the digital-linker route yields only a closing window.

---

## 5. Falsification verdict

**Trilemma:** searched BrightID, Proof of Humanity, Idena, Worldcoin/World ID,
Humanity Protocol, GoodDollar, Gitcoin Passport, Civic, BABT, zkPassport,
Circles, pseudonym parties, Optimism Citizen House, on-chain ML scoring, plain
CAPTCHA. **No system occupies all three corners.** Every one is `1+2`, `1+3`, or
`2+3` (table §2).

**Theorem 2:** no institution-free system exhibits `c_H ≪ c_A`. The social-graph
systems that appear to (BrightID, Idena) do so via vouchers/bonded-invitations
(distributed institution) and/or a behavioural test (sensor). **Theorem 2
survives the empirical test**, with the standing conditionality of TRILEMMA §6
(it holds unless a robust digital `same-entity` linker exists; none does, and
row 17 is the live evidence of the trend).

**Unification (Result 2):** the escapes seen empirically are exactly
{sensor, institution, expense}. No fourth kind observed.

**If you think Idena is a counterexample:** the burden is to show `c_A ≥ θ`
*without* the invitation graph and *without* the flip test. The invitation graph
is bonded human vouching (institution); the flip test is a human–machine
distinguisher with a documented closing window (sensor). Neither survives
removal, so Idena does not sit stably in the institution-free corner.

---

## 6. Consequence for downstream documents

- TRILEMMA §6 "verdict pending EMPIRICAL" → **resolved: theorems survive,
  conditionally.** No revision of TRILEMMA's structure required; its §6
  conditionality language stands as written.
- Paper §4 subsection (Task 4): may state the trilemma and Sybil Wedge's
  `2+3` placement, but must carry the conditionality — "no *known* robust
  institution-free asymmetry; every surveyed system confirms the split" — not
  "proven impossible."

---

## References (system-specific)

- M. Borge, E. Kokoris-Kogias, P. Jovanovic, L. Gasser, N. Gailly, B. Ford.
  *Proof-of-Personhood.* IEEE EuroS&PW 2017.
- H. Yu, M. Kaminsky, P. Gibbons, A. Flaxman. *SybilGuard.* ACM SIGCOMM 2006.
- H. Yu, P. Gibbons, M. Kaminsky, F. Xiao. *SybilLimit.* IEEE S&P 2008.
- D. Siddarth, S. Ivliev, S. Siri, P. Berman. *Who Watches the Watchmen? …
  Sybil-resistance in Proof of Personhood Protocols.* Frontiers in Blockchain,
  2020.
- BrightID docs (connection parties, Aura); Proof of Humanity / Kleros docs;
  Idena white paper and flip-ceremony spec; Worldcoin / World ID docs (Orb, iris
  dedup); Gitcoin Passport scorer docs; Circles UBI trust-graph docs. (Project
  documentation, accessed 2025–2026; cited as deployed behaviour, not endorsed.)
