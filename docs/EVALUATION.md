# Evaluation quickstart

For a technical reviewer landing cold. Goal: **independently verify the core
claims in under an hour**, on your own machine, without trusting this repo's prose.

The authoritative claims are in [`../MASTER-SPECIFICATION.md`](../MASTER-SPECIFICATION.md).
This document tells you how to check them. Where you cannot check a claim from this
repo alone, that is stated explicitly at the end.

## Time budget

| track | verifies | needs | ~time |
|---|---|---|--:|
| A — reproducible build | the deployed prover *is* the audited circuit (byte-identical) | Node ≥ 18 | 10 min |
| B — circuit shape & privacy | 4,309 constraints, exactly 7 public signals, RLN burn binds to epoch_action, no signature gadget, `C` never public | Node | 10 min |
| C — integration is drop-in | OIDC + W3C VP wrap, real HTTP + real proofs, pairwise & epoch_action-scoped `sub` | Node | 5 min |
| D — phone performance | the MASTER-SPEC §4 numbers reproduce | an Android phone + `adb`, or nothing (desktop bracket) | 20 min |
| E — cross-engine equivalence | snarkjs / C++→WASM / rapidsnark proofs all verify against one vkey with identical public signals | Node (+ phone for on-device) | 5 min |
| F — revocation & multi-source roots | Gate 6 both paths (in-circuit non-membership `+R` measured; incremental bulk rebuild measured); client fails closed on root disagreement / below quorum | Node | 10 min |
| G — soundness self-audit | **structural forward-determination** proves every signal + both public outputs uniquely determined except 72 `IsZero` `<--` hints (no solver, no assumption, no linearization); corroborated by a 56-point two-witness search (9 free == 9 hints free at the deployed witness), a taint proof, and a finite-field SMT proof; 27 adversarial checks rejected; circomspect clean; Picus and cvc5-FF both stall on real `Poseidon` | Node (+ Rust/Racket/cvc5/WSL) | 30 min |
| H — mutation testing | filtered by two-witness search: 1 of 10 mutants is a genuine under-constraint (M1a, a freed nullifier the old harness layer missed and the null-space-directed layer catches) | Node + WSL analyzers | 90 min |
| I — ceremony coordinator | sequential MPC pipeline rejects replay, fork, rollback, corruption, double-contribution and garbage | Node | 10 min |
| J — simulated memory ceiling | Gate 3 supporting evidence: prover passes at 336 MB, OOM at 320 MB. Android-emulator path (2–3 GB, real OS) scripted but not run here — no SDK-endpoint access (`gate3_android_emulator.md`) | Linux/WSL + root (cgroup v2) | 15 min |

Prereq once: `npm install` (toolchain is pinned — Node `24.14.0`, `circom2`
`0.2.23`, `circomlib` `2.0.5`, `snarkjs` `0.7.6`; see `package.json` `engines` and
`supply-chain/artifacts.lock.json` `toolchain`).

---

## Track A — the build is the audited circuit

```bash
node scripts/repro_build.mjs --double     # build twice, assert byte-identical
node scripts/repro_build.mjs --verify     # build once, check every hash against the lock file
node scripts/circuit_freeze.mjs           # v1.2 freeze: source/r1cs/constraint hashes vs artifacts.lock.json (CIRCUIT-FREEZE.md)
```

- `--double` proves the circom compile and the Groth16 `setup` are **deterministic**
  (two clean builds produce byte-identical `.r1cs`, `.wasm`, and pre-ceremony
  `_0.zkey`).
- `--verify` compares those hashes to `supply-chain/artifacts.lock.json`. The lock
  covers the headline `wedge_mem_w8_d9_split` (v1.1, `r1cs` `fbd04ecd…`,
  `wasm_prover` `f016efcf…`) and the pre-split `wedge_mem_w8_d9` (`r1cs`
  `b6f46f8f…`, `wasm_prover` `d5b327cc…`).
  - cross-check against `supply-chain/ARTIFACTS.sha256` and against
    `sha256sum web/wedge_mem_w8_d9_split.wasm` (the file actually served).
- **What is *not* reproducible:** `_final.zkey` (per-circuit ceremony entropy). It
  is *verified* instead — `snarkjs zkey verify` against the `.r1cs` + ptau. The
  spike's setup is a throwaway single contribution; production replacement is
  `supply-chain/TRUSTED-SETUP.md`. This is MASTER-SPEC §6 gate #5, `Open`.
