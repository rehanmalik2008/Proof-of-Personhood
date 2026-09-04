# Sybil-Wedge — private proof-of-personhood login

A working, measured implementation of a **personhood primitive**: a party proves
to any verifier that it is *a distinct human who has not made this claim before in
this context* — with no central registry, no biometrics, no hardware root of
trust, no revelation of *which* human, and no linkability across contexts (not by
verifiers, not by colluding verifiers, not by the issuer).

It is a bot/sybil defence for signup and action gates and for per-capita
allocation. **It is not an identity system** — it never establishes *who* someone
is.

---

## Status — read this before anything else

**This is a measured, reproducible engineering system with a candidate security
property. It has not been independently reviewed and has never been deployed.**

| | |
|---|---|
| Measured on real hardware | **yes** — every number here traces to a capture in [`results/`](results/) |
| Reproducible builds | **yes** — byte-identical rebuilds, hashes pinned in [`supply-chain/artifacts.lock.json`](supply-chain/artifacts.lock.json) |
| Independently audited | **no.** Zero external audits. Gate 1 is open. |
| Production deployment | **none.** No platform has run this, not even in shadow mode. |
| Proving keys in this repo | **evaluation only.** Throwaway single-contribution trusted setup. A compromised setup breaks *soundness*. Never use them for anything real — [`supply-chain/TRUSTED-SETUP.md`](supply-chain/TRUSTED-SETUP.md). |
| The economic parameter β | **never measured** against a live application. Every figure in the economics section is an estimate. |

A **self-audit** of the constraint system is published in full
([`docs/SELF-AUDIT.md`](docs/SELF-AUDIT.md)): Picus (SMT) reports every deployed
circuit *properly constrained*, circomspect is clean on the instantiated
entrypoints, a manual footgun pass is documented per template, and a 24-check
adversarial witness harness finds no soundness bug. **That is evidence, not an
audit.** Self-audit does not close Gate 1 and the word "audited" is not used
anywhere in this project.

### Production gates — five of six are open

No production deployment until these close. All are ordinary external work rather
than open research; none is a cryptographic unknown. Full detail:
[MASTER-SPECIFICATION §6](MASTER-SPECIFICATION.md).

| # | Gate | Status |
|---|---|---|
| 1 | ≥2 independent circuit audits | **Open** — audit-*ready*, not audit-*ed*. Self-audit run; it does not substitute. |
| 2 | GDPR right-to-erasure legal memo | **Open** — append-only tree vs. a deletion right. Blocks EU deployment. |
| 3 | Peak RSS + p95 on a ≤3 GB device | **Open** — the measured device is 3.75 GB. Strong evidence, not closure. |
| 4 | IP indemnification / liability structure | **Open** |
| 5 | Trusted-setup ceremony (or transparent-setup migration) | **Open, disclosed** — current keys are evaluation-only |
| 6 | Attester-level revocation | **Closed (v1.1)** — both paths implemented, measured, tested |

Stated falsification criteria, written in advance so they cannot be moved later,
are in [MASTER-SPECIFICATION §8](MASTER-SPECIFICATION.md) and §8 of the paper.

---

## Verify this yourself in under an hour

Don't trust the prose. The full reviewer walkthrough is
[**docs/EVALUATION.md**](docs/EVALUATION.md); this is the short version.

```bash
npm install                                   # pinned toolchain: Node 24.14.0, circom2 0.2.23, snarkjs 0.7.6
node scripts/build.mjs                        # compile + Groth16 setup + self-verified inputs (~18 min)

node scripts/repro_build.mjs --double         # A: two clean builds are byte-identical
npm test                                      # B/C/G: 72 assertions across 5 suites (below)
node scripts/bench_node.mjs                   # constraint counts + desktop prove times, every circuit
node scripts/test_soundness_adversarial.mjs   # G: 24 adversarial witnesses, all must be rejected
```

