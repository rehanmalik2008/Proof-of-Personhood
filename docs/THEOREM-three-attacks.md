# Three attacks: grinding, trustless bribery, and the revocation–privacy tension

**Formalizes `three-attacks.md`.** Extends the Problem 4 line
(`docs/THEOREM-equilibrium-problem4.md`, cited **EQ**) with three results:
Theorem 5 (grinding asymmetry — a *positive* result), the whistleblower-bounty
parameter `B` in EQ's security condition, and Theorem 7 (the tension between
EQ's bulk-revocation requirement and cohort anonymity). Theorem 6 records why
the cryptographic Dark-DAO defence is closed; §4 is the bounded investigation of
its one open direction.

Labels: **[THIS WORK]**, **[KEPT]** (from the source, verified), **[CORRECTION]**,
**[OPEN]**, **[CONJECTURE]**.

Local numbering: results in this document are `3A-Result n` to avoid collision
with EQ's `Result 1–4`.

---

## 1. Theorem 5 — grinding asymmetry, and the anti-grinding construction

### 1.1 The attack [KEPT]

If attester assignment is a VRF over enrollee-chosen input and aborting is free,
an attacker re-rolls until the assignment is an all-corrupt `k`-set. With corrupt
fraction `f` and set size `k`, expected attempts to hit an all-corrupt set are
`f^{-k}`. Free aborts make this trivial (`f=0.1, k=3` → 1,000 rolls). The
protocol must gate re-rolling.

### 1.2 Construction: commit → cost → assign [THIS WORK]

Enrollment (one-time, off the per-login path):

1. **Commit.** Enrollee samples nonce `r`, publishes
   `com = Poseidon(r, pk_enrollee)` to the enrollment ledger at block height `h`.
   Binding `pk_enrollee` stops a griefer reusing someone else's commitment.
2. **Cost gate — VDF (preferred).** Enrollee evaluates `y = VDF_T(com)` and
   publishes `(com, y, π_vdf)`. The VDF is keyed on `com`, so it cannot be
   precomputed before committing and a fresh `com` forces a fresh `T`-step
   sequential evaluation. `π_vdf` (Wesolowski / Pietrzak) is verified **on
   chain**, not in circuit. *Fee variant:* escrow/burn `c` in a tx referencing
   `com` — cheaper to reason about, but a value transfer that pushes on the
   accessibility corner (Theorem 2); VDF burns only electricity and needs no
   recipient.
3. **Beacon.** The unbiasable public beacon `ρ_e` for the first epoch `e` whose
   publication time is `≥ h + Δ`, with `Δ ≥ T + finality`. Use drand (threshold
   BLS, unbiasable by construction) or `RANDAO+VDF`; a future block hash works
   only if `Δ` exceeds any miner's biasing horizon.
4. **Assign.** `assign = Poseidon(com, y, ρ_e)`; derive the `k` attester
   pool-indices as `idx_j = assign + j mod n` de-duplicated, or `k` rejection
   samples from `Poseidon(assign, j)`. The enrollee then collects signatures
   from exactly those `k` attesters; the credential mints only if the `k`
   pubkeys presented match `derive(assign, ·)`.

**The three properties that must be enforced, or Theorem 5 is void:**

| requirement | enforced by | failure if absent |
|---|---|---|
| beacon unbiasable | drand / VDF-delayed beacon; never enrollee- or coordinator-chosen | attacker grinds the beacon input instead of `com` |
| beacon unknown at commit | `Δ ≥ T + finality`; `com` at height `h` is bound to the unique next beacon after `h+Δ`, no beacon shopping | attacker commits after seeing `ρ_e`, picks a winning `com` in one try |
| no re-derivation without fresh commit + fresh payment | `assign` is a pure function of `(com, y, ρ_e)`; `y = VDF_T(com)`; a different `assign` needs a different `com` (⇒ new `T`-step VDF) — the beacon schedule is fixed | attacker re-rolls `assign` for free, `f^{-k}` → 1 attempt |

