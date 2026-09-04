# The No-Shared-Key Bridge

### Why membership, not signatures, is the private Phase-1→Phase-2 bridge — and why that also retires the signature floor

**What two agents proved (the fence).** A "cheap token" bridge from the expensive Phase-1 attestation check to a fast per-login Phase-2 proof **cannot be a symmetric MAC.** Both agents, independently, found the identical structural wall: to check `T = Poseidon(k_B, C)` in-circuit, the phone needs `k_B`; either `k_B` is public (anyone forges tokens → unforgeability dead) or the phone holds it (backend's master key on every phone → trust model dead). No third option exists for a symmetric primitive. This is a wall, not a budget. Believe it.

**What they were reaching for but couldn't complete.** Both agents then pointed at **Merkle-membership** as the honest, sound, *keyless* alternative — the backend publishes a root of issued commitments `C`, the phone proves `C` is a leaf — and both rejected it on cost (depth 27 at 10⁸ users ≈ 5,000+ constraints). Neither agent had the project's **accumulator result** in context, which makes membership **O(1) instead of O(depth)**. Connecting those is the missing piece, and it does more than fix the bridge — it dissolves the problem the whole recent arc has been fighting.

**Status.** `Result` = argued from the measured constraint attributions in prior notes; `Construction` = composition of existing primitives; `Open` = must be prototyped. No new cryptography.

---

## 0. The insight neither agent stated: the bridge *is* the signature floor

Step back. The recent arc found two "walls," and has been treating them as separate:

- **The signature floor** (the-signature-floor.md): Phase 2 proving k EdDSA verifications in-circuit is ~12,600 constraints, incompressible in R1CS.
- **The bridge problem** (the two MAC-token agents): how does Phase 1's attestation check get *carried into* Phase 2 cheaply?

**These are the same problem.** The only reason Phase 2 re-verifies signatures in-circuit is to prove "I was attested." If Phase 1 instead **deposits proof-of-attestation into a set**, and Phase 2 proves **membership in that set**, then Phase 2 never verifies a signature at all — the signatures are checked *once*, in Phase 1, off the phone's hot path. The signature floor exists only because we kept re-proving attestation on every login. **Membership replaces re-verification.** So a cheap, keyless membership proof simultaneously (a) solves the bridge and (b) retires the signature floor. That reframing is the whole contribution of this note.

---

## 1. The construction — keyless, private, O(1)

**Phase 1 (once per credential lifetime, off the hot path):**
1. Phone holds root secret `s`; computes `C = Poseidon(s)`.
2. Phone proves the k EdDSA attestations over `C` in a **heavy circuit** — the ~12,600-constraint cost is paid **here, once**, and can run on a plugged-in phone or be verified backend-side. This is Phase 1's whole job; its latency does not touch the login UX.
3. Backend verifies the heavy proof and **inserts `C` into a cryptographic accumulator** (RSA/BBF or KZG), publishing the updated accumulator value per epoch. No key is shared with the phone. The backend's only secret is used to *maintain* the accumulator, never to *issue a token the phone must verify*.
4. Phone caches its **membership witness** `w` for `C`.

**Phase 2 (every login, the hot path):**
The circuit proves, all private except `N`:
- `C = Poseidon(s)` (know the secret behind the committed leaf),
- `Verify_accumulator(C, w, acc) = 1` (C is in the published set) — **O(1) in set size**,
- `N = Poseidon(s, ctx, epoch)` (per-context nullifier),
- RLN share over `(ctx, epoch)`.

**What leaks:** only `N`. The accumulator check proves *set membership*, not *which attesters* — the attester identities were consumed in Phase 1 and never appear in Phase 2. **This is the property the leak-tolerant Lever C could not give: full attester-unlinkability, because the verifier in Phase 2 sees no attester data at all — there is none in the circuit.**

> **Result 1 (keyless bridge).** *Accumulator-membership bridges Phase 1 to Phase 2 with (i) no shared key — the phone holds only `s` and a public membership witness, nothing secret to the backend; (ii) full unforgeability — a fake `C` is not in the accumulator and no witness exists for it, and forging one requires breaking the accumulator, not knowing a MAC key; (iii) full attester-unlinkability — Phase 2 contains no attester keys, categories, or signatures; and (iv) O(1) in-circuit membership cost, independent of user-base size. It defeats the MAC-token wall because there is no symmetric key to be either public-and-forgeable or shared-and-leaked.*

---

## 2. The cost — honest, and where it actually lands

The two agents' 5,000-constraint objection was against a **Merkle** proof (O(depth)). The accumulator changes the class:

- **Merkle-membership:** depth × ~200 constraints ≈ 5,000+ at 10⁸ users. Rejected by the agents, correctly.
- **Accumulator-membership, in-circuit:** the check is one group operation. **But here is the trap the accumulator note already flagged:** an RSA modexp or a BN254 pairing *in-circuit* is millions of constraints — far worse. So the O(1) win is real **only if the accumulator verification is done in a form the circuit can afford.**

Two honest routes, and the fork matters:

**2a. Membership verified in-circuit via a SNARK-friendly accumulator.** Use an accumulator whose verification is native field arithmetic (e.g. a KZG/polynomial commitment opening expressed with a pairing-friendly proof system, or a Poseidon-based vector commitment). The Phase-2 circuit then verifies membership without pairings-in-R1CS. This preserves **full privacy** (nothing about `C` or attesters leaves the circuit; only `N` is public). **Open:** whether a SNARK-friendly membership opening lands near the measured 478-residual cost or drags in expensive gadgets. This is the main line and must be measured.

**2b. Membership verified out-of-circuit — REJECTED here.** The phone could reveal `C` and let the backend check the accumulator. That is fast and keyless — but it re-introduces a leak: the backend sees `C`, and if `C` is stable across logins the user becomes *linkable across contexts* (the very thing the nullifier protects). **This is the Lever C leak in a new costume; privacy is non-negotiable, so 2b is out.** Route 2a is the only one that satisfies the requirement.

> **Result 2 (cost placement).** *The keyless bridge is cheap and private only via route 2a — a SNARK-friendly membership opening verified in-circuit. Route 2b (out-of-circuit membership) recovers speed by leaking `C` and is rejected under the privacy requirement. The open question is whether 2a's in-circuit membership opening is affordable on a low-end phone; this is a smaller and more tractable open question than "beat the signature floor," because membership openings have SNARK-friendly forms that scalar-multiplication does not.*

---

## 3. Why this is more promising than Lever J (and composes with it)

The prior escape (the-proof-system-escape.md, Lever J) was: migrate to PLONKish so the *signature* verification gets cheaper via lookups. This note offers a *different and better* escape: **don't verify the signature in Phase 2 at all.** 

- Lever J makes the ~12,600-constraint signature cost ~2× cheaper (still thousands of constraints, marginal on a phone).
- This construction makes the Phase-2 signature cost **zero** (signatures are in Phase 1), replacing it with an O(1) membership opening.

If route 2a's membership opening is cheap, Phase 2 is ~478 (residual) + membership-opening — plausibly well under the Groth16 signature floor, **fully private, on Groth16, no proof-system migration required.** And if the membership opening is *itself* cheaper in PLONKish, this **composes** with Lever J for further margin. So the priority order flips: **measure the keyless-membership bridge (2a) first; it is the higher-leverage, more-likely escape, and it is the one that also gives full attester-unlinkability for free.**

> **Result 3 (priority).** *The no-shared-key membership bridge dominates both the MAC-token (unsound) and Lever J (marginal) as the Phase-2 speed strategy, because it removes the signature from the hot path entirely rather than cheapening it, and delivers full attester-unlinkability as a structural consequence rather than a fought-for property. It should be the main line, with Lever J demoted to a composable secondary optimization on the membership opening.*

---

## 4. What must still be proven (the honest open list)

1. **The Phase-2 membership opening constraint count (route 2a).** The entire win rests on a SNARK-friendly, in-circuit membership opening being cheap. If it is not — if the only affordable accumulators need out-of-circuit checks (2b, leaky) or in-circuit pairings (millions of constraints) — the construction fails and we are back to Lever J. **Prototype this first.** Candidates: KZG opening in a pairing-native proof system; a Poseidon Merkle path at *sharded, shallow* depth (2¹⁶ per shard, depth 16 ≈ 3,200 constraints — worse than O(1) but keyless and private, a real fallback); a Verkle-style vector commitment.
2. **Witness maintenance under set updates.** Accumulator witnesses go stale when the set changes. The attester-issued set grows as users enroll; each new insertion may require witness updates. Batching and epoch-boundary republishing mitigate this, but the phone's cached witness `w` must be refreshable cheaply and *without* a round-trip that re-links the user. **Open: the witness-refresh protocol and its privacy.**
3. **Phase-1 cost is not free, only relocated.** The ~12,600-constraint attestation proof still exists; it is off the login hot path but must run somewhere (plugged-in phone, or backend-verified). Confirm Phase-1 latency is acceptable as a one-time enrollment cost.
4. **Revocation.** Removing a burned `C` from an accumulator (dynamic accumulators support deletion, but cost varies). RLN handles double-use burns; accumulator deletion handles attester revocation. Confirm both compose.

---

## 5. The decision, reordered around the new main line

Privacy non-negotiable; the goal is fully-private sub-2s Phase-2 login on a low-end phone.

1. **Lever F still applies:** derive k from real β; Phase-1 cost scales with k but is off the hot path, so k=3 is now cheap to afford (it is not on the login path). *This is a side benefit: moving signatures to Phase 1 makes the k-choice a security decision unconstrained by login latency.*
2. **Main line — route 2a:** prototype the SNARK-friendly in-circuit membership opening. Measure Phase-2 composed constraint count (478 residual + opening) and phone p95. This is the highest-leverage measurement available.
3. **If 2a is cheap:** ship the fully-private, keyless, O(1)-bridge wedge on Groth16 — no leak, k=3 affordable, no migration. This is the strongest honest outcome the project can reach.
4. **If 2a's opening is too costly in Groth16:** compose with Lever J (PLONKish + lookups on the opening) and re-measure.
5. **If both miss on a low-end phone:** the sharded shallow-Merkle fallback (depth 16, ~3,200 constraints, keyless, private) is the honest floor — worse than O(1) but still far below the signature floor and fully private. Measure it as the guaranteed-sound backstop.

**The un-inflated bottom line.** The two agents proved the MAC shortcut is unsound — a real fence. But they lacked the accumulator result, and connecting it reveals that **membership, not signatures, is the bridge, and membership retires the signature floor because it moves attestation off the login hot path entirely.** This is the most promising escape found so far *and* it is the one that delivers full attester-unlinkability structurally. It rests on one measurable open question — the in-circuit membership-opening cost (route 2a) — which is smaller and more tractable than "beat the signature floor" ever was. Measure it. If it lands, the wedge is fully private, fast on a low-end phone, on Groth16, with no shared key and no compromise.

---

## 6. Falsification (commit before building)

1. If the cheapest **in-circuit, private** membership opening (route 2a) exceeds ~4,000 constraints on top of the 478 residual, the O(1) promise doesn't materialize affordably — fall to the sharded-Merkle fallback (§5.5) and re-scope.
2. If the only affordable accumulator check must be **out-of-circuit** (2b), it leaks `C` → linkability → violates the privacy requirement → rejected; do not ship it as "private."
3. If **witness maintenance** requires a per-update phone round-trip that re-links the user, the bridge's privacy breaks in the update path even if the proof is private — solve witness-refresh privacy before claiming unlinkability.
4. If Phase-1 enrollment latency (the relocated ~12,600-constraint proof) is unacceptable as a one-time cost on the target phone, the relocation only *moved* the floor into onboarding — measure it, don't assume it's fine.
