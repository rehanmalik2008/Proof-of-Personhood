# Self-audit: adversarial soundness review of the deployed circuits

**Status:** self-audit, not an audit. "Audit" is a term of art for independent
third-party review; none has happened. **Gate 1 (>=2 independent circuit audits)
stays `Open`.** This document strengthens the *evidence* for constraint-system
soundness; it does not substitute for external review, and it is not a claim that
the system is unbreakable. No cryptographic system can make that claim.

Program executed: `auditing-yourself-honestly.md`. Date: 2026-09-04.

---

## 0. Why this exists (the gap being attacked)

The repository has 48 passing tests. **Every one of them drives the honest
prover**: it feeds a well-formed input to the witness generator and checks the
output. That is strong evidence for correct execution and honest-path behaviour.
It is **zero** evidence for *soundness against a malicious prover*.

An under-constrained signal is a signal the constraint system does not fully
pin down. It is invisible to honest-path testing because the honest generator
never chooses the bad value. A malicious prover that hand-builds a witness can.
The result is a proof that **verifies** for a statement that is **false** — the
ZK equivalent of a silently exploitable memory-safety bug.

This program attacks exactly that surface: static analysis of the constraint
system, a manual footgun pass, and an adversarial witness harness that
constructs the witnesses an honest generator never would and checks the circuit
rejects them.

**This document was written across several rounds.** Sections 1-10 are the
original program (`auditing-yourself-honestly.md`). Section 11 is later work:
mutation testing (`closing-what-code-can-close.md`), a tool-independent
two-witness search (`what-the-mutation-test-proved.md`) that revised two of the
earlier claims, then multi-point probing, a taint proof and compositional
verification (`after-the-oracle.md`, section 11.6), a finite-field SMT encoding
(`the-last-technical-frontier.md`, section 11.7), and finally a **linear-time
structural forward-determination walk** that makes the determination result
solver-independent and unconditional (`the-structural-argument.md`, section 11.8).
**Read section 11 before trusting the summary below.**

**Result summary, as qualified by section 11:** the deployed circuit is **proven
uniquely determined** — **every signal, and both public outputs, is pinned by the
constraints except 72 `IsZero` `<--` hint signals proved to influence no public
output** (section 11.8, `forward_determination.md`; solver-independent, no
`Poseidon` assumption, no linearization bound, no probe count; corroborated by
three prior methods). Unique determination is **one** soundness property. It does
**not** establish that the circuit computes the intended function — nullifier
correctness, the RLN burn semantics, logic errors in *what* is constrained — which
is what an external audit additionally checks. This makes an audit faster and
better-targeted; it does not predict its outcome, and it does not close Gate 1.

- **Forward-determination** (`scripts/forward_determination.mjs`, section 11.8):
  a linear-time structural walk of the constraint graph. On an `--O1` build of
  the deployed circuit, every signal is uniquely determined by division except
  the 72 `IsZero.inv` `<--` hints; **`N` and `y` are determined** with no solver
  and no assumption. Cross-checks with the null-space search (the 9 free at the
  deployed witness are exactly the 9 null-space directions). This is the primary
  determination result; the three below corroborate it.
- **Two-witness search** (`scripts/two_witness_search.mjs`, sections 11.4b / 11.6):
  on the deployed circuit, no second satisfying witness moves a public output,
  within a stated bound (linear null space plus exact non-linear re-check) — now
  run at **56 structurally diverse honest witnesses** with a stable null-space
  dimension of 9 and no public-output move at any point. The `IsZero`-hint
  freedoms are **proved benign** by a taint analysis (`scripts/taint_iszero.mjs`),
  not merely explained. A compositional argument
  (`scripts/compositional_verify.mjs`) reduces the whole-circuit question to the
  single assumption that circomlib `Poseidon` uniquely determines its output. On
  the abstraction, a finite-field SMT encoding (`scripts/ff_smt_two_witness.mjs`,
  cvc5+CoCoALib) then proves the two public outputs `N`, `y` **uniquely
  determined with no linearization bound at all** (section 11.7).
- **Picus** (Veridise, SMT): returns *properly constrained* for all six deployed
  circuits. **This is a claim by a tool that could not be shown to detect a known
  under-constraint in a circuit of this structure** (section 11.4c): it returns
  *unknown* on a small Poseidon-plus-RLN circuit with a freed output and does not
  terminate on the full circuit with the same defect. The verdict carries weight
  only next to the two-witness search, which agrees.
- **circomspect** (Trail of Bits): nothing at any level on the instantiated
  entrypoints; two WARNING classes on the symbolic templates, both explained (a
  documented `epochTree` verifier obligation, and the canonical safe inverse-hint).
- **Adversarial harness** (`scripts/test_soundness_adversarial.mjs`, 27 checks):
  each stated property enforced by a constraint a tampered witness cannot satisfy.
  Its old signal-at-a-time layer missed a coordinated multi-signal under-constraint
  (M1a); a null-space-directed Layer C (`scripts/nullspace_harness.mjs`, section
  11.6) now perturbs along the null-space basis and random combinations of it and
  catches that class.

Remaining unverified surface is listed in section 7.

---

## 1. Scope — the circuits actually deployed

| role | entrypoint | template | constraints | nPublic |
|---|---|---|--:|--:|
| Phase-2 login (headline, v1.1) | `circuits/main_mem_w8_d9_split.circom` | `WedgeMembershipWideSplit(8,9)` | 4,309 | 7 |
| Phase-2 login, pre-split (v1.0, benchmarked) | `circuits/main_mem_w8_d9.circom` | `WedgeMembershipWide(8,9)` | 4,309 | 6 |
| Phase-2 + individual revocation (Gate 6) | `circuits/main_mem_w8_d9_split_rev{64,256,1024}.circom` | `WedgeMembershipWideSplitRevoke(8,9,R)` | 4,373 / 4,565 / 5,333 | 7+R |
| Phase-2 + revocation, pre-split | `circuits/main_mem_w8_d9_rev{64,256,1024}.circom` | `WedgeMembershipWideRevoke(8,9,R)` | ~4,373 / 4,565 / 5,333 | 6+R |
| Phase-1 enrolment (one-time, off the hot path) | `circuits/main_wedge_direct_k3.circom` | `WedgeDirect(3)` | 13,099 | 6 |

Sub-templates exercised: `Residual`, `ResidualSplit`, `MerkleWide`, `MerkleBin`
(binary backstop only), `NonMembershipList`, and circomlib 2.0.5 `Poseidon`,
`IsEqual`/`IsZero`, `EdDSAPoseidonVerifier`, `Num2Bits`/`Num2Bits_strict`.

**Explicitly out of scope — present in the tree but NOT deployed:**
`wedge_haggr.circom` templates `EdDSAHalfAggVerify` / `WedgeAggHalf` ("Lever H"
half-aggregate benchmark; its own header states the mod-L binding
`sigma_i == rho_i*hRAM_i` is deliberately omitted for the benchmark, which would
be a soundness hole *if it were deployed* — it is not), `wedge_core.circom`
`Wedge3` (superseded benchmark), `wedge_residual.circom` `WedgeResidual`
(residual-cost benchmark), and the deeper binary variants `d20`/`d27`.

---

## 2. Environment and reproducibility

Static analyzers for Circom are Rust/Racket tools with no Windows build. The host
is Windows 11 with no Visual Studio and only Git-Bash (no C compiler), so the
analysis ran inside the machine's **WSL2 Ubuntu-22.04**, with the repository
bind-mounted read-only-in-practice at `<repo>`.

```
WSL2 kernel           6.6.87.2-microsoft-standard-WSL2
Ubuntu                22.04
rustup toolchain      stable  (rustc 1.98.1)     # Ubuntu's apt cargo 1.75 is too old for circomspect deps
circomspect           0.9.0   (cargo install circomspect)         # Trail of Bits
racket                9.3 [cs] (official installer; Ubuntu's apt racket 8.2 is too old for Picus)
Picus                 commit 138b151 (2024-03-14) (github.com/Veridise/Picus)   # Veridise
z3                     4.8.12   (SMT backend for Picus)
node (host)            24.14.0
snarkjs                0.7.6
circom2 (npm/WASM)     0.2.23
circomlib             2.0.5
```

One command installs both analyzers into a fresh Ubuntu 22.04:
`bash scripts/wsl_install_analyzers.sh`.

Driver scripts committed for re-run:

| script | what it does |
|---|---|
| `scripts/run_circomspect.sh` | circomspect INFO pass over every deployed entrypoint + every template, SARIF out |
| `scripts/run_circomspect_warn.sh` | circomspect WARNING-only summary (the signal-to-noise view) |
| `scripts/wsl_install_analyzers.sh` | one-shot install of circomspect + Racket 9.3 + Picus into a fresh Ubuntu |
| `scripts/run_picus.sh` | Picus SMT pass over every deployed circuit (section 3.2) |
| `scripts/test_soundness_adversarial.mjs` | the adversarial witness harness (host Node, no WSL) |

Raw analyzer output is preserved verbatim under `docs/self-audit/`:
`circomspect_full_run.txt`, `circomspect_<circuit>.sarif` (x9).

Re-run, from the repo root on a Linux box (or WSL):

```bash
cargo install circomspect
bash scripts/run_circomspect.sh          # adjust REPO= path inside if not <repo>/...
bash scripts/run_circomspect_warn.sh
node scripts/test_soundness_adversarial.mjs
```

---

## 3. Step 1 — static analyzers

### 3.1 circomspect 0.9.0 (Trail of Bits) — RAN, full coverage

Command (per circuit):

```
circomspect -L node_modules/circomlib/circuits -l INFO \
  --sarif-file docs/self-audit/circomspect_<c>.sarif circuits/<c>.circom
```

**On the instantiated deployed entrypoints** (`main_*.circom`, concrete
`W=8, depth=9, R, k=3`): **0 findings at every level** (INFO, WARNING, ERROR),
all nine circuits. With template parameters concrete, circomspect resolves the
loop-bound arithmetic to integers and the substantive warnings below do not
survive instantiation (its constraint tracking is precise enough with concrete
`R` to see the non-membership inverse *is* constrained).

**On the symbolic template files** (`wedge_*.circom`, parameters left as
variables), WARNING level:

| file | template | warning | deployed? | disposition |
|---|---|---|---|---|
| `wedge_membership.circom` | `WedgeMembershipWideSplit` | `epochTree` is not used by the template | **yes** | **Not a bug — verifier obligation.** `epochTree` is a prover-supplied, verifier-checked public input with, by design, zero in-circuit constraints (the split adds a public input and a verifier policy, not a gadget; see `splitting-the-epochs.md`). circom keeps a declared public input in the statement vector regardless. The deployment MUST enforce root-freshness on `epochTree` out of circuit (`integration/lib/freshness.mjs`, `THREAT-MODEL.md` section 6). Carried to section 7. |
| `wedge_revocation.circom` | `WedgeMembershipWideSplitRevoke` | `epochTree` is not used | **yes** | same as above |
| `wedge_revocation.circom` | `NonMembershipList` | `<--` does not constrain the assigned signal (`inv[i]`) | **yes** | **Not a bug — canonical safe pattern.** `inv[i] <-- diff[i]!=0 ? 1/diff[i] : 0;` is a witness *hint*; the very next line `diff[i]*inv[i] === 1` fully pins `inv[i]` to the unique multiplicative inverse of `diff[i]`, and is *unsatisfiable* when `diff[i]==0` (i.e. `C == revoked[i]`), which is precisely the intended non-membership enforcement. This is structurally circomlib's own `IsZero` gadget (`inv <-- in!=0 ? 1/in : 0; in*out === 0`), which Trail of Bits' own documentation cites as the safe example. circomspect points its own cursor at the constraining line. Verified adversarially in the harness (check B5). |
| `wedge_haggr.circom` | `EdDSAHalfAggVerify` | `Num2Bits` non-strict (x2: `ScalarLT_L`, `rhoTrunc`); `Poseidon.out` unconstrained (`hram[i]` computed, unused) | **no** | Non-deployed "Lever H" benchmark. Not analysed further for soundness because it never ships. Recorded for completeness. |
| `wedge_core.circom` | `Wedge3` | none at WARNING | no | benchmark only |
| `wedge_residual.circom` | `WedgeResidual` | none at WARNING | no | benchmark only |

INFO-level output is dominated by generic "field element arithmetic could
overflow" / "comparison with field elements greater than p/2" notes that
circomspect emits on essentially every `+`/`-`/`*` and every `<` on a symbolic
bound. On BN254 with the values these circuits carry (Poseidon outputs, small
indices, a 254-bit secret) none corresponds to an actual overflow; they are
awareness notes, not findings. The full list is in
`docs/self-audit/circomspect_full_run.txt` (1,258 lines).

`WedgeDirect(3)` — the deployed enrolment circuit — produces **no WARNING-level
findings**; only the generic INFO notes.

**circomspect limitation, disclosed:** circomspect is a linter with pattern-based
passes. Its own documentation states it "can only annotate a portion of
under-constrained variables." A clean circomspect run is evidence, not proof.

### 3.2 Picus (Veridise) — SMT-based under-constrained detection — RAN, all deployed circuits SAFE

Picus is the tool that most directly targets this program's threat: it uses an
SMT solver (here z3 4.8.12) to decide whether a circuit's constraints *uniquely
determine* every output from the inputs. Its verdicts (`picus/exit.rkt`):
exit **8 = safe** ("properly constrained"), **9 = unsafe** ("underconstrained"),
**0 = unknown** (solver could not decide within the query timeout).

Command (per circuit), from the Picus checkout:

```
./run-picus --solver z3 --timeout <ms> --json <out>.json  build/<circuit>.r1cs
```