- The ptau (`build/pot15_final.ptau`, `cfff419a…`) is a **pinned input** with
  documented provenance, not regenerated here.
- SBOM: `npm run sbom` regenerates `supply-chain/SBOM.json` (CycloneDX, 129
  components).

**Pass:** `--double` prints byte-identical for all three artifacts; `--verify`
reports no hash mismatch.

## Track B — circuit shape and the privacy interface

```bash
node scripts/bench_node.mjs               # constraint counts + desktop prove times, every circuit
node scripts/test_rln_burn.mjs            # RLN burn invariant for the split-epoch circuit — 15 assertions
grep -c -iE 'eddsa|EdDSAPoseidonVerifier|BitElementMulAny|EscalarMul' circuits/wedge_membership.circom   # expect 0
```

- **Constraint count.** `wedge_mem_w8_d9_split` = **4,309** (`snarkjs r1cs info
  build/wedge_mem_w8_d9_split.r1cs`). The pre-split `wedge_mem_w8_d9` is
  constraint-identical; the split (v1.1, `splitting-the-epochs.md`) added zero
  constraints and one public signal. MASTER-SPEC §2.
- **No signatures in the login circuit.** The grep above returns `0` — the Phase-2
  circuit compile graph contains no signature-verification gadget. The heavy
  k-signature proof is a *separate* file/artifact (`wedge_direct_k3`, 13,099
  constraints), never composed with Phase-2. MASTER-SPEC §2 "Why membership".
- **Exactly 7 public signals, `C` private.** `web/wedge_mem_w8_d9_split_vkey.json`
  reports `nPublic: 7`. Inspect `circuits/main_mem_w8_d9_split.circom`
  `component main {public [...]}` — the public list is
  `[root, ctx, epoch_action, epoch_tree, signalHash]` plus the two outputs `[N, y]`;
  `C`, `s`, and the whole Merkle path are private witnesses with no output wire.
- **The RLN burn binds to `epoch_action` only.** `test_rln_burn.mjs` proves two
  proofs in one `(ctx, epoch_action)` that cite *different* `epoch_tree` roots and
  recovers `s` from the two RLN shares (the burn fires); it also checks that
  different `epoch_action` values do not collide. This is the one invariant the
  epoch split rests on.

**Pass:** 4,309 constraints; grep returns 0; `nPublic` is 7 with the signals named
above; `test_rln_burn.mjs` prints `ALL GREEN` (15 passed, 0 failed).

## Track C — integration is an SDK + endpoint, not a rearchitecture

```bash
node integration/run.mjs        # spins a real HTTP OP + RP, issues + verifies real proofs
```

- Expect **13/13 assertions pass** (10 OIDC/VP + 3 for the end-to-end multi-source
  root-consistency check: forged mirror → `502`, restored → `200`, below quorum →
  `502`). It exercises: a W3C Verifiable Presentation
  carrying one new `proof.type`; an OIDC flow where the RP receives `sub = N`;
  the two semantics that MASTER-SPEC §5 / THREAT-MODEL N2 call out — `sub` is
  **pairwise** (different, uncorrelatable `sub` per RP) **and scoped to
  `epoch_action`** (rotates each rate-limit window); and the split-epoch
  decoupling — advancing `epoch_tree` alone (a tree republish) does not grant a
  new action and does not rotate `sub`.
- Integration surface is `verifyVP()` (~80 LoC, with two constant-time freshness
  checks) + a `/roots` poll + a `(sub, epoch_action)` dedupe.
  `integration/README.md` has the details.

**Pass:** `13/13`, and the RP code contains no bespoke crypto — only a VP verify call
plus the multi-source root-consistency check.

## Track D — reproduce the phone numbers (MASTER-SPEC §4)

**With an Android phone + `adb` (USB debugging on):**

```bash
node scripts/measure_phone_rss.mjs --load 4 --load-mb 200   # OS peak RSS under memory pressure
node scripts/bench_rapidsnark.mjs                            # native rapidsnark prove time on-device
node scripts/serve.mjs                                       # then open the printed URL in phone Chrome, run the harness
node scripts/collate_results.mjs results/ > DEVICE-MATRIX.md # collate + memory-gate verdict
```

