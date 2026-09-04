# The Last Open Item

### Witness maintenance is now the only thing between the private bridge and shipping

**Where we are (measured, and it is good).** Phase-2 login is **4,309 constraints**, fully private, at **134M-user scale**, on Groth16, no proof-system migration. `C` never leaves the proof; the verifier learns only `N`. Full-flow desktop p95 **869 ms**, 2.3× headroom under the 2 s bar. The signature floor is not beaten — it is *dissolved*, because membership (Poseidon paths, no scalar multiplications) replaced re-verification. Every falsification gate passed **except one**, which was honestly labelled `Open`:

> **Step 4 — witness maintenance: argued sound, not implemented, not load-tested.** This is now the sole remaining barrier to shipping, and it is more subtle than the constraint count. This note works it.

**Status.** `Result` = argued and consistent with the append-only structure; `Construction` = composition; `Open` = must be implemented and load-tested. No new cryptography.

---

## 0. Why this is now *the* problem

Everything else is measured and passing. The proof is cheap and private. But a personhood-login proof requires the phone to hold a **current membership witness** for its leaf `C` against the **currently published root**. The tree grows as new users enroll. So two things move over time — the root, and every witness — and the phone must keep its witness current **without any operation that re-links the user.** If witness-refresh leaks, the whole privacy result (which the proof itself preserves) is destroyed *in the update path*, and a privacy property that holds in the proof but not in maintenance is not a privacy property. That is why this is the last gate and why it must be built, not argued.

The prior note's Falsification #3 named the exact failure: *"asking 'give me the path for leaf index J' reveals a stable position J."* A per-user witness query is a linkable identifier. The refresh must be **query-free.**

---

## 1. The core tension, stated precisely

- **Correctness** needs the phone's witness to match the current root.
- **Privacy** forbids the phone from telling the backend *which* leaf it holds (that is a stable pseudonym across every refresh).
- **The tree changes** every epoch as enrollments append.

A naive fix — phone asks backend "update my path" — satisfies correctness and breaks privacy (reveals leaf index J, persistently). The whole problem is achieving correctness **with zero per-user upstream information.**

---

## 2. The construction — broadcast-only, query-free refresh — **Construction**

Make the tree **append-only** and make the update object **the same for every client**.

- **Append-only frontier.** New leaves are added only at the growing edge. A given leaf's authentication path changes **only** when a new leaf lands in one of its sibling subtrees — which, for an append-only tree, happens only near the fill-frontier and in a bounded, predictable set of levels.
- **Broadcast the append-log, not per-user paths.** Each epoch the backend publishes one public object: the ordered list of newly appended leaves (or, more compactly, the new frontier nodes). This is **identical for every client** — downloading it reveals nothing about which leaf the downloader holds, exactly like downloading a block header reveals nothing about which address you own.
- **Local recomputation.** Each phone takes the public append-log and recomputes *its own* affected path levels locally. No upstream query, no leaf index revealed, no re-linkage. Privacy is preserved because the phone is a pure consumer of a public broadcast.

> **Result 1 (query-free refresh).** *For an append-only Merkle tree, a per-epoch public broadcast of appended frontier nodes lets every client refresh its own witness by local computation, with zero per-user upstream communication and therefore zero leaf-index leakage. The refresh is privacy-safe by the same argument that makes downloading public chain data privacy-safe: every client fetches the identical object.*

---

## 3. The costs this introduces — the honest part

Broadcast-refresh is sound, but it is not free, and three costs must be measured before "shipping."

**3.1 Broadcast bandwidth grows with enrollment rate.** If `A` users enroll per epoch, the append-log is O(A) per epoch. At high growth this is a real download. Mitigation: publish frontier *nodes* not raw leaves (log-compressed), and let clients that were offline for `m` epochs fetch a coalesced update. **Open: the per-epoch broadcast size at realistic enrollment rates, and the offline-catch-up cost.** A phone offline for a month must catch up without a per-user query.

**3.2 Local recompute cost on a weak phone.** Recomputing affected path levels is cheap per epoch (bounded levels) but the *offline-catch-up* case may touch many levels. Measure the worst-case recompute on a low-end phone, not the steady-state.

**3.3 Root freshness vs. proof validity.** The proof is against a specific root. Between the phone's last refresh and the verifier's current root, there is a window. Either the verifier accepts a *recent* root (a sliding window of the last `w` epochs — simple, standard, slightly weakens freshness) or the phone must always be current (bad UX). **Design choice: accept the last `w` roots; state `w` and its security meaning (how stale a membership proof may be).**

> **Result 2 (cost placement).** *Query-free refresh moves the maintenance cost into (i) per-epoch broadcast bandwidth O(enrollments), (ii) local recompute (cheap steady-state, unbounded-ish on long offline gaps), and (iii) a root-staleness window `w` the verifier must accept. None breaks privacy; all must be measured on a real low-end phone and at realistic enrollment rates before "ship."*

---

## 4. Revocation — the coupled open item — **Open**

Append-only makes refresh easy but revocation hard: you cannot cheaply *remove* a burned or compromised `C` from an append-only tree. Two revocation needs:

