# Zero-attester personhood reduces to a robust human–machine separation

**A research report in four phases, per `the-reduction.md`.**

Status of each claim is labelled inline:
**[KNOWN]** — established result with citation ·
**[FOLKLORE]** — widely assumed in the community, no single canonical proof ·
**[THIS WORK]** — proved or specified here ·
**[CONJECTURE]** — the author's estimate, not proved ·
**[OPEN]** — open problem.

The four numbered "requirements" referenced throughout are those of the source
four-problems document:

| # | Requirement (as used here) |
|---|---|
| 1 | No trusted institution anywhere in the trust path (permissionless). |
| 2 | Strict uniqueness: at most one credential per human. |
| 3 | No biometrics (no template, no sensor reading bound to the body). |
| 4 | Permissionless participation / open enrolment. (not load-bearing below) |
| 5 | No hardware attestation (no TEE, no signed device measurement). |
| 6 | An economic Sybil-cost floor `γ ≥ β·m·E`. (not load-bearing below) |

Requirements 4 and 6 do not appear in the impossibility argument; 1, 2, 3, 5 do.

---

## Phase 1 — Indexed Merkle non-membership for revocation (engineering; landed)

### Result

The `+R`-constraint brute-force revocation list (`NonMembershipList(R)` in
`circuits/wedge_revocation.circom`) is replaced by an **indexed Merkle tree
(IMT)** non-membership proof whose cost is independent of the revoked-set size.

Built and measured (`scripts/build_nonmembership_imt.mjs`, toolchain frozen at
circom2 0.2.23 / circomlib 2.0.5 / snarkjs 0.7.6, `--O2`):

| IMT depth | capacity | total constraints | added over 4,309 base | nPublic |
|---:|---:|---:|---:|---:|
| 16 | 65,536 | **11,505** | +7,196 | 8 |
| 20 | 1,048,576 | **12,477** | +8,168 | 8 |
| 24 | 16,777,216 | **13,449** | +9,140 | 8 |

Added-cost model: **`added(depth) ≈ 3,308 + 243·depth`**. The `243` is one
Poseidon(2) path-hash per level (independently confirmed against
`wedge_mem_bin_d16 → d20 → d27`, which scale at 243 constraints/level). The
`3,308` fixed term is one Poseidon(3) leaf hash plus **two full-width 254-bit
field comparisons** with their range checks (see "Soundness note" below).

Current list, for comparison (measured; each entry costs exactly one constraint
*and* one public input):

| variant | R | total | added | nPublic |
|---|---:|---:|---:|---:|
| `…_split_rev64` | 64 | 4,373 | +64 | 71 |
| `…_split_rev256` | 256 | 4,565 | +256 | 263 |
| `…_split_rev1024` | 1,024 | 5,333 | +1,024 | 1,031 |

### Crossover

Raw R1CS-size crossover: the IMT is smaller once `R` exceeds the added-constraint
figure at that depth — **≈ 7,200 (d16), ≈ 8,200 (d20), ≈ 9,100 (d24)**.

This is higher than the source's "`R ≈ 5,000`" estimate for one reason: the
estimate assumed only path-hash cost (`~255`/level) and no comparison cost. A
sound non-membership check must also prove `leaf_low < C < leaf_high`, and over
an unrestricted field that is two 254-bit decompositions plus two big-endian
comparison scans (≈ 3,050 constraints), which is the bulk of the fixed term. The
252-bit-domain optimisation below removes about half of it and moves the
crossover to `R ≈ 5,700` at depth 20, matching the source estimate.

The raw-constraint crossover is the *pessimistic* comparison. On every other
axis the IMT wins immediately:

* **Verifier bandwidth / statement size.** The list ships `R` field elements
  with every verification (`nPublic = 7 + R`); the IMT ships one (`revRoot`),
  `nPublic = 8`, constant. At `R = 1,024` that is 1,031 vs 8.
* **Verification-key size and on-chain cost** scale with `nPublic`.
* **Operational.** One circuit, one trusted-setup, for any revocation-list size,
  replacing the `rev64 / rev256 / rev1024` family and its per-size ceremonies.

### Construction

Standard indexed Merkle tree (Aztec's nullifier tree design
**[KNOWN]**, Aztec Protocol yellow-paper / "indexed merkle tree" note, 2022;
the sorted-list-in-a-tree idea for non-membership is older folklore
**[FOLKLORE]**). Each occupied leaf is a linked-list node

```
leaf_i = Poseidon(3)(val_i, nextIdx_i, nextVal_i)
```