Compare against the committed captures in `results/` and MASTER-SPEC §4:
- `results/rapidsnark-SM-A125F-*.json` — native prove-only **~477 ms warm / 510 ms cold**.
- `results/wasmprover-SM-A125F-*.json` — C++→WASM **~2,467 ms warm / 3,071 ms cold**.
- `results/phone-SM-A125F-*.json` — snarkjs browser prove-only **~3,374 / 5,187 ms**.
- `results/attrib-*-SM-A125F-*.json` — the thread-count sweep behind the
  "gap is codegen, not field arithmetic" finding
  ([research-history/AFTER-THE-BRIDGE-EXP1.md](research-history/AFTER-THE-BRIDGE-EXP1.md)).
- peak RSS **361 MB baseline / 379 MB under 900 MB ballast**, tab survived 20/20.

**Without a phone:** `node scripts/bench_node.mjs` gives the desktop prove-time
bracket for every circuit; the on-device JSONs in `results/` are the record to
audit. Note the device measured (Galaxy A12) is **3.75 GB** — MASTER-SPEC §6 gate
#3 (a ≤3 GB device under load) is `Open`; do not read the A12 memory result as
closure.

**Pass:** your device's numbers land in the same class as the committed captures
(exact values are hardware-specific; the *ratios* — native ≈ 5× faster than
browser prove-only, WASM/native flat ~5× across thread counts — should hold).

## Track E — cross-engine cryptographic equivalence

Every prover engine must produce a proof that verifies against the **same**
verification key with **byte-identical public signals**.

```bash
node scripts/xengine_split_check.mjs      # snarkjs vs C++->WASM on the split circuit, desktop
```

- `xengine_split_check.mjs` proves the split circuit with snarkjs and with the
  rapidsnark-to-WASM prover (Node), verifies both against the 7-signal vkey, and
  diffs the public signals. Group elements differ (Groth16 is randomised); the
  public signals are identical. **Pass:** `PASS: snarkjs and C++->WASM verify
  identically on the split circuit (nPublic 7)`.
- rapidsnark **native** (arm64) needs the A12 and is not re-run for the split
  circuit; it was validated this way on every prior circuit and the equivalence
  argument is engine-independent. On-device: `scripts/bench_rapidsnark.mjs` /
  `bench_wasmprover.mjs` print `proof verifies: true` / `public signals: identical`
  and record it in `results/*.json`.

## Track F — revocation (Gate 6) and multi-source root consistency

```bash
node scripts/test_root_consistency.mjs   # 6 scenarios, 11 assertions — the client-side cross-check
node scripts/test_revocation.mjs         # 9 assertions — both revocation paths
node scripts/bench_revocation_split.mjs  # constraint + prove-time delta of the R-list, vs the 4,309 baseline
node scripts/bench_bulk_rebuild.mjs      # bulk-rebuild broadcast size + client recompute time, measured
```

- **Multi-source root consistency.** `test_root_consistency.mjs` stands up 3 mirror
  endpoints and checks: 3 honest → `ACCEPT`; one serving a forged current root →
  `FAIL_CLOSED_DISAGREEMENT`; one lagging by one epoch but on the leader's hash
  chain (within `w`) → `ACCEPT` (lag is tolerated, disagreement is not); 2 of 3
  unreachable → `FAIL_CLOSED_QUORUM` (default quorum 2-of-3); all 3 forged
  *consistently* → `ACCEPT` (documents the undefeated full eclipse); a source that
  rewrites an earlier epoch's root → `FAIL_CLOSED_DISAGREEMENT` (the head at that
  epoch is not on the leader's chain). Wired into the OP prover and RP verifier;
  `integration/run.mjs` carries the end-to-end version (13 assertions, steps 7–9).
- **Individual revocation (R-list).** `bench_revocation_split.mjs` compiles the
  split circuit with an in-circuit non-membership check against `R` published field
  elements and prints the delta vs. 4,309: **+64 / +256 / +1,024 constraints** for
  `R` = 64 / 256 / 1,024 (exact, not approximate), `nPublic = 7 + R`, prove-time
  delta +21 / +20 / +123 ms on an i7-9850H. `test_revocation.mjs` (a) confirms an
  honest credential proves and a credential placed on the list **cannot** produce a
  witness (`(C−C)·inv === 1` is unsatisfiable).
