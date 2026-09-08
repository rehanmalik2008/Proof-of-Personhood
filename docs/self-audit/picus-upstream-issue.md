<!-- Ready-to-file issue body for chyanju/picus (or Veridise/Picus discussions).
     Title: cvc5 FF + Picus both stall on Poseidon-output-feeds-arithmetic (minimal 262-constraint repro) -->

## Summary

On a circuit shape that is ubiquitous in production circom — a Poseidon hash
whose output feeds a downstream arithmetic relation (nullifiers, commitments, RLN
shares) — Picus returns **"Cannot determine whether the circuit is properly
constrained"** on a **minimal, 262-constraint, genuinely under-constrained**
example. A tool-independent two-witness search decides the same case in 0.3 s, and
a direct SMT-modulo-finite-fields encoding (cvc5 `--cocoa`) also fails to
terminate — so both mature tool classes hit the same wall, which appears to be the
S-box (`x^5`) polynomial ideal rather than anything specific to this circuit.

This is offered as an **empirical benchmark data-point**, not a correctness bug —
the README already notes cvc5 `unknown` / getting stuck is possible. The value is
in pinning down *where* the uniqueness deduction stalls, on a very common shape,
at minimal size.

## Repro (self-contained, ~30 lines of circom)

```circom
// poseidon_rln_freed.circom — N = Poseidon(3)(s,ctx,epoch); y = s + N*signalHash
// with the y binding downgraded from <== to <-- so y is genuinely free.
pragma circom 2.1.0;
include "poseidon.circom";
template PoseidonRLNFreed() {
    signal input s; signal input ctx; signal input epoch; signal input signalHash;
    signal output N; signal output y;
    component hN = Poseidon(3);
    hN.inputs[0] <== s; hN.inputs[1] <== ctx; hN.inputs[2] <== epoch;
    N <== hN.out;
    signal a1x; a1x <== N * signalHash;
    y <-- s + a1x;          // <-- not <== : y is under-constrained
}
component main = PoseidonRLNFreed();
```

```bash
circom poseidon_rln_freed.circom --r1cs --sym -l <circomlib>/circuits
./run-picus --solver z3 --timeout 10000 poseidon_rln_freed.r1cs
#  observed: "Cannot determine whether the circuit is properly constrained"  (exit 0, ~11 s)
```

Baseline `poseidon_rln.circom` (identical but `y <== s + a1x`) → `safe`, ~35 s.
A Poseidon-free 2-signal under-constraint (`out <-- in*2;`) → `unsafe`, ~2 s.

## Ground truth (two complementary methods, both sub-second)

`y` is genuinely under-constrained.

1. **Jacobian null-space check** at an honest witness: null-space dimension 1, the
   free column is exactly `y`, and `w1 + delta` satisfies all 262 non-linear R1CS
   constraints while `y` differs (0.3 s, tool-independent).
2. **Structural forward-determination**: seed the inputs, then iterate — a
   constraint `(A·w)(B·w) = (C·w)` with `A·w`, `B·w` determined and one
   undetermined signal in `C·w` (invertible coeff) determines that signal by
   division. On this circuit every signal reaches the determined set *except*
   `y` (and the `IsZero` inverse hint, which no output reads). `y` is a public
   output that no constraint pins → flagged immediately. Linear-time, no field
   reasoning at all, so the `x^5` S-box costs nothing.

Method 2 is the relevant one for this report: the reason Picus (ideal deduction)
and cvc5-FF (Gröbner basis) both stall is that they attack a *structural*
property *semantically* and pay the S-box ideal cost. A forward walk of the
constraint graph sidesteps it.

## Cross-check with cvc5 finite-field theory

cvc5 1.3.4 with `--cocoa` (`QF_FF`), given the exact two-witness query for the
262-constraint circuit (both witnesses satisfy every constraint, agree on all
inputs, differ at `y`), also does not terminate — crash/timeout at ~100 s. It
decides the query sub-second only when `Poseidon` is replaced by a
determinism-only relation. Same wall, different solver.

## Environment

- Picus `138b151` (`Veridise/Picus@main`), `--solver z3`
- Racket 9.3 [cs], z3 4.8.12, Ubuntu 22.04 (WSL2)
- circom 2.x (`circom2` npm), circomlib 2.0.5
- cvc5 1.3.4 static-gpl for the FF cross-check

## Why record it

Poseidon-output-feeds-arithmetic is one of the most common shapes in real
circuits. A user who runs Picus on one and gets *cannot determine* may misread it
as reassurance. Documenting the boundary — decided fast without a hash, not
decided when the free signal is downstream of a permutation output — helps
calibration, and it is a concrete target if uniqueness propagation through hash
gadgets is added. Happy to contribute both circuits as a regression/benchmark
fixture if useful.