sorted by `val`, `nextVal` pointing to the immediate successor (`0` = this leaf
is the current maximum). The list is seeded with the zero record `(0,0,0)` so
every value has a predecessor.

**Non-membership of `C`** (`circuits/wedge_nonmembership_imt.circom`,
`IndexedNonMembership(depth)`): the prover exhibits the unique "low nullifier"
record `L` and **one** Merkle path, and the circuit checks

1. `Poseidon(3)(L.val, L.nextIdx, L.nextVal)` opens to `revRoot`  — inclusion;
2. `L.val < C`  — lower bound (also rules out `L.val == C`, i.e. `C` itself revoked);
3. `C < L.nextVal`  **or**  `L.nextVal == 0`  — upper bound / maximum case.

**Adjacency is structural, not a second path.** `L.nextVal` is by construction
the immediate successor of `L.val` in the set. If `C` were revoked, the true
low-nullifier for `C` would have `nextVal ≤ C`, failing check 3; and no *other*
in-tree record with `val < C` has a `nextVal` that both exceeds `C` and is the
real successor, because the linked list is a total order with unique successors.
So checks 1–3 place `C` strictly inside a gap between two adjacent set elements
⇒ `C ∉ RevokedSet`. This is why the "two independent bracketing paths" phrasing
in the source is realised here as *one path + the next-pointer*: two independent
paths cannot certify that the two leaves are adjacent in sorted order; the
pointer can.

### Soundness note — full-width comparison

circomlib `LessThan(n)` asserts `n ≤ 252` and is unsound for field elements
`≥ 2^252`. Poseidon outputs are uniform in `[0, p)` with `p ≈ 2^253.5`, so ~30 %
of commitments exceed `2^252`. `LtField()` therefore decomposes each operand
with `Num2Bits(254)` (which range-checks it) and compares most-significant-bit
first. This is total and sound for every element of `[0, p)` and is the reason
the fixed cost is ~3.3k rather than ~1k.

*Optional optimisation (not applied):* define the revocation identifier as
`rid = C mod 2^252` (or the low 252 bits of a domain-separated hash). Then
`LessThan(252)` is sound and the two comparisons drop to ≈ 1.5k total, moving
the crossover to `R ≈ 5,700` at depth 20. Cost: a `2^124` birthday bound on
"two distinct credentials sharing an `rid`", whose only consequence is that
revoking one would revoke both. Defensible for a revocation list; left out of
the default because the project's thesis is not trading soundness for constants.

### Tests

`scripts/test_nonmembership_imt.mjs` (in `npm test`), against the real Groth16
circuit at depth 20 — **7/7 pass**:

| # | case | outcome |
|---|---|---|
| 1 | non-revoked credential | proves & verifies |
| 2 | revoked credential (`C` inserted) | witness generation fails (`C < L.nextVal` false, `L.nextVal == C`) |
| 3 | `C` below every revoked value | proves; low nullifier = seed record `(0,·,·)` |
| 4 | `C` above every revoked value | proves; `isMax` branch, upper bound vacuous |
| 5 | `C = (revoked − 1)` | proves; sits in the predecessor gap |
| 6 | `C = (revoked + 1)` | proves; low nullifier is that revoked value |
| 7 | revoked `C` + forged low nullifier from an unrelated lower gap | rejected (`C < L.nextVal` false: `L.nextVal ≤ C`) |

### Deployment recommendation

Ship **IMT depth 20** (`wedge_mem_w8_d9_split_revimt20`, capacity ~1.05 M
revocations, **12,477** constraints, constant in `R`). This is a fresh circuit
and needs its own entry in `CIRCUIT-FREEZE.md` and its own ceremony slot before
production use; it is not part of the v1.2 freeze. It converts revocation from
campus-scale (`R ≤ ~1,000` before the list dominates the proof) to
internet-scale at fixed cost.

**Classification correction (source §4.1 confirmed):** Problem 3 as "needs an
`O(1)` transparent accumulator, Low tractability" is wrong. `O(log R)` with a
transparent setup, no trapdoor, no pairing, is sufficient and now built. The
`O(1)` accumulator remains **[OPEN]** in accumulator theory but the system does
not need it.

---

## Phase 2 — The reduction (the research contribution)

### 2.1 Model

**Parties.** A *human* `𝐇` interacts with the protocol only through a *commodity
device* `𝐃`. The pair `(𝐇,𝐃)` is modelled as a source that, on protocol
messages, returns bit-strings; the protocol has no channel to `𝐇` that `𝐃` does
not mediate. A *machine* `𝐌` is any algorithm — **computationally unbounded** —
with no access to `𝐇` (no human in the loop).

