# Satisfiability modulo finite fields — removing the linearization bound

`scripts/ff_smt_two_witness.mjs` (the-last-technical-frontier.md, Tasks 1 & 2).
Every prior soundness result carries the **linearization bound**: the two-witness
search works with the Jacobian null space, a local object, so it only rules out a
second witness with a *non-zero linear component*. 56-point probing repeats that
local check at many points; it does not make it global.

This round poses the two-witness question **exactly**, with no linearization, as
a satisfiability query over the BN254 scalar field:

> Do there exist two full witnesses `w1, w2` such that both satisfy every R1CS
> constraint (quadratic, exact), they agree on every input signal and the
> constant wire, and they differ at some public output?

`UNSAT` is a complete proof of unique determination. `SAT` is a concrete second
witness. Solver: **cvc5 1.3.4** built with `--cocoa` (the `-gpl` static release;
CoCoALib is GPL), theory `QF_FF`. Field modulus = the BN254 scalar prime. Each
query is split into one UNSAT check per public output `k`, with `w1_k != w2_k`
encoded by a Rabinowitsch inverse `(w1_k - w2_k)*s = 1` so the sub-query is a
pure conjunctive system for the Gröbner-basis FF engine. Install:
`scripts/wsl_setup_cvc5.sh`.

## Lemma (Merkle-independence of the public outputs)

Both the 0.13 s universal UNSAT below and the residual line of the
forward-determination proof (`forward_determination.md`) work on the
**`ResidualSplit` sub-circuit alone** — `C = Poseidon(s)`, `N = Poseidon(s, ctx,
epoch_action)`, `y = s + N·signal_hash` — dropping the entire Merkle half. That
drop is **not** a modelling convenience; it is licensed by an explicit lemma,
and a reviewer should check it first.

> **Lemma.** In `WedgeMembershipWideSplit(8, 9)`, the public outputs `N` and `y`
> are functions of `{s, ctx, epoch_action, signal_hash}` only. No signal of the
> Merkle sub-circuit (`MerkleWide`) — `node`, `pathIndex`, `root`, `cur[i]`, the
> per-level `Poseidon`, the comparators `eq[i][j]`, `selAcc`, `dotAcc` — appears
> in the determining cone of `N` or `y`.
>
> **Proof.** By construction (`circuits/wedge_membership.circom`): `res.N <== N`
> and `res.y <== y` where `res = ResidualSplit()` is wired only from
> `s, ctx, epoch_action, signal_hash`. The single signal shared between the two
> sub-circuits is the commitment `C`, and it flows **one way** — `mk.leaf <==
> res.C` — into the Merkle opening; nothing flows back. This is confirmed
> mechanically by the directed constraint-influence closure in
> `taint_iszero.md`: the closure from every Merkle-half signal (including each
> `IsZero.out`, which *does* feed the slot routing) reaches no public output, and
> `N`, `y`'s own backward cone contains no `mk.*` signal. ∎

So proving determination of `N` and `y` on the residual projection is a proof
about the deployed circuit's public outputs, not a weaker statement.

## Task 1 — the 217-constraint Layer B abstraction

| encoding | scope | cvc5 result | time |
|---|---|---|---:|
| **residual projection** (`residual_abstract`, 7 constraints): `N = mockH(s,ctx,epochAction)`, `y = s + N·signalHash`, **all inputs symbolic** | **universal, unconditional** | **UNSAT** on both outputs | **0.13 s** each |
| positive control (`residual_abstract_freed`): same, but `y <--` (binding removed) | universal | `N` **UNSAT**; `y` **SAT** — model is a concrete second witness moving `y` | 5.6 s / 0.1 s |
| full 217-constraint `main_abstract_split`, **inputs pinned to an honest witness**, 6 structurally diverse points (leftmost / rightmost / max-depth / ascending / alternating / random path shapes) | exact & non-linear **at each point** (no linearization; still per-point) | **UNSAT** on both outputs, **all 6 points** | ~1.0–1.3 s / sub-query |
| full 217-constraint `main_abstract_split`, **all 87 inputs symbolic** | universal | **no verdict** — cvc5 `gb` ran ~490 s on the first sub-query then aborted (CoCoA/allocation failure) | — |

**What this establishes.**

