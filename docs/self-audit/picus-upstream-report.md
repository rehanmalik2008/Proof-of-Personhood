# Picus empirical report — where uniqueness deduction stalls on a common circuit shape

*Reproducible benchmark data-point for the Picus maintainers
(the-last-technical-frontier.md, Task 4; drafted after-the-oracle.md, Task 5).*

## Filing status — prepared, not filed; needs one command from the author

Filing was left to the author deliberately: it is a public post attributed to a
personal GitHub identity, and the target repo is **not** the one the earlier note
assumed.

- **`Veridise/Picus` has issues disabled** (`GET /repos/Veridise/Picus` →
  `"has_issues": false`). The binary used here (`/opt/Picus`, commit `138b151`,
  2024-03-14) is `Veridise/Picus@main`.
- The correct destination is **`chyanju/picus`** — the academic upstream
  (`"has_issues": true`, active, last push 2026-07), or Veridise's contact
  form / the `Veridise/Picus` discussions tab.
- This session has no `gh` CLI. A GitHub credential for the author is cached in
  the OS credential helper (it authenticates `git push` to the project's own
  repo); it was **not** reused to post to a third-party tracker.

The issue body is ready at `docs/self-audit/picus-upstream-issue.md`. To file:

```bash
gh issue create --repo chyanju/picus \
  --title "cvc5 FF + Picus both stall on Poseidon-output-feeds-arithmetic (minimal 262-constraint repro)" \
  --body-file docs/self-audit/picus-upstream-issue.md
```

(or paste the body into a new issue in the GitHub web UI). `chyanju/picus`'s
README explicitly invites reports: *"Conflicting results … indicate a bug in
Picus, and we would appreciate a bug report."*

## What the data-point is (not a correctness bug)

Picus's own README documents that a solver can *get stuck* and that `cvc5`
returning `unknown` is expected behaviour, deferring to `z3`. So this is **not** a
soundness/correctness bug in Picus. It is an **empirical map of where the
uniqueness deduction stalls**, on a circuit shape that is everywhere in
production circom — a `Poseidon` hash whose output feeds a downstream arithmetic
relation (nullifiers, commitments, RLN shares, signal binding):

| circuit | constraints | ground truth | Picus (`--solver z3`) | time |
|---|--:|---|---|--:|
| trivial `out <-- in*2`, unconstrained | 2 | under-constrained | **`unsafe`** (exit 9), prints both witnesses | ~2 s |
| `poseidon_rln` — `N = Poseidon(3)(s,ctx,epoch)`, `y = s + N·signalHash` | 262 | properly constrained | **`safe`** (exit 8) | ~35 s |
| `poseidon_rln_freed` — same but `y <-- s + N·signalHash` (binding removed) | 262 | **under-constrained at `y`** | **"Cannot determine…"** (exit 0) | ~11 s |
| `wedge_mem_w8_d9_split` (4,309), `y` binding removed | 4,309 | **under-constrained at `y`** | **no verdict** — past a 15-min cap | >900 s |

Row 3 is the crux: a *minimal* genuine under-constraint, 262 constraints, and
Picus returns neither `safe` nor `unsafe`. The distinguishing feature vs. row 1
is that the free signal (`y`) is downstream of a `Poseidon` permutation output
(`N`), and the deduction does not propagate uniqueness through the permutation.

**A tool-independent two-witness search decides row 3 in 0.3 s**
(`scripts/two_witness_search.mjs`): Jacobian null space at an honest witness has
dimension 1, the free column is exactly `main.y`, and `w1 + δ` satisfies all 262
non-linear constraints while `y` differs. So the case is not hard in an absolute
sense — it is hard *for uniqueness deduction specifically*.

**A direct SMT encoding over finite fields does not help either.** cvc5 1.3.4
with `--cocoa` (`QF_FF`), fed the exact two-witness query for `poseidon_rln`
(concrete inputs, 262 constraints), also fails to terminate (crash/timeout at
~100 s). Both mature tools hit the same S-box (`x^5`) polynomial-ideal wall. The
query becomes decidable only when the permutation is abstracted to a
determinism-only relation (`docs/self-audit/ff_smt.md`).

## Environment

- Picus commit `138b151` (`Veridise/Picus`), `./run-picus --solver z3 --timeout 10000`
- Racket 9.3 [cs], z3 4.8.12, Ubuntu 22.04 (WSL2)
- circom via the `circom2` npm package, circomlib 2.0.5
- cvc5 1.3.4 static-gpl (for the FF-SMT cross-check)

## Reproduction

Minimal circuits in this repo:

```
circuits/poseidon_rln.circom          # properly constrained baseline
circuits/poseidon_rln_freed.circom    # y binding downgraded  <==  ->  <--
```

```bash
cd circuits
node ../node_modules/circom2/cli.js poseidon_rln_freed.circom \
     --r1cs --wasm --sym --O2 -o . -l . -l ../node_modules/circomlib/circuits

# ground truth: under-constrained at main.y, found in ~0.3 s
node ../scripts/two_witness_search.mjs prlnf \
     --r1cs poseidon_rln_freed.r1cs \
     --wasm poseidon_rln_freed_js/poseidon_rln_freed.wasm \
     --sym  poseidon_rln_freed.sym --input prln_in.json

# Picus: returns "Cannot determine whether the circuit is properly constrained"
cd /opt/Picus
./run-picus --solver z3 --timeout 10000 <repo>/circuits/poseidon_rln_freed.r1cs
```

For the full-circuit non-termination case, compile `wedge_mem_w8_d9_split` with
`y <== s + a1x` in `circuits/wedge_membership.circom` changed to `y <-- s + a1x`.

## What this project concluded

Picus is kept only as a corroborating method, not a validated oracle for this
circuit. The determination result the project actually relies on is a
**linear-time structural forward-determination walk** of the constraint graph
(`docs/self-audit/forward_determination.md`): it decides the full deployed
circuit — including every `Poseidon` — in 0.5 s, because it never reasons about
the field. That is the concrete form of the observation above: Picus and cvc5-FF
stall because they attack a structural property semantically; walking the graph
does not. See `docs/SELF-AUDIT.md` §11.4c / §11.6 / §11.8,
`docs/self-audit/ff_smt.md`, and `paper/paper.html` §7.3.