**Digital-only observation [THIS WORK, def].** A personhood protocol `P` is
*digital-only* if every message any verifier receives is a bit-string and the
accept/reject output is a deterministic function of those bit-strings and public
randomness `ρ`. Write the enrolment decision as a predicate
`P_acc(τ, ρ) ∈ {0,1}` on the enrolment transcript `τ`.

> **Remark.** Digital-only is *implied by the requirements*, not an extra
> assumption: requirement 3 forbids a biometric sensor reading and requirement 5
> forbids an attested hardware measurement, so the only thing a verifier can
> condition on is what a commodity device chooses to transmit — bits.

**Correctness.** `Pr_ρ[ P_acc(τ_𝐇, ρ) = 1 ] ≥ 1 − negl` for `τ_𝐇` drawn from an
honest `(𝐇,𝐃)` enrolment.

**Uniqueness vs. a machine [THIS WORK, def].** For every machine `𝐌` (no human),
running the enrolment protocol any number of times `m = poly`, the expected
number of credentials `𝐌` obtains is `≤ 1` (strict; requirement 2). In
particular, for a *single* enrolment attempt,
`Pr_ρ[ P_acc(τ_𝐌, ρ) = 1 ] ≤ 1/m` for every polynomial `m`, i.e. **negligible**.

**Human–machine distinguisher [KNOWN term; von Ahn et al., EUROCRYPT 2003].** A
predicate `D` on transcripts has *advantage* `ε` if
`| Pr[D(τ_𝐇)=1] − Pr[D(τ_𝐌)=1] | ≥ ε`, with `τ_𝐇`, `τ_𝐌` drawn from the honest
human and the (best) machine enrolment distributions respectively. `ε` is
*non-negligible* if `ε ≥ 1/poly`. `D` is *robust* if `ε` stays non-negligible as
machine capability `→ ∞` (formally: `inf` over all machines `𝐌` of the advantage
is non-negligible).

### 2.2 Theorem 1

> **Theorem 1 (Reduction).** Let `P` be digital-only, correct, and satisfy
> uniqueness against a machine adversary holding no human participant. Then the
> enrolment predicate `D := P_acc(·, ρ)` is a human–machine distinguisher with
> non-negligible advantage. Moreover the advantage is `1 − negl`, and the
> statement holds even when `𝐌` is computationally unbounded.

**Proof.** By correctness, `Pr[D(τ_𝐇) = 1] ≥ 1 − negl`. By uniqueness vs. a
machine, for the machine enrolment distribution `Pr[D(τ_𝐌) = 1] ≤ negl` (shown
above: if it were `≥ 1/poly`, then `poly`-many independent attempts yield in
expectation `≥ 1` credential, contradicting strict uniqueness for an entity that
is not a human). Hence

```
adv(D) = Pr[D(τ_𝐇)=1] − Pr[D(τ_𝐌)=1] ≥ (1 − negl) − negl = 1 − negl.
```

`D` is efficiently computable (it is the verifier). Unbounded compute does not
help `𝐌`: the separation is **distributional**, not computational — `𝐌` cannot
sample from the human enrolment distribution because `𝐌` has no human, and no
amount of computation manufactures a sample from a distribution one cannot
query. An unbounded `𝐌` may compute `D` and search for a `τ` with `D(τ)=1`, but
by uniqueness the set of such `τ` reachable without a human has negligible mass
under any machine-realisable strategy — that is exactly the hypothesis. ∎

> **Corollary 1.** Zero-attester personhood satisfying requirements 1–3 and 5
> exists **only if** a *robust* human–machine distinguisher exists. Equivalently:
> if no robust human–machine distinguisher exists, requirements {1, 2, 3, 5} are
> jointly unsatisfiable for a digital-only protocol. **[THIS WORK]**

This converts an open *cryptography* question into an open *AI* question — one
with a measured, monotone, adverse empirical trend (§2.4).

### 2.3 Corollary 2 — the three escapes are exhaustive

> **Corollary 2 (Exhaustiveness).** Any protocol that meets the personhood goal
> (bounded credentials per human, permissionless) *without* relying on a robust
> human–machine distinguisher must negate one of exactly three propositions, and
> requirements {1, 2, 3, 5} close all three. **[THIS WORK]**

**Proof.** Theorem 1's hypotheses are P1 = digital-only, P2 = uniqueness vs. a
machine, P3 = correctness. A protocol meeting the goal cannot negate P3 (it
would reject honest humans, forfeiting the goal). So it must negate **P1** or
**P2**.