### 1.3 Cost

**In-circuit constraint cost.** Two designs:

- **Verifier-checked assignment: 0 added constraints.** The base circuit already
  proves `k` EdDSA signatures over `C` by `k` pubkeys. Expose those `k` pubkeys
  (or their pool-indices) as public inputs; the verifier checks
  `{pk_1..pk_k} = derive(assign, ·)` and that `assign = Poseidon(com, y, ρ_e)`
  with `π_vdf` valid on chain. Same "prover-supplied, verifier-checked" shape as
  `epochTree`. **⚠ Do not use this variant if redundant pre-attestation
  (`k' > k`, `RESEARCH-private-bulk-revocation.md` §3B) is deployed:** revealing
  the `k` signer identities lets an observer see a user drop the revoked attester
  and switch subsets, re-exposing the cohort at re-proof (measured: AUC ≈ 1,
  `surplus_attestation_leak.mjs`). With redundancy, the in-circuit variant below
  is **required**, not optional.
- **In-circuit assignment binding (required with redundancy; self-contained
  credential otherwise):** `Poseidon(3)`
  for `assign` (≈ 240) + `k` index derivations (≈ 240 each) + `k` Merkle
  openings against the attester-pool root, depth `⌈log2 n⌉`, ≈ 243/level. For
  `n = 256` (depth 8): per attester ≈ 240 + 8·243 = 2,184; **`k=3` → ≈ 6,800**,
  **`k=5` → ≈ 11,200** added to the 4,309 base (11.1k / 15.5k total — the same
  order as the IMT revocation circuit). VDF stays on chain in both designs.

**Honest-user latency (one-time, enrollment only).**
`commit-tx finality` (chain-dependent, ~2 s–2 min) `+ T` (VDF wall-clock; 30 s
in the worked example, 0 for the fee variant) `+ ` wait for the next scheduled
beacon after `h+Δ` (≤ one drand cadence, ~30 s). ≈ **`T` + ~1 minute**; ~90 s
with a 30 s VDF on a fast-finality chain. Not on the per-login hot path.

**Attacker expected cost `c · f^{-k}`.** With a `T = 30 s` VDF gate, per fake
credential, *before any bribe*:

| `f` | `f^{-3}` | `f^{-5}` | k=3, machine-hours | k=5, machine-hours | k=5, machine-days |
|---:|---:|---:|---:|---:|---:|
| 0.05 | 8,000 | 3,200,000 | **66.7** | **26,667** | 1,111 |
| 0.10 | 1,000 | 100,000 | **8.33** | **833** | 34.7 |
| 0.20 | 125 | 3,125 | **1.04** | **26.0** | 1.08 |

At cloud spot ~\$0.04/machine-hour: `f=0.1,k=5` ≈ \$33/fake; `f=0.05,k=5` ≈
\$1,070/fake; `f=0.2,k=3` ≈ \$0.04/fake. **Grinding protection is meaningful only
at `k ≥ 5` and/or low `f`.** At `k=3, f=0.2` it adds ~1 machine-hour — nothing.
This is a design argument for `k ≥ 5` wherever the threat model includes
assignment grinding.

**Parallelization caveat.** VDFs are sequential *within* one chain, parallel
*across* chains. `f^{-k}` attempts do **not** take `f^{-k}·T` wall-clock — an
attacker with `M` rigs finishes in `f^{-k}·T/M`. The cost is `f^{-k}·T`
**machine-seconds**, a hardware/energy bill, not elapsed time. Every figure above
is stated in machine-hours for this reason. A fee gate converts directly to money
with no parallelization question, at the accessibility-corner cost noted in §1.2.

### 1.4 Theorem 5 and 3A-Result 1

