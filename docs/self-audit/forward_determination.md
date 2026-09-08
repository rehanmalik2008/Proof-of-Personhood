# Forward-determination (triangularity) analysis — the solver-free determination proof

`scripts/forward_determination.mjs` (the-structural-argument.md, Task 1). The last
technical soundness item, and the only one that needs no solver.

## Why this exists

Picus (deduction over the constraint ideal) and cvc5-FF (Gröbner basis) are two
architecturally unrelated methods, and they **fail identically** — no verdict,
crash, or OOM — on any circuit containing a real `Poseidon`, at a few hundred
constraints. When two unrelated methods fail identically on a small problem, the
problem is being posed in the wrong category. Both ask a **semantic** question
(*does a second solution exist over the field algebra?*) and pay the cost of the
`x⁵` S-box ideal. But unique determination of a forward-computable circuit is a
**structural** property of the constraint graph. Walking the graph once answers
it in linear time, with no field solving.

## Method

`determined := { constant wire } ∪ { every input signal }` (public outputs are
**not** seeded). Then, to fixpoint: for each R1CS constraint `(A·w)(B·w) = (C·w)`,
if — treating already-determined signals as known — the constraint is **affine**
in the undetermined signals (`A·w` and `B·w` both fully determined, or one of
`A`/`B` a literal non-zero constant) **and** it has exactly one undetermined
signal with a non-zero (invertible) coefficient, that signal is **uniquely**
determined by division. Mark it, repeat.

Every division step is cross-checked against the honest witness (`--witness` /
`--wasm`): a mismatch aborts (it would mean the parser or the affine-solve logic
is wrong). The structural verdict does not depend on the witness values.

**`--O1`, not `--O2`.** Forward-determination needs the constraint system to still
mirror witness-generation order. `--O2` *fuses* constraints and destroys that
(on the O2 deployed R1CS the pure pass determines `N` and `y` but stalls on 2,942
Poseidon-internal signals — a representation artefact, not under-constraint). The
script builds an `--O1` copy of the identical circuit (same function, same public
interface, `build/fd-o1/`) and analyses that: 11,921 constraints, 11,990 wires.

## Result

| phase | determined | stalled |
|---|--:|--:|
| **1 — pure forward substitution** | 11,720 / 11,990 | 270: `72 IsZero.inv` + `72 IsEqual.out` + `63 selAcc` + `63 dotAcc` |
| **2 — circomlib `IsZero` `out` closure** (see below) | 11,918 / 11,990 | **72 — every one a `main.mk.eq[i][j].isz.inv`** |

- **Both public outputs `main.N` and `main.y` are DETERMINED** — unique functions
  of the inputs, by pure triangular substitution. No solver, no linearization, no
  probe count, no `Poseidon` assumption. Runtime: **0.5 s**.
- The 72 stalled signals are exactly the `IsZero` inverse hints of the 72 Merkle
  comparators (8 slots × 9 levels). They are `<--` assignments that **no
  constraint determines** — which is the *correct* structural picture: they are
  the genuine circomlib `IsZero` freedom. Nothing else stalls.
- **Falsification #3 — MATCH.** The two-witness null-space search finds exactly 9
  free directions at the deployed honest witness, all `main.mk.eq[i][0].isz.inv`.
  Those 9 are precisely the `inv` whose `IsZero` input is 0 at that witness
  (`pathIndex[i] = 0` ⇒ `eq[i][0].isz.in = 0`); the other 63 are pinned the
  moment the input is non-zero. The structural free set restricted to the
  deployed configuration **equals** the null-space free set. The two methods
  agree.

### Phase 2: the `IsZero` `out` closure, stated honestly

Pure forward substitution also stalls on each comparator's `out` and the
`selAcc`/`dotAcc` accumulators that consume it, because circomlib `IsZero` pins
`out` by a **case-split** — `out = (in == 0) ? 1 : 0`, unique in both branches —
and forward substitution does not case-split. Phase 2 closes those `out` signals
using that proven property of a verified gadget (`out <== 1 - in*inv` together
with `in*out === 0` forces `out ∈ {0,1}` and `out = [in == 0]`), after which
`selAcc`/`dotAcc` cascade by ordinary substitution. This is **sound and
universal**, but it is a cited-lemma step, not a substitution step, and is
labelled as such. It does not touch the public outputs, which are already
determined in Phase 1 without it: `N` and `y` live in the `ResidualSplit`
sub-circuit and their entire determining cone (the nullifier `Poseidon` and the
RLN line) is triangular.

## The `M1a` detection property

The `<--` operator is exactly a signal that *no constraint determines*. Such a
signal never enters the determined set. So forward-determination detects M1a's bug
class — an unconstrained output — **structurally, in the full circuit, in linear
time**, with none of the coordinated-direction search that took three earlier
rounds to reach it by other means. Run on an `N <-- hN.out` mutant, `main.N`
itself would appear in the stalled set (a public output that never gets
determined → the script exits non-zero with a top-of-report warning).

## What it establishes, and what it does not

**Establishes (unconditional, solver-independent):** every signal of the deployed
circuit is uniquely determined by the inputs except 72 `IsZero` inverse hints
that no public output reads (`taint_iszero.md` and the residual-projection lemma,
`ff_smt.md`); therefore **the public outputs `N` and `y` are uniquely determined
by the inputs.** No `Poseidon` assumption (Poseidon is covered — it is
triangular). No linearization bound. No probe count. No solver.

**Does not establish, and the paper keeps saying so:** that the circuit computes
the *intended* function, that the nullifier and RLN constructions are the right
ones, or that there is no logic error in *what* is being constrained. Unique
determination is one failure mode an external audit examines, not all of them.
This makes an audit faster and cheaper. It does not replace it, and **Gate 1
stays Open.**

Machine-readable: `forward_determination.json`.