0. **The encoding is sound in both directions.** Positive control
   `residual_abstract_freed` (`y` binding removed): cvc5 returns UNSAT for `N`
   (still bound) and **SAT for `y`, with a concrete second-witness model**. So an
   UNSAT verdict below means genuine unique determination, not a spurious
   inconsistency in the encoding.

1. **The linearization bound is removed for the public outputs.** The residual
   projection is the sub-circuit that computes `N` and `y`; the Merkle half feeds
   nothing back into them (`taint_iszero.md` proves this). With every input free,
   cvc5 proves in 0.13 s that **no pair of witnesses agrees on
   `{s, ctx, epochAction, signalHash}` and differs at `N` or `y`.** That is an
   unconditional, universal proof of unique determination for both public
   outputs of the abstraction — no linearization, no probe count, no bound.

2. **The full 217-constraint abstraction is proven per-point, exactly.** At six
   structurally diverse honest inputs, cvc5 proves `UNSAT` in ~1 s: no second
   witness differs at `N` or `y`. This removes the *linearization* bound at each
   point (it is an exact non-linear check, not a Jacobian one); it keeps a
   *point* bound (proven at those inputs, not universally).

3. **The fully universal 217-constraint query does not terminate.** With all 87
   coupled inputs symbolic (`s`, the 81 Merkle-path signals, `ctx`, the two epoch
   counters, `signalHash`, and `root` — which is functionally tied to `s` and the
   path), cvc5's Gröbner engine does not decide it and aborts around 8 minutes.
   On this evidence the fully universal claim over the *whole* abstraction is
   **not** obtainable by direct SMT here; the per-point exact results and the
   universal residual-projection result are.

## Task 2 — real `Poseidon` in isolation

| target | constraints | encoding | cvc5 result |
|---|--:|---|---|
| `poseidon_only_k3` (real `Poseidon(3)`) | 261 | inputs symbolic | **no verdict** — crash at ~463 s |
| `poseidon_rln` / `poseidon_rln_freed` (real `Poseidon(3)` + RLN line) | 262 | inputs pinned (concrete) | **no verdict** — crash / timeout at ~100–120 s |
| `poseidon_only_k8` (real `Poseidon(8)`) | 402 | inputs symbolic, `--ff-solver=gb` | **no verdict** — RSS past 4 GB, killed at ~300 s |
| `poseidon_only_k8` | 402 | inputs symbolic, `--ff-solver=split` | **no verdict** — RSS past 5.7 GB, killed at ~135 s |

**cvc5's finite-field theory does not decide a circuit containing a real
`Poseidon` permutation** at any size at or above ~260 constraints, symbolic or
concrete, with either FF sub-solver. This is the same wall Picus hits
(`docs/self-audit/picus-upstream-report.md`), for the same underlying reason: the
S-box (`x^5`) polynomial ideal. The Layer B abstraction is decidable *because* it
replaces the permutation with a determinism-only relation.

**Consequence for Layer A / the composition.** FF-SMT does **not** make Layer A
(`Poseidon` uniquely determining) unconditional — cvc5 cannot decide `Poseidon(8)`
either. Layer A therefore remains an assumption, established by the bounded
two-witness search at 16 points plus Picus for arity 3, and it is now known to be
beyond *both* mature tools (Picus and cvc5-FF). The composition stays: *given*
circomlib `Poseidon` uniquely determines its output, the deployed circuit's
public outputs are uniquely determined by its inputs.

## Net effect on the project's soundness claim

| claim | before this round | after |
|---|---|---|
| `N`, `y` uniquely determined (abstraction) | "no second witness with a non-zero linear component at 56 points" | **unconditional, universal, non-linear proof** (residual projection, cvc5 QF_FF, `UNSAT`) |
| whole 217-constraint abstraction uniquely determined | 56-point linearized | exact non-linear at 6 points; universal query does not terminate |
| Layer A (`Poseidon` uniquely determining) | assumption (16-point search + Picus arity 3) | still an assumption; now shown beyond Picus *and* cvc5-FF |

**Gate 1 is unaffected.** Even a complete formal proof of unique determination
does not close it: unique determination means the constraints pin every signal,
not that the circuit computes the intended function, that the nullifier and RLN
constructions are the right ones, or that there is no logic error in *what* is
being constrained. Under-constraint is one failure mode an external audit
examines, not all of them.

Raw logs and per-run JSON: `ff_smt_*.txt` / `ff_smt_*.json` in this directory.