> **Theorem 5 (grinding asymmetry) [THIS WORK].** Under commit-then-cost-then-assign
> with per-attempt cost `c`, corrupt fraction `f`, assignment size `k`: an honest
> enrollee pays `c` once; an attacker requiring an all-corrupt `k`-set pays
> `c · f^{-k}` in expectation (machine-hours). The asymmetry ratio `f^{-k}` is
> achieved with **no institution** and **no enrolment discrimination**.

**Consistency with Theorem 2.** Theorem 2 (EQ / TRILEMMA): no institution ⇒
`c_H = c_A`, because an adversary runs the honest algorithm `N` times, producing
transcripts from the identical honest distribution. Theorem 5 does not violate
it: the protocol treats every enrolment identically. The attacker's extra cost is
**self-imposed** — he discards the overwhelming majority of assignment outcomes
because he requires a rare event, not because the protocol identifies him. The
honest user accepts whatever assignment arrives.

> **3A-Result 1 [THIS WORK].** Randomized assignment plus a per-attempt cost
> raises `c_A / c_H` with no institution, by making the attacker's requirement
> rare under the protocol's *own* randomness. It is consistent with Theorem 2,
> not an exception. It adds the first **non-amortizing** term to the attacker's
> per-identity cost:
> $$\gamma(N) \;=\; \underbrace{\tfrac{k\,b}{N}}_{\text{amortizes (EQ)}} \;+\; \underbrace{c\,f^{-k}}_{\text{does not}}$$
> Every fake credential needs its own successful roll. For small `f` and `k ≥ 5`
> the grinding term dominates.

---

## 2. The whistleblower bounty `B` in the security condition (Task 2)

### 2.1 Dark DAO escrow makes silence *profitable*, not *verifiable* [KEPT]

A Dark DAO can verifiably purchase a **signature** ("I signed `C`" is positive
and provable); it cannot verifiably purchase **silence** ("I will not report" is
negative, unbounded in time, unprovable). The refinement that works: **escrow
released at `T` only if `C` has not been revoked** — non-revocation is publicly
checkable. That does not restore trustless silence-buying; it makes silence pay,
which is enough to set up a bidding war.

### 2.2 The bidding war, formalized [THIS WORK]

Attester `i`, offered escrowed bribe `b_i` (paid at `T` iff `C` not revoked),
versus reporting for bounty `B` + immunity:

```
E[U_report] = B + V_i                                    (keep franchise, no slash, take bounty)
E[U_silent] = δ · b_i · (1−ρ)^{k−1} + (1−p_d)V_i − p_d S_i
```

`δ = e^{−rT}` discounts the escrow period; `ρ` is the probability each *other*
corrupted attester in the `k`-set reports (any one defection revokes `C` and
sinks the escrow — hence `(1−ρ)^{k−1}`); `p_d` is the residual detection hazard.
Silence is chosen iff `E[U_silent] > E[U_report]`:

```
δ · b_i · (1−ρ)^{k−1}  >  B + p_d (S_i + V_i)
```

```
┌───────────────────────────────────────────────────────────┐
│   b_i  >  [ B + p_d (S_i + V_i) ] / [ δ (1−ρ)^{k−1} ]      │   (participation constraint, with bounty)
└───────────────────────────────────────────────────────────┘
```

Clean case (`δ→1`, `ρ→0`): **`b_i > B + p_d(S_i + V_i)`** — `B` adds one-for-one
to the bribe floor. The `(1−ρ)^{k−1}` factor is a **coordination tax** on the
Dark DAO: `k` jointly-fragile escrows inflate every required bribe by
`1/(1−ρ)^{k−1}`.

### 2.3 How `B` enters EQ Corollary 4.1 [THIS WORK]

EQ Cor 4.1: unprofitability needs `k·b > e^{−1} R / q` with the fixed-point
bribe `b = p_d(N^*)(S+V) = 0.632(S+V)`. Substituting `b = B + 0.632(S+V)` (clean
case):

```
k·B + 0.632·k(S+V)  >  0.368 · βmE / q
```