*Negating P1* means some verifier input is not a commodity-device bit-string:
there is a physical channel the protocol inspects directly. Any such channel
that discriminates humans from machines is a reading of a physical property of
the enrolling entity — i.e. a **biometric sensor** (closed by requirement 3;
"the sensor reading *is* a biometric") — or an **attested measurement** of the
device producing the channel (closed by requirement 5). There is no third kind
of non-digital input: an input either is or is not mediated by the commodity
device's own software, and if it is not, something physical is being sensed and
vouched for.

*Negating P2* has exactly two realisations. Uniqueness vs. a machine fails
either because (a) some party **certifies humanness out of band** — a machine
*with* that party's blessing is treated as a human — which is a **trusted
institution** in the trust path (closed by requirement 1); or because (b)
"`≤ 1` per human" is **replaced by** "cost `≥ c` per identity" — **weakened
uniqueness** (closed by requirement 2). These are the only two: either the bound
on machine credentials is restored by an external trust anchor, or the bound
itself is changed from a count to a cost. A purely internal, cost-free
restoration of the bound is what Theorem 1 rules out.

Three escapes — physical/biometric, institution, cost — closed by requirements
3&5, 1, 2 respectively. ∎

> **Headline result.** *Requirements 1, 2, 3 and 5 are jointly unsatisfiable for
> a digital-only protocol unless a robust human–machine separation exists. This
> is a conditional impossibility for a problem the field treats as merely
> unsolved. It should be published as the primary result, with the hybrid floor
> (§3) as the constructive complement — not pursued as a construction target.*

**Relation to prior impossibilities.** Douceur (IPTPS 2002) **[KNOWN]**: without
a trusted authority or a resource cost, Sybil attacks are unpreventable.
Nakamoto (2008) **[KNOWN]** supplied a resource cost for *consensus*
(identities-per-hashrate). Theorem 1 explains why the same move fails for
*personhood*: a purchasable resource bounds identities-per-resource, and
personhood needs identities-per-**human**, a quantity no digital-only protocol
can measure without a robust distinguisher. Observation 1 of the source
(personhood needs a resource that is universal, per-human bounded,
non-transferable, and digitally verifiable; the four candidates each miss a
clause) is the informal shadow of this theorem.

### 2.4 Empirical grounding: no known robust human–machine distinguisher

The claim "every proposed distinguisher has an empirical validity window that
has been closing, and none has a robustness argument" — surveyed:

**Text / image CAPTCHAs.**

* von Ahn, Blum, Hopper, Langford, *CAPTCHA: Using Hard AI Problems for
  Security*, EUROCRYPT 2003 **[KNOWN]** — coined the term; the "robustness
  argument" was explicitly *"a break advances AI"*, i.e. an empirical bet, not a
  proof.
* Mori & Malik, CVPR 2003 — broke EZ-Gimpy (~92 %) / Gimpy (~33 %) within months
  of deployment.
* Chellapilla & Simard, NIPS 2004 — ML beats several early schemes.
* reCAPTCHA v1 (text, 2007). Goodfellow et al., *Multi-digit Number Recognition
  from Street View*, 2013/ICLR 2014 — 99.8 % on reCAPTCHA-hard Street View
  digits.
* Bursztein et al., *The End is Nigh: Generic Solving of Text-based CAPTCHAs*,
  USENIX WOOT 2014.
* Ye et al., *Yet Another Text CAPTCHA Solver: A GAN Approach*, ACM CCS 2018 —
  one model breaks 33 schemes incl. reCAPTCHA/hCaptcha text at 10–90 %.
* reCAPTCHA v2 ("I'm not a robot", 2014). Sivakorn et al., IEEE EuroS&P 2016 —
  image challenges ~70 %. Akrout et al. 2019 — RL agent ~97 %. Plesner et al.,
  *Breaking reCAPTCHAv2*, 2024 — YOLO pipeline, **100 %** of image challenges,
  human-indistinguishable timing.
* Audio reCAPTCHA. Bock et al., *unCaptcha*, USENIX WOOT 2017 (~85 %);
  unCaptcha2, 2019 (~91 %) using the platforms' own speech-to-text.
* Searles et al., *An Empirical Study & Evaluation of Modern CAPTCHAs*, USENIX
  Security 2023 **[KNOWN]** — across schemes, automated solvers are **faster and
  at least as accurate as humans**; humans take 1–15 s and are error-prone.
* OpenAI GPT-4 System Card, 2023 — GPT-4 induced a human TaskRabbit worker to
  solve a CAPTCHA; multimodal models (GPT-4V, Gemini, Claude) solve many static
  CAPTCHAs directly by 2024.