- **Bulk revocation (tree rebuild).** `bench_bulk_rebuild.mjs` measures a tombstone
  rebuild (revoked leaves → 0, indices not compacted) at 10k / 50k / 200k occupancy
  and 1 / 5 / 10 % revocation: the rebuild broadcast is **9 KB–1.2 MB**, grows with
  revoked×depth not tree size, and is **6–39× smaller** than full republication
  (0.35–7 MB). An unaffected client folds it in in **2.4–5.1 ms** (vs. the 122 ms
  month-offline baseline). `test_revocation.mjs` (b)+(c): after a rebuild that
  revokes one leaf, that client's `clientRefresh` throws and it cannot prove against
  the new root; an unaffected client refreshes query-free and proves.
- Liveness cost of the bulk path (a rebuild interrupts every client for one refresh
  window) is disclosed in MASTER-SPEC §5 and THREAT-MODEL §6.

**Pass:** `test_root_consistency.mjs` 11/11; `test_revocation.mjs` 9/9; the two
benches print the deltas above (measurements are hardware-specific; the constraint
deltas are exact and the broadcast-size ordering — incremental ≪ full — must hold).

---

## Track G — soundness self-audit (the Gate 1 surface)

Every other track drives the **honest** prover. This one drives a **malicious**
one. Full transcript: [`SELF-AUDIT.md`](SELF-AUDIT.md).

```bash
node scripts/forward_determination.mjs        # STRUCTURAL: every signal + N,y determined except 72 IsZero <-- hints; ~5s, no solver
node scripts/test_soundness_adversarial.mjs   # 27 adversarial checks incl. null-space-directed Layer C, host Node
node scripts/two_witness_search.mjs           # tool-independent under-constraint oracle on the deployed circuit
node scripts/gen_input_multipoint.mjs         # 56 structurally diverse honest witnesses
node scripts/two_witness_multipoint.mjs       # ~13 min: the search re-run at all 56 points
node scripts/taint_iszero.mjs                 # mechanical proof the 9 IsZero freedoms are benign
node scripts/build_selfaudit_circuits.mjs && node scripts/compositional_verify.mjs --picus  # Poseidon at the module boundary
bash scripts/wsl_setup_cvc5.sh                # cvc5 1.3.4 + CoCoALib (finite-field SMT), into /opt/cvc5
node scripts/ff_smt_two_witness.mjs circuits/residual_abstract.r1cs   # UNSAT -> N,y uniquely determined, no linearization bound
node scripts/nullspace_harness_regression.mjs # rebuilds M1a, confirms the null-space layer catches it
node scripts/mutation_test.mjs                # ~90 min: 10 injected bugs vs all 3 methods
node scripts/ceremony/test_ceremony.mjs       # 27 assertions: ceremony coordinator + 6 attacks
# Gate 3 simulated ceiling (Linux/WSL, needs root for cgroup v2):
sudo bash scripts/mem_ceiling_test.sh 3072 2560 2048 512 384 336 320
# static analysis (Linux/WSL):
bash scripts/wsl_install_analyzers.sh         # circomspect + Racket 9.3 + Picus
bash scripts/run_circomspect_warn.sh          # WARNING-only signal-to-noise view
bash scripts/run_picus.sh                     # SMT under-constrained detection x6 circuits
```

- **Adversarial witness harness.** `test_soundness_adversarial.mjs` builds 24
  witnesses an honest generator never would. Layer A hands malformed inputs to the
  witness generator and requires a constraint to fire (s ≠ opened leaf; forged
  Merkle sibling; out-of-range / mis-pointed path index; wrong root; a revoked `C`
  attempting non-membership; corrupted enrolment signature; non-distinct diversity
  labels). Layer B takes an honest witness, flips one signal (`N` rebound to a
  different secret or another context; `y` off its line or rewritten for a
  different secret; the non-membership inverse zeroed; the enrolment commitment
  swapped) and requires **both** `snarkjs.wtns.check` and a fresh `groth16` proof
  to fail. Three end-to-end checks recover the real `s` from the two proofs a
  double-actor would produce.