**Result — every deployed circuit is `safe` (exit 8, "the circuit is properly
constrained"):**

| circuit | constraints | SMT query timeout | Picus verdict |
|---|--:|--:|---|
| `wedge_mem_w8_d9_split` (headline login) | 4,309 | 30 s | **properly constrained** |
| `wedge_mem_w8_d9_split_rev64` | 4,373 | 45 s | **properly constrained** |
| `wedge_mem_w8_d9_split_rev256` | 4,565 | 60 s | **properly constrained** |
| `wedge_mem_w8_d9_split_rev1024` | 5,333 | 90 s | **properly constrained** |
| `wedge_mem_w8_d9` (pre-split login) | 4,309 | 30 s | **properly constrained** |
| `wedge_direct_k3` (enrolment) | 13,099 | 90 s | **properly constrained** |

No circuit returned *unsafe* or *unknown*; no query timed out. Raw logs:
`docs/self-audit/picus_full_run.txt` and `docs/self-audit/picus_<circuit>.json`.

Install path (`scripts/wsl_install_analyzers.sh`): Ubuntu 22.04's `apt racket` is
8.2, on which Picus (`138b151`) fails to build — it uses `#:do` in
`for/list`/`for/hash` and `make-temporary-directory`, both Racket >= 8.4
(observed errors:
`linear-lemma.rkt:34:13: for/list: bad sequence binding clause at: #:do`,
`tmpdir.rkt:12:18: make-temporary-directory: unbound identifier`). Installing
**Racket 9.3** from the official installer and re-running `raco pkg install`
builds Picus cleanly.

**Picus scope, disclosed:** Picus proves unique determination *modulo its solver
and the per-query timeout*; a `safe` verdict means it found no input-agreeing,
output-disagreeing pair, not a machine-checked proof in a proof assistant. It
analyses the R1CS as compiled (the same `.r1cs` in the reproducible-build lock).
Run without the `.sym` for the `rev256`/`rev1024`/`pre-split` circuits (Picus
warns and partitions inputs/outputs from the R1CS header instead); with the
`.sym` present for `split`, `rev64`, and `enrol` the verdict is identical.

### 3.3 Other tools surveyed

| tool | status | run? | why |
|---|---|---|---|
| **circomspect** (Trail of Bits) | actively maintained | **yes** | section 3.1 — clean on the instantiated entrypoints |
| **Picus** (Veridise) | maintained | **yes** | section 3.2 — every deployed circuit `safe` (properly constrained) |
| **zkFuzz** (Takahashi et al., 2025; ~4,500 LoC Rust) | new research tool | no (not packaged for general install at time of writing) | Its *method* — mutate the witness computation, search for an assignment the constraints still accept that encodes a different output — is exactly what Layer B of the harness does by hand for the signals that carry the security properties. |
| **ZKAP** (Wen et al.) | research artifact | no | No general distribution; its anti-pattern catalogue (unconstrained output, unused signal, dataflow) overlaps circomspect, which ran clean on the entrypoints. |
| **Ecne** (0xPARC) | dormant since ~2022 | no | Julia toolchain absent; its R1CS "unique solution" check is the same question Picus answered `safe` for every deployed circuit, and is further exercised by the Layer-B tamper tests. |
| **AC4 / ConsCS** (academic) | research | no | No packaged release usable here. |
| **snarkjs `wtns.check` / `r1cs info`** | maintained | **yes** | Used inside the harness as the R1CS-satisfaction oracle, and for constraint counts. |

---

## 4. Step 2 — manual footgun checklist, circuit by circuit

Checklist items: `<--` vs `<==` (assignment without constraint); unconstrained
`signal output`; missing `Num2Bits` / range checks; component under-instantiation
(a sub-component input left unwired); signal aliasing (a signal assigned twice or
two names for one wire); and, for this design, the prover-supplied /
verifier-checked public inputs.

### 4.1 `Residual` / `ResidualSplit`  (`wedge_membership.circom`)

```
C <== Poseidon(1)(s)
N <== Poseidon(3)(s, ctx, epoch[Action])
a1x <== N * signalHash
y   <== s + a1x
```

| item | finding |
|---|---|
| `<--` vs `<==` | none — every assignment is `<==` (constraining). |
| unconstrained output | `C`, `N`, `y` each assigned once with `<==` from a determined expression. `C` is wired to `mk.leaf` in the parent and is **never** a `main` output. `N`, `y` are the only public outputs and both are pinned. Harness B1/B3 confirm a tampered `N` or `y` breaks the R1CS. |
| range checks | `s` needs none — any field element is a valid secret; membership (checked) and nullifier determinism (checked) carry the security, not the magnitude of `s`. `ctx`, `epochAction`, `signalHash` are verifier-checked public inputs. |
| component under-instantiation | `Poseidon(1)`, `Poseidon(3)` — all inputs wired. |
| signal aliasing | none; `a1x` is a named intermediate assigned once. |
| verifier obligation | `epochTree` (ResidualSplit's parent) has no in-circuit role; verifier must bind it. `signalHash` must be recomputed and checked by the verifier as `H(nonce || RP)`. Both are in the deployment checklist (`THREAT-MODEL.md` section 6). |

### 4.2 `MerkleWide(W, depth)`  (deployed as `MerkleWide(8,9)`)

```
cur[0] <== leaf
for each level i:
  eq[i][j] = IsEqual(pathIndex[i], j)          for j in 0..W-1
  selAcc[i][W] === 1                            # exactly one slot selected
  dotAcc[i][W] === cur[i]                       # selected slot holds the running hash
  cur[i+1] <== Poseidon(W)(node[i][0..W-1])
root === cur[depth]
```

| item | finding |
|---|---|
| `<--` vs `<==` | none — all `<==`. |
| unconstrained output | no `signal output`; this is a checker. `root` is an input, forced equal to `cur[depth]`. |
| range checks | `pathIndex[i]` is **not** directly bit-constrained, but `selAcc[i][W] === 1` over `IsEqual` outputs (each 0/1, soundly) forces `pathIndex[i]` to equal exactly one `j in [0,W)`, i.e. an implicit range constraint. Harness A4 (out-of-range index `8`) is rejected by this constraint. |
| component under-instantiation | `Poseidon(W)` all `W` inputs wired; `IsEqual()` both inputs wired. |
| signal aliasing | `cur`, `selAcc`, `dotAcc` are arrays, each cell written once in the loop. |
| soundness note | non-selected `node[i][j]` are free witnesses, but they feed `Poseidon(W)` whose output must chain to `root`; forging membership of a `C` not in the tree requires a 9-deep Poseidon(8) pre-image/collision chain. Soundness rests on Poseidon collision resistance — the standard Merkle-in-circuit assumption. Harness A1/A2/A3/A5 confirm the generator rejects a wrong leaf, a forged sibling, a wrong slot, and a forged root. |

### 4.3 `MerkleBin(depth)`  (binary backstop, `wedge_mem_bin_d16` only)

`pathIndices[i] * (pathIndices[i] - 1) === 0` (booleanity constrained);
conditional swap via `d/l/r` all `<==`; `root === cur[depth]`. No outputs, no
`<--`, no under-instantiation. Clean. Not on the primary deployment path.

### 4.4 `NonMembershipList(R)`  (`wedge_revocation.circom`)

```
for i in 0..R-1:
  diff[i] <== val - revoked[i]
  inv[i]  <-- diff[i] != 0 ? 1/diff[i] : 0        # hint
  diff[i] * inv[i] === 1                          # constraint
```

| item | finding |
|---|---|
| `<--` vs `<==` | **the one `<--` in the deployed set.** Safe: `inv[i]` is pinned by `diff[i]*inv[i] === 1` on the next line; unsatisfiable iff `diff[i] == 0` (i.e. `val == revoked[i]`). Identical shape to circomlib `IsZero`. Harness B5 zeroes `inv[7]` and confirms the R1CS is then unsatisfied; harness A8 puts `C` on the list and confirms no witness exists. |
| unconstrained output | none — no `signal output`. |
| range checks | not applicable — exact field (in)equality. |
| component under-instantiation | none — no sub-components. |
| verifier obligation | `revoked[R]` is a **public input** with no in-circuit binding to an authenticated "published revocation list". The verifier MUST ship the authentic list. The source header notes the production alternative (commit the sorted set as one root, prove non-membership against it). Carried to section 7. |

### 4.5 `WedgeDirect(3)`  (enrolment, `wedge_haggr.circom`)

```
C <== Poseidon(1)(s)
N <== Poseidon(3)(s, ctx, epoch)
y <== s + N*signalHash
for each pair (i,j): IsEqual(category[i], category[j]).out === 0
for each attester i: EdDSAPoseidonVerifier(enabled=1, Ax,Ay,R8x,R8y,S[i], M=C)
```

| item | finding |
|---|---|
| `<--` vs `<==` | none in `WedgeDirect` itself. (circomlib `EdDSAPoseidonVerifier` uses `<--` bit hints internally, each followed by constraints; circomlib 2.0.5 is widely reviewed.) |
| unconstrained output | `C`, `N`, `y` each `<==` from determined expressions. `C` is a public output at enrolment by design (the backend inserts it into the tree). Harness B6 confirms a tampered `C` breaks the R1CS. |
| range checks | `S[i]` (signature scalar) is range-checked *inside* circomlib `EdDSAPoseidonVerifier` (`Num2Bits_strict` + `CompConstant` against the subgroup order). No direct `Num2Bits` appears in `WedgeDirect`. |
| component under-instantiation | `EdDSAPoseidonVerifier` — all of `enabled, Ax, Ay, R8x, R8y, S, M` wired; `IsEqual` both inputs wired. |
| signal aliasing | none. |
| design note (not a circuit bug) | the in-circuit diversity check compares **prover-supplied `category[]` labels**, and does not bind them to the attester keys `Ax[i]/Ay[i]`. A prover could pass distinct dummy labels while using three keys from one category. This is documented and deliberate: the **authoritative** diversity check is done by the backend at enrolment, which holds the real keys and categories; the in-circuit check is a cheap belt-and-suspenders. Carried to section 7. |
| note | `y` (an RLN share) is produced at enrolment though enrolment does not rate-limit. It is harmless — one share on a line reveals nothing without a second — but it is dead weight. Not a soundness issue. |

### 4.6 Cross-cutting

- **No `signal output` anywhere in the deployed set is left unassigned.** The only
  outputs are `N, y` (login) and `C, N, y` (enrolment), all pinned.
- **The only `<--` in the deployed set** is the `NonMembershipList` inverse hint
  (4.4), which is immediately constrained.
- **`Num2Bits` (non-strict) does not appear in any deployed template.** The
  non-strict uses circomspect flagged are in the non-deployed `wedge_haggr.circom`
  aggregate path. Deployed bit decomposition happens only inside circomlib
  `EdDSAPoseidonVerifier`, which uses `Num2Bits_strict`.
- **No signal aliasing** was found in any deployed template.

---

## 5. Step 3 — adversarial witness harness

`scripts/test_soundness_adversarial.mjs`, **24 checks, all pass**
(`node scripts/test_soundness_adversarial.mjs`; also wired into `npm test`).

Two techniques:

- **Layer A (input-level):** hand the witness generator an input that violates an
  honest invariant; assert `snarkjs.wtns.calculate` **throws**. A throw means a
  `===` constraint fired during witness computation — the property is enforced.
- **Layer B (witness-level, stronger):** compute an honest witness, flip one
  signal to an adversarial value, re-serialise the `.wtns` (minimal writer in the
  harness, since snarkjs exports but does not import witnesses), then run
  `snarkjs.wtns.check(r1cs, wtns)` **and** `groth16.prove` + `groth16.verify`.
  A properly constrained signal makes **both** fail. A tampered assignment that
  still satisfies the R1CS, or still verifies, would be a genuine soundness bug
  (the signal was under-constrained). This is the zkFuzz methodology applied by
  hand to the signals that carry the paper's claims.

### Layer A — the generator must reject malformed inputs

| check | attack | property defended | result |
|---|---|---|---|
| A1 | `s` bumped so `Poseidon(s)` is not the opened leaf | unforgeability / know-the-secret | rejected at `MerkleWide` line 80 |
| A2 | one Merkle sibling `node[3][5]` altered | path must hash to the published root | rejected at `MerkleWide` line 80 |
| A3 | `pathIndex[2]` flipped to another **in-range** slot | `dotAcc === cur[i]` — running hash must be in the selected slot | rejected at `MerkleWide` line 80 |
| A4 | `pathIndex[4]` set to `8` (arity is 8) | `selAcc[i][W] === 1` — exactly one in-range slot | rejected at `MerkleWide` line 79 |
| A5 | `root` bumped | `root === cur[depth]` | rejected at `MerkleWide` line 85 |
| A6 | `epochTree` set to `999999` | **must be ACCEPTED** — `epochTree` has no in-circuit role | accepted; **and** N, y unchanged (A6b) — confirms the RLN slot binds to `epochAction` only. Surfaces the verifier obligation, not a bug. |
| A7 | `ctx` bumped | must be ACCEPTED; N must differ | accepted; `N@ctx != N@ctx'` (A7b) — cross-context nullifier is context-dependent |
| A8 | `revoked[9]` set to `C` (a genuinely revoked credential) | `(C - r_i)*inv_i === 1` unsatisfiable when `C == r_i` | rejected at `NonMembershipList` line 36 |
| A8b | honest non-revoked input | negative control | proves |
| A9 | two equal `category` labels at enrolment | diversity predicate `IsEqual(...).out === 0` | rejected at `WedgeDirect` line 250 |
| A10 | one attester signature scalar corrupted | `EdDSAPoseidonVerifier` per attester | rejected at `ForceEqualIfEnabled` line 56 |
| A11 | enrolment `s` bumped (breaks the signed message `M = C`) | signatures are over `C = Poseidon(s)` | rejected at `ForceEqualIfEnabled` line 56 |

### Layer B — tampering one signal must break the R1CS and any proof

| check | tamper | property defended | result |
|---|---|---|---|
| B0 | none (honest witness) | baseline | R1CS satisfied **and** proof verifies |
| B1 | `N` := `Poseidon(s', ctx, epochAction)`, `s' != s` | a nullifier cannot be forged for a different secret | R1CS unsatisfied, proof rejected |
| B2 | `N` := `Poseidon(s, ctx+1, epochAction)` | `N@ctx1 == N@ctx2` for one `s` would need a broken constraint (or a Poseidon collision) | R1CS unsatisfied, proof rejected |
| B3 | `y` := `y + 1` | `y === s + N*signalHash` — the Shamir share is pinned to the line | R1CS unsatisfied, proof rejected |
| B4 | `y` := `s'' + N*signalHash`, `s'' != s` (burn-evasion: present a share for a different secret) | the `s` in `y` is the same `s` that forms `C` | R1CS unsatisfied, proof rejected |
| B5 | `NonMembershipList.inv[7]` := `0` | `diff_i * inv_i === 1` forces the true inverse | R1CS unsatisfied, proof rejected |
| B6 | enrolment `C` := `Poseidon(s + 7)` | `C === Poseidon(s)` — the enrolled commitment is bound to the proven secret | R1CS unsatisfied, proof rejected |

### End-to-end — the burn actually works

| check | result |
|---|---|
| E1 | two proofs, same `(s, ctx, epochAction)`, different `signalHash` → **same** `N` (the RLN slot does not fork on `signalHash` or `epochTree`) |
| E2 | the two `(signalHash, y)` points lie on a line whose slope equals the public nullifier `N` |
| E3 | the line's intercept **is the real secret `s`** — double-action in one `(ctx, epochAction)` is self-incriminating, by arithmetic, with no adjudicator |

---

## 6. Step 4 — attack catalogue

For each security property in section 3 (Table 1) of the paper: the strongest
attack constructed, and whether it fails or is recorded as a finding. Trust
assumptions are red-teamed at the end.

### P1 — Sybil resistance  (`gamma >= beta*m*E` plus diversity `D`)

- **Attack:** an economically rational attacker mints identities below the cost
  bound. **Outcome:** out of scope for constraint soundness — this is the
  economic argument in section 4 of the paper, and its own falsification
  criterion (a measured `beta`) is stated as unmet. The circuit's job is to make
  each identity cost `k` independent attestations; the adversarial harness (A9)
  shows the diversity labels must be pairwise-distinct in-circuit, and section
  4.5 records that the *authoritative* `D` check is the backend's. **No circuit
  finding. The economic bound remains unvalidated against a live application
  (Falsification 3).**

### P2 — Unforgeability  (a fabricated `C` has no membership witness)

- **Attack A:** supply a Merkle path for an arbitrary leaf `L` and an `s` with
  `Poseidon(s) != L`. **Result:** rejected — harness A1.
- **Attack B:** supply a path of forged siblings that re-hashes to the real root.
  **Result:** rejected — harness A2; would require a 9-deep Poseidon(8) collision.
- **Attack C:** out-of-range or mis-pointed `pathIndex`. **Result:** rejected —
  harness A3, A4.
- **Attack D (witness-level):** hand-build a witness with the internal Merkle
  `cur[]` chain set to bridge a foreign leaf to the root. **Result:** `wtns.check`
  rejects it (the `Poseidon(W)` output constraints and `root === cur[depth]` are
  not all satisfiable simultaneously without a real opening) — this is the
  general case that B1/B6 instantiate for specific signals.
- **Verdict:** holds against "anyone not breaking the accumulator" — i.e. modulo
  Poseidon collision resistance. **No finding.**

### P3 — Cross-context unlinkability  (`N = Poseidon(s, ctx, epoch_action)`, `C` never revealed)

- **Attack A:** make `N` collide across two contexts for one `s`
  (`N@ctx1 == N@ctx2`). **Result:** rejected — harness B2; `N` is pinned to the
  Poseidon image of `(s, ctx, epoch_action)`, so equality across distinct `ctx`
  needs a Poseidon collision.
- **Attack B:** leak `C` through a public output. **Result:** inspection — `C` is
  wired only to `mk.leaf` and `nm.val`, both internal; it is not in any `main`
  public list for the login/revocation circuits (`.sym` shows
  `main.res.C` folded, witness index -1, no output wire). At **enrolment** `C`
  *is* public by design, and the issuer sees it; the paper states exactly this.
- **Attack C:** the issuer, holding every `C` (enrolment) and every `N` (use),
  links two `N`s to one person. **Result:** requires inverting Poseidon or
  guessing `s`. Not a circuit finding; it is the residual assumption the paper
  states ("cross-context unlinkability holds against the issuer because ... `C`
  never appears in a Phase-2 proof").
- **Verdict:** holds against colluding RPs + issuer, modulo Poseidon
  pre-image/collision resistance. **No finding.**

### P4 — Attester unlinkability  (no attester data in the Phase-2 circuit)

- **Attack:** recover an attester identifier from a Phase-2 proof. **Result:**
  inspection — `WedgeMembershipWideSplit` / `...Revoke` inputs are
  `s, node[][], pathIndex[], root, ctx, epochAction, epochTree, signalHash`
  (+ `revoked[]`). No `Ax/Ay/R8/S`, no category, no attester key anywhere. The
  circuit *structurally cannot* leak attester data because it never receives it.
  This is the strongest form: it holds "against the verifier itself". **No
  finding.**

### P5 — One action per context per `epoch_action`  (nullifier uniqueness; `N` binds to `epoch_action`, not `epoch_tree`)

- **Attack (the `epoch_tree` escape — the model the note points to):** act twice
  in one rate-limit window against two different published tree roots, hoping the
  two proofs carry different nullifiers and evade dedup. **Result:** rejected —
  harness A6/A6b: varying `epochTree` leaves `N` and `y` **bit-identical**. `N`
  depends only on `(s, ctx, epochAction)`. The RLN slot does not fork on
  `epochTree`. `scripts/test_rln_burn.mjs` (15 assertions) is the honest-path
  version; A6/E1 are the adversarial version.
- **Verdict:** holds. **No finding.**

### P6 — Double-use burn  (RLN: two proofs in one `(ctx, epoch_action)` reveal `s`)

- **Attack A:** present two proofs with different `signalHash` but manipulate `y`
  on the second so the two points do **not** determine a line through `s`.
  **Result:** rejected — harness B3 (y off the line) and B4 (y for a different
  secret): `y === s + N*signalHash` is a hard constraint, and the `s` in it is
  the same `s` that forms `C`.
- **Attack B:** present two proofs with **different** `N` for the same `s` so they
  look like two different users and no burn triggers. **Result:** rejected —
  harness B1/B2: `N` cannot be moved off `Poseidon(s, ctx, epoch_action)`.
- **Positive demonstration:** harness E1-E3 recovers the real `s` from exactly
  the pair of proofs an attacker would produce.
- **Verdict:** holds and is self-enforcing. **No finding.**

### P7 — No shared key  (membership replaces any MAC/token bridge)

- This is an architectural property (Phase 2 carries no symmetric secret shared
  with a verifier; the trust root is the proof + published root). Nothing to
  attack at the constraint level. The OP-signature-is-not-the-trust-root point is
  covered by the integration tests (`integration/run.mjs`). **No finding.**

### Trust-assumption red-team

The paper's residual trust is "1-of-N honest root sources" (now an enforced
client-side check, `integration/lib/root_consistency.mjs`). The note asks: what
if the N mirrors are not actually independent?

| shared failure domain | consequence | mitigation status |
|---|---|---|
| **Shared CA** | All mirror TLS certs chain to one CA. A CA compromise (or a coerced issuance) lets an attacker MITM every mirror at once and serve a consistent forged head to a target — the client's cross-check passes, because all N connections are intercepted with the same forgery. **Full eclipse, undefeated in-band** (already disclosed as N6 / paper section 7.2). | **Open, disclosed.** Independence "in trust root" (paper section 6 normative paragraph) is meant to cover this: at least one mirror should be reachable over a path not gated by the same CA (e.g. a public chain RPC with cert pinning, or a source with a pinned key). Not enforced by code. Carried to section 7. |
| **Shared hosting provider** | All mirrors in one cloud/AS. Provider compromise or a legal order to that one provider takes down or rewrites all N. | **Open, disclosed.** Same normative independence clause ("differ in operator, network path"). The `integration/run.mjs` mirrors deliberately share a process and are labelled "one source with three ports" precisely to make this non-independence visible in the reference code. |
| **Shared DNS resolver / registrar** | Poisoning one resolver, or compromising one registrar/parent zone, redirects all mirror hostnames to an attacker. | **Open, disclosed.** Mitigated in practice by using at least one mirror addressed by pinned IP or by a chain whose endpoints are themselves consensus-verified. DNSSEC helps but is not universal. Not enforced by code. |
| **Attester independence (diversity `D`)** | If the `k` "independent" attesters share governance, jurisdiction, or key custody, `k`-collusion is one decision, not `k`. | **Open.** This is Falsification 2 in the paper ("fewer than 3-5 genuinely independent attesters ... the diversity predicate would be theatre"). The in-circuit check (4.5) does not and cannot establish real-world independence. |
| **Timing correlation** | Even with per-proof unlinkability, a network observer who sees a witness refresh then a login from one IP links them. | **Open, disclosed** (paper section 6, N3). Requires the deployment to run refresh on a schedule decoupled from login and to pad download sizes. Normative, not code-enforced here. |

None of these is a constraint-system finding. All are trust-model surface, and
all are already disclosed in `THREAT-MODEL.md` and paper sections 6-7. The
red-team's contribution is to state the concrete mechanism (CA, AS, resolver) by
which "N independent sources" silently collapses to one.

---

## 7. Remaining unverified surface

Explicitly **not** covered by this self-audit:

1. **Independent circuit audit (Gate 1).** Not done. This self-audit reduces the
   probability of an easy finding; it does not replace two independent expert
   reviews. Gate 1 stays `Open`.
2. **A machine-checked proof of unique determination.** Picus returned `safe`
   ("properly constrained") for every deployed circuit (section 3.2), which is a
   solver result over the compiled R1CS, not a proof-assistant artifact: it is
   bounded by z3's decision procedure and the per-query timeout, and no query
   timed out. circomspect is a linter, not a solver. The harness adds an
   independent empirical check of the specific signals that carry the paper's
   properties. Three lines of evidence agree; none is a formal proof.
3. **circomlib 2.0.5 internals.** `Poseidon`, `EdDSAPoseidonVerifier`,
   `Num2Bits_strict`, `IsZero`/`IsEqual` are trusted as-is. They are widely
   reviewed but were not re-audited here.
4. **Verifier / deployment obligations** the circuit deliberately does not
   enforce, each of which must be checked outside the circuit:
   - `epochTree` root-freshness (within the staleness window `w`);
   - `signalHash == H(nonce || RP)` recomputed by the verifier;
   - `ctx` is the correct sector identifier for the relying party;
   - `revoked[R]` is the authentic published revocation list (production: commit
     it as one root);
   - the backend's authoritative diversity `D` check at enrolment;
   - refresh/login timing decoupling and download padding (N3).
   These are in `THREAT-MODEL.md` section 6 and the integration code, but the
   self-audit did not formally verify that code enforces them beyond the existing
   honest-path integration tests.
5. **Trusted setup.** The proving keys are a throwaway single-contribution setup,
   for evaluation only (Gate 5). A compromised setup breaks soundness regardless
   of how well-constrained the circuit is.
6. **The Groth16 verifier contract / snarkjs verifier** itself was not audited.
7. **Full eclipse** of all N root sources (shared CA / host / resolver, section
   6) remains preventable only out-of-band; in-band it is detectable after the
   fact, not blocked.

---

## 8. What this program can and cannot claim

**Can claim:**

- **Picus** (Veridise; SMT, z3 backend) analysed the R1CS of **all six deployed
  circuits** and returned **`safe` — "the circuit is properly constrained"** for
  every one, with no timeouts. Within Picus's decision procedure, every output
  signal is uniquely determined by the inputs.
- **circomspect** 0.9.0 reported **no findings on the instantiated entrypoints**
  and two explained WARNING classes on the symbolic templates (a documented
  verifier obligation on `epochTree`, and the canonical safe inverse-hint
  pattern).
- A **manual footgun pass** over every deployed template found **no unconstrained
  output, no unsafe `<--`, no missing range check, no component
  under-instantiation, and no signal aliasing** on the deployment path.
- An **adversarial witness harness** (24 checks, zkFuzz-style witness mutation)
  demonstrates that **each stated security property is enforced by a constraint a
  tampered witness cannot satisfy** — tested against a malicious prover, not only
  the honest path: unforgeability (A1-A5), cross-context nullifier binding
  (A7, B1, B2), the `epoch_action`-only RLN slot (A6, E1), the degree-1 burn
  (B3, B4, E1-E3), in-circuit non-membership (A8, B5), enrolment commitment
  binding (A11, B6), and the enrolment diversity and signature checks (A9, A10).
- Three independent methods (SMT solver, linter, adversarial harness) agree that
  no under-constrained signal was found in the deployed circuits.

**Cannot claim, and does not:**

- Not "audited". No independent third-party review has occurred.
- Not "impossible to break". No cryptographic system can claim this.
- Not "formally verified". Picus's `safe` is a solver verdict over the compiled
  R1CS bounded by a query timeout, not a proof-assistant artifact; no property was
  discharged in a proof assistant.
- Not a closed Gate 1. Gate 1 requires **two or more independent circuit audits
  before production** and remains `Open`. Strengthening the evidence while keeping
  the gate open is the intended, and the honest, position.

---

## 9. Findings register

| # | source | location | severity | status |
|---|---|---|---|---|
| F1 | circomspect | `wedge_membership.circom` / `wedge_revocation.circom` — `epochTree` unused in `WedgeMembershipWideSplit(Revoke)` | informational | **By design.** Verifier-checked public input, zero constraints. Deployment enforces root-freshness (`freshness.mjs`, `THREAT-MODEL.md` section 6). Not a circuit change. Carried to section 7.4. |
| F2 | circomspect | `wedge_revocation.circom` — `<--` on `inv[i]` in `NonMembershipList` | informational | **Safe pattern.** `inv[i]` is pinned by `diff[i]*inv[i] === 1` on the next line (circomlib `IsZero` shape). Confirmed adversarially (harness B5, A8). No change. |
| F3 | manual review | `WedgeDirect(3)` — in-circuit diversity check is on prover-supplied `category[]` labels, not bound to attester keys | informational | **By design.** Authoritative `D` check is the backend's at enrolment. Documented. Carried to section 7.4. |
| F4 | manual review | `NonMembershipList` — `revoked[R]` is an unauthenticated public input | low (verifier obligation) | Verifier must ship the authentic list; production commits it as one root. Documented in source header. Carried to section 7.4. |
| F5 | Picus | all six deployed circuits | positive result | **`safe` — "properly constrained"** for every deployed circuit (`docs/self-audit/picus_full_run.txt`). Install needed Racket 9.3 (Ubuntu's 8.2 is too old); recipe in `scripts/wsl_install_analyzers.sh`. |
| F6 | manual review | `WedgeDirect(3)` emits an RLN share `y` at enrolment though enrolment does not rate-limit | trivial | Harmless (one share leaks nothing). Dead weight; not a soundness issue. No change. |

**No finding rises to a soundness bug.** Per the program's own framing, a real
bug here would have been a success of the method; none was found, and that is
reported as-is, not inflated.

---

## 10. Reproduction

```bash
# 0. install both analyzers into a fresh Ubuntu 22.04 (WSL or container)
bash scripts/wsl_install_analyzers.sh
#    -> circomspect at /opt/circomspect/bin, Picus at /opt/Picus

# 1. static analysis  (adjust REPO= inside the scripts to your checkout path)
bash scripts/run_circomspect.sh        > docs/self-audit/circomspect_full_run.txt
bash scripts/run_circomspect_warn.sh
bash scripts/run_picus.sh              # expect "properly constrained" x6

# 2. adversarial harness (host, needs Node + the build/ artifacts)
node scripts/test_soundness_adversarial.mjs      # 24 checks

# 3. the honest-path suites this program complements
npm test
```

Expected: `run_circomspect_warn.sh` prints `(no warnings/errors)` for every
`main_*` entrypoint; `run_picus.sh` prints `The circuit is properly constrained`
six times; `test_soundness_adversarial.mjs` prints `24 passed, 0 failed`.

`.sym` files for the three harness circuits are in `build/` (both the source
basename, `main_mem_w8_d9_split.sym`, and a Picus-friendly alias,
`wedge_mem_w8_d9_split.sym`); regenerate with
`circom2 <src>.circom --sym --O2 -o . -l . -l ../node_modules/circomlib/circuits`
from `circuits/`.

---

## 11. Mutation testing: does this process actually catch bugs?

*(added v1.2, `closing-what-code-can-close.md` §1)*

Section 8 claims three methods agree that no under-constrained signal was found.
That is consistent with two different worlds: a genuinely sound circuit, or a
circuit whose bug all three methods happen to miss. Nothing in section 3 or 5
distinguishes them, because **none of those tools had ever been shown to catch a
bug in these circuits.**

Mutation testing distinguishes them. `scripts/mutation_test.mjs` injects a known
bug into a copy of a deployed circuit, compiles it, and asks each method whether
it notices. The output is not "the circuit is sound" but **"here is exactly which
bug classes this process would and would not catch."**

```bash
node scripts/mutation_test.mjs                  # ~90 min; per mutant: compile + 3 analyses
node scripts/mutation_test.mjs --only=M4a --keep
```

Each mutation is applied by exact-string replacement that **throws unless the
anchor matches exactly once**, so a mutation that silently failed to apply can
never be scored as "undetected". That guard caught a real methodology error during
development: two anchors matched both `ResidualSplit` (deployed) and the v1.0
`Residual` template (not deployed), and would have mutated dead code.

### 11.1 The detection-rate table

Full per-mutant detail: [`self-audit/mutation_table.md`](self-audit/mutation_table.md).

Read "caught" as *the method produced a signal*, not as *an exploitable bug
existed*. Section 11.2 shows one mutant is behaviourally identical to the original;
section 11.4 restricts the denominator to the one mutant a two-witness search
proves is a genuine under-constraint (M1a), and reports the detection rate over
that.

| | mutants | caught |
|---|--:|--:|
| **any of the three methods** | 10 | **9** |
| circomspect | 10 | 7 |
| adversarial harness | 10 | 6 |
| Picus | 10 | 0 (see 11.3) |

| mutant | injected bug | circomspect | Picus | harness |
|---|---|---|---|---|
| M1a | `<==` to `<--` on the nullifier `N` | **caught** | inconclusive | missed |
| M1b | `<==` to `<--` on the commitment `C` | **caught** | missed | missed |
| M2 | pathIndex range check `selAcc[i][W] === 1` deleted | missed | missed | missed |
| M3 | root compared against `cur[depth-1]` | missed | missed | **caught** |
| M4a | `ctx` dropped from the nullifier hash | **caught** | missed | **caught** (A7b) |
| M4b | `epoch_action` dropped from the nullifier hash | **caught** | missed | missed |
| M5 | `epoch_action` aliased to `epoch_tree` | **caught** | missed | **caught** (A6b) |
| M6 | RLN share no longer depends on `signalHash` | **caught** | missed | **caught** (E2, E3) |
| M7 | in-circuit non-membership constraint deleted | **caught** | missed | **caught** (A8, B5) |
| M8 | EdDSA verifier disabled at enrolment | missed | missed | **caught** (A10, A11) |

### 11.2 M2 is an equivalent mutant, not a detection gap

M2 was the one mutant no method flagged. Before reporting it as a detection gap it
was tested directly, and **it is not one.**

Removing `selAcc[i][W] === 1` is what should let an out-of-range `pathIndex`
through. It does not. Feeding `pathIndex = 8` and `pathIndex = 99` to the mutant's
witness generator produces exactly the same rejection as the pristine circuit,
from the same template. The surviving constraint `dotAcc[i][W] === cur[i]` already
excludes it: with no slot selected the dot product is zero, which would require the
running Merkle hash to be zero, and a Poseidon output equal to zero is a ~1/p
event.

`selAcc[i][W] === 1` is therefore **defence in depth rather than load-bearing**,
and the mutant accepts and rejects exactly the same witnesses as the original. In
mutation-testing terms it is an *equivalent mutant*, and equivalent mutants are not
detection gaps. The constraint is free after `--O2` linear elimination (both
circuits compile to 4,309 constraints) and **should stay**: it makes the intent
explicit instead of resting on a probabilistic argument.

**Reporting M2 as a surviving mutant would have been wrong**, and the automated
runner did report it that way. What corrected it was a behavioural test, not a
tool.

### 11.3 Picus caught nothing, and mostly that is correct

Picus decides **unique determination of outputs given inputs**. Most of these
mutants leave the circuit perfectly determined and merely *wrong*: a nullifier that
drops `ctx` is still a deterministic function of the inputs. Returning "properly
constrained" for those is Picus behaving correctly inside its stated scope, not a
miss. The same holds for M1b: with `C` unconstrained, the Merkle constraints and
the public `root` still pin it, and the outputs `N` and `y` never depend on it.

Two things are worth recording anyway.

- **Picus's scope is narrower than a reader of section 3.2 might assume.** "All six
  deployed circuits properly constrained" is a real result about under-constraint.
  It says nothing about whether the circuit computes the intended function, and
  nine of the ten bugs here are of the second kind.
- **On the one mutant inside its scope, Picus produced no verdict.** M1a was run
  twice: once it crashed inside `picus.rkt`, once it exceeded a 420 s wall-clock
  cap. Picus is dramatically slower on a circuit that really is underconstrained,
  because it keeps hunting for a counterexample: about 35 s on the pristine
  circuit, still running after 20 minutes on M1a. A tool that cannot answer in
  bounded time on the failure case is a limitation of the method, and is recorded
  as inconclusive rather than as a detection.

### 11.4 M1a: a genuine under-constraint, established only after two wrong intermediate calls

M1a replaces `N <== hN.out` with `N <-- hN.out` in the deployed `ResidualSplit`.
circomspect flags it syntactically. The adversarial harness passes 24/24. Picus
returns no verdict (below).

**This section has been wrong twice. The record is kept visible on purpose.**

- **v1 (round 3, first pass):** inferred from the compiled circuit that the
  nullifier was forgeable and that the harness missed a real bug. Right
  conclusion, but the stated mechanism (single-signal coupling to `y`) was a
  guess.
- **v2 (round 3, retraction):** ran two hand forgeries — `N` alone, and `N`+`y`
  keeping `y - s = N*signalHash` — saw both rejected, and withdrew the claim.
  **This retraction was itself wrong.** The forgeries never perturbed the internal
  product `a1x = N*signalHash`, so they could not have found the second witness
  even though one exists.
- **v3 (this round, two-witness search):** settled by the tool-independent oracle
  `scripts/two_witness_search.mjs`. It computes the Jacobian null space of the
  constraint system at the honest witness and re-checks each direction against the
  full non-linear R1CS. On the M1a mutant it finds a **verified second witness**
  that moves the coordinated triple `(main.res.a1x, main.N, main.y)` — and with it
  the public nullifier `main.N`. `main.N` is under-constrained. The exploit is
  concrete: a free nullifier means one credential yields unlimited distinct
  pseudonyms, defeating the sybil property.

| build | nullity vs pristine | verdict |
|---|--:|---|
| M1a, O1 | 10 (9 benign `IsZero.inv` + 1) | second witness moves `main.N`, `main.y` — **SOUNDNESS BUG** |

The blind-spot claim in v1 is **reinstated**, now with a witness rather than an
inference: the adversarial harness misses M1a because its Layer-B tests move one
witness index at a time, and the second witness requires the three-signal move
`(a1x, N, y)` that keeps every surviving constraint satisfied. `N`+`y` alone
breaks `a1x === N*signalHash`; the harness never tries `a1x`.

### 11.4b The nine other mutants are not signal-level under-constraints

The two-witness search was run against the pristine circuit and every mutant that
could be rebuilt. Results in `docs/self-audit/two_witness_results.md`.

- **Pristine deployed circuit (O2 and O1):** no second witness moves a public
  output. Nine second witnesses exist, all at `main.mk.eq[i][0].isz.inv` — the
  `IsZero` hint, free because its comparator input is 0 and read by no public
  signal. Benign by construction; the same freedom is in circomlib's own `IsZero`.
- **M1b (`C <--`):** `C` stays pinned by the Merkle path against the public
  `root`. `N`, `y` determined. Over-determined, not exploitable.
- **M2:** equivalent mutant (11.2), confirmed behaviourally.
- **M3 (`root === cur[depth-1]`):** the honest input does not satisfy the mutant
  (`wtns.calculate` throws). Wrong-tree bug, not a signal freedom.
- **M4a (`ctx` dropped):** `N`, `y` determined — a different, still-deterministic
  function. M4b/M5/M6 are the same structural class (determined expression to
  determined expression) and are marked reasoned, not individually rebuilt.
- **M7 (non-membership constraint deleted):** `N`, `y` determined; only the benign
  `IsZero.inv` directions. M7 widens the accepted **input** set (a revoked `C` now
  proves) — a different bug class, caught by harness A8/B5.
- **M8 (EdDSA `enabled <-- 0`):** `C`, `N`, `y` determined (elimination completed
  at `--maxfill 4000`, 178 s). Same as M7: input-set widening, caught by A10/A11.

**Filtered denominator = 1** (M1a). Over that one mutant: circomspect caught it
syntactically, the adversarial harness missed it, Picus produced no verdict, the
two-witness search caught it. The unfiltered "9 of 10 produced a signal" counted
mutants that are mostly not exploitable.

### 11.4c Picus could not be validated as an oracle for this circuit

Per note falsification criterion 2. All runs with Racket 9.3 on PATH; crash and
timeout treated as no-verdict, never as detection.

| target | constraints | Picus | time | exit |
|---|--:|---|--:|--:|
| self-test `out <-- x*2` (nothing constrained) | 2 | **UNDERCONSTRAINED**, prints both witnesses | ~2 s | 9 |
| deployed circuit, pristine (O2) | 4,309 | properly constrained | ~35 s | 8 |
| deployed circuit, pristine (O1) | 11,921 | properly constrained | ~35 s | 8 |
| `Poseidon(3)` + RLN line, output `y` freed | ~150 | **Cannot determine** | ~11 s | 0 |
| y-free mutant (O2), proven under-constrained at `y` | 4,309 | **no verdict**, >15 min | >900 s | — |
| y-free mutant (O1) | 11,920 | **no verdict**, >15 min | >900 s | — |
| M1a mutant | 4,309 | **no verdict** (crash + >7 min) | — | — |

Picus flags a trivial under-constraint. It cannot flag a real Poseidon-plus-RLN
circuit with a freed output — *unknown* on the small version, non-terminating on
the full one. Its deduction does not propagate uniqueness through Poseidon.

**Consequence for section 3.2 / paper section 7.3.** The pristine `properly
constrained` verdict is a claim by a procedure that returns *unknown* or does not
terminate on known-bad circuits of the same structure. It carries weight only
as one of two independent methods that agree — the tool-independent two-witness
search reaches the same "no second witness moves a public output" conclusion on
the pristine circuit, within its bound. Picus alone is **not a validated
under-constraint oracle for this circuit**, and the paper now says so.

### 11.5 What this changes, and what it does not

**Changes.** Gate 1's evidence is now a filtered figure, not an unfiltered one. A
two-witness search (`scripts/two_witness_search.mjs`) restricts the mutant
denominator to genuine signal-level under-constraints; exactly one of the ten
qualifies (M1a). Over that one: circomspect caught it syntactically, the
adversarial harness missed it (11.4), Picus produced no verdict, the two-witness
search caught it. The exercise also established that Picus is not a validated
oracle for this circuit (11.4c) and that the circuit is heavily over-determined
(11.4b) — a real property, and the reason most mutants are not exploitable. A
shorter, better-aimed brief for an auditor than "please look at everything": one
known under-constraint class the behavioural and solver methods both miss, and a
solver whose clean verdict here needs the independent search beside it.

**Does not change.** Gate 1 stays `Open`, and after this round is understood as
further from closure than section 3.2 read: its strongest single piece of
evidence (a clean Picus verdict) rests on a tool that could not be shown to detect
a defect in a circuit of this kind. Ten mutants is a small sample chosen by the
author of the circuits. No mutant tested the circomlib primitives or the verifier.
The filtered rate (1 of 1) is not a statement about the probability that the real
circuits are sound.

### 11.6 After the oracle: multi-point, taint proof, compositional verification

Follow-up round (`after-the-oracle.md`). Four strengthenings of the two-witness
result; none closes Gate 1, all make an external audit cheaper and better aimed.

**Multi-point probing** (`scripts/two_witness_multipoint.mjs`,
`docs/self-audit/two_witness_multipoint.md`). The single-point Jacobian null
space is measure zero on the solution manifold. The search was re-run at **56
structurally diverse honest witnesses** of the deployed circuit: leftmost /
rightmost / max-depth / single-level / random path shapes; all-zero / all-maximal
/ random / alternating / `C`-valued sibling vectors; `s`, `ctx`, both epoch
counters and `signal_hash` at random values and at field edges (`0`, `1`, `p-1`,
`p-2`, equal epochs, zero `signal_hash`).

- Null-space dimension is a stable **9 at every one of the 56 points**.
- **No direction moves a public output at any point** (largest entry on any
  public column, over all points: exact `0`).
- Every direction is an `IsZero` inverse hint. The *support* moves with the path
  shape — the freed hint at level `i` is always `eq[i][path_index[i]].isz.inv`,
  0 mismatches over 504 (level, point) pairs — but the *dimension* never does.
- Spectrum question, for an exact field computation: rank over `F_p` is exact,
  there is no near-zero singular value; each of the nine free columns is an exact
  zero column of the Jacobian and every other column is a pivot at every point.

Quantified claim replacing "no under-constraint found": *no second witness with a
non-zero linear component was found at 56 structurally diverse honest witnesses,
across the full R1CS with exact non-linear re-verification*, large-non-linear-jump
bound unchanged.

**Taint proof for the nine hint freedoms** (`scripts/taint_iszero.mjs`,
`docs/self-audit/taint_iszero.md`). "Benign" was folklore; now mechanical. For
each of the nine `eq[i][path_index[i]].isz.inv`:

- null-space support is exactly `{self}`;
- its column in the linearised R1CS is an **exact zero column** (0 non-zero rows)
  — nothing in the system responds to a change in it;
- `w1 + t*delta` for six field multipliers `t` satisfies all 4,309 non-linear
  constraints with `N` and `y` **bit-identical**;
- the transitive closure of the directed constraint-influence relation from the
  hint contains **no public output**. (The undirected co-occurrence graph is not
  used: it connects almost everything through the shared input `s` and through
  `C` entering the tree, and proves nothing.)

All nine: `BENIGN (proved)`.

**Compositional verification** (`scripts/compositional_verify.mjs`,
`docs/self-audit/compositional_verify.md`). Picus does not terminate on the full
circuit; the standard answer is to verify at the module boundary.

- *Layer A* — circomlib `Poseidon` alone (`circuits/poseidon_only_k{3,8}.circom`):
  two-witness search returns null-space dimension **0** at 16 random points for
  each arity; Picus confirms *properly constrained* for arity 3 (does not
  terminate for arity 8).
- *Layer B* — every `Poseidon` in the deployed circuit replaced by a
  determinism-only relation (`circuits/abstract/poseidon.circom`): the 217-
  constraint result has null-space dimension **9**, all benign `IsZero` hints,
  with `N` and `y` determined. Picus still does not terminate even on this.
- *Composition*: given circomlib `Poseidon` uniquely determines its output, the
  deployed circuit's public outputs are uniquely determined by its inputs. This
  does not rescue Picus; it shrinks the circuit-specific check from 4,309
  constraints to 217, resting on one stated, widely-shared, separately-checked
  assumption (Layer A).

**Picus finding packaged for upstream** (`docs/self-audit/picus-upstream-report.md`,
`circuits/poseidon_rln{,_freed}.circom`). A minimal ~262-constraint reproducer:
Picus returns *cannot determine* on a genuine, minimal under-constraint whose
free output is downstream of a `Poseidon` permutation output (the two-witness
search finds the second witness in 0.3 s), and does not terminate on the
realistic version. Draft issue text is in the report; filing it is a maintainer-
contact step, not taken here.

**Null-space-directed adversarial harness** (`scripts/nullspace_harness.mjs`,
wired into `test_soundness_adversarial.mjs` as Layer C). The old Layer B flipped
one signal at a time and provably missed M1a's coordinated `(a1x, N, y)` move.
Layer C perturbs along the null-space basis and 128 random linear combinations of
it, re-verifying each against the full non-linear R1CS — the complete local
candidate set for a first-order violation. On the pristine circuit: 137
perturbations, none moves a public output, all non-public freedoms are `IsZero`
hints. Regression `scripts/nullspace_harness_regression.mjs` rebuilds the M1a
mutant (`--O2`, clean tree) and runs the same probe: null-space dimension **10**
(pristine is 9), the extra direction `basis[0]@main.y` and every random
combination move the public pair `{main.y, main.N}`, `caught = true`. The old
signal-at-a-time Layer B passed all its checks on the same mutant.

### 11.7 Removing the linearization bound: SMT modulo finite fields

`the-last-technical-frontier.md`, Tasks 1-2. Every result up to here is a Jacobian
argument, so each carries the same caveat: a second witness reachable only by a
large non-linear jump with zero linear component is outside it. 56-point probing
repeats a local check. `scripts/ff_smt_two_witness.mjs` removes the bound by posing
the two-witness question exactly, as a satisfiability query over the BN254 scalar
field, and handing it to **cvc5 1.3.4 built with CoCoALib** (`QF_FF`;
`scripts/wsl_setup_cvc5.sh`). Split into one UNSAT check per public output, with
`w1_k != w2_k` encoded by a Rabinowitsch inverse. Full results:
`docs/self-audit/ff_smt.md`.

- **Encoding validated both ways.** Positive control `residual_abstract_freed`
  (`y <--`): cvc5 returns UNSAT for `N` (still bound) and **SAT for `y` with a
  concrete second-witness model**. An UNSAT verdict is therefore genuine unique
  determination, not a spurious inconsistency.
- **Public outputs: unconditional universal proof.** On the residual projection
  (`residual_abstract`, 7 constraints: `N = mockPoseidon(s,ctx,epochAction)`,
  `y = s + N*signalHash`; the Merkle half feeds nothing back per §11.6 taint
  proof), with **every input symbolic**, cvc5 returns **UNSAT in 0.13 s** for
  both `N` and `y`. No linearization, no probe count, no bound: `N` and `y` are
  uniquely determined by `{s, ctx, epochAction, signalHash}`.
- **Full 217-constraint abstraction: exact, per point.** Inputs pinned to an
  honest witness, 6 structurally diverse path shapes: **UNSAT in ~1 s** for both
  outputs at all 6. Removes the *linearization* bound at each point; keeps a
  *point* bound.
- **Full 217-constraint abstraction, fully symbolic: does not terminate.** cvc5
  `gb` runs ~490 s then aborts. The monolithic universal claim is not obtainable
  by direct SMT here (falsification criterion 2 of the note, for that claim).
- **Real `Poseidon`: does not terminate.** `Poseidon(3)` alone (261 con) crashes
  ~463 s; `Poseidon(3)+RLN` (262 con, concrete) crashes ~100 s; `Poseidon(8)`
  (402 con) blows memory past 4-5.7 GB with either FF sub-solver. Same S-box
  ideal that stops Picus. So FF-SMT does **not** make Layer A (§11.6) unconditional
  — Layer A stays an assumption, now known beyond *both* Picus and cvc5-FF.

Net: the linearization bound is removed for the two public outputs (unconditional)
and made point-wise exact for the whole abstraction; it is not removed for the
monolithic universal claim. Gate 1 is unaffected — even a complete determination
proof is one failure mode an audit examines, not the whole of it.

**Merkle-independence lemma (load-bearing for the residual projection).** The
0.13 s universal UNSAT and the residual line of §11.8 both work on the
`ResidualSplit` sub-circuit alone, dropping the Merkle half. That drop is an
explicit lemma, not a convenience: `N` and `y` are functions of
`{s, ctx, epoch_action, signal_hash}` only; the sole signal shared with the
Merkle sub-circuit is `C`, flowing one way (`mk.leaf <== res.C`) into the
opening; nothing flows back. Confirmed mechanically by the directed
constraint-influence closure in `taint_iszero.md`. Full statement:
`docs/self-audit/ff_smt.md`, "Lemma (Merkle-independence of the public outputs)".

### 11.8 Forward-determination: the solver-free determination proof

`the-structural-argument.md`, Task 1. `scripts/forward_determination.mjs`. Picus
and cvc5-FF fail identically on real `Poseidon` because both attack a *structural*
property *semantically* and pay the `x^5` S-box ideal cost. Forward-determination
walks the constraint graph instead: seed `determined := {const} ∪ {inputs}`;
to fixpoint, any constraint `(A·w)(B·w) = (C·w)` that is affine in the
undetermined signals (A·w, B·w determined, or one of A/B a literal constant) with
exactly one undetermined signal of invertible coefficient determines that signal
by division. Linear-time, no solver, no field reasoning.

- **Run on an `--O1` build of the deployed circuit** (11,921 constraints; `--O2`
  fuses constraints and destroys triangularity — on O2 the pure walk still
  determines `N` and `y` but stalls on 2,942 Poseidon-internal signals, a
  representation artefact). Same circuit, same function, same public interface.
- **Phase 1 (pure forward substitution): 11,720 / 11,990 signals** determined in
  0.5 s. Stalled: 72 `IsZero.inv` + 72 `IsEqual.out` + 63 `selAcc` + 63 `dotAcc`
  — the Merkle comparator machinery.
- **Phase 2 (circomlib `IsZero` `out` closure):** `IsZero` pins `out` by a
  case-split (`out = [in == 0]`, unique in both branches) which forward
  substitution does not perform. Closing the 72 `out` with that proven property
  of the verified gadget (a cited lemma, labelled as such, not a substitution
  step), then re-running, leaves **72 stalled signals, every one a
  `main.mk.eq[i][j].isz.inv`** — the genuine `<--` hints that no constraint pins.
- **Both public outputs `N` and `y` are DETERMINED** (Phase 1, no gadget lemma
  needed — their cone is the triangular `ResidualSplit` Poseidon). Solver-free,
  linear-time: no `Poseidon` assumption, no linearization, no probe count.
- **Falsification #3 — MATCH.** The Jacobian null-space search finds exactly 9
  free directions at the deployed witness, all `eq[i][0].isz.inv`; those are
  precisely the structurally-free `inv` whose `IsZero` input is 0 at that witness.
  The two methods agree.
- **`M1a` detection:** `<--` = a signal no constraint determines = never enters
  the set. On an `N <-- hN.out` mutant, `main.N` (a public output) appears in the
  stalled set and the script exits non-zero. Detects the bug class structurally,
  in the full circuit, in linear time.

**`Poseidon` determinism, mathematical cross-check** (`compositional_verify.md`,
recorded as a cited design property): `x ↦ x^5` is a bijection on the BN254
scalar field because `p ≡ 2 (mod 5)` ⇒ `gcd(5, p−1) = 1` (the reason `α = 5` was
chosen); the MDS layers are invertible; round-constant adds are translations; so
the permutation is a composition of bijections, injective. Not a machine-checked
proof — but an independent argument for the same assumption that §11.8's
structural walk discharges directly.

**Bottom line.** With §11.8 the circuit is **proven uniquely determined** — every
signal is pinned by the constraints — which is one soundness property, established
unconditionally and without a solver. An external audit additionally checks what
determination does not touch: that the circuit computes the *intended* function —
nullifier correctness, the RLN binding semantics the burn requires, and logic
errors in *what* is constrained. Determination establishes none of that and does
not predict an audit's outcome; it makes the audit faster and better-targeted (a
reviewer can skip re-deriving that the constraints pin the signals). The soundness
work is finished to the limit of what one team can establish about its own code.
**What remains for Gate 1 is independent human review of everything the circuit
does, and no further code provides it.**
