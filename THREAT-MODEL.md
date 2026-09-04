# Threat Model & Security Parameters — Sybil-Wedge Personhood Login

> **Authoritative document:** [`MASTER-SPECIFICATION.md`](MASTER-SPECIFICATION.md).
> This threat model is a companion to it (per-parameter failure modes, the
> normative deployment disciplines, the concrete falsification attacks). Where any
> wording here differs from the master spec, the master spec governs.

**Status:** draft for adversarial review. **Version:** 0.1 (2026-09-02).
**Scope of this document:** the Phase-2 login proof (`wedge_mem_w8_d9_split`, 4,309
constraints, Groth16/BN254), the append-only membership tree and its witness
maintenance, the nullifier/RLN construction, the epoch-root publication medium,
and the OIDC/VP integration surface (`integration/`). **Out of scope:** the Phase-1
enrollment/attestation flow's internal soundness (covered by its own model), the
economic/anti-collusion design of the attester set, and any token mechanism (there
is none, by design).

This document is written to be attacked. If a claim here is false, that is a bug in
the claim — file it. §10 lists the falsification criteria the design commits to.

---

## 1. One-paragraph system description

A person enrolls once (Phase 1, off the hot path): `k` independent attesters vouch
for a commitment `C = Poseidon(s)` where `s` is the user's secret; the backend
verifies the attestations and appends `C` as a leaf in a public append-only
arity-8 Poseidon Merkle tree (depth 9, capacity 134,217,728). At every login
(Phase 2), the client proves in zero knowledge: (a) it knows `s` with
`C = Poseidon(s)`, (b) `C` is in the tree under a currently-published root, (c) it
has computed a per-context nullifier `N = Poseidon(s, ctx, epoch_action)` and (d) an RLN
degree-1 share `y = s + N·signalHash`. The proof's public signals are exactly
`[N, y, root, ctx, epoch_action, epoch_tree, signalHash]` (nPublic 7). The verifier (relying party) learns `N`
and nothing else — no PII, no `C`, no attester identities, no link to the user's
activity at any other `ctx`. Witnesses are kept current by a per-`epoch_tree` **public
broadcast** that every client consumes identically (no per-user query). Epoch roots
are committed to a **1-of-N-honest publication medium** so clients can detect an
equivocating backend.

---

## 2. What IS protected (security & privacy claims)

Each claim is stated so it can be tested. "Attacker" = anyone other than the user,
including the backend, attesters, relying parties, the OP, and network observers,
except where a claim names a weaker adversary.

