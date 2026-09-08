# Compositional verification — Poseidon at the module boundary

`scripts/compositional_verify.mjs` (after-the-oracle.md, Task 4). The monolithic
Picus run does not terminate on the full 4,309-constraint circuit: its deduction
does not propagate uniqueness through the Poseidon permutation. The standard
answer is to verify at the module boundary.

## Layer A — circomlib Poseidon in isolation

`circuits/poseidon_only_k3.circom` and `poseidon_only_k8.circom` — the two
arities the deployed circuit uses. Property: given fixed inputs, every internal
and output signal is uniquely determined.

| gadget | two-witness search, 16 random input points | Picus |
|---|---|---|
| `Poseidon(3)` | **nullity 0** at all 16 — uniquely determining | **properly constrained**, ~14 s |
| `Poseidon(8)` | **nullity 0** at all 16 — uniquely determining | **no verdict** (killed at 300 s) |

`nullity 0` means: fix the inputs and the constraints leave no free signal at
all — the output is a function of the inputs. Consistent with published analysis
of the circomlib Poseidon gadget. Note Picus already fails to terminate on
`Poseidon(8)` *alone*; the tool-independent two-witness search handles both
arities instantly.

### Cross-check: the S-box is a field bijection (cited design property)

Independently of any tool, the Poseidon-determinism assumption has a short
mathematical justification — it is the reason the gadget is built this way, and a
cryptographer reviewing the paper can check it directly. It is recorded here as a
**cited design property, not a machine-checked result**:

- The S-box is `x ↦ x⁵`. A power map `x ↦ x^d` on `F_p` is a **bijection** iff
  `gcd(d, p − 1) = 1`. For the BN254 scalar field `p`, `p ≡ 2 (mod 5)` so
  `p − 1 ≡ 1 (mod 5)`, hence `5 ∤ (p − 1)` and `gcd(5, p − 1) = 1`. `x⁵` is a
  permutation of `F_p`. This is exactly why circomlib's Poseidon uses `α = 5` on
  this field (fields where `5 | p − 1` must use `α = 3` instead).
- The linear layers are multiplication by invertible **MDS matrices** over `F_p`
  (an MDS matrix is invertible by definition — every square submatrix is
  non-singular).
- The round-constant additions are translations, trivially bijective.

A Poseidon round is `translate ∘ MDS ∘ S-box` (full round) or the same with the
S-box on one lane (partial round); each factor is a bijection of `F_p^t`, so each
round is, and the whole permutation is a composition of bijections — **injective,
hence its output is uniquely determined by its input.**

This corroborates the `nullity 0` runs above from a completely different
direction (algebra, not search or deduction). Two independent arguments for the
same assumption, neither of which is a solver, is a materially better position
than one unverifiable assumption. It is still not a machine-checked proof of the
*R1CS encoding* — that is what Layer A's two-witness runs test, and what
`forward_determination.md` now closes structurally (Poseidon's R1CS is
triangular, so its determination needs no assumption at all).

## Layer B — the deployed circuit, Poseidon abstracted to determinism only

`circuits/abstract/poseidon.circom` shadows circomlib on the include path and
replaces every `Poseidon(n)` instance with `out === sum_i (i+1)*inputs[i]`. The
abstraction asserts nothing about Poseidon except that `out` is a deterministic
function of `inputs`. The resulting `main_abstract_split` circuit is **217
constraints** (vs 4,309).

Two-witness search on the abstracted circuit, four path shapes:

| path shape | nullity | moves a public output? | non-public freedoms |
|---|--:|---|---|
| leftmost  | 9 | no | `eq[i][0].isz.inv`, i=0..8 |
| rightmost | 9 | no | `eq[i][7].isz.inv`, i=0..8 |
| max-depth | 9 | no | `eq[i][pathIndex[i]].isz.inv`, i=0..8 |
| ascending | 9 | no | `eq[i][pathIndex[i]].isz.inv`, i=0..8 |

Every non-public freedom is an `IsZero` `inv` hint — the same benign freedom
Task 3 proves. `main.N` and `main.y` are uniquely determined. **Layer B holds:
given only that each Poseidon instance is a deterministic function of its
inputs, the circuit's public outputs are uniquely determined by its inputs.**

Picus on the 217-constraint abstracted circuit: **still no verdict** (killed at
300 s). The comparator/`selAcc`/`dotAcc` structure alone is enough to stall it.
So the abstraction does **not** rescue Picus — it rescues the *analysis*: the
two-witness search gives a clean whole-circuit answer on the abstraction, where
it would otherwise be trusting a single 4,309-constraint Gaussian elimination.

## Composition

- **Layer A holds** — the real circomlib Poseidon R1CS uniquely determines its
  output from its inputs (two-witness search, both arities, 16 points each;
  Picus confirms for arity 3).
- **Layer B holds** — given Layer A, the deployed circuit's public outputs are
  uniquely determined by its inputs; only the nine benign `IsZero` hints stay
  free.
- **Together** — a whole-circuit uniqueness result for `main.N`, `main.y`,
  obtained where the monolithic run does not terminate, and resting on a
  217-constraint circuit-specific check plus one separately-established lemma
  instead of a single 4,309-constraint elimination.

### What this does and does not buy

It does **not** make Picus usable on this circuit — Picus does not terminate on
the full circuit, on the abstraction, or even on `Poseidon(8)` alone. What it
buys is a **smaller trusted base** for the tool-independent result: the
circuit-specific reasoning drops from 4,309 constraints to 217, and the
remaining dependence on Poseidon is a single, widely-shared, separately-checked
assumption rather than an implicit trust in a large elimination. It is
**independent of the Poseidon R1CS encoding**: if circomlib changes its Poseidon
implementation, Layer B is unaffected and only Layer A must be re-checked.

### The assumption, stated for the paper

**circomlib's Poseidon R1CS uniquely determines its output signals from its
input signals.** It is narrow, it is shared by essentially every circom project
that hashes, it is supported by published analysis of the gadget, and Layer A
checks it directly on the two arities this circuit uses. It is **not** a
substitute for an independent circuit audit — Gate 1 stays Open — it makes one
cheaper and more targeted by reducing the whole-circuit soundness question to a
single separately-checkable lemma.

Raw log: `compositional_verify.txt`. Machine-readable: `compositional_verify.json`.
