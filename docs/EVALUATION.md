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
| G — soundness self-audit | Picus (SMT) = *properly constrained* for all 6 deployed circuits; 24 adversarial witnesses all rejected; circomspect clean on the entrypoints | Node (+ Rust/Racket/WSL for the analyzers) | 10 min |

Prereq once: `npm install` (toolchain is pinned — Node `24.14.0`, `circom2`
`0.2.23`, `circomlib` `2.0.5`, `snarkjs` `0.7.6`; see `package.json` `engines` and
`supply-chain/artifacts.lock.json` `toolchain`).

---

## Track A — the build is the audited circuit

```bash
node scripts/repro_build.mjs --double     # build twice, assert byte-identical
node scripts/repro_build.mjs --verify     # build once, check every hash against the lock file
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
node scripts/test_soundness_adversarial.mjs   # 24 adversarial checks, host Node
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
- **circomspect 0.9.0.** Clean on the instantiated deployed entrypoints (all
  levels). On the symbolic templates, two WARNING classes, both explained in
  `SELF-AUDIT.md` §3.1: `epoch_tree` has no in-circuit constraint (by design —
  verifier-checked; it is a deployment obligation), and the non-membership gadget
  uses the canonical safe inverse-hint pattern (`inv` pinned by the next line).
- **Picus 138b151** (Veridise; SMT, z3 backend). Returns **"the circuit is
  properly constrained"** (exit 8 = *safe*) for **all six deployed circuits** —
  the split login circuit, the three split-revocation variants, the pre-split
  login circuit, and the enrolment circuit — with no timeouts. `SELF-AUDIT.md`
  §3.2; raw logs in `docs/self-audit/picus_full_run.txt`.

**Pass:** `run_picus.sh` prints `The circuit is properly constrained` six times;
`test_soundness_adversarial.mjs` prints `24 passed, 0 failed`;
`run_circomspect_warn.sh` shows `(no warnings/errors)` for every `main_*`
entrypoint. **No soundness bug is a result, not a guarantee** — Gate 1 needs
independent review.

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