```
┌─────────────────────────────────────────────────┐
│   k(S + V) + 1.58·k·B   >   0.58 · βmE / q       │   (security condition, with bounty)
└─────────────────────────────────────────────────┘
```

Design rule with margin: **`k·(S + V + 1.58·B) ≥ βmE / q`.**

**\$1 of bounty budget substitutes for \$1.58 of stake-plus-franchise**, because
`B` is a *certain* payment to the reporter while `S+V` is lost only with
probability `p_d(N^*) = 0.632` (`1/0.632 = 1.58`). And `B` is not locked up the
way stake is, and is paid only on realized reports. **`B` is a strictly more
capital-efficient security lever than raising `S`** — up to `B ≈ V_i + `(immunity
value), past which the attester reports regardless and further `B` is wasted;
beyond that point, spend on stake.

### 2.4 Defender's expected cost as a function of report rate [THIS WORK]

Per corruption episode (`k` attesters corrupted for one credential), the
probability of at least one report is `1 − (1−ρ)^k`; the defender pays one bounty
on that event:

```
E[defender outlay | episode]  =  [1 − (1−ρ)^k] · B
```

Under deterrence the episode rate `λ → 0`, so absolute expected cost `→ 0`; the
register value is the insurance premium per residual episode. Expected-cost ratio
(attacker : defender) per episode:

```
   k · b                    k                 (         0.632 (S+V) )
─────────────────  ≥  ────────────── · ( 1 + ─────────────────── )
[1−(1−ρ)^k] · B        1 − (1−ρ)^k     (              B          )
```

For `ρ = 0.2, k = 5`: `1 − 0.8^5 = 0.672`, ratio `≥ 7.4 · (1 + 0.632(S+V)/B)` —
always `> 7×`, and `≫` that when `S+V > B`. Raising `B` raises both `ρ` (more
reporting) and the attacker's floor — a double benefit — until `ρ → 1`.

> **3A-Result 2 [THIS WORK].** The whistleblower bounty is a defender-side
> control on the attacker's bribe floor: `k(S+V) + 1.58·k·B ≥ βmE/q`. The
> defender pays `B` only on realized reports (`[1−(1−ρ)^k]·B` per episode,
> `→ 0` under deterrence), while the attacker pays `k·b ≥ k[B + 0.632(S+V)]`
> per attempted credential up front. Dark DAO escrow converts an
> unenforceability argument into this bidding war; it does not break it.

`B` joins the falsification register (§5).

---

## 3. Theorem 7 — the revocation–privacy tension, and the §6 disclosure (Task 3)

### 3.1 The cohort leak [KEPT]

Bulk revocation of attester `A` (EQ 3.1 / paper §5.8) tombstones every credential
`A` signed. A public observer sees exactly which leaves changed at the revocation
block and learns **`cohort(A)`** — a linkage across every user in it. Users whose
proofs begin failing after that block are identifiable as cohort members by
timing correlation alone. This is a genuine anonymity break and was undisclosed.

### 3.2 Theorem 7

> **Theorem 7 (revocation–privacy tension) [THIS WORK].** EQ's economic bound
> requires portfolio-wide revocation on attester compromise — without it
> `Π(N)` is unbounded (EQ 3, 3A-Result via `γ`). But publicly verifiable bulk
> revocation necessarily reveals the partition of credentials by signing
> attester. Therefore the economic-security bound and cohort anonymity are in
> direct tension: **the mechanism that makes the economics close is the
> mechanism that leaks the grouping.**

### 3.3 Quantification [THIS WORK]

`n` attesters, `k` per credential, uniform random assignment (forced by
Theorem 5). A credential's `k`-set is a uniform `k`-subset of `[n]`.

- `P(A ∈ a random k-set) = k/n`, so **`|cohort(A)| ≈ N·k/n`.**
- A user who was anonymous among `N` is, after "user ∈ cohort(A)", anonymous
  among `N·k/n`. **Anonymity-set reduction factor `= n/k`.**