- **Forward-determination** (`scripts/forward_determination.mjs`,
  `forward_determination.md`) — the primary determination result, and the only
  one with no solver. Seed the inputs; to fixpoint, any constraint that is affine
  in the undetermined signals with exactly one unknown of invertible coefficient
  determines that unknown by division. On an `--O1` build of the deployed circuit
  (`--O2` fuses constraints and breaks triangularity): every signal is
  determined except the 72 `IsZero.inv` `<--` hints; **`N` and `y` are
  determined**; runtime ~0.5 s. Linear-time, no field reasoning, so the `x⁵`
  S-box costs nothing — which is why it decides what Picus and cvc5-FF cannot.
  The 9 hints free at the deployed witness are exactly the 9 null-space
  directions the Jacobian search finds (cross-check). Detects the `<--` bug class
  (M1a) structurally: an unconstrained public output never enters the determined
  set.
- **Two-witness search** (`scripts/two_witness_search.mjs`) — a tool-independent
  under-constraint oracle. A circuit is under-constrained at a signal iff two
  distinct witnesses satisfy every constraint, agree on every input, and differ
  at that signal. It takes the Jacobian of the R1CS at the honest witness,
  computes the null space of its non-input columns over the scalar field, and
  re-checks each direction against the full non-linear constraints. On the
  deployed circuit: **no second witness moves a public output**; 9 second
  witnesses exist at the `IsZero` `inv` hint of each Merkle comparator, free
  because the comparator input is 0 and read by nothing observable (the same
  benign freedom is in circomlib). On a mutant with the RLN share freed it finds
  the exploit witness. Bound: linear null space + exact non-linear re-check; a
  defect reachable only by a large non-linear jump is outside it.
- **Multi-point probing** (`scripts/two_witness_multipoint.mjs`, `two_witness_multipoint.md`).
  The single-point null space is measure zero on the solution manifold, so the
  search is re-run at **56 structurally diverse honest witnesses** (leftmost /
  rightmost / max-depth / random path shapes; zero / maximal / random / `C`-valued
  siblings; `s`, `ctx`, both epochs and `signal_hash` at random and at field
  edges). Null-space dimension is a stable **9** at every point; no direction
  moves a public output at any point; each free column is an exact zero column of
  the Jacobian, so there is no near-degenerate determination to report.
- **Taint proof** (`scripts/taint_iszero.mjs`, `taint_iszero.md`). Each of the 9
  `IsZero` freedoms is shown benign mechanically: singleton null-space support;
  exact-zero Jacobian column; six field multipliers along the direction leave all
  4,309 constraints satisfied with `N`, `y` bit-identical; and the directed
  constraint-influence closure from the hint reaches no public output.
- **Compositional verification** (`scripts/compositional_verify.mjs`,
  `compositional_verify.md`). Layer A: circomlib `Poseidon(3)` and `Poseidon(8)`
  are uniquely determining in isolation (two-witness dimension 0 at 16 points
  each; Picus confirms arity 3). Layer B: with every `Poseidon` replaced by a
  determinism-only relation, the 217-constraint circuit is uniquely determined
  (dimension 9, all benign hints). Composed: the deployed circuit's outputs are
  uniquely determined given one stated assumption — circomlib `Poseidon` uniquely
  determines its output.
- **Finite-field SMT** (`scripts/ff_smt_two_witness.mjs`, `ff_smt.md`; cvc5 1.3.4
  built with CoCoALib, `QF_FF` — `scripts/wsl_setup_cvc5.sh`). The two-witness
  query posed exactly, no linearization. On the residual projection of the
  abstraction (`N`, `y`, `Poseidon` mocked), **all inputs symbolic → UNSAT in
  0.13 s** for both outputs: an unconditional universal proof they are uniquely
  determined. Positive control (`y <--`): `N` UNSAT, `y` **SAT** with a model.
  Full 217-constraint abstraction: UNSAT at 6 concrete points (exact, per-point);
  the fully symbolic query does not terminate, and neither does any query over a
  real `Poseidon` (crash / >4 GB memory), the same wall Picus hits.
- **circomspect 0.9.0.** Clean on the instantiated deployed entrypoints (all
  levels). On the symbolic templates, two WARNING classes, both explained in
  `SELF-AUDIT.md` §3.1: `epoch_tree` has no in-circuit constraint (by design —
  verifier-checked; it is a deployment obligation), and the non-membership gadget
  uses the canonical safe inverse-hint pattern (`inv` pinned by the next line).
