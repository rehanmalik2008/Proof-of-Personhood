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

**Result summary:** no soundness bug was found.

- **Picus** (Veridise; SMT-based under-constrained detection) returns **"the
  circuit is properly constrained"** (exit code 8 = *safe*) for **all six
  deployed circuits** — the split login circuit, all three split revocation
  variants, the pre-split login circuit, and the 13,099-constraint enrolment
  circuit. No timeouts, no *unknown*. This is a solver result that every output
  signal is uniquely determined by the inputs, not a linter pass.
- **circomspect** (Trail of Bits) reports **nothing at any level on the
  instantiated entrypoints**, and two WARNING classes on the parameter-symbolic
  templates, both explained below with reasoning (one is a documented verifier
  obligation on `epochTree`, one is the canonical safe inverse-hint pattern).
- The **adversarial harness** (`scripts/test_soundness_adversarial.mjs`, 24
  checks) shows each stated security property is enforced by a constraint that a
  tampered witness cannot satisfy, tested against a malicious prover.

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
bind-mounted read-only-in-practice at `/mnt/d/BREAKTHROUGH/sybil-wedge-bench`.

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
bash scripts/run_circomspect.sh          # adjust REPO= path inside if not /mnt/d/...
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