| # | Claim | Mechanism | Strongest adversary it holds against |
|---|---|---|---|
| P1 | **The verifier learns no PII and no `C`.** | `C`, `s`, and the Merkle path are private witnesses; only `[N, y, root, ctx, epoch_action, epoch_tree, signalHash]` are public. | malicious verifier |
| P2 | **Cross-context unlinkability.** `N@ctx1` and `N@ctx2` for the same user are not correlatable. | `N = Poseidon(s, ctx, epoch_action)`; without `s`, distinct `ctx` give independent-looking field elements. | colluding relying parties + the OP that generated both proofs |
| P3 | **The witness-refresh path leaks no position.** Refreshing a witness reveals nothing about which leaf the client holds. | per-epoch broadcast is one identical public object; client recomputes locally; no upstream call carries a leaf index. Enforced structurally (`assertQueryFree`, epoch-only server API). | honest-but-curious backend (see §4 for malicious) |
| P4 | **Offline catch-up leaks no position and is bounded.** | client replays the `m` missed per-epoch broadcasts (`m×9` hashes); 0 per-user upstream calls. | honest-but-curious backend |
| P5 | **Double-action in one `(ctx, epoch_action)` is detectable and self-incriminating.** Two proofs with different `signalHash` in the same `(ctx, epoch_action)` expose `s` via the two RLN shares, for **any** `epoch_tree` — the RLN slot binds to `epoch_action` only (`scripts/test_rln_burn.mjs`). | RLN degree-1 Shamir: 2 points reconstruct the line, revealing `s`. | malicious user (Sybil / rate-limit evasion) |
| P6 | **Proofs are replay-bound.** A proof made for `(nonce, RP)` cannot be presented to a different RP or reused. | `signalHash = H(nonce ‖ RP)` is a public input the verifier recomputes and checks; OIDC `nonce`/`aud`/`exp` on the ID token. | network MITM, malicious RP replaying to another RP |
| P7 | **A revoked credential cannot log in — both paths.** | *Individual:* the split Phase-2 circuit proves `C ∉ revocation_set` in-circuit, cost exactly `+R` (measured +64/+256/+1,024 for R=64/256/1,024; nPublic `7+R`). *Bulk:* at an `epoch_tree` boundary the operator rebuilds with revoked leaves tombstoned to 0 (indices not compacted); the rebuild ships as one incremental broadcast (measured 9 KB–1.2 MB, ∝ revoked×depth, not tree size) and a revoked client's cached witness stops hashing to the published root. Tests: `scripts/test_revocation.mjs` (9 assertions). | malicious user holding a revoked `C`; compromised attester whose whole batch must be undone |
| P8 | **A targeted eclipse (backend serves one client a divergent root) is prevented, not just detected.** | Epoch roots folded into a hash-chained head `head_e = Poseidon(head_{e-1}, root_e, e)`. Before proving and before accepting, the client fetches the head from `N` independent sources and cross-checks (`integration/lib/root_consistency.mjs`): classifies each reachable source AGREE / LAG-on-chain (tolerated within `w`) / DISAGREE, and **fails closed** on any disagreement or below quorum (default 2-of-3 reachable). Tests: `scripts/test_root_consistency.mjs` (11 assertions). | malicious backend, **given ≥1 honest head source for that client** (see §4, §6) |
| P9 | **Compromise of the OP signing key does not forge personhood.** | the identity trust root is the Groth16 proof + published root, not the OP signature; an RP may verify the VP directly. | attacker with the OP's private key but no valid membership witness |

---

## 3. What is NOT protected (explicit non-goals & known leaks)

A reviewer must not be surprised by anything here.