Trend: **monotone**. Every scheme's machine solve-rate has risen over time; no
text/image scheme retains a durable gap. Idena's synchronised "flip" challenges
(the one deployed proof-of-personhood system relying on a CAPTCHA-like test)
are, by its own community's reporting, under increasing pressure from
learned solvers — an empirical window, not a proof.

**Interaction entropy / keystroke & mouse dynamics.**

* Monrose & Rubin, *Keystroke dynamics as a biometric*, FGCS 2000 **[KNOWN]**.
* Killourhy & Maxion, *Comparing anomaly-detection algorithms for keystroke
  dynamics*, DSN 2009 **[KNOWN]** — canonical benchmark; best equal-error-rate
  ≈ 9.6 % *even for the easier task of telling two humans apart*. Telling
  "a human" from "a good generator" is not easier.
* Serwadda & Phoha, *Examining a large keystroke biometrics dataset for
  statistical-attack openings*, ACM TISSEC 2013 — bot trained on population
  statistics substantially raises impostor pass-rates.
* Stefan, Shu, Yao, *Robustness of keystroke-dynamics based biometrics against
  synthetic forgeries*, Computers & Security 2012 **[KNOWN]** — synthetic
  keystroke generators defeat detectors trained without forgery examples.
* Acien et al., *TypeNet*, ACM TIIS 2022 — deep models both authenticate and,
  run generatively, synthesise human-like timing at scale.
* General position: keystroke/mouse dynamics is a *weak biometric* (it
  distinguishes enrolled individuals with double-digit EER); as a
  human-vs-machine gate it is weaker still, because the machine's target — "look
  like a generic human" — is an easier distribution to hit than "look like a
  specific enrolled human", and modern sequence models hit it. No robustness
  argument exists; every result is an accuracy figure on a fixed adversary.

**Reaction-time bounds.**

* Human simple visual reaction time floors at ≈ 200–250 ms, auditory ≈ 150 ms
  (Luce, *Response Times*, 1986 **[KNOWN]**; a century of psychophysics).
* This bounds humans from being *too fast*. It gives no lower bound on a
  machine: a machine trivially inserts delay and samples a realistic RT
  distribution. As a distinguisher it has advantage only against naive bots and
  **zero robustness** — the escape (add `sleep`) is one line.

**Cognitive / knowledge challenges** (semantic puzzles, common-sense QA,
"describe this image"): the exact capability LLMs and multimodal models have
been optimised for; solve rates now exceed median-human on many such tasks
(broadly documented across LLM evaluations, 2023–2025). No robustness argument;
the trend is the steepest of all the categories here.

**Search for a counterexample — none found.** A counterexample would be a
proposed human–machine separation accompanied by a *robustness argument*
(advantage provably bounded away from 0 as machine capability grows) rather than
an empirical validity window. Candidates considered and rejected:

* *AI-completeness framing* (von Ahn et al.) — "a break advances AI" is a
  research bet; repeatedly falsified.
* *Social-graph Sybil detection* (Yu et al., SybilGuard SIGCOMM 2006 /
  SybilLimit S&P 2008) **[KNOWN]** — has a genuine structural robustness
  argument, but it detects Sybil *regions* under a "few attack edges"
  assumption; it is not a human–machine distinguisher and it reintroduces the
  social-institution escape (attack edges are cheap in practice).
* *Distance-bounding / proof of physical presence* — a physical channel; the
  §2.3 P1 escape (sensor).
* *Pseudonym parties* (Borge et al., IEEE EuroS&PW 2017) **[KNOWN]** — explicitly
  non-digital (people physically gather); the P1 escape.
* *Idena flips* — explicitly an empirical window; under AI pressure.

> **Conclusion (§2.4) [THIS WORK, supported].** As of early 2026 there is **no
> known robust human–machine distinguisher**. Every proposed mechanism has a
> measured validity window, and across CAPTCHA families, behavioural biometrics,
> timing bounds, and cognitive challenges the windows have narrowed
> monotonically with model capability. Corollary 1 therefore makes zero-attester
> strict-uniqueness personhood conditional on a breakthrough that currently has
> no theoretical basis.

---

## Phase 3 — Problem 2′: the hybrid floor (constructive complement)

### 3.1 Statement

> **Open Problem 2′ [KNOWN framing, source].** Construct a Sybil-resistant
> protocol where the marginal cost of each additional identity is bounded below
> by a *physical* quantity — energy, sequential wall-clock time, or physical
> presence — with **no human institution** in the trust path, and where the cost
> is not reducible by capital at scale.