- `N = 10^6, k = 3`: `n = 100` → cohort ≈ 30,000, factor ≈ 33×;
  `n = 1000` → cohort ≈ 3,000, factor ≈ 333×.

Two faces of `n`, stated honestly:

- **Per-revocation exposure** is the fraction `k/n` of users touched by any one
  compromise. Larger `n` → smaller fraction leaked per event, and slower
  accumulation of linkage across successive revocations. (This is the source's
  "raising `n` improves it".)
- **Residual anonymity of an identified cohort member** is `N·k/n`. Larger `n` →
  *smaller* crowd for that individual — still ≥ 3,000 for realistic `n ≤ 1000`
  at `N = 10^6`, but the effect is adverse and should not be hidden.

Net: larger `n` reduces how many users each compromise exposes; it does not make
an identified member's residual set larger. The semantic sting is removed by
mitigation (b), not by `n`.

### 3.4 Mitigations, honestly costed [KEPT + THIS WORK]

| # | mitigation | effect | cost |
|---|---|---|---|
| a | **overlapping `k`-sets** (already present, `k ≥ 2`) | revocation *selects* `cohort(A)`, does not *partition* the population; `|cohort| = Nk/n` | none — structural |
| b | **random assignment** (forced by Theorem 5) | cohorts are random subsets with no shared geography/institution/language; "user ∈ cohort(A)" reveals a **semantically empty** set | none — it is the Theorem 5 fix. **One mechanism, both attacks.** |
| c | **private revocation set** (non-membership vs an encrypted / HE-committed set) | removes the leak entirely | far too expensive in-circuit on current techniques; name as the ideal, shelve |
| d | **prospective-only revocation** (stop new attestations from `A`, leave existing live) | full privacy | **breaks Theorem 4's bound** — fake credentials survive, `Π(N)` regains an unbounded term. The tradeoff in its starkest form; must be a conscious choice, not a silent default |
| e | **staged revocation with cover churn** (spread over epochs, mixed with unrelated churn) | raises the observer's correlation cost | does not remove the signal; buys time, not privacy |

> **3A-Result 3 [THIS WORK].** The tension is real and not fully resolvable with
> current techniques. Honest position: quantified partial mitigation — overlapping
> `k`-sets bound the loss to a factor `n/k`; random assignment (already required
> by Theorem 5) strips the cohort of semantic content; the residual leak is
> disclosed (§3.5). **`n` is a privacy parameter, not only an availability one**
> — a new design pressure toward large pools that the economics alone did not
> produce (and that also lowers `f`, improving Theorem 5's `f^{-k}` and EQ's
> bound — `n` large is triply motivated).

### 3.5 Text for paper §6 ("What is not protected")

> **Bulk-revocation cohort leak.** Revoking a compromised attester tombstones
> every credential it signed, and the changed leaves are public, so an observer
> learns the set of credentials that attester signed &mdash; a linkage across
> every user in that set. A user whose proofs begin failing in the revocation
> block is identifiable as a member by timing alone. With `n` attesters, `k`
> signers per credential, and the randomized assignment that grinding-resistance
> requires, the leaked set has about `N·k/n` members, so an affected user's
> anonymity set shrinks by a factor of roughly `n/k` (about 30&thinsp;000
> members and a 33&times; reduction at `N = 10^6, k = 3, n = 100`). Two
> properties bound the harm: the `k`-sets overlap, so revocation selects a subset
> rather than partitioning the population; and assignment is random, so the
> leaked set shares no real-world attribute and the linkage is semantically
> empty. Removing the leak entirely needs non-membership against an encrypted
> revocation set, which is impractical in-circuit today. Prospective-only
> revocation &mdash; refusing new attestations from the compromised party while
> leaving its existing credentials live &mdash; preserves privacy completely but
> forfeits the economic bound of Section 4, because the fake credentials it
> signed survive. `n` is therefore a privacy parameter as well as an availability
> one: larger pools leak a smaller fraction of users per compromise.

