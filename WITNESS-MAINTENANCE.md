# Witness Maintenance — built and load-tested

> **Authoritative document:** [`MASTER-SPECIFICATION.md`](MASTER-SPECIFICATION.md)
> (see §2 "Witness maintenance" and §6 "Verified and closed"). Where wording here
> differs, the master spec governs. Note this doc's trust language is already the
> narrowed form: root-consistency requires a **1-of-N-honest** publication medium;
> a single publisher **is** a trusted (if publicly accountable) party — "no
> trusted party" was retracted (MASTER-SPEC §5).

Closes Step 4 of `docs/research-history/the-no-shared-key-bridge.md` / the sole
`Open` item in `docs/research-history/the-last-open-item.md`. Phase-2 login (4,309
constraints, private, measured) is unchanged; this is the maintenance **system**
around it.

**Environment:** desktop i7-9850H, Node v24.14.0, `circomlibjs` Poseidon (WASM),
`snarkjs` Groth16. No phone — desktop numbers with a ×2 (mid-range) / ×4 (low-end,
single weak core) projection, the same convention the rest of the spike uses.
Every timing is **p95 over ≥ 20 runs**, not median.

Run it:

```bash
node scripts/witness_maint.mjs          # Step 1: the tree + refresh + structural query-free guards
node scripts/bench_witness.mjs          # Step 2: broadcast size / catch-up / steady-state p95
node scripts/bench_catchup_100k.mjs     # Step 2: worst case — month offline at peak enrollment
node scripts/build_revocation.mjs       # Step 3: compile + Groth16 setup for the non-membership circuits
node scripts/bench_revocation.mjs       # Step 3: added constraints vs 4,309 + full-flow p95
node scripts/bench_revocation_diff.mjs  # Step 3: noise-cancelled per-round revocation delta
node scripts/root_consistency.mjs       # Step 4: eclipse attack + root-consistency prototype
```

---

## Bottom line

| step | gate | result |
|---|---|---|
| **1** — broadcast-refresh built | query-free enforced *structurally*, not argued | **PASS** — `assertQueryFree` + epoch-only server API + audit; 5 structural guards reject leaky calls; witness == ground truth across every test |
| **2** — three costs load-tested | broadcast bearable; catch-up query-free *and* bounded; refresh p95 | **PASS** — per-epoch broadcast 5–45 KB (7× under raw); month-offline-at-peak catch-up = 13 MB bounded download + 122 ms desktop recompute, **0 upstream per-user calls**; steady-state refresh p95 3–4 ms desktop / ~15 ms phone |
| **3** — revocation measured vs 4,309, **both paths** | not assumed free; bulk path measured, not estimated | **MEASURED / CLOSED (Gate 6)** — *Individual:* non-membership adds **exactly +R** (confirmed on the v1.1 split circuit too: 4,373 / 4,565 / 5,333; nPublic 7+R; +21/+20/+123 ms). *Bulk:* incremental tombstone rebuild — broadcast **9 KB–1.2 MB** at realistic occupancy (6–39× smaller than full republication), unaffected client recompute **2.4–5.1 ms**. Liveness cost (whole-population refresh-window interruption) disclosed. |
| **4** — eclipse question answered | honest about trust required | **ANSWERED / ENFORCED** — root-consistency via hash-chained head + multi-source cross-check, now a **client-side check that fails closed** (disagreement or below 2-of-3 quorum), wired into prover and verifier. Targeted eclipse *prevented under 1-of-N honest sources*; full eclipse still *detectable only after the fact* (undefeated, documented). **Not zero-trust**: a single publisher is a trusted (if publicly-accountable) party; independence of the `N` sources is normative. |
| **5** — timing decoupling | flagged as deployment discipline | **DOCUMENTED** — refresh must run on a login-independent schedule; login reads cache only, fails closed past window `w`, never triggers on-demand refresh. |

**No gate failed. The remaining risk is the one the whole spike already carries:
the base Phase-2 phone p95 is still a desktop projection, not a device
measurement.** Witness maintenance did not add a wall; it added a bounded-cost
system and one honest downgrade to the trust story (Step 4).

---

## Step 1 — Broadcast-refresh, implemented

`scripts/witness_maint.mjs`. Append-only **arity-8 Poseidon Merkle tree, depth 9**,
capacity `8^9 = 134,217,728`.