This is the move Nakamoto made: not one-vote-per-human, but cost-per-unit-
influence with no institution. Problem 2′ applies the same weakening to
personhood. It is the **only** escape from Theorem 1 that keeps requirements 1,
3, 5 (it spends requirement 2).

### 3.2 The VDF-chain minting path

**[KNOWN primitive]** Verifiable Delay Function: Boneh, Bonneau, Bünz, Fisch,
*Verifiable Delay Functions*, CRYPTO 2018; efficient constructions Wesolowski
(EUROCRYPT 2019) and Pietrzak (ITCS 2019). A VDF `VDF_T` requires `T` *sequential*
steps to evaluate, is not parallelisable below `T`, and produces a proof
verifiable in `polylog(T)`.

**Construction (identity = a continuously maintained VDF chain).**

* Enrolment binds an identity to a secret `s`; chain genesis `x_0 = H(s)`.
* Each epoch `e` (wall-clock length `L`) publishes
  `x_e = VDF_T( x_{e-1} ‖ beacon_e )`, where `beacon_e` is a public randomness
  beacon unpredictable until epoch `e` opens (drand, or an L1 block hash).
* `T` is calibrated so that commodity hardware evaluates `VDF_T` in ≈ `L`.
* An identity is *live* at epoch `e` iff it has published a valid `x_e`
  extending its own `x_{e-1}` under `beacon_e`.

**Why `N` identities need `N` machines [THIS WORK, argument].**

1. Each chain's epoch-`e` work depends on `beacon_e`, so it **cannot be
   precomputed**: the `T` sequential steps must be spent inside the `L`-window.
2. A single chain **cannot be parallelised** below `T` (VDF property).
3. Distinct identities have distinct `x_{e-1}` and therefore **distinct VDF
   inputs**; there is no batching across chains for modular-squaring VDFs.

Hence to keep `N` identities live an operator must perform `N` independent
`T`-step sequential computations within each `L`-window. With per-device
sequential rate `r` (steps/s) and `T ≈ r_commodity · L`, one device clears
`r·L / T = r / r_commodity` chains per epoch. So the identity count is bounded by

```
N  ≤  (Σ over devices of r_device) / r_commodity  =  σ · (#devices),
```

where **`σ = r_fastest / r_commodity`** is the ASIC/commodity sequential-speed
ratio. `N` identities ⇒ at least `⌈N/σ⌉` physical sequential-compute devices.
This is the structural Sybil bound: linear in hardware, with slope `1/σ`.

### 3.3 The ASIC constant σ, and monitoring it

**[KNOWN]** For the well-studied VDFs (RSA-group and class-group modular
squaring) the sequential speed-up of dedicated silicon over a tuned commodity
CPU/GPU is a **small constant**, not unbounded: the Ethereum Foundation / VDF
Alliance RSA-VDF ASIC programme targeted roughly `10–30×`; class-group VDFs
(Chia) see similar small factors. Squaring is inherently serial; ASICs win on
clock and datapath width, not on parallelism, so `σ` is bounded by a
technology-node constant.

**Monitoring `σ` [THIS WORK, spec].**

* Publish a reference `r_commodity` (steps/s on a named commodity part) and
  recalibrate `T = r_commodity · L` each parameter epoch.
* Track the fastest publicly demonstrated `r_fastest` (hardware papers,
  bounty submissions, chain-observed sub-`L` completions).
* `σ = r_fastest / r_commodity`. When `σ` moves, raise `T` (equivalently `L`) so
  that `σ`-advantaged hardware still cannot exceed its `σ`-fold identity budget
  cheaply, and so honest commodity users still finish within `L` (raise `L`, or
  ship the reference implementation as a GPU kernel to lift `r_commodity`).
* `σ` is a **bounded, observable, priced** parameter. Contrast the attester
  model, where `k` colluding attesters drive the Sybil cost to **zero
  discontinuously** with no observable precursor.

### 3.4 Composed floor — and a correction to the source

The source writes the hybrid floor as `γ ≥ max(γ_attester, γ_physical)`. With
**disjunctive acceptance** (an identity is valid with *either* `k` attester
signatures *or* a live VDF chain) an attacker takes the cheaper path, so the
*effective* per-identity cost is

```
γ_effective  =  min( γ_attester_path ,  γ_physical ).
```

The value of the hybrid is therefore not that it raises the honest-case floor —
it can't, and naively it could *lower* it if `γ_physical < γ_attester`. The
value is that it **replaces the catastrophic failure mode**:

| scenario | attester-only | hybrid (disjunctive) |
|---|---|---|
| attesters honest | `γ_attester` | `min(γ_attester, γ_physical)` |
| all `k` attesters collude | **0** | **`γ_physical` > 0** |