`npm test` runs, in order: `test_rln_burn` (15) · `test_root_consistency` (11) ·
`test_revocation` (9) · `test_soundness_adversarial` (24) · `xengine_split_check`
· `integration/run` (13).

| track | what it proves | time |
|---|---|--:|
| A — reproducible build | the deployed prover **is** the audited source, byte for byte | 10 min |
| B — circuit shape | 4,309 constraints, exactly 7 public signals, `C` never public, no signature gadget in the login circuit | 10 min |
| C — integration | real OIDC + W3C VP over real HTTP with real proofs; `sub` pairwise and `epoch_action`-scoped | 5 min |
| D — phone performance | the on-device numbers reproduce (needs an Android + `adb`) | 20 min |
| E — cross-engine equivalence | snarkjs / C++→WASM / rapidsnark all verify against one vkey, identical public signals | 5 min |
| F — revocation & multi-source roots | Gate 6 both paths; client fails closed on root disagreement or below quorum | 10 min |
| G — soundness self-audit | 24 adversarial witnesses rejected; Picus + circomspect clean | 10 min |

## Read this first

- **[paper/proof-of-personhood-without-a-registry.pdf](paper/proof-of-personhood-without-a-registry.pdf)**
  — the public research paper (v1.1, 23 pages): the problem, the construction, the
  measured results *including the four failed optimisation paths*, what is not
  protected, the open gaps, the self-audit, and an appendix with a real proof and
  its verification transcript. Start here if you are reading rather than running.
- **[MASTER-SPECIFICATION.md](MASTER-SPECIFICATION.md)** — the authoritative
  document. A reviewer who reads only §5 ("what is NOT protected") and §6 (the gap
  register) has the accurate picture.
- **[THREAT-MODEL.md](THREAT-MODEL.md)** — written to be attacked: every security
  parameter and its failure mode, the narrowed trust claim, the normative
  deployment disciplines.
- **[docs/SELF-AUDIT.md](docs/SELF-AUDIT.md)** — the adversarial self-audit, with
  tool versions, exact commands, raw logs, and the reasoning for every dismissed
  finding.
- **[docs/EVALUATION.md](docs/EVALUATION.md)** — independently verify the core
  claims in under an hour.
- **[SECURITY.md](SECURITY.md)** — how to report a vulnerability. Breaking this is
  welcome and the falsification criteria are stated in advance.
- **[docs/research-history/](docs/research-history/)** — the chronological research
  record, retractions included. Superseded by the master spec; not an entry point.

## What it does

Two phases, deliberately separated so cost lives off the hot path.

- **Enrollment (once per credential lifetime).** The device holds a root secret
  `s`, publishes `C = Poseidon(s)`, gets `k` independent attesters to blind-sign
  `C`, proves those signatures in a heavy circuit (13,099 constraints), and the
  backend appends `C` to an append-only Poseidon Merkle tree (arity-8, depth 9,
  capacity 134,217,728).
- **Login (every use, the hot path).** The device proves in-circuit, with
  everything private except the outputs: knowledge of `s` behind a leaf `C`;
  `C ∈ published tree` opened against the `root` for `epoch_tree` (`C` never
  revealed); a per-context nullifier `N = Poseidon(s, ctx, epoch_action)`; and an
  RLN Shamir share whose slot is `(ctx, epoch_action)` — bound to the rate-limit
  window, not the tree epoch. **Public output: exactly 7 signals** —
  `[N, y, root, ctx, epoch_action, epoch_tree, signalHash]`. The verifier learns
  only that one attested distinct human acted once in this context in this
  rate-limit window.

Two time counters (v1.1): `epoch_action` is the rate-limit / nullifier window
(fast); `epoch_tree` is the tree-publication cadence (slow). v1.0 used one counter
for both; the split costs zero circuit constraints. The RLN double-use burn binds
to `epoch_action` only — `scripts/test_rln_burn.mjs` recovers `s` from two proofs
in one action window that cite different tree roots.

