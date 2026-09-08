# Two-witness search — results

Tool: `scripts/two_witness_search.mjs`. Ground truth for under-constraint (note §4):
a circuit is under-constrained at a signal if two distinct satisfying witnesses
exist that agree on every circuit INPUT and differ at that signal. Method:
Jacobian nullspace at the honest witness + exact nonlinear re-check of every
nullspace direction against the full R1CS. **Bound:** a second witness reachable
only by a large nonlinear jump with zero linear component is not covered; absence
of a found second witness is weaker evidence than a found one.

"Public signal" = a public output (indices 1..nPubOut); every input is held fixed.
A second witness that moves a public signal is a definite soundness bug. One that
moves only non-public signals is listed and left for manual classification.

## Task 2 — the deployed circuit, unmutated

| circuit | opt | constraints | rank / free | nullity | moves a public signal? |
|---|---|--:|--:|--:|---|
| `wedge_mem_w8_d9_split` (deployed) | O2 | 4,309 | 4,281 / 4,290 | 9 | **NO** — `N`, `y` determined |
| same | O1 | 11,921 | 11,893 / 11,902 | 9 | **NO** — `N`, `y` determined |

The 9 nullspace directions are all `main.mk.eq[i][0].isz.inv` — the `inv` witness
hint inside the `IsZero` gadget of each Merkle-path `IsEqual` comparator, free
precisely because the comparator input is 0 (`pathIndex[i] == 0` for slot 0). This
is the well-known benign internal freedom of `IsZero`: `out` is still forced to 1,
no public signal reads `inv`. Same 9 in the O1 build. **No exploitable
under-constraint in the pristine deployed circuit, within the search bound.**
Consistent across two optimisation levels, and agrees with Picus and the
adversarial harness.

## Task 3 — a constructed under-constrained mutant (`y <--`)

Downgrade the RLN binding `y <== s + a1x` to `y <-- s + a1x` in `ResidualSplit`.

| build | nullity | verdict |
|---|--:|---|
| y-free, O2 | 10 (9 benign + 1) | **`main.y` UNDER-CONSTRAINED — second witness moves a public signal** |
| y-free, O1 | 10 | same |

The extra nullspace direction over the pristine 9 is exactly `main.y`. The second
witness (honest witness with `y` changed) satisfies the full nonlinear R1CS. A
free `y` means the RLN Shamir share is not pinned to `s + N*signalHash`, so two
proofs in one `(ctx, epoch_action)` window no longer reconstruct `s` — **burn
evasion**. `main.N` stays determined.

## Task 5 — filtered mutation denominator

Of the ten mutants from `mutation_test.mjs`, which are genuine signal-level
under-constraints — a second witness moving a public signal, at fixed honest
inputs?

| mutant | injected bug | two-witness verdict | genuine soundness mutant? |
|---|---|---|---|
| **M1a** | `N <== hN.out` → `<--` | `main.N` (with `a1x`, `y`) under-constrained; second witness moves `N` and `y` | **YES** |
| M1b | `C <== hC.out` → `<--` | `C` stays pinned by the Merkle path vs. the public `root`; `N`, `y` determined; only the 9 benign `IsZero.inv` dirs | no — over-determined |
| M2 | `selAcc[i][W] === 1` deleted | equivalent mutant (behavioural test, round 3): accepts/rejects identical witnesses | no |
| M3 | `root === cur[depth-1]` | honest input does not satisfy the mutant (`wtns.calculate` throws); wrong-tree-level bug, not a signal freedom | no |
| M4a | `ctx` dropped from nullifier hash | `N`, `y` determined (a different, still-deterministic function) | no |
| M4b | `epoch_action` dropped | not individually run; same structural class as M4a (determined expression → determined expression) | no (reasoned) |
| M5 | `epoch_action` aliased to `epoch_tree` | same class as M4a | no (reasoned) |
| M6 | `a1x <== N * N` | same class as M4a | no (reasoned) |
| M7 | non-membership `diff*inv === 1` deleted | `N`, `y` determined; only benign `IsZero.inv` dirs. M7 widens the accepted INPUT set (a revoked `C` now proves) — caught by harness A8/B5, not a signal freedom | no |
| M8 | EdDSA `enabled <-- 0` at enrolment | `C`, `N`, `y` determined; 9 benign dirs (elimination completed at `--maxfill 4000`, max fill 1361, 178 s). M8 widens the accepted INPUT set (arbitrary signatures accepted) — caught by harness A10/A11 | no |