**Design rule [THIS WORK].** Choose VDF parameters so that
`γ_physical ≥ γ_attester_target`. Then the VDF path never undercuts the intended
floor in the honest case, and total attester collusion degrades the guarantee to
`γ_physical` — the intended floor — instead of to zero. Stated cleanly:

> **`γ ≥ γ_physical` unconditionally**, for any coalition of attesters, given a
> VDF path calibrated to `γ_physical ≥ γ_attester_target`.

That is a concrete, provable, non-trivial security improvement to the deployed
system and it requires no breakthrough — only the VDF-chain path added as an
alternative enrolment route, and the calibration above.

### 3.5 Cost per identity per epoch — order-of-magnitude estimate **[CONJECTURE]**

Assumptions: RSA-2048 modular-squaring VDF; epoch `L = 1 day`; commodity rate
`r_commodity ≈ 2·10⁷ squarings/s` (single tuned CPU core); `σ ≈ 20`.

* **Energy.** One core at ≈ 20 W for `L/σ ≈ 1.2 h` of actual compute (ASIC path;
  commodity path runs the full 24 h at similar wattage) ⇒ **0.02–0.5 kWh per
  identity per epoch** ⇒ **US$0.002–0.05** at $0.10/kWh. Commodity users pay the
  upper end; ASIC operators the lower.
* **Hardware.** One sequential-compute device is required per `σ` identities and
  must exist for the identity's lifetime. Amortised: a $200 device over 3 years
  of daily epochs ≈ **$0.06 per (σ·identity)-epoch** ⇒ **~$0.003 per identity
  per epoch** at `σ = 20`.
* **Total: ≈ $0.005–0.05 per identity per epoch**, dominated by the requirement
  to *own and run `⌈N/σ⌉` devices continuously*.

This is small in absolute terms — Problem 2′ buys a *linear* cost, not an
*expensive* one. Its deterrence value is that a 1,000-identity Sybil operator
must run ~50 devices around the clock indefinitely, observably, with no
institution to subvert and no capital shortcut below the `1/σ` slope. Whether
linear-at-this-slope is *enough* is an economic question, and the direct input
to Problem 4.

---

## Phase 4 — Constructions: none attempted; the negative result stands

Per the source's instruction and §2.3: the impossibility analysis is
**exhaustive**. Corollary 2 enumerates the three escapes and shows requirements
{1, 2, 3, 5} close all three. There is no gap in which a construction for
zero-attester **strict-uniqueness** personhood could live.

> **First-class result.** *Under requirements 1–6 jointly, no viable
> construction exists — conditional on the non-existence of a robust
> human–machine distinguisher, for which there is no candidate and a monotone
> adverse empirical trend (§2.4). Producing "≥ 3 candidate constructions" here
> would produce three schemes each broken by a local model on the user's own
> device, which is the attack the requirement set itself names.*

The constructive work that *is* available is Problem 2′ (§3): it is not a
construction for requirements 1–6, it is a principled weakening of requirement 2,
and it is buildable on the deployed system now.

---

## Probability estimates **[CONJECTURE]**

**Strong version — requirements 1–6 jointly (digital-only, no institution, no
biometric, no attestation, strict one-per-human, economic floor):**
**< 5 %** ever, and effectively **~0 % within 10 years**. It is gated on a robust
human–machine distinguisher. Not only does none exist — the trend of the last
two decades is that every candidate degrades monotonically, and the capability
that breaks them (general perception + language + reasoning at human level on
short tasks) is exactly what the field is pushing forward hardest. A robust
distinguisher would be a landmark *negative* result about AI capability; betting
on it is betting against the central trend of the field.

**Weak version — Problem 2′ (institution-free physical Sybil cost, no strict
uniqueness):** **~60 %** that a clean, defensible construction with a stated
security theorem is reachable by one researcher in months. The primitive (VDF
chains) exists; the `N`-identities-need-`⌈N/σ⌉`-devices argument (§3.2) is
straightforward; the `γ ≥ γ_physical` unconditional floor (§3.4) is provable.
The residual risk is in the parts that are economics, not cryptography: whether
`σ` stays a small monitored constant in adversarial conditions, and whether a
*linear* per-identity cost at a low slope deters real Sybil operators — which is
Problem 4's question, not this one's.

---

## Recommended next target

Per the source's own resolution of the Problem-2-vs-Problem-4 tension: after
Phase 1 (landed) and the Phase 2 write-up (a publishable conditional
impossibility), the right next problem is **Problem 4** — turning `γ ≥ β·m·E`
from a design rule into a stated equilibrium of a specified stochastic game with
attester bribery, an unknown attacker budget, and a resale market. Pen-and-paper,
one person, no new cryptography; the direct analogue of Bitcoin's §11. Problem 2′
(§3) is its constructive input.