Login verifies **no signatures** — attestation is proven once at enrollment and
carried forward by set membership. That is the central design decision: it
collapsed the login circuit from 13,099 to **4,309 constraints** and made
attester-unlinkability structural (the login proof contains no attester data, so
none can leak). Witness upkeep is a **public broadcast per `epoch_tree`, identical
for every client** — no per-user query ever occurs (enforced in code, not policy).

## Measured performance

Real hardware: **Samsung Galaxy A12** (Helio P35, 8×Cortex-A53, 3.75 GB RAM,
Android 12, Chrome 152) — an entry-level device, deliberately chosen as the hard
case. Raw captures: [`results/`](results/).

**Prove-only** (same zkey/witness; proofs byte-verified equivalent across all three engines):

| engine | cold | warm median | install |
|---|--:|--:|---|
| snarkjs (browser, deployed today) | 5,187 ms | 3,374 ms | none |
| C++→WASM (rapidsnark via Emscripten) | 3,071 ms | 2,467 ms | none |
| **rapidsnark native** | **510 ms** | **477 ms** | app / SDK |

End-to-end (witness-calc + prove) adds ~1,164 ms warm / ~1,592 ms cold in-browser.

**Memory** — peak prover RSS (kernel `VmHWM`) **361 MB** baseline / **379 MB** under
900 MB ballast, ~10% of device RAM; tab survived 20/20 runs, no OOM. (The
`~2 GB` figure sometimes seen is *reserved* address space, ~18% committed — not
resident.) Note this does **not** close Gate 3: the device is 3.75 GB, not ≤3 GB.

**The prover-optimization search is closed** — four paths, each failed for a
measured reason (browser levers, the C++→WASM bridge at 5.17× native, field
assembly ruled out because the WASM/native gap is a flat ~5× at *every* thread
count = codegen not field arithmetic, and Rust/arkworks-WASM which uses the same
scalar field path). Detail: [docs/research-history/AFTER-THE-BRIDGE-EXP1.md](docs/research-history/AFTER-THE-BRIDGE-EXP1.md).
The ~5× is a property of today's WASM toolchain, not of this code, and narrows for
free as LLVM codegen and SIMD proposals mature.

## Deployment matrix

Identical circuit, zkey, nullifier, public signals, and privacy in every cell —
the split is a deployment choice, not a protocol fork.

| device class | zero-install browser | native SDK |
|---|---|---|
| Entry-level (A12-class, ~$110) | ~4.7 s cold end-to-end (C++→WASM) / ~6.8 s (snarkjs) | **~0.5 s — GO** |
| Mid-range | ~2–4 s *(projected)* | GO |
| Flagship / desktop | ~0.7 s | GO |

**Target (revised, on the record):** ≤2 s on mid-range; ≤5 s cold on entry-level,
**proven once per `epoch_action`, not per login** (`epoch_action`-scoped nullifiers + RP-side
caching). Deployments that prove per-login on entry-level devices use the native
SDK. See MASTER-SPECIFICATION §4.3.

## Reproduce / run

Prereqs: **Node ≥ 18**. No Rust, no MSVC, no `circom` binary (`circom2` npm →
WASM). The static analyzers used by the self-audit need Linux or WSL —
`scripts/wsl_install_analyzers.sh` installs circomspect and Picus in one shot.

```bash
npm install
node scripts/build.mjs                 # compile circuits + ptau + Groth16 setup + self-verified inputs (~18 min)
npm test                               # 6 suites, 72 assertions
node scripts/bench_node.mjs            # desktop constraint + prove-time table for every circuit
node scripts/repro_build.mjs --double  # prove deployed WASM/r1cs/zkey are byte-identical to a clean compile
node scripts/serve.mjs                 # serve web/index.html — open on the target phone (same Wi-Fi)
```