**Filtered denominator = 1** (M1a). Everything else is either an equivalent
mutant, a wrong-but-deterministic function, or an input-set widening — none of
which the two-witness definition (fixed honest inputs, second witness at a signal)
targets, and two of which (M7, M8) are real bugs the *adversarial harness* catches
by trying bad inputs.

### Detection over the filtered denominator (n = 1)

| method | M1a |
|---|---|
| circomspect | **caught** — but syntactically (flags any `<--`), not by reasoning about exploitability |
| adversarial harness | **missed** — 24/24 pass; its Layer-B tests perturb one witness index at a time and never do the coordinated `(a1x, N, y)` move |
| Picus | **no verdict** — see Task 4 |
| two-witness search | **caught** (this is what it is for) |

So the honest filtered detection rate is: of the one proven soundness mutant among
the ten, the syntactic linter caught it, the behavioural harness missed it, and
the solver produced no verdict. The unfiltered "9 of 10" counted signals produced
by nine mutants that are mostly not exploitable.

## The over-determination finding (note §3), now measured

Removing a single binding constraint from this circuit frequently does **not**
create an exploitable weakness because signals are redundantly determined:

- `C` (M1b): pinned by the Merkle path against the public `root` even with its own
  assignment downgraded.
- `pathIndex` range check (M2): redundant against the slot-selection constraint
  `dotAcc[i][W] === cur[i]` (no slot selected ⇒ dot product 0 ⇒ a Poseidon output
  would have to be 0).
- The 9 `IsZero.inv` freedoms in every build: benign by construction — `out` is
  still forced, `inv` feeds nothing a public signal reads.

The signal that turned out **not** redundantly determined is the RLN share on the
`ResidualSplit` line: `y` (M1a: `N`, and the whole `(a1x, N, y)` line). That is
exactly where note §3 predicted a real vulnerability would have to live — a signal
with one determining constraint and no other.

## Task 4 — validating Picus as an oracle on this circuit

Picus decides *unique determination of outputs from inputs*. It has never been
shown to detect a genuine under-constraint **in a circuit of this size and
structure**, which is what makes the §7.3 clean result an unvalidated oracle.
Tests, all with Racket 9.3 on PATH; crash/timeout treated as no-verdict, never as
detection:

| target | constraints | Picus result | time | exit |
|---|--:|---|--:|--:|
| self-test: `out <-- x*2`, nothing constrained | 2 | **UNDERCONSTRAINED** — prints both witnesses (`out: 0` vs `out: 1`) | ~2 s | 9 |
| `wedge_mem_w8_d9_split` pristine (O2) | 4,309 | properly constrained | ~35 s | 8 |
| `wedge_mem_w8_d9_split` pristine (O1) | 11,921 | properly constrained | ~35 s | 8 |
| **`rs.r1cs`**: `Poseidon(3)` + RLN line, output `y` downgraded to `<--` (provably free) | ~150 | **Cannot determine whether the circuit is properly constrained** | ~11 s | 0 (unknown) |
| **y-free mutant (O2)**, `main.y` proven under-constrained by two-witness search | 4,309 | **no verdict** — ran past a 15-minute wall-clock cap, then terminated | >900 s | — |
| **y-free mutant (O1)** | 11,920 | **no verdict** — same, >15 min | >900 s | — |
| **M1a mutant** (round 3) | 4,309 | **no verdict** — one internal crash, one >7-minute cap | — | — |

**Reading.** Picus correctly flags a blatant 2-signal under-constraint. It cannot
flag a real Poseidon+RLN circuit with a free output — it returns *unknown* on the
small version and does not terminate on the full one. Its deduction does not
appear to propagate uniqueness through the Poseidon permutation.

**Consequence for §7.3.** The pristine circuit's `properly constrained` verdict
(exit 8, ~35 s) is a claim by a procedure that returns *unknown* or does not
terminate on known-under-constrained circuits of the same structure. It should
carry weight only as **one of two independent methods that agree** (the
tool-independent two-witness search reaches the same "no observable second
witness" conclusion on the pristine circuit). Picus alone is **not a validated
under-constraint oracle for this circuit**, and the paper is being changed to say
so. This is note falsification criterion 2.