| piece | where | what it does |
|---|---|---|
| **(a) epoch append** | `AppendOnlyMerkle.appendEpoch(newLeaves[])` | appends a batch at the fill frontier; recomputes only the right-spine parents whose children changed (`≈ A/7` Poseidon(8) hashes for `A` new leaves, not `A`) |
| **(b) public broadcast** | the frozen object `appendEpoch` returns | `{epoch, nBefore, nAfter, root, newLeaves, changed[], byLevel}` — **identical bytes for every client**, contains no client's leaf index, position, or path |
| **(c) client refresh** | `clientRefresh(broadcast, witness)` | recomputes the client's own affected path levels from the public broadcast + its **private** witness. `9` Poseidon(8) hashes, `O(depth)`. Asserts the recomputed root equals `broadcast.root` or throws (divergent-broadcast detection). |
| catch-up | `clientCatchup(broadcasts[], witness, "replay"|"coalesce")` | applies `m` epochs of broadcast; `replay` = m×9 hashes, `coalesce` = dedup then 9 hashes |

**The query-free property is enforced in code, not argued** (Falsification: "must be
structural"):

- `assertQueryFree()` runs at the top of `clientRefresh` / `clientCatchup`: rejects
  any call that isn't exactly `(publicData, privateWitness)`, any non-frozen
  broadcast, any broadcast carrying a callable or a position-like field
  (`index`, `leafIndex`, `position`, `path`, `socket`, `url`, `fetch`, `server`).
- `MockServer` is the *entire* upstream surface. Its API is `getBroadcast(epoch)` and
  `getBroadcasts(from, to)` — **keyed on epoch and nothing else**. There is
  deliberately no `getPathForLeaf(index)`. `auditQueryFree()` asserts every upstream
  call in the whole run carried only an integer epoch.
- `clientRefresh` / `clientCatchup` are handed already-downloaded broadcast objects.
  They never receive `server` and cannot reach the network.

Self-test output (`node scripts/witness_maint.mjs`): 10 epochs of growth to
`n = 53,582` (frontier rollovers through level 5 exercised), client witness
**identical to ground truth every epoch**; a client dark for 9 epochs reconstructs
its exact path by `replay` **and** `coalesce`; `0` upstream calls; all 5 structural
guards reject; the frontier-compressed form alone (no raw leaves) refreshes an
established client.

---

## Step 2 — The three costs, load-tested (§3 of the note)

### 2.1 Broadcast size per epoch

Warm start 150,000 enrolled, then one epoch at each rate. `raw` = the `A` new leaf
values; `frontier` = the internal nodes (level ≥ 1) that changed — what a
**far-from-frontier client (> 1 epoch old) needs, and all it needs**.

| new leaves / epoch | raw | **frontier-compressed** | ratio | dominant term |
|--:|--:|--:|--:|--|
| 1,000 | 31.3 KB | **4.7 KB** | 6.6× | L1: 125 nodes |
| 10,000 | 312.5 KB | **44.9 KB** | 7.0× | L1: 1,250 nodes |
| 100,000 | 3.1 MB | **446.7 KB** | 7.0× | L1: 12,500 nodes |

Frontier-compressed is `≈ A/7` field elements (`Σ A/8^i`), ~7× smaller than the raw
append-log. Raw leaves are needed only by the ≤ 7 clients enrolled into the bottom
group still being filled *this* epoch; everyone else reads only `byLevel`.

**Verdict:** at a plausible sustained rate (1k–10k/epoch) the per-epoch broadcast is
**5–45 KB** — a routine cache fetch, bearable on a metered connection. Even a
sustained 100k/epoch (≈ a national-scale onboarding surge) is 447 KB/epoch. No
compression wall. Falsification #1 clears.

### 2.2 Offline catch-up — m = 1 / 4 / 30 epochs

Established client (index 137), base population 50,000, then `m` epochs at the rate
shown. Download = sum of the `m` per-epoch frontier broadcasts (`replay`) or their
dedup union (`coalesce`). Recompute p95 over 20 runs.

**rate 1,000/epoch**

| m | replay dl | coalesced dl | recompute p95 (replay / coalesce) | query-free | correct |
|--:|--:|--:|--:|:--:|:--:|
| 1 | 4.7 KB | 4.7 KB | 3.5 / 7.9 ms | yes | ✅ |
| 4 | 18.8 KB | 18.1 KB | 20.0 / 8.6 ms | yes | ✅ |
| 30 | 141.3 KB | 134.2 KB | 120.6 / 23.7 ms | yes | ✅ |

**rate 10,000/epoch**

| m | replay dl | coalesced dl | recompute p95 (replay / coalesce) | query-free | correct |
|--:|--:|--:|--:|:--:|:--:|
| 1 | 44.9 KB | 44.9 KB | 5.0 / 12.7 ms | yes | ✅ |
| 4 | 179.5 KB | 178.8 KB | 16.4 / 21.7 ms | yes | ✅ |
| 30 | 1.35 MB | 1.34 MB | 122.6 / 205.8 ms | yes | ✅ |

**rate 100,000/epoch — month offline at peak enrollment (3,050,000 leaves in the gap)**

| m | replay dl | coalesced dl | recompute p95 replay | recompute p95 coalesce | correct |
|--:|--:|--:|--:|--:|:--:|
| 1 | 0.44 MB | 0.44 MB | 6.9 ms | 83.3 ms | ✅ |
| 4 | 1.74 MB | 1.74 MB | 25.4 ms | 341.3 ms | ✅ |
| 30 | 13.09 MB | 13.08 MB | **121.6 ms** | 3588.5 ms | ✅ |

Two findings here worth stating plainly:

1. **`replay` is the right strategy for large gaps at high enrollment.** It is
   `m × 9` Poseidon(8) hashes — 270 hashes, **121.6 ms desktop / ~490 ms phone ×4**
   for a full month offline during a 100k/epoch surge. Bounded and modest.
2. **`coalesce`'s 3.6 s is an implementation artifact, not a fundamental cost.** The
   naive dedup builds an `O(gap)` map over ~420k changed-node keys (30 × ~14k). A
   production coalescer would key by level and keep only the client-relevant
   sibling band; `replay` already demonstrates the real bound. Coalesce only wins
   at low enrollment (rate 1k, m=30: coalesce 23.7 ms vs replay 120.6 ms) where the
   map is small.

The **download** is 13 MB frontier-compressed for the month-at-peak case — bounded
by gap enrollment, ~7× smaller than the 91 MB raw append-log, and it is the
*identical public object* for every client last-synced at that epoch. No per-user
query.

Upstream calls during the entire catch-up in every case: **0** (all epoch-keyed).
Work is bounded: `replay` = `m×9` hashes; `coalesce` = 9 hashes + one `O(gap)`
dedup pass. **Neither is per-user, neither is unbounded.** Falsification #2 clears —
query-free *and* bounded in the catch-up path. The realistic recommendation:
clients refresh per epoch (3–4 ms); a client returning from a long absence uses
`replay` over the missed per-epoch broadcasts (≤ ~0.5 s phone for a month at peak).

The one honest caveat (§5.3): the *size* of a catch-up download reveals how long a
client was offline. Mitigation is to round the download up to standard buckets
(e.g. 64 KB / 256 KB / 1 MB / "full week") — a padding decision, not a structural
problem.

### 2.3 Steady-state (1-epoch) refresh — p95, 20 runs

Client 251, base 120,000, one epoch at the rate shown.

| rate | refresh p95 | hashes | siblings updated | phone ×2 / ×4 |
|--:|--:|--:|--:|--:|
| 1,000/epoch | 3.3 ms | 9 | 1 | 7 / 13 ms |
| 10,000/epoch | 4.3 ms | 9 | 1 | 9 / 17 ms |
| 100,000/epoch | 3.3 ms | 9 | 4 | 7 / 13 ms |

Refresh is **`O(depth) = 9` Poseidon(8) hashes regardless of enrollment rate or
`m`** (the `byLevel` view makes sibling lookup `O(1)`; an earlier flat-map version
was `O(broadcast)` and cost 55 ms at 100k/epoch — fixed). Projected low-end phone
steady-state refresh: **~15 ms**. This is not on the login hot path (see Step 5).

---

## Step 3 — Revocation, measured

### RLN double-use — confirmed tree-independent

Two proofs in one `(ctx, epoch)` expose `s` through the RLN share `y = s + N·h`
(degree-1 Shamir). The burned `s` is published and verifiers reject it. This needs
**no tree deletion, no witness refresh, no circuit change** — it already ships in
`Residual()` (`wedge_membership.circom`), which the Phase-2 circuit includes
unchanged. Nothing in witness maintenance touches it.

### Attester-level revocation — non-membership check, `C ∉ revocation_set`

`circuits/wedge_revocation.circom`: `WedgeMembershipWideRevoke(8, 9, R)` = the exact
Phase-2 circuit **plus** `C != r_i` for every entry of a published revocation list
of `R` commitments, via the non-zero gadget `inv_i ← 1/(C−r_i); (C−r_i)·inv_i === 1`
(1 R1CS constraint each; unsatisfiable iff `C == r_i`). `C` stays a private witness;
only `N`, `y` leave the proof — same privacy as the base.

**Added constraints (exact, `snarkjs r1cs info`):**

| variant | constraints | +vs 4,309 | % over budget |
|---|--:|--:|--:|
| Phase-2 base | 4,309 | — | — |
| + non-membership R=64 | 4,373 | **+64** | +1.5% |
| + non-membership R=256 | 4,565 | **+256** | +5.9% |
| + non-membership R=1024 | 5,333 | **+1,024** | +23.8% |

The cost is **exactly +R**, and every added constraint is a linear non-zero check
— **no Poseidon, no elliptic-curve op**, the cheapest kind in the system.

**Full-flow p95 (`wtns.calculate` + `groth16.prove` + `groth16.verify`), 25
interleaved rounds.** This desktop was heavily contended this session — the base
read **2.1 s median / 2.7 s p95** against the README's quiet **664 ms Node / 869 ms
Chrome** for the identical base circuit (~3× degraded, uniform; the README's
"proving-time absolutes are indicative" caveat in force). So the portable number is
the **per-round delta** (variant proven immediately after base, shared noise
cancels):

| variant | Δ median vs base | Δ p95 vs base | normalized to quiet base (869 ms → …) |
|---|--:|--:|--:|
| R=64 | +158 ms | — | ~890–920 ms |
| R=256 | +154 ms | — | ~930–990 ms |
| R=1024 | +379 ms | +409 ms | **~1,050–1,150 ms** |

(The contended deltas are +14–17% on a 2.7 s base, consistent with the +23.8%
constraint ratio minus the fixed `verify` + `wtns` overhead that does not scale
with these constraints.)

**Gate — does it push Phase-2 over ~2 s projected on a low-end phone?**

Not on its own, but it eats headroom and the honest tradeoff must be stated:

- The **base** Phase-2 phone p95 is still unmeasured (the whole spike's open item —
  desktop 869 ms was the GO proxy). Revocation does **not** change the GO/NO-GO
  *story*; it consumes **~15–25 % of the proving headroom** for R=1024.
- If the base phone p95 lands comfortably < 2 s (the README's expectation), **R ≤
  256 revocation is free in practice** (+~5 % constraints, +~150 ms desktop) and
  even R=1024 clears with reduced margin.
- If the base phone p95 is **marginal** (near 2 s), adding R=1024 non-membership
  **can tip it over**. Mitigations, in order: (a) keep `R` small — a revocation
  list of *individually burned credentials* is naturally small (dozens–hundreds),
  not thousands; (b) if a whole compromised attester must be invalidated, prefer
  **periodic tree rebuild at an epoch boundary** (one-off witness refresh for
  everyone, already cheap per Step 2) over carrying thousands of revoked `C`s in
  every login proof; (c) the committed-root non-membership variant (below).

**Design note — the list is PUBLIC input here.** The verifier ships `R` field
elements (32 KB for R=1024) and Groth16 verify cost grows with public-input count.
A production system commits the sorted revoked set as **one root** (KZG or
sorted-Merkle) and proves non-membership against it in-circuit via the
sorted-neighbour trick: `O(depth)` Poseidon hashes ≈ 255 constraints each. Crossover
vs. the linear scan is near **R ≈ 40** — for any real revocation list the
committed-root form is both smaller in-circuit and keeps the verifier's public
input `O(1)`. The linear-scan circuits here are the measurement vehicle, not the
recommended production shape.

### On the split circuit (`closing-two-gates.md` Item 2a)

The v1.1 split-epoch circuit (`epoch` → `epoch_action` + `epoch_tree`) carries the
same non-membership gadget: `circuits/wedge_revocation.circom`
`WedgeMembershipWideSplitRevoke(8, 9, R)`, built as
`wedge_mem_w8_d9_split_rev{64,256,1024}`. The constraint delta against the 4,309
split baseline is **identical to the pre-split measurement — exactly +64 / +256 /
+1,024** (4,373 / 4,565 / 5,333). `nPublic = 7 + R`. `scripts/bench_revocation_split.mjs`
is the noise-cancelled differential bench: on a quiet i7-9850H, base 538 ms, deltas
**+21 ms / +20 ms / +123 ms** for R = 64 / 256 / 1,024. So the pre-split estimate
held: the epoch split changes nothing about revocation cost.

### Bulk revocation — the tree rebuild, MEASURED (`closing-two-gates.md` Item 2b)

Mitigation (b) above — "periodic tree rebuild" — is no longer hand-waved. It is
implemented as `AppendOnlyMerkle.revokeAndRebuild(indices)` in
`scripts/witness_maint.mjs` and measured by `scripts/bench_bulk_rebuild.mjs`.

**Tombstone, do not compact.** Revoked leaves are set to `0`; indices are **not**
shifted. Only the internal nodes on the revoked paths change, so the rebuild
broadcast is the *union of changed subtrees*, deduped near the root — the same
`{changed, byLevel}` object shape the normal per-epoch broadcast uses, consumed by
the unmodified `clientRefresh`.

**The key question from the note — can the rebuild broadcast be incremental rather
than full republication? — is answered YES by measurement.** Arity-8 depth-9,
occupancy 10k / 50k / 200k leaves × revocation 1 % / 5 % / 10 %:

| | tombstone broadcast | full republication | ratio |
|---|--:|--:|--:|
| 10k leaves, 1 % revoked | 9.3 KB | 0.35 MB | 39× smaller |
| 50k, 5 % | ~230 KB | 1.74 MB | ~8× |
| 200k, 10 % | 1,180.5 KB | 6.98 MB | 6× smaller |

The tombstone broadcast grows with **revoked-count × depth**, not with tree size.
An **unaffected** client folds it into its cached witness in **2.4–5.1 ms** median
(vs. the 122 ms month-offline catch-up baseline in Step 2.2), and issues **zero**
upstream per-user calls. A **revoked** client's cached witness stops hashing to the
new root, its `clientRefresh` throws, and a fresh proof against the new root fails
because its Merkle path no longer verifies. Tests: `scripts/test_revocation.mjs`
(9 assertions — honest proves; listed credential cannot witness; post-rebuild the
victim is locked out and a bystander refreshes query-free and proves).

**Liveness cost (disclosed, not softened).** Between a rebuild being published and a
given client's next scheduled refresh, that client cannot prove. An attester
compromise therefore causes a **refresh-window interruption for the whole
population**. This is a liveness cost, not a security one, and it is the price of
bulk revocation without a per-user query. Carried into MASTER-SPEC §5 and
THREAT-MODEL §6.

---

## Step 4 — The eclipse attack, surfaced

`scripts/root_consistency.mjs`. Broadcast-refresh is privacy-safe against an
*honest-but-curious* backend (Step 1). A **malicious** backend can eclipse a
targeted client — serve it a different epoch broadcast/root than everyone else — so
its witness diverges and its next proof fails or is distinguishable.

**Defense — now enforced, not a prototype.** Fold each epoch root into a
hash-chained transparency head `head_e = Poseidon(head_{e-1}, root_e, e)` and mirror
`head_e` to several independent sources. Before proving **and** before accepting,
the client fetches the head from `N` sources and cross-checks. This moved from the
`scripts/root_consistency.mjs` prototype into `integration/lib/root_consistency.mjs`
and is wired into both the OP prover and the RP verifier in `integration/run.mjs`.
It classifies each reachable source:

- **AGREE** — same root and same chained head at the lead epoch.
- **LAG** — behind the leader but its head is a genuine prefix of the leader's
  chain, and within the staleness window `w`. Tolerated.
- **DISAGREE** — a different root at the same epoch, a head that is *not* on the
  leader's chain (history rewrite), or self-inconsistent. Attack signal.

The client **fails closed** on any DISAGREE among reachable sources, or when fewer
than a **quorum** are reachable (default **2-of-3**; 2-of-3 reachable is the
documented acceptable minimum for liveness, but any disagreement fails closed
regardless of count). Fetching only the current root, not the chained head, is
non-compliant — it cannot detect a rewritten history. Demonstrated
(`scripts/test_root_consistency.mjs`, 11 assertions; `integration/run.mjs` steps
7–9):

| scenario | result |
|---|---|
| (A) 3 honest sources | all agree → **ACCEPT** |
| (B) one serves a forged current root | → **FAIL_CLOSED_DISAGREEMENT** |
| (C) one lagging by 1 epoch, on the leader's chain, within `w` | → **ACCEPT** (lag ≠ disagreement) |
| (D) only 1 of 3 reachable | → **FAIL_CLOSED_QUORUM** |
| (E) backend **and every** source collude, consistently | 3/3 "agree" on the forged head → **not caught in-band** (undefeated full eclipse, documented) |
| (F) a source rewrites an earlier epoch's root (chain forks) | → **FAIL_CLOSED_DISAGREEMENT** ("head not on the leader's chain") |

### What trust the root-publisher requires (Falsification #4 — answered honestly)

**It is not zero-trust.** The chained head makes equivocation *always detectable
after the fact* by any auditor holding the real root history (a fork can never
reconcile with the append-only chain). But it only *prevents* an eclipse for a
given client under a **1-of-N honest assumption on that client's head sources**
(case E is the boundary). What v1.1 adds is that the 1-of-N clause is now an
**enforced client-side check that fails closed**, so the adversary's requirement
rises from "control the client's one root source" to "control every source it
queries, simultaneously and consistently". The full-eclipse case (E) stays open.
**Independence of the `N` sources is normative:** they must differ in operator,
network path, and ideally trust root; three endpoints on one operator's
infrastructure are one source with three URLs. (The three mirrors in
`integration/run.mjs` share a process — they are a wiring test, not an independent
set.)

So the "no trusted party" claim of the broader project is **weaker than stated**
once eclipse resistance is required:

- With a **single bulletin-board publisher**: that operator *is* a trusted party —
  they can equivocate; the chain only makes it publicly accountable, not
  impossible. "No trusted party" ⟶ "one publicly-accountable publisher who cannot
  equivocate *undetectably*."
- With a **public blockchain** as the head medium: trust reduces to "the chain does
  not deep-reorg / is not 51%-attacked" — a weaker, externally-audited assumption
  than trusting this backend, but still an assumption.
- With a **gossip network**: 1-of-N honesty among the client's peers, plus a side
  channel for the heads.

**Bottom line for Step 4:** root-consistency is achievable and cheap (one Poseidon
per epoch, one hash-chain head), it makes targeted eclipse *detectable-always* and
*preventable under 1-of-N honest sources*, but it **does require a broadcast medium
the client can trust at least one path into.** The honest phrasing is
"no *single* trusted party, given a 1-of-N-honest publication medium" — not "no
trust at all."

---

## Step 5 — Timing decoupling (§5.2) — deployment discipline

Even though refresh is query-free, **when** a phone downloads a broadcast and
**when** it then produces a login proof can be correlated by a network observer: a
refresh-then-proof burst from one IP within seconds links "this device just
refreshed" to "this login happened," re-introducing a timing fingerprint that the
in-circuit privacy does not cover.

**Discipline (must be stated as a deployment parameter, like the staleness window `w`):**

1. **Witness refresh runs on an independent schedule**, decoupled from login —
   e.g. a background job at a fixed cadence (once per epoch, or once per `k`
   epochs) plus jitter, triggered by a timer, **never by a login attempt**.
2. The login path reads the **locally cached** witness only. If the cache is stale
   beyond the verifier's accepted window `w`, the login fails closed and the user
   retries after the next scheduled refresh — it does **not** trigger an on-demand
   refresh, because an on-demand refresh is exactly the correlatable event.
3. Refresh downloads should look like any other periodic background fetch (same
   endpoint, same size bucket — see §5.3 padding), so refresh traffic is not
   distinguishable from an app update check.

This is not enforced by the circuit or the tree; it is an **operational
requirement on the client implementation**, and it belongs in the deployment
checklist next to "verifier accepts the last `w` roots."

---

## Non-negotiables — status

| # | requirement | status |
|--:|---|---|
| 1 | no per-user upstream query in any refresh or catch-up path | **met, structurally** — `assertQueryFree` + epoch-only `MockServer` API + `auditQueryFree` = 0 non-epoch calls across every test including month-offline catch-up |
| 2 | revocation cost measured against the 4,309 budget, not assumed free — **both paths** | **measured, Gate 6 closed** — individual: exactly +R (also confirmed on the v1.1 split circuit); bulk: incremental tombstone rebuild, broadcast 9 KB–1.2 MB, unaffected recompute 2.4–5.1 ms, liveness cost disclosed. See Step 3. |
| 3 | the eclipse question answered honestly, including what trust it requires | **answered + enforced** — the 1-of-N-honest clause is now a client-side check that fails closed (disagreement or below 2-of-3 quorum), wired into prover and verifier; independence of the `N` sources is normative; full eclipse still undefeated in-band; a single publisher is a trusted (if accountable) party; "no trusted party" is weaker than previously stated |