- **Double-use burn:** already handled by RLN (two proofs in one `(ctx,epoch)` reveal `s`) — this does not need tree deletion; the burned `s` is published and verifiers reject it. **Good — RLN revocation is orthogonal to the tree.**
- **Attester revocation / compromised enrollment:** if an attester is found corrupt and its issued `C`s must be invalidated, an append-only tree cannot delete them. Options: (a) a separate **revocation accumulator / nullifier set** the Phase-2 proof also checks non-membership against (adds cost — measure it), or (b) periodic **tree rebuild** at epoch boundaries excluding revoked leaves (expensive, forces all witnesses to refresh). **Open: which revocation mechanism composes with broadcast-refresh at acceptable cost.**

> **Result 3 (revocation split).** *Double-use revocation is solved (RLN, tree-independent). Attester-level revocation is not, and requires either a non-membership check in Phase 2 (added constraints — measure against the 4,309 budget) or periodic rebuild (added refresh cost). This is a genuine open item and must not be waved away as "handled by RLN" — RLN only handles double-use.*

---

## 5. The threat this construction must survive — **the adversarial section**

Broadcast-refresh is privacy-safe for an *honest-but-curious* backend. Attack it harder:

**5.1 The eclipse/withholding attack.** A malicious backend serves *different* append-logs to different clients (an eclipse), so a targeted client's witness diverges and its later proof fails or is distinguishable. Defense: the epoch root must be **publicly committed and consistent** — published to a broadcast medium all clients can cross-check (a bulletin board, a chain, gossiped roots), so a client can verify it saw the same root everyone else did. Without root-consistency, broadcast-refresh is eclipse-able. **Open: the root-consistency/gossip mechanism — this is where the design meets the harder distributed-systems problems the earlier project explored (attestation, consistency), and it should reuse that machinery, not reinvent it.**

**5.2 Timing correlation on refresh downloads.** Even query-free, *when* a phone downloads the broadcast, and *when* it then produces a proof, can correlate. Standard mitigation: decouple refresh timing from proof timing (refresh on a schedule, not on-demand-at-login). **Deployment discipline, must be stated.**

**5.3 The offline-user distinguishability.** A phone offline for many epochs fetches a large catch-up; the *size* of its catch-up leaks how long it was offline, weakly fingerprinting it. Mitigation: padded/coalesced catch-up to standard sizes. Minor, but real.

> **Result 4 (honest threat scope).** *Broadcast-refresh is privacy-safe against an honest-but-curious backend by construction (Result 1), but requires a root-consistency mechanism to resist an eclipsing backend, and refresh/proof timing decoupling to resist correlation. These are deployment-and-distributed-systems requirements, not proof-circuit properties, and they are the real remaining engineering surface. The circuit is done; the *system* around witness maintenance is not.*

---

## 6. The decision — what "ship" actually requires now

The proof is measured and private. To ship, close exactly these, in order:

1. **Build broadcast-refresh (Result 1) and load-test it:** per-epoch broadcast size at realistic enrollment, offline-catch-up cost, local-recompute p95 on a low-end phone. (§3)
2. **Choose and measure a revocation mechanism (Result 3):** non-membership check (measure added constraints vs. the 4,309 budget) or periodic rebuild (measure refresh cost). Do not ship without attester-revocation.
3. **Add root-consistency (Result 4.1):** a public, cross-checkable commitment of each epoch root, so refresh is not eclipse-able. Reuse existing consistency machinery.
4. **State the staleness window `w` and refresh/proof timing decoupling** as explicit deployment parameters.
5. **Then, and only then**, run the whole thing on real low-end phones and publish for adversarial review.

**The un-inflated bottom line.** The membership bridge delivered what the whole arc was chasing: fully-private, keyless, sub-2s-projected personhood login at 134M scale, signatures relocated off the hot path, on Groth16. That is a real result. But "the circuit is done" is not "the system is done" — witness maintenance turned out to hide a small cluster of genuine distributed-systems problems (broadcast bandwidth, revocation, root-consistency against an eclipsing backend) that are now the actual remaining work. They are tractable and they reuse machinery the broader project already explored. None of them is a wall like the signature floor was; all of them must be measured before "ship." The project has moved from "is the proof possible?" (yes, measured) to "is the maintenance system sound and cheap?" (open, tractable) — which is exactly the right place to be, and much further than three notes ago.

---

## 7. Falsification (commit before building)

1. If per-epoch **broadcast size** at realistic enrollment forces a download a low-end phone on a metered connection can't bear, broadcast-refresh needs compression or a different structure — measure it.
2. If **offline-catch-up** for a month-absent phone requires unbounded recompute or a per-user query, the query-free property breaks in the catch-up path — solve catch-up explicitly.
3. If **attester-revocation** via non-membership check pushes Phase-2 back over ~2 s p95 on a low-end phone, revocation and speed conflict — surface the tradeoff, don't hide it.
4. If **root-consistency** cannot be achieved without a trusted publisher, the eclipse attack is unresolved and the "no trusted party" property is weaker than claimed — state exactly what trust the root-publisher requires.
5. If refresh/proof **timing correlation** is measurable end-to-end, unlinkability holds in the proof but leaks in the traffic — decouple and re-measure.