Also add `n` (attester pool size) where the paper first introduces `k` and the
diversity predicate, noted as "also a privacy parameter; see §6".

---

## 4. Theorem 6, and the bounded investigation of its open direction (Task 4)

### 4.1 Verdict (timeboxed, ~2 h)

**No threshold signature scheme was found with both required properties against a
Dark DAO that solicits fresh proofs. Theorem 6 reasserts through the
share-contribution transcript, as expected.** Threshold *ring* signatures give
property (a) and a weak form of (b) (historical non-attribution) and are worth
building for an unrelated reason (§4.4), but they do not close the Dark-DAO
direction. The defence stays economic (§2).

### 4.2 Theorem 6 [KEPT]

> **Theorem 6 (receipt-freeness is incompatible with attestation).** An
> attester's decision to vouch depends on knowledge `K` about the enrollee —
> else the attestation carries no information. Any `K` sufficient to justify an
> attestation is sufficient as a Dark DAO predicate: the attester proves
> knowledge of `K` and of having acted on it. Receipt-freeness and meaningful
> attestation cannot coexist.

Escapes, all closed: blind signing relocates the receipt to "I signed for
requester `R`"; anonymous requesters remove the basis to vouch (Theorem 6
directly); MACI-style re-encryption/shuffle needs a trusted coordinator (an
institution) — **excluded from this investigation by instruction.**

### 4.3 The one open direction, investigated

**Target:** a `(k,n)` threshold scheme where **(a)** the combined output hides
which `k` of `n` signed, and **(b)** each attester's share-contribution
transcript is simulatable, so no attester can prove participation.

**(a) is not the hard part.** Vanilla `(k,n)` threshold BLS over a DKG group key
already gives it: the credential verifies against the fixed group public key; any
`k` shares combine to the same signature; the verifier learns "≥ `k` signed", not
which.

**(b) is where it fails.** The core obstruction is Theorem 6 at the share level:

> A share that is **hard to produce without `s_i`** and **verifiable given
> `v_i`** *is* a signature by `i` — a receipt. A share that is **simulatable**
> (producible without `s_i`) lets a party with zero keys forge `k` of them, so
> the credential certifies nothing. **Verifiable-vouching and simulatable-share
> are contradictory.**

**The near-miss — threshold ring signatures.** A `t`-of-`n` ring signature:
combined output proves "`t` of these `n` signed" (a ✓); each contributed piece is
a 1-of-`n` membership proof, simulatable by *any* ring member given their own key,
so no piece attributes to a *specific* attester (historical non-attribution —
weak b ✓).

**Why it still loses to a Dark DAO.** The DAO does not need `i` to prove "my
*historical* share is in `C`". It solicits a **fresh** proof: *"produce, now, a
valid vouching-share for `C` bound to your registered key `v_i`; escrow releases
if `C` is not revoked in `T`."* Producing a share that would *actually* contribute
to a real credential requires `s_i` and is checkable against `v_i` — a fresh
receipt, regardless of how transparent the on-chain credential is. Theorem 6's
`K`-predicate ("prove knowledge of `s_i` and of a valid share for `C`") is
satisfiable independent of set-hiding. Historical non-attribution does not stop
on-demand capability-proof.

**What would block on-demand receipts, and why it is excluded.** Only a
construction where a valid share cannot be bound to `v_i` *even by `i`* — `i`
consumes blinding randomness it never learns — defeats fresh solicitation. That
randomness must come from a coordinator, who can then both attribute and simulate
shares: a trusted institution, Theorem 6's third escape, MACI-class. Excluded by
instruction, and it moves the problem rather than solving it.

### 4.4 Spillover to Theorem 7

Set-hiding attestation (threshold or ring) *would* help the **cohort leak**: if
the credential never records which attesters signed, bulk revocation can no
longer read the partition off the public leaves — it would need a private
revocation index (mitigation 3.4(c)). So signer-set-hiding is worth building for
the **privacy** benefit even though it does not close the Dark-DAO direction.
Recorded as a design note, not a result.

