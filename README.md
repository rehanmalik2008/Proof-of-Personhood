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

**Of six production gates, one is closed; Gate 1 gained a tool-independent
under-constraint check that also clarified how far it still is from closure; Gates
3 and 5 gained measured evidence. The remaining work is external and scoped.** No
gate moved, and none is presented as closed.

- **Gate 1.** A [self-audit](docs/SELF-AUDIT.md) found no soundness bug in the
  deployed circuits. A linear-time
  [structural forward-determination walk](docs/self-audit/forward_determination.md)
  — no solver, no `Poseidon` assumption, no linearization — establishes that
  **every signal, and both public outputs, is uniquely determined by the inputs
  except 72 `IsZero` `<--` hint signals** that no public output reads. Three
  prior methods corroborate: a tool-independent
  [two-witness search](scripts/two_witness_search.mjs) at
  [56 structurally diverse witnesses](docs/self-audit/two_witness_multipoint.md)
  (its 9 free directions at the deployed witness are exactly the 9 hints free
  there); those hint freedoms
  [proved benign](docs/self-audit/taint_iszero.md) by a taint analysis; and a
  [finite-field SMT proof](docs/self-audit/ff_smt.md) (cvc5 + CoCoALib) that `N`
  and `y` are uniquely determined with every input symbolic. Picus and cvc5-FF
  both **stall on any circuit with a real `Poseidon`** — the structural method
  exists precisely because they attack a structural property semantically
  (packaged for the Picus maintainers in
  [docs/self-audit/picus-upstream-report.md](docs/self-audit/picus-upstream-report.md)).
  [Mutation testing](docs/self-audit/mutation_table.md), filtered by the
  two-witness search to genuine signal-level under-constraints, has a denominator
  of **one**: M1a, a freed nullifier — a real, exploitable under-constraint that
  circomspect catches syntactically and the old signal-at-a-time harness missed
  (a null-space-directed harness layer now catches that class). The deployed
  circuit has no such defect. **Unique determination is one soundness property.**
  It does not establish that the circuit computes the *intended* function —
  nullifier correctness, the RLN burn semantics, logic errors in *what* is
  constrained — which is what an external audit additionally checks. The new work
  makes an audit faster and better-targeted; it does not predict its outcome, and
  Gate 1 is understood as *further* from closure than it first looked.
  **Evidence, not an audit.** The word "audited" is not used anywhere in this
  project.
- **Gate 3.** Under a hard cgroup memory cap with swap disabled, the prover
  completes and verifies down to **336 MB** and is OOM-killed at **320 MB**
  ([results](docs/self-audit/mem_ceiling_results.txt)). Simulated on desktop x86;
  the gate names a *device*, so it stays open pending a physical ≤3 GB handset.
- **Gate 5.** The trusted-setup [ceremony coordinator](docs/CEREMONY.md) is built
  and tested: 27 assertions, six adversarial submissions rejected, two real
  coordinator bugs found and fixed. The circuit set is now
  [frozen for v1.2](CIRCUIT-FREEZE.md) and the run-book is written
  ([docs/CEREMONY-RUNBOOK.md](docs/CEREMONY-RUNBOOK.md)), but the ceremony has
  **not** been run — it needs genuinely independent human contributors. The
  shipped keys remain evaluation-only until it is; Gate 5 stays Open.

### Production gates — five of six are open

No production deployment until these close. All are ordinary external work rather
than open research; none is a cryptographic unknown. Full detail:
[MASTER-SPECIFICATION §6](MASTER-SPECIFICATION.md).

| # | Gate | Status |
|---|---|---|
| 1 | ≥2 independent circuit audits | **Open**, and further from closure than it looked. A linear-time structural forward-determination walk (no solver, no assumption) shows every signal and both public outputs uniquely determined by the inputs except 72 `IsZero` `<--` hints that no output reads; corroborated by a 56-point two-witness search, a taint proof of the hints, and a finite-field SMT proof (cvc5+CoCoALib). Picus and cvc5-FF both stall on real `Poseidon`. circomspect clean; mutation testing found one genuine under-constraint in a mutant (M1a). Makes an external audit cheaper and better targeted; does not substitute for it — a full determination proof is one failure mode an audit examines, not all of them. |
| 2 | GDPR right-to-erasure legal memo | **Open** — append-only tree vs. a deletion right. Blocks EU deployment. |
| 3 | Peak RSS + p95 on a ≤3 GB device | **Open** — the measured device is 3.75 GB. Simulated ceiling: passes at 336 MB, OOM at 320 MB. An Android emulator at 2–3 GB (right OS, real memory manager) is scripted (`scripts/wsl_setup_avd.sh`) but was not run here — the build host could not reach the Android SDK endpoint. Evidence, not closure. |
| 4 | IP indemnification / liability structure | **Open** |
| 5 | Trusted-setup ceremony (or transparent-setup migration) | **Open, disclosed** — current keys are evaluation-only. Coordinator built and tested; ceremony not run. |
| 6 | Attester-level revocation | **Closed (v1.1)** — both paths implemented, measured, tested |

Stated falsification criteria, written in advance so they cannot be moved later,
are in [MASTER-SPECIFICATION §8](MASTER-SPECIFICATION.md) and §8 of the paper.

---

## Two tracks

This repository holds two separable bodies of work. A reader can engage with
either without the other.

### Track 1 — the protocol (measured engineering)

The working system: circuits, prover, benchmarks, integration, and the protocol
paper. Everything here is measured on real hardware and reproducible.