| # | Not protected | Why / mitigation |
|---|---|---|
| N1 | **`N` is pseudonymous personal data.** Within one `(ctx, epoch_action)` the RP has a stable identifier for the user and can build a per-context profile of that user's actions. | This is the intended function (Sybil resistance needs *a* stable per-context id). Cross-context linkage is still prevented (P2). GDPR treatment: §5 `epoch length`, and the erasure interaction is an **open legal item** (see §9). |
| N2 | **`N` is scoped to `epoch_action`, not a durable account key.** In a new `epoch_action` the same user at the same RP presents a *different* `N`. | Deliberate — maximises unlinkability across time. RPs needing persistent pseudonymous accounts need a second, epoch-independent pairwise identifier (an added circuit output, ~255 constraints, no new crypto). **Not built.** Stated in `integration/README.md`. |
| N3 | **Traffic-analysis correlation of refresh↔proof timing.** If a client refreshes its witness and then immediately logs in from the same network vantage point, an observer can correlate the two. | **Mitigated only by the normative requirements in §6** (scheduled refresh, cache-only login, download padding). Per-proof unlinkability that leaks in traffic is not unlinkability — hence §6 is normative, not advisory. |
| N4 | **Catch-up download size fingerprints offline duration.** A client fetching a large coalesced catch-up reveals it was offline for roughly that long. | Weak fingerprint; mitigation is padding catch-up downloads to standard buckets (§6). |
| N5 | **The backend learns coarse enrollment metadata.** It knows how many users enrolled per epoch and the tree's shape (public). | Inherent to a public append-only tree; contains no per-user information. |
| N6 | **Full eclipse (backend + all of a client's head sources collude).** | Not preventable in-band; **detectable after the fact** by any auditor with the real root history. Reduced to a 1-of-N-honest assumption on the publication medium (§6). This is the narrowed trust claim — see §7. |
| N7 | **Phase-1 attester collusion.** If `k` attesters in `k` distinct diversity categories collude, they can mint a fake personhood credential. | Out of scope of this document; handled by the attester-set governance and the diversity predicate `D`. The parameter `k` (§5) sets the collusion bar. |
| N8 | **Denial of service.** A backend can refuse to publish broadcasts/roots, or a network can drop them; the client then cannot refresh and (past window `w`) cannot log in. | Availability, not integrity or privacy. Login fails **closed** (§6). No safety property is violated. |
| N9 | **Quantum adversary.** Groth16/BN254 and Poseidon are not post-quantum. | Standard for 2026 ZK deployments; a PQ migration is a known future item, not a current claim. |
| N10 | **Metadata at the OP.** A non-self-issued (hosted) OP learns `N@ctx` for each RP it serves and the wall-clock of each login. It still cannot correlate across `ctx` (P2). | Prefer the self-issued OP (`integration/lib/op.mjs`); a hosted OP is a convenience with this residual visibility. |

---

## 4. Adversaries

| Adversary | Capability assumed | What they can / cannot do |
|---|---|---|
| **Honest-but-curious backend** | sees all enrollments, publishes broadcasts/roots honestly, logs everything | **cannot** determine which leaf a refreshing client holds (P3/P4), **cannot** see `s` or `C` at login (P1). Learns enrollment counts (N5). |
| **Malicious backend** | may serve divergent broadcasts/roots to different clients (eclipse), withhold data, lie about verification if it is also the verifier | targeted eclipse is **detectable** given ≥1 honest head source (P8); full eclipse is **not preventable in-band** (N6), only auditable. Cannot forge membership. |
| **Malicious / colluding relying parties** | share all `N`, timestamps, IPs they observe | **cannot** link a user across `ctx` (P2) absent an out-of-band identifier (IP, device fingerprint, login timing — not this protocol's job, but note N3). |
| **Compromised OP** | holds the OP signing key | **cannot** forge personhood (P9). Can mint syntactically valid ID tokens with arbitrary `N` — an RP that verifies the VP directly rejects these; an RP that trusts the OP blindly does not. **RPs SHOULD verify the VP.** |
| **Malicious user** | controls their device, wants multiple identities or to exceed the rate limit | one `C` per enrolled person (Phase-1 property). Double-action in `(ctx, epoch_action)` burns `s` (P5). A revoked `C` is rejected (P7). |
| **Network observer** | sees packet timing/size on the client's link | can attempt refresh↔proof correlation (N3) and offline-duration fingerprinting (N4); defeated only by §6 discipline. |

---

## 5. Security parameters — every one, its meaning, its failure mode

> These are the knobs a deployment sets. Each row: what it is, the recommended
> value/range, and **what breaks if it is set wrong**.

### `k` — number of independent attestations required at enrollment
- **Meaning:** how many attesters, in how many distinct diversity-predicate (`D`)
  categories, must vouch for `C` in Phase 1. Sets the collusion bar: an attacker
  must compromise `k` independent attesters across `k` categories to mint a fake.
- **Recommended:** `k ≥ 2`; `k = 3` for higher-assurance deployments.
- **Failure mode:** `k = 1` → a single compromised attester mints unlimited fake
  people; the whole Sybil property collapses. `k` too high → enrollment friction,
  fewer real users, no security benefit past the point where categories are
  genuinely independent.
- **Not a login-latency parameter:** signatures are verified once in Phase 1, off
  the hot path, so `k` does not affect the 4,309-constraint login proof.

### `w` — root staleness window (in `epoch_tree` units)
- **Meaning:** the verifier accepts a proof whose `membershipRoot` is the current
  epoch's root **or any of the previous `w − 1`** epoch roots. Bridges the gap
  between a client's last witness refresh and the verifier's current root.
- **Recommended:** `w` = 3–8 epochs, tuned so a client that refreshes on its normal
  schedule is always inside the window with margin.
- **Failure mode:** `w` too small → clients that missed one refresh cycle fail
  login (availability hit; fails closed, N8). `w` too large → a user whose
  credential was **revoked** up to `w` epochs ago can still log in against an old
  root; and a stale witness widens the window for an eclipse to matter. `w` is the
  **maximum age of a membership assertion** and must be treated as such in the
  revocation SLA: *effective revocation latency ≥ w epochs.*

### `R` — revocation-list size (attester-level revocation)
- **Meaning:** number of entries in the published revocation set that the Phase-2
  proof checks non-membership against. Adds **exactly `+R` constraints** to the
  4,309 base (linear non-zero checks; no Poseidon, no EC).
- **Measured:** `R = 64 → 4,373 (+1.5%)`, `R = 256 → 4,565 (+5.9%)`,
  `R = 1024 → 5,333 (+23.8%)`. Full-flow p95 delta ≈ +150 ms (R≤256) to +380 ms
  (R=1024) on a contended desktop; normalised ≈ +5–25% of proving time.
- **Failure mode:** `R` too large → login proof time grows and (with the list as
  public input) the verifier ships `R` field elements; at `R ≈ 40` the committed-
  root non-membership variant becomes cheaper and keeps verifier input `O(1)`. If
  a whole compromised attester's output must be invalidated (potentially millions
  of `C`s), **do not** carry them all in `R`: do a **periodic tree rebuild at an
  epoch boundary** (one cheap witness refresh for everyone) instead.
- **Gate:** if the base login proof is marginal (~2 s p95) on the target device,
  `R = 1024` can push it over. Keep `R` to genuinely-burned individual
  credentials (dozens–hundreds), not bulk attester revocation.
  *(The "~2 s p95" here is a per-device sizing threshold for `R`, not the product
  latency target. The target was revised — ≤2 s on mid-range; ≤5 s cold on
  entry-level, proven once per epoch, not per login; entry-level per-login uses
  the native SDK. See MASTER-SPECIFICATION §4.3.)*

### `epoch length` — split into `epoch_action` and `epoch_tree` (v1.1)

**Since v1.1 (`splitting-the-epochs.md`) this is two parameters, not one.**
`epoch_action` sets roles (1) and (2) below; `epoch_tree` sets role (3) and the
staleness window `w`. They are tuned independently. The RLN burn and the
nullifier bind to `epoch_action` only. What follows describes the roles the two
counters now split between them.
- **Roles, now split across two counters:** (1) how often `N` rotates
  (`N = Poseidon(s, ctx, epoch_action)`) and (2) the rate-limit window for the
  "one action per `(ctx, epoch_action)`" property are set by **`epoch_action`**;
  (3) the cadence at which the tree publishes a new root and clients refresh
  witnesses, and the staleness window `w`, are set by **`epoch_tree`**.
- **Recommended:** `epoch_action` to the desired rate-limit granularity — e.g.
  10 min–1 h for fine-grained abuse control, 24 h for "one action per day".
  `epoch_tree` to what tree maintenance can bear — e.g. daily. Before v1.1 these
  had to be equal.
- **Failure mode:** `epoch_action` too short → `N` churns fast, within-window RP
  UX suffers, and a client re-proves that often (unless it uses the native
  prover). `epoch_tree` too short → clients refresh constantly (bandwidth,
  battery). `epoch_tree` too long → a stale witness / old root is usable for
  longer (eclipse surface) and `w` widens revocation latency. `epoch_action` too
  long → the rate limit is coarse and the RLN burn covers a long window.
- **Decoupled since v1.1 (`splitting-the-epochs.md`):** `epoch_action` (rate limit /
  nullifier window) and `epoch_tree` (tree / refresh cadence, and revocation
  latency `w`) are now independent public inputs. A deployment tunes the rate
  limit without touching the refresh cadence. The RLN burn binds to `epoch_action`
  only (`scripts/test_rln_burn.mjs`).

### Tree shape — `arity = 8`, `depth = 9` (fixed)
- **Meaning:** capacity `8^9 = 134,217,728` leaves; refresh cost `O(depth) = 9`
  Poseidon(8) hashes; proof cost 4,309 constraints (measured). Wider-shallower was
  chosen because a Poseidon(W) hash costs ~linearly in `W` but a tree needs only
  `log_W(n)` levels.
- **Failure mode:** changing arity/depth is a **circuit change** (new trusted
  setup, new verification key, coordinated RP upgrade). Capacity exhaustion
  (>134M enrolled) requires a new tree generation and a migration, not a parameter
  tweak.

### `D` — the diversity predicate over attester categories
- **Meaning:** the rule that the `k` attestations must come from `k` *distinct*
  categories (e.g. not two social-graph attesters). Enforced in Phase 1.
- **Failure mode:** weak `D` (categories not actually independent) makes `k`
  attestations easier to collude than the nominal bar. This is an
  attester-governance concern (out of scope here) but the parameter is named for
  completeness.

### `N_pub` — size of the honest-fraction publication set (the "N" in 1-of-N)
- **Meaning:** how many independent sources mirror the epoch-root head. The
  security of P8 is "at least one of a client's `N_pub` sources is honest".
- **Recommended:** ≥ 3 genuinely independent operators, or a public blockchain
  (`N_pub` effectively the chain's validator set), or both.
- **Failure mode:** `N_pub = 1` → that operator is a **trusted party** who can
  equivocate (detectably, but not preventably); the narrowed-trust claim (§7)
  degrades to "one publicly-accountable publisher". `N_pub` sources that are not
  actually independent (same host, same operator, same jurisdiction under
  compulsion) collapse toward `N_pub = 1`.

---

## 6. Normative requirements (MUST)

These are not recommendations. A deployment that does not meet all of them does not
have the properties claimed in §2 and MUST NOT describe itself as providing them.

1. **Root-consistency check (MUST).** Every client MUST, before proving *and* before
   accepting, fetch the chained head `head_e = Poseidon(head_{e-1}, root_e, e)` from
   `N` independent sources and cross-check it. It MUST classify each reachable source
   as AGREE, LAG-but-on-the-leader's-chain (tolerated only within the staleness
   window `w`), or DISAGREE, and MUST **fail closed** on (a) any DISAGREE among
   reachable sources — a different root at the same epoch, or a head that is not a
   prefix of the leader's chain, is an attack signal, not lag — or (b) fewer than a
   quorum of reachable sources. Quorum is a documented deployment parameter; **2-of-3
   reachable is the acceptable minimum** for liveness, but any disagreement fails
   closed regardless of how many sources agree. Fetching only the current root (not
   the chained head) is non-compliant: it cannot detect history rewriting.
   Reference: `integration/lib/root_consistency.mjs`, tested in
   `scripts/test_root_consistency.mjs`. (Defends P8; without it the protocol is
   eclipse-able.)

2. **Independent 1-of-N-honest publication medium (MUST).** Epoch-root heads MUST be
   published to `N_pub ≥ 3` sources that are independent **in operator, in network
   path, and ideally in trust root** — for example a public chain, a CDN-backed
   static endpoint, and a third-party bulletin board. Three endpoints on one
   operator's infrastructure are **one source with three URLs**: they share a failure
   domain, collapse to `N_pub = 1` under compromise or compulsion, and make the trust
   claim look stronger while changing nothing. A single bulletin-board publisher is
   permitted ONLY with an explicit, documented downgrade of the trust claim (§7).

3. **Refresh/proof timing decoupling (MUST).** Witness refresh MUST run on a
   schedule that is independent of login — a background task at a fixed cadence
   plus jitter, triggered by a timer, **never** by a login attempt. The login path
   MUST read only the locally cached witness. If the cache is stale beyond `w`, the
   login MUST fail closed and wait for the next scheduled refresh; it MUST NOT
   trigger an on-demand refresh. (Defends against N3.)

4. **Download padding (MUST).** Per-epoch broadcast fetches and catch-up downloads
   MUST be padded to a small set of standard sizes so that fetch size does not
   reveal witness position or offline duration. (Defends against N4.)

5. **Challenge binding (MUST).** The verifier MUST recompute
   `signalHash = H(nonce ‖ relying-party-id)` and reject any proof whose public
   `signalHash` does not match, in addition to standard OIDC `nonce`/`aud`/`exp`
   checks. (Defends P6.)

6. **RP verifies the presentation (MUST).** A relying party MUST verify the
   embedded Groth16 proof and the `membershipRoot` freshness itself, OR delegate
   to a verifier it has independent reason to trust. An RP MUST NOT accept `N` from
   an ID-token signature alone. (Defends P9 / the compromised-OP case.)

7. **Independent audits before production (MUST).** ≥ 2 independent circuit-level
   audits (constraint soundness / under-constrained signals), plus a review of the
   tree-maintenance and nullifier/RLN code, MUST be completed before any
   production deployment. A formal-soundness pass SHOULD be done where feasible.
   A **self-audit** has been run (`docs/SELF-AUDIT.md`): Picus 138b151 (Veridise,
   SMT) returns *"the circuit is properly constrained"* for all six deployed
   circuits; circomspect 0.9.0 is clean on the instantiated entrypoints (two
   explained WARNING classes on the symbolic templates); a manual footgun pass;
   and a 24-check adversarial witness harness
   (`scripts/test_soundness_adversarial.mjs`) that tampers witnesses against a
   malicious prover. No soundness bug found. This strengthens the evidence; it is
   **not** an independent audit and does not satisfy this requirement.

8. **Revocation latency disclosure (MUST).** The deployment MUST publish its
   effective revocation latency, which is `≥ w` epochs (§5, `w`), and MUST NOT
   claim faster revocation than the staleness window permits.

---

## 7. The trust claim — narrowed, and normative

> **The protocol has no *single* trusted party, GIVEN a 1-of-N-honest publication
> medium for epoch-root heads.**

This is the only trust claim the project makes. Earlier phrasing ("zero trusted
parties") is **retracted**: it is falsifiable and it fails against a reviewer who
asks "what if the client's only root source is the backend?".

Precise content of the narrowed claim:

- **No party can forge personhood.** Not the backend, not the OP, not any single
  attester (that needs `k` colluding across `D` categories — §5), not the
  publication medium.
- **No party can silently equivocate on the tree state.** A backend that serves
  divergent roots is caught by the root-consistency check (§6.1) **provided the
  client has ≥ 1 honest source** in the publication set. The check is now enforced
  client-side and fails closed, so the adversary's bar rises from "control the
  client's one root source" to "control every source it queries, simultaneously and
  consistently." If it does clear that bar (full eclipse, N6), the equivocation is
  still **detectable after the fact** by any auditor holding the real root history —
  the hash chain cannot be reconciled — but it is **not prevented in real time**.
  This item stays open; the raised bar does not close it.
- **Therefore the residual trust is:** *at least one of the client's `N_pub`
  publication sources is honest (or the public chain used is not deep-reorged).*
  With `N_pub = 1` this collapses to trusting that one publisher not to
  equivocate; such a deployment MUST say so (§6.2).
- **The OP is not trusted for identity** (P9). A hosted OP is trusted only for
  ID-token transport integrity and sees the residual metadata in N10.

Any standards document, audit response, or external description MUST use this
narrowed form verbatim or equivalent. Overclaiming here is a credibility loss with
exactly the reviewers a large deployment brings.

---

## 8. The integration surface (summary; full write-up in `integration/README.md`)

- The relying party runs **stock OIDC** (`response_type=id_token`, JWKS, `nonce`/
  `aud`/`exp`). The Phase-2 proof is carried as a **W3C Verifiable Presentation**
  with one new proof type (`GrothBn254NullifierProof2025`) inside an otherwise
  standard VP container. No new credential format, no token.
- Integration cost for an RP: (1) a VP-verifier call (snarkjs verify + a pinned
  verification key + ~80 LoC); (2) a poll of the published-roots feed for the
  staleness window; (3) a `(sub, epoch)` dedupe for the Sybil property.
- **Finding:** drop-in (SDK + endpoint), **not** a rearchitecture — with the one
  semantic change that `sub` is pairwise **and scoped to `epoch_action`** (N2).

---

## 9. Residual risks & open items

| Item | Status |
|---|---|
| GDPR right-to-erasure vs. append-only tree | **open legal** — RLN burn + revocation set is the proposed mechanism; needs a counsel memo confirming it satisfies erasure for `N`-as-pseudonymous-data. |
| Data residency of the broadcast / root-publication state | **open** — needs a per-jurisdiction story. |
| Formal-methods soundness pass on the circuit | **open** — recommended before production (§6.7). A **self-audit** is done (`docs/SELF-AUDIT.md`): Picus (SMT, Veridise) returns *properly constrained* for all six deployed circuits; circomspect clean on the instantiated entrypoints; a manual footgun pass; and a 24-check adversarial witness harness. No soundness bug found. A solver verdict bounded by its query timeout is not a proof-assistant artifact, and none of this is a substitute for §6.7. |
| Independent circuit audits (Gate 1) | **open** — self-audit strengthens the evidence (above); ≥ 2 independent external reviews still required before production. |
| Persistent pseudonymous accounts (epoch-independent pairwise id) | **not built** — ~255-constraint circuit addition; no new crypto. |
| Separating the rate-limit epoch from the tree epoch | **done (v1.1)** — `epoch` split into `epoch_action` + `epoch_tree`, zero added constraints, nPublic 6 → 7; RLN burn binds to `epoch_action` only. |
| Multi-source root consistency (was: only detectable after the fact) | **done (v1.1)** — client cross-checks the chained head across `N` independent sources before proving and before accepting, fails closed on disagreement or below quorum (`integration/lib/root_consistency.mjs`, 11 assertions). Full eclipse (N6) stays open. |
| Attester-level revocation — both paths (Gate 6) | **done (v1.1)** — individual: in-circuit non-membership, `+R` constraints measured (+64/+256/+1,024). Bulk: incremental tombstone rebuild at an `epoch_tree` boundary, broadcast 9 KB–1.2 MB measured, unaffected client recompute 2–5 ms (`scripts/test_revocation.mjs`, 9 assertions). Liveness cost: a rebuild interrupts every client for one refresh window (disclosed). |
| Post-quantum migration | **future** — Groth16/BN254 + Poseidon are not PQ (N9). |
| Attester-set governance & anti-collusion economics | **out of scope** of this doc — sets `k` and `D`'s real strength. |

---

## 10. Falsification criteria — how to prove this document wrong

1. **P2 broken:** exhibit a method by which two colluding RPs (optionally plus the
   OP) link `N@ctx1` and `N@ctx2` to the same user *without* `s` or an
   out-of-band identifier. → cross-context unlinkability is not real.
2. **P3/P4 broken:** exhibit any refresh or catch-up code path that sends, or lets
   the server infer, a client's leaf index. → the query-free claim fails.
   (`assertQueryFree` + the epoch-only server API are the structural defense;
   defeating them is the target.)
3. **P5 broken:** produce two valid proofs in one `(ctx, epoch_action)` — for any
   `epoch_tree`, e.g. two different tree roots — with different
   `signalHash` that do **not** reconstruct `s`. → RLN rate-limiting is not
   self-incriminating.
4. **P6 broken:** replay a proof made for `(nonce₁, RP₁)` to `RP₂` or in a later
   session and have it accepted by a spec-conformant verifier. → proofs are not
   replay-bound.
5. **P8 / §7 broken:** show a targeted eclipse that is **not** detected by a client
   doing the §6.1 check with ≥ 1 honest source; **or** show that the design in
   fact requires a single trusted publisher even with `N_pub ≥ 3`. → the narrowed
   trust claim is still too strong.
6. **§6.3 insufficient:** demonstrate an end-to-end refresh↔proof timing
   correlation that survives scheduled-refresh + cache-only-login + padding. →
   traffic-analysis mitigation is inadequate and unlinkability leaks in traffic.
7. **§5 `w` / §6.8:** show a revoked credential logging in *after* the disclosed
   `w`-epoch latency. → revocation latency is worse than stated.
8. **Circuit soundness:** find an under-constrained signal in `wedge_mem_w8_d9_split`
   (or the revocation variants) that admits a proof for a `C` not in the tree, or
   a mismatched `N`. → the core proof is unsound. (This is what the §6.7 audits
   are for; this document does not claim to have found none, only that none is
   known.)