---

## References

1. J. Douceur. *The Sybil Attack.* IPTPS 2002.
2. S. Nakamoto. *Bitcoin: A Peer-to-Peer Electronic Cash System.* 2008.
3. L. von Ahn, M. Blum, N. Hopper, J. Langford. *CAPTCHA: Using Hard AI Problems
   for Security.* EUROCRYPT 2003.
4. G. Mori, J. Malik. *Recognizing Objects in Adversarial Clutter: Breaking a
   Visual CAPTCHA.* CVPR 2003.
5. K. Chellapilla, P. Simard. *Using Machine Learning to Break Visual Human
   Interaction Proofs.* NIPS 2004.
6. I. Goodfellow et al. *Multi-digit Number Recognition from Street View Imagery
   using Deep Convolutional Neural Networks.* ICLR 2014.
7. E. Bursztein et al. *The End is Nigh: Generic Solving of Text-based CAPTCHAs.*
   USENIX WOOT 2014.
8. G. Ye et al. *Yet Another Text CAPTCHA Solver: A Generative Adversarial
   Approach.* ACM CCS 2018.
9. S. Sivakorn, I. Polakis, A. Keromytis. *I Am Robot: (Deep) Learning to Break
   Semantic Image CAPTCHAs.* IEEE EuroS&P 2016.
10. I. Akrout et al. *Hacking Google reCAPTCHA v2 using Deep Learning.* 2019.
11. K. Bock et al. *unCaptcha: A Low-Resource Defeat of reCAPTCHA's Audio
    Challenge.* USENIX WOOT 2017.
12. A. Searles et al. *An Empirical Study & Evaluation of Modern CAPTCHAs.*
    USENIX Security 2023.
13. A. Plesner et al. *Breaking reCAPTCHAv2.* 2024.
14. OpenAI. *GPT-4 System Card.* 2023.
15. F. Monrose, A. Rubin. *Keystroke Dynamics as a Biometric for
    Authentication.* Future Generation Computer Systems, 2000.
16. K. Killourhy, R. Maxion. *Comparing Anomaly-Detection Algorithms for
    Keystroke Dynamics.* IEEE/IFIP DSN 2009.
17. A. Serwadda, V. Phoha. *Examining a Large Keystroke Biometrics Dataset for
    Statistical-Attack Openings.* ACM TISSEC 2013.
18. D. Stefan, X. Shu, D. Yao. *Robustness of Keystroke-Dynamics Based
    Biometrics Against Synthetic Forgeries.* Computers & Security 2012.
19. A. Acien et al. *TypeNet: Deep Learning Keystroke Biometrics.* ACM TIIS 2022.
20. R. D. Luce. *Response Times: Their Role in Inferring Elementary Mental
    Organization.* Oxford University Press, 1986.
21. H. Yu, M. Kaminsky, P. Gibbons, A. Flaxman. *SybilGuard: Defending Against
    Sybil Attacks via Social Networks.* ACM SIGCOMM 2006.
22. H. Yu, P. Gibbons, M. Kaminsky, F. Xiao. *SybilLimit: A Near-Optimal Social
    Network Defense Against Sybil Attacks.* IEEE S&P 2008.
23. M. Borge et al. *Proof-of-Personhood: Redemocratizing Permissionless
    Cryptocurrencies.* IEEE EuroS&PW 2017.
24. D. Boneh, J. Bonneau, B. Bünz, B. Fisch. *Verifiable Delay Functions.*
    CRYPTO 2018.
25. B. Wesolowski. *Efficient Verifiable Delay Functions.* EUROCRYPT 2019.
26. K. Pietrzak. *Simple Verifiable Delay Functions.* ITCS 2019.
27. Aztec Protocol. *Indexed Merkle Tree* (nullifier-tree design note). 2022.
28. D. Siddarth, S. Ivliev, S. Siri, P. Berman. *Who Watches the Watchmen? A
    Review of Subjective Approaches for Sybil-resistance in Proof of Personhood
    Protocols.* Frontiers in Blockchain, 2020.

---

*Artifacts:* `circuits/wedge_nonmembership_imt.circom`,
`circuits/main_mem_w8_d9_split_revimt{16,20,24}.circom`, `scripts/imt.mjs`,
`scripts/build_nonmembership_imt.mjs`, `scripts/test_nonmembership_imt.mjs`,
`docs/self-audit/nonmembership_imt.{md,json}`.
