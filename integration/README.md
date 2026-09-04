# OIDC + W3C VP integration surface — proof of concept

> **Authoritative document:** [`../MASTER-SPECIFICATION.md`](../MASTER-SPECIFICATION.md)
> (§5 on `N` as personal data and scoped to `epoch_action`, not an account key; §6 "Verified
> and closed" for this PoC's result). Reviewer walkthrough:
> [`../docs/EVALUATION.md`](../docs/EVALUATION.md) Track C.

**Task:** wrap the existing Phase-2 nullifier proof as (a) a W3C Verifiable
Presentation and (b) an OpenID Connect flow where a relying party receives the
nullifier `N` as a **pairwise, sector-scoped** subject identifier — then answer one
question: **is production integration an SDK + endpoint, or a rearchitecture?**

**No new cryptography. No token. No new credential format.** The only new artifact
is a single VP `proof.type` (`GrothBn254NullifierProof2025`) inside an otherwise
standard VP container — which `from-circuit-to-standard.md` §1 explicitly permits.

```bash
node integration/run.mjs
```

---

## The finding

> **DROP-IN — SDK + endpoint, not a rearchitecture — with one semantic change the
> relying party must accept.**

### What the relying party already has (stock OIDC, unchanged)

`integration/lib/rp.mjs` is an ordinary OIDC client:

- `GET /login` → make `nonce` + `state`, redirect to the OP's `authorization_endpoint`
- `GET /callback` → validate the ID token against the OP's JWKS: `iss`, `aud`,
  `exp`, `nonce`
- `response_type=id_token`, discovery via `/.well-known/openid-configuration`

A platform that already does "Sign in with Google/Apple/Okta" has all of this.

### What integration adds (the "SDK + endpoint")

| # | Addition | Size | Nature |
|---|---|---|---|
| 1 | **Verify the Verifiable Presentation** — `verifyVP()` → snarkjs `groth16.verify` against a pinned verification key, plus challenge-binding and root-freshness checks | ~80 LoC + snarkjs verifier + one pinned `vkey.json` | the **SDK** |
| 2 | **Poll the published-roots feed** — to know which `membershipRoot` values are inside the staleness window `w` (`epoch_tree` units) and the current `epoch_action` | one `GET /roots` on a timer | the **endpoint** |
| 3 | **`(sub, epoch_action)` dedupe** — the "one action per person per rate-limit window" Sybil property | a set membership check | additive to existing anti-abuse |

None of these is a new protocol. #1 is a library call. #2 is an HTTP GET the RP's
stack can already make. #3 is application logic the RP writes once.

### The one semantic change (this is the finding's caveat, stated prominently)

**The OIDC `sub` here is pairwise AND scoped to `epoch_action`.**

- `sub = N = Poseidon(s, ctx, epoch_action)`.  (`epoch_tree`, the tree-root cadence, is a separate public signal and does not enter `N`.)
- `ctx` is derived from the relying party's identifier → **the same human is a
  different, uncorrelatable `sub` at every RP** (this is the pairwise property,
  and it is *cryptographically enforced* — even the OP that generated both proofs
  cannot link them, because the linkage lives only inside `Poseidon(s, …)`).
- `epoch_action` rotates → **the same human at the same RP presents a different
  `sub` every rate-limit window.** Advancing `epoch_tree` alone (a tree republish)
  does *not* rotate `sub` and does *not* reset the rate limit.

An RP that treats `sub` as a **durable account primary key** must change that
assumption. Here `sub` is a **per-window action token**, not an account handle. It
is the right shape for: rate-limiting, one-vote-per-period, one-review-per-window,
faucet/airdrop-style "one claim per person per round", bot-defense on a
per-`epoch_action` basis. It is **not**, as built, a drop-in replacement for a persistent login
identity.

If persistent pseudonymous accounts are required, the fix is a **second,
epoch-independent pairwise identifier** — `N_stable = Poseidon(s, ctx)` — as an
added circuit output. That is ~255 constraints, no new cryptography, no new
format. **It is not built here** and it is a circuit change, so it is a small
research/engineering item, not part of the drop-in claim.

---

## What `run.mjs` demonstrates

Real HTTP, real redirects, real Groth16 proofs (the `wedge_mem_w8_d9_split`
artifacts), driven end to end with `fetch()`. It stands up **three independent root
mirrors** and both the OP prover and the RP verifier run the multi-source
root-consistency check (`lib/root_consistency.mjs`) before proving and before
accepting. **13 assertions**, all pass:

| step | result |
|---|---|
| RP-A login | `200` — allowed, `sub = N_A` |
| RP-A login again, same `epoch_action` | `403` — "already acted this action window" (Sybil gate via `(sub, epoch_action)`) |
| RP-B login (same human) | `200` — allowed, `sub = N_B`, **`N_B ≠ N_A`** and neither derivable from the other |
| advance `epoch_action`, RP-A login | `200` — allowed, `sub = N_A′ ≠ N_A` (nullifier rotated) |
| advance `epoch_tree` only (tree republish), RP-A login | `403` — still the same action window; **the republish grants nothing** and `sub` is unchanged |
| advance `epoch_action` again, RP-A login | `200` — `sub` rotates once more |
| forge one mirror's current root | `502 root_consistency_failed` — `FAIL_CLOSED_DISAGREEMENT`; the chained-head cross-check catches the divergent root |
| restore that mirror | `200` — back to agreement |
| close 2 of 3 mirrors | `502 root_consistency_failed` — `FAIL_CLOSED_QUORUM`; one reachable source is below the 2-of-3 quorum |

The proof carried inside the ID token as a `vp` claim is a full W3C VP:

```jsonc
{
  "@context": ["https://www.w3.org/ns/credentials/v2", ".../nullifier-presentation/v1"],
  "type": ["VerifiablePresentation", "NullifierPresentation"],
  "verifiableCredential": [],           // nothing disclosed — personhood is proven in ZK
  "proof": {
    "type": "GrothBn254NullifierProof2025",
    "proofPurpose": "authentication",
    "challenge": "<oidc nonce>",         // freshness
    "domain": "<relying party id>",      // audience binding
    "publicSignals": { "nullifier": "…", "rlnShare": "…", "membershipRoot": "…",
                       "context": "…", "epochAction": "…", "epochTree": "…", "signalHash": "…" },
    "proofValue": "<base64url({pi_a,pi_b,pi_c})>"
  }
}
```

`signalHash` is bound: the verifier recomputes `H(nonce ‖ relying-party-id)` and
rejects any proof whose public `signalHash` differs — so a proof is inseparable
from the exact `(login attempt, RP)` it was made for.

---

## Files

```
integration/
  run.mjs              end-to-end driver + the finding
  lib/proof.mjs        wrapper over build/wedge_mem_w8_d9_split.* (7 public signals)
  lib/vp.mjs           build / verify the W3C Verifiable Presentation
  lib/oidc… (op.mjs)   self-issued OpenID Provider surface (.well-known, jwks, /authorize)
  lib/rp.mjs           mock relying party: stock OIDC + the 3 additions above
  lib/roots.mjs        published-roots feed + multi-mirror harness (startRootMirrors:
                       honest / lagging / dishonest / rewrite modes; epoch_tree window w + epoch_action)
  lib/head_chain.mjs   shared Poseidon transparency head: head_e = H(head_{e-1}, root_e, e)
  lib/root_consistency.mjs  the client-side cross-check: AGREE / LAG-on-chain / DISAGREE,
                       fail closed on disagreement or below quorum (default 2-of-3)
  lib/freshness.mjs    the two-parameter verifier freshness policy (w, actionRecency)
  lib/jose.mjs         RS256 JWS + JWKS via node:crypto only (no deps)
```

## Honesty notes / what a reviewer should push on

- **The OP is self-issued** (the user's agent). A *hosted* OP would additionally
  see `N@ctx` per RP and login wall-clock (still cannot correlate across `ctx`).
  `THREAT-MODEL.md` N10.
- **The OP signature is not the identity trust root** — the Groth16 proof + the
  published root are. An RP MUST verify the VP itself, not trust the ID-token
  signature alone (`THREAT-MODEL.md` §6.6 / P9). `run.mjs`'s RP does verify it.
- **`response_mode`**: the PoC uses `query` for a server-side RP; production should
  use `form_post` or PKCE + code flow. Not a rearchitecture, a config choice.
- **Root freshness** is checked against local stub feeds. `run.mjs` now runs three
  mirrors and the multi-source root-consistency check on both sides
  (`lib/root_consistency.mjs`, `THREAT-MODEL.md` §6.1); it fetches only the
  hash-chained head, not just the current root, so a rewritten history is caught.
  **The three mirrors here share a process — they are one source with three ports.**
  A production deployment MUST use sources that are independent in operator, network
  path, and ideally trust root (`THREAT-MODEL.md` §6.2); three endpoints on one
  operator's infrastructure do not count. Standalone scenarios:
  `scripts/test_root_consistency.mjs` (11 assertions).
- **Revocation.** Both paths are implemented and tested outside this PoC
  (`scripts/test_revocation.mjs`, 9 assertions). Individual: the `_split_rev*`
  circuits slot into `lib/proof.mjs` by swapping artifact names and adding the
  `revoked[]` public input (`+R` constraints, measured +64/+256/+1,024). Bulk: an
  incremental tombstone rebuild at an `epoch_tree` boundary
  (`scripts/witness_maint.mjs` `revokeAndRebuild`), broadcast 9 KB–1.2 MB measured.
  A rebuild interrupts every client for one refresh window (disclosed,
  MASTER-SPEC §5).