- **Picus 138b151** (Veridise; SMT, z3 backend). Returns **"the circuit is
  properly constrained"** for all six deployed circuits. **This could not be
  validated as an oracle for this circuit:** Picus flags a blatant 2-signal
  under-constraint (exit 9, prints both witnesses), but on a small Poseidon+RLN
  circuit with an output freed it returns *cannot determine*, and on the full
  circuit with the same defect it does not terminate within 15 minutes (nor on
  the 217-constraint abstraction, nor on `Poseidon(8)` alone). Its *properly
  constrained* verdict counts only alongside the two-witness search, which agrees
  on the deployed circuit. The reproducer and a ready-to-file issue body are
  packaged (`docs/self-audit/picus-upstream-report.md`,
  `picus-upstream-issue.md`); it is not filed — `Veridise/Picus` has issues
  disabled and this environment has no `gh`/token. `SELF-AUDIT.md` §11.4c / §11.6;
  `docs/self-audit/two_witness_results.md`.

**Mutation testing** (`docs/self-audit/mutation_table.md`,
`docs/self-audit/two_witness_results.md`) measures the self-audit's own
detection rate. Ten bug classes are injected one at a time; the two-witness
search then filters the denominator to genuine signal-level under-constraints.
**Exactly one of the ten qualifies — M1a, a freed nullifier that is real and
exploitable.** circomspect catches it syntactically; the old signal-at-a-time
harness layer missed it (its Layer-B tests move one signal at a time; the second
witness needs the coordinated `(a1x, N, y)` move); the null-space-directed
Layer C catches it (`nullspace_harness_regression.mjs`: null-space dimension 10,
the extra direction moves `{N, y}`); Picus gives no verdict. The other nine are
equivalent mutants, wrong-but-deterministic functions, or input-set widenings —
the last of which the adversarial harness does catch by trying bad inputs. The
unfiltered "9 of 10 produced a signal" is not a bug count.

**Pass:** `two_witness_search.mjs` prints `No second witness moved a public signal`
for the deployed circuit; `two_witness_multipoint.mjs` prints `nullity is stably 9`
across 56 points with `largest null-space entry on ANY public column ... 0`;
`taint_iszero.mjs` prints `all 9 proved benign`; `test_soundness_adversarial.mjs`
prints `27 passed, 0 failed`; `run_circomspect_warn.sh` shows `(no
warnings/errors)` for every `main_*` entrypoint; `run_picus.sh` prints `The
circuit is properly constrained` six times (a verdict that, per §11.4c, needs the
two-witness search beside it). **No soundness bug is a result, not a guarantee** —
Gate 1 needs independent review; this work only makes it cheaper and better aimed.

---

## Where the honesty lives

- **Open gaps that block production:** MASTER-SPEC **§6** — now **five** hard gates:
  audits, GDPR erasure memo, ≤3 GB device measurement, IP/liability, trusted-setup
  ceremony. Gate 6 (attester-level revocation) moved to `Closed` in v1.1 — both
  paths implemented, measured, tested (Track F).
- **What is *not* protected:** MASTER-SPEC **§5** (N is personal data; N is not an
  account key; trust is 1-of-N not zero — now an enforced client-side check, still
  not defeating a full eclipse; timing correlation; attester collusion;
  bulk-revocation liveness; credential rental; state-scale adversaries; not
  post-quantum; trusted setup).
- **Falsification criteria stated in advance:** MASTER-SPEC **§8**.
- **Per-parameter failure modes and "what breaks each claim":** THREAT-MODEL.md
  (every security parameter has a "failure mode" row; §"Falsification" lists the
  concrete attacks that would disprove each property).

## What you cannot verify from this repo

- **Circuit soundness** — no independent audit has happened (MASTER-SPEC §6 #1).
  `--double` proves the binary matches the source; it says nothing about whether
  the constraint system is under-constrained. A **self-audit** is in the repo
  (`docs/SELF-AUDIT.md`, Track G): static analysis, a manual footgun pass, and a
  24-check adversarial witness harness, no soundness bug found. That strengthens
  the evidence; it is not independent review and Gate 1 stays open.
- **The economic security parameter β** — never measured against a real
  application (MASTER-SPEC §8 #3).
- **Trusted-setup integrity** — the `_final.zkey` is a throwaway single
  contribution.
- **The ≤3 GB-device memory gate** — the measured device is 3.75 GB.
- **Real-world adoption / shadow-mode behaviour** — none has occurred.