- **[paper/proof-of-personhood-without-a-registry.pdf](paper/proof-of-personhood-without-a-registry.pdf)**
  — the protocol paper (v1.2, 28 pages).
- **[MASTER-SPECIFICATION.md](MASTER-SPECIFICATION.md)** — authoritative spec; the
  six gates.
- Code: [`circuits/`](circuits/), [`scripts/`](scripts/), [`web/`](web/),
  [`integration/`](integration/). Verify: [`docs/EVALUATION.md`](docs/EVALUATION.md).

### Track 2 — the theory (impossibility results and an equilibrium)

The theory outgrew the protocol paper and lives on its own. Twelve numbered
results across nine documents, several retractions, all mapped.

- **[docs/theory/THEORY-INDEX.md](docs/theory/THEORY-INDEX.md)** — the map: every
  Theorem / Corollary / Result → source document, status
  (proved / grounding argument / conjecture / narrowed / withdrawn), falsification
  criteria, and the simulation that measured it. **Start here.**
- **[docs/theory/PAPER-limits-of-proof-of-personhood.md](docs/theory/PAPER-limits-of-proof-of-personhood.md)**
  — the theory paper draft: *Three Impossibility Results and an Equilibrium*.
- **[docs/theory/](docs/theory/)** — the nine source notes (Theorems 1–12, the
  Trilemma, the equilibrium, the mechanism-design results).
- **[scripts/sim/](scripts/sim/)** — the simulations. Every theory number cited to
  a script; outputs under [`docs/self-audit/sim_*`](docs/self-audit/).

```bash
for s in scripts/sim/*.mjs; do node "$s"; done   # regenerate every measured number (~3 min)
```

The one ecosystem finding worth a stranger's time on its own:
**[docs/DISCOVERY-lessthan-hash-soundness.md](docs/DISCOVERY-lessthan-hash-soundness.md)**
— circomlib `LessThan(252)` silently certifies `p−1 < 1` on hash outputs;
reproducer `scripts/repro_lessthan_hash.mjs`; filings drafted in
[`docs/filings/`](docs/filings/).

---

## Verify this yourself in under an hour

Don't trust the prose. The full reviewer walkthrough is
[**docs/EVALUATION.md**](docs/EVALUATION.md); this is the short version.

```bash
npm install                                   # pinned toolchain: Node 24.14.0, circom2 0.2.23, snarkjs 0.7.6
node scripts/build.mjs                        # compile + Groth16 setup + self-verified inputs (~18 min)

node scripts/repro_build.mjs --double         # A: two clean builds are byte-identical
npm test                                      # B/C/G: 75 assertions across 7 suites (below)
node scripts/bench_node.mjs                   # constraint counts + desktop prove times, every circuit
node scripts/test_soundness_adversarial.mjs   # G: 27 adversarial checks incl. null-space-directed Layer C
```

`npm test` runs, in order: `test_rln_burn` (15) · `test_root_consistency` (11) ·
`test_revocation` (9) · `test_soundness_adversarial` (27) · `two_witness_search` ·
`xengine_split_check` · `integration/run` (13).

| track | what it proves | time |
|---|---|--:|
| A — reproducible build | the deployed prover **is** the audited source, byte for byte | 10 min |
| B — circuit shape | 4,309 constraints, exactly 7 public signals, `C` never public, no signature gadget in the login circuit | 10 min |
| C — integration | real OIDC + W3C VP over real HTTP with real proofs; `sub` pairwise and `epoch_action`-scoped | 5 min |
| D — phone performance | the on-device numbers reproduce (needs an Android + `adb`) | 20 min |
| E — cross-engine equivalence | snarkjs / C++→WASM / rapidsnark all verify against one vkey, identical public signals | 5 min |
| F — revocation & multi-source roots | Gate 6 both paths; client fails closed on root disagreement or below quorum | 10 min |
| G — soundness self-audit | 27 adversarial checks (incl. null-space-directed) rejected; two-witness search at 56 points finds no defect in the deployed circuit; 9 IsZero freedoms proved benign; circomspect clean; Picus unvalidated as an oracle here | 10 min |

## Read this first

- **[paper/proof-of-personhood-without-a-registry.pdf](paper/proof-of-personhood-without-a-registry.pdf)**
  — the public research paper (v1.2, 28 pages): the problem, the construction, the
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
  DISCOVERY-redundancy-heuristic.md   standalone note: exploitable under-constraints cluster at non-redundantly-determined signals
  self-audit/             raw analyzer output + forward-determination, two-witness, taint, FF-SMT results
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

## Citing this work

Author: **Rehan Malik** ([github.com/rehanmalik2008](https://github.com/rehanmalik2008)).
The construction, circuits, and paper are original work; see [AUTHORS](AUTHORS).

Cite with [`CITATION.cff`](CITATION.cff) — GitHub renders a "Cite this repository"
button from it. It carries the software entry plus a `preferred-citation` for the
paper. A permanent archival record (arXiv, and a Zenodo DOI cut from a GitHub
release) is planned; once minted, its identifier goes in `CITATION.cff` and here.

The first public, timestamped release is **v1.1 (2026-09-04)** — git history and
the [GitHub release](https://github.com/rehanmalik2008/Proof-of-Personhood/releases/tag/v1.1)
are the verifiable record. This repository and the paper are a public disclosure
and constitute prior art for the construction (see [NOTICE](NOTICE)).

## License

Apache-2.0, with the §3 patent grant. Copyright 2026 Rehan Malik. See
[LICENSE](LICENSE) and [NOTICE](NOTICE). This licence choice is committed
irrevocably in MASTER-SPECIFICATION §7: no BSL, no SSPL, no future relicense.
