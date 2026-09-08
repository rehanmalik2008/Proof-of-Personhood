# Exploitable under-constraints concentrate at non-redundantly-determined signals

*A short auditing note, separable from the protocol it came out of. Hypothesis
with clean local support; stated so it can be tested or refuted elsewhere.*

## Claim

In a real ZK (R1CS / Circom) circuit, deleting or weakening a single binding
constraint usually does **not** create an exploitable under-constraint, because
most signals are pinned by several independent constraints. The exploitable cases
cluster at the signals that have **only one** determining constraint. So:

> Rank every non-input signal by *determination redundancy* — how many
> independent constraints would still pin it if you removed one — and audit the
> bottom of that list first. The signals with redundancy zero (a single
> determining constraint, no backup) are where a missing or wrong constraint
> actually becomes a soundness bug.

This converts "check every constraint for a missing sibling" (unbounded) into
"find the non-redundantly-determined signals; those are the candidates" (a short,
ranked worklist).

## Evidence

From one circuit (a proof-of-personhood login circuit, 4,309 R1CS constraints)
and ten single-constraint mutations, each deleting or weakening one binding
relation:

| mutation | signal targeted | redundancy of that signal | exploitable? |
|---|---|---|---|
| commitment assignment `C <== …` → `<--` | `C` | high — also pinned by the Merkle path against the public root | **no** |
| `pathIndex` range check deleted | `pathIndex` | high — redundant against the slot-selection constraint `dotAcc[i][W] === cur[i]` | **no** (proved-equivalent mutant) |
| nullifier `N <== …` → `<--`, plus single- and two-signal forgery attempts | `N` | resisted single-signal *and* coordinated forgery until the exact `(a1x, N, y)` direction | **only via the coordinated 3-signal move** |
| RLN share `y <== s + N·signalHash` → `<--` | `y` | **zero — one determining constraint, no other** | **YES — real, exploitable** |
| six further weakenings (drop `ctx` / `epoch_action` from the hash, alias the epochs, detach the share from `signalHash`, disable the EdDSA verifier, delete the non-membership check) | various | either still deterministic-but-wrong, or widen the accepted *input* set rather than freeing a signal | not signal-level under-constraints |

The filtered count of genuine signal-level under-constraints was **one**, and it
was precisely the one signal with no redundant determination. The vulnerability
lived at the single point of non-redundant determination, and nowhere else.

Two later, independent analyses of the same circuit converge on the same picture:

- A **forward-determination (triangularity) walk** determines every signal by
  unique division except the `IsZero` inverse hints — the signals that have *no*
  determining constraint at all (redundancy is undefined / negative for them; they
  are `<--` hints, benign because no public output reads them).
- The **Jacobian null-space** of the constraint system at an honest witness has
  dimension equal to exactly those hint signals; every other signal has a
  full-rank column — i.e. is over-determined relative to the free ones.

## How to measure redundancy

For a signal `x`, take the sub-matrix of the linearised constraint system (the
R1CS Jacobian at a witness, or the structural incidence matrix) restricted to the
constraints that mention `x`. Redundancy is the **co-rank**: how many of those
constraints could be dropped while still pinning `x` (rank of the sub-system minus
1, clamped at 0). Redundancy 0 = a single determining constraint = audit
candidate. This is cheap: it is a rank computation per signal, or, structurally,
"count the constraints in which `x` is the unique unknown given everything
upstream".

## Honest boundary

This is **one circuit, ten mutants, one exploitable case**. That is suggestive,
not conclusive. The claim is a hypothesis with strong local support:

> *Exploitable under-constraints concentrate at non-redundantly-determined
> signals; ranking by determination redundancy and auditing the bottom of the
> list first is a more efficient search than treating every constraint as a
> candidate.*

Testing it across many independent circuits would either establish it as an
auditing principle or bound where it fails — for instance, a circuit whose bug is
a *wrong* redundant constraint (all copies agreeing on the wrong value) would not
be caught by this heuristic, and neither would a logic error in what is being
constrained. That test is a research programme in its own right, larger and more
outward-facing than anything left on the circuit this came from.

## Provenance

Emerged from the mutation-testing and structural-analysis rounds of the
`Proof-of-Personhood` project (`docs/SELF-AUDIT.md` §11.4b, §11.6, §11.7;
`docs/self-audit/mutation_table.md`, `two_witness_results.md`,
`forward_determination.md`). The protocol is irrelevant to the claim; only the
mutation ledger and the two determination analyses are.