> **3A-Result 4 [THIS WORK].** The Dark-DAO defence is economic (§2), not
> cryptographic. No threshold scheme provides signer-set-hiding *and*
> simulatable share transcripts against fresh-proof solicitation; the share
> that certifies a real vouch is the receipt. Signer-set-hiding remains worth
> building for Theorem 7's cohort leak.

---

## 5. Falsification register (consolidated)

Unmeasured parameters the security claims depend on. `q, β` from EQ / paper §8;
`w, τ` from `inalienability-and-detection.md`; `B, n` added here.

| param | meaning | appears in | status |
|---|---|---|---|
| `β` | attacker value per fake identity, per application | `γ ≥ βmE`; EQ Cor 4.1 | unmeasured (paper §8.3) |
| `q` | per-fraudulent-attestation detection hazard | EQ Cor 4.1 (`k(S+V) ≥ βmE/q`) | unmeasured (EQ Result 4) |
| `w` | per-attester defection probability under a given bounty (= `ρ` in §2) | §2.2 participation constraint; `B` sets it | unmeasured |
| `τ` | per-`k`-subset co-signing frequency at which correlation monitoring flags the subset | `m ≈ k(N/τ)^{1/k}` (inalienability note) | unmeasured |
| `B` | whistleblower bounty | §2.3 (`k(S+V) + 1.58kB ≥ βmE/q`) | **new; unmeasured; a design choice not yet made** |
| `n` | attester pool size | Theorem 5 (`f`, `f^{-k}`); Theorem 7 (`n/k` anonymity factor) | **now a privacy parameter, not only availability** |
| `f` | corrupt fraction of the attester pool (`≈` a function of `n` and independence) | Theorem 5 (`c·f^{-k}`) | unmeasured |

A deployment that does not instrument detection has `q ≈ 0` and `w ≈ 0`, sending
required stake to infinity (EQ Result 4); one that does not monitor attestation
correlation has effectively `τ = ∞`. `B` and `n` are the two levers this document
adds; both are currently unset.

---

## 6. Falsification

1. **Theorem 5** fails if the attacker biases the beacon or re-derives an
   assignment without re-paying `c` (§1.2 table). Attack those two properties
   first. Also fails if `k` is set `≤ 3` at `f ≥ 0.2`, where `c·f^{-k}` is
   negligible — then grinding is not gated in practice even though the
   construction is present.
2. **3A-Result 2** fails if a Dark DAO can verify *silence* (make non-reporting
   publicly checkable). Escrow-on-non-revocation does not; a construction that
   does would be a significant finding.
3. **Theorem 6 / 3A-Result 4** fails if a threshold scheme exists with
   signer-set-hiding output *and* share transcripts simulatable against
   fresh-proof solicitation. §4.3 argues this is contradictory; a counterexample
   reopens the cryptographic Dark-DAO defence and would lead this document.
4. **3A-Result 3's quantification** fails if cohort sizes are not `≈ Nk/n` — e.g.
   under non-uniform attester load, where a heavily-used attester's cohort is far
   larger and its members far more exposed. Measure the realistic load
   distribution before relying on the `n/k` bound.

---

## 7. What changes downstream

- **Paper §4 economics:** add the grinding term `γ(N) = kb/N + c·f^{-k}` and the
  bounty form `k(S+V) + 1.58kB ≥ βmE/q`; state that grinding cost does not
  amortize.
- **Paper §6:** insert the §3.5 disclosure paragraph (required).
- **Paper §8 falsification:** add `B`, `n`, `q` (already flagged by EQ) as
  unmeasured parameters.
- **Parameter register:** adopt §5 as the consolidated list.
- **Design:** `k ≥ 5` where assignment grinding is in scope; large `n` for the
  economic, grinding, and privacy reasons jointly; revocation stays
  retrospective (prospective-only forfeits Theorem 4) with staged cover as a
  time-buying measure.
