# Security policy

**Breaking this is the point.** The project publishes falsification criteria in
advance ([MASTER-SPECIFICATION §8](MASTER-SPECIFICATION.md), §8 of the paper) and
a threat model written to be attacked ([THREAT-MODEL.md](THREAT-MODEL.md)). A
report that invalidates a claim is the most useful contribution anyone can make
here, and it will be credited and published, not buried.

## Status of this code

Read this before deciding whether a finding matters.

- **No independent audit has happened.** Gate 1 is open. The
  [self-audit](docs/SELF-AUDIT.md) is evidence, not review.
- **Nothing is deployed.** There is no production system, no user data, and no
  bug bounty. There is no money involved.
- **The proving keys in this repository are evaluation-only**, from a throwaway
  single-contribution trusted setup. Attacks that rely on a compromised setup are
  already disclosed as Gate 5 and are not findings — see
  [`supply-chain/TRUSTED-SETUP.md`](supply-chain/TRUSTED-SETUP.md).

## Reporting a vulnerability

**Preferred: GitHub private vulnerability reporting.** Open
`Security → Report a vulnerability` on this repository. That gives a private
thread with the maintainer and a CVE path if one is warranted.

If private reporting is unavailable to you, open a public issue **only for
findings that are not exploitable against a live system** — which, given nothing
is deployed, is most of them. For anything you judge sensitive, use the private
channel and wait.

Please include:

1. Which claim it breaks — cite the property from
   [THREAT-MODEL.md](THREAT-MODEL.md) §2 (P1–P9), the falsification criteria, or
   the paper's §3 table.
2. The concrete construction: inputs, a witness, a script, or a proof sketch.
   For circuit soundness, the strongest form is a witness that satisfies the R1CS
   and encodes a false statement — see
   [`scripts/test_soundness_adversarial.mjs`](scripts/test_soundness_adversarial.mjs)
   for the harness shape and how to extend it.
3. Which artefact and commit you tested.

### Response

This is a one-person research project, not a funded security team. Expect:

| | target |
|---|--:|
| Acknowledgement | 5 working days |
| Initial assessment | 14 working days |
| Fix or public disclosure of the finding | 90 days |

If a real soundness bug is found, the commitment is to **fix it, report it
prominently in the README and the paper, and regenerate every affected artefact**
— including reissuing the reproducible-build lock and the PDF. A retraction is a
success of the method. This project already carries several
([`docs/research-history/`](docs/research-history/)) and does not hide them.

## In scope

- **Circuit soundness** — under-constrained signals in
  `wedge_mem_w8_d9_split`, the revocation variants, or `wedge_direct_k3`; anything
  admitting a proof for a `C` not in the tree, a mismatched nullifier, or an RLN
  share off its line.
- **Privacy** — any method to link `N@ctx1` and `N@ctx2` to one user without `s`;
  any path that leaks `C`, a leaf index, or attester identity out of a Phase-2
  proof.
- **The RLN burn** — two valid proofs in one `(ctx, epoch_action)` that do not
  reconstruct `s`.
- **Witness maintenance** — any refresh or catch-up path that lets the server
  infer a client's leaf position (the `assertQueryFree` guard is the target).
- **Root consistency** — a targeted eclipse not caught by the client-side
  cross-check when at least one source is honest.
- **The integration surface** — replay, audience confusion, or nullifier reuse in
  the OIDC/VP PoC under `integration/`.
- **Supply chain** — a way to make the reproducible build produce artefacts that
  do not match the audited source.

## Out of scope

Not because they are unimportant, but because they are **already disclosed** and
listing them again is not a finding:

- The evaluation-only trusted setup (Gate 5).
- Full eclipse of *every* root source a client can reach (N6 / paper §7.2) — the
  raised bar and the residual exposure are documented.
- `N` being pseudonymous personal data, and `N` not being a durable account key.
- Timing correlation between witness refresh and login where a deployment ignores
  the normative decoupling and padding requirements (THREAT-MODEL §6).
- Credential rental and coercion, which are analysed and bounded rather than
  eliminated.
- Attester collusion at `k` or above.
- Missing post-quantum security (BN254/Groth16).
- Attacks that require compromising the user's device or OS.

If you think one of these is worse than the documents admit, that **is** a
finding. Say so and show the arithmetic.