Phone benchmark (real-device p95 + OS RSS, over `adb`, no root):

```bash
node scripts/measure_phone_rss.mjs --load 4 --load-mb 200   # peak RSS under memory pressure
node scripts/bench_rapidsnark.mjs                            # native rapidsnark prove time on-device
node scripts/collate_results.mjs results/ > DEVICE-MATRIX.md # collate every capture + memory-gate verdict
```

`node scripts/repro_build.mjs --verify` needs `build/pot15_final.ptau`, a pinned
36 MB input that is **attached to the GitHub Release** rather than committed. Its
SHA-256 is in `supply-chain/artifacts.lock.json`. You can also regenerate a spike
ptau with `scripts/build.mjs`, or point `PTAU=` at a public perpetual-powers-of-tau
file — see [`supply-chain/TRUSTED-SETUP.md`](supply-chain/TRUSTED-SETUP.md).

## Layout

```
paper/                    the public research paper (PDF) + its reproducible build
LICENSE  NOTICE           Apache-2.0; §3 is the irrevocable patent grant
SECURITY.md               vulnerability disclosure policy
CONTRIBUTING.md           how to contribute, and the evidence standard for claims
MASTER-SPECIFICATION.md   authoritative spec (claim, architecture, numbers, gaps, falsification)
THREAT-MODEL.md           security parameters, failure modes, trust claim, normative disciplines
REPRODUCIBLE-BUILDS.md    supply-chain: byte-identical artifact proof + SBOM + trusted-setup note
WITNESS-MAINTENANCE.md    append-only tree, query-free per-epoch broadcast, catch-up, revocation
PHONE-RSS.md              operator runbook for OS-level peak-RSS capture on a real Android
docs/
  EVALUATION.md           reviewer quickstart — verify the core claims in under an hour
  SELF-AUDIT.md           adversarial self-audit: tools, commands, findings, unverified surface
  self-audit/             raw analyzer output (circomspect SARIF + logs, Picus logs)
  research-history/       chronological research record, retractions included
circuits/                 Groth16/BN254 circom sources; wedge_mem_w8_d9_split = the 4,309-constraint login
scripts/                  build, benchmarks (node + on-device), repro build, SBOM, analyzers, tests
integration/              OIDC + W3C Verifiable Presentation drop-in PoC (real HTTP, real proofs)
web/                      real-device benchmark harness (index.html) + EVALUATION-ONLY prover artifacts
web-wasm/ wasm-bridge/ web-attrib*/   C++→WASM bridge build + attribution benchmark artifacts
supply-chain/             artifact hash lock, CycloneDX SBOM, TRUSTED-SETUP.md
results/                  device captures (*.json) behind MASTER-SPECIFICATION §4
build/*_vkey.json         verification keys (the rest of build/ is regenerable and not committed)
```

## Caveats

- **The proving keys here are evaluation-only.** `_final.zkey` files come from a
  throwaway single-contribution trusted setup. Production needs a public
  multi-party ceremony or a transparent-setup system
  ([`supply-chain/TRUSTED-SETUP.md`](supply-chain/TRUSTED-SETUP.md), Gate 5).
- **Trust is not zero.** The honest claim is *"no single trusted party, given a
  1-of-N-honest publication medium."* The client now enforces that check across N
  independent root sources and fails closed, but a full eclipse of every source
  remains detectable only after the fact. "Zero trusted parties" is retracted.
- The nullifier `N` is **pseudonymous personal data** under GDPR, and it is scoped
  to `epoch_action` — an action token, not an account key.
- Not post-quantum (BN254/Groth16); a crypto-agility path exists.
- Desktop prove-time absolutes vary with machine load; constraint counts are exact.
  On-device numbers are the authoritative ones.

## License

Apache-2.0, with the §3 patent grant. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
This licence choice is committed irrevocably in MASTER-SPECIFICATION §7: no BSL,
no SSPL, no future relicense.
