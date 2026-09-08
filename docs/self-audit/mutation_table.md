| mutant | bug class | what it breaks | circomspect | Picus | adversarial harness | caught |
|---|---|---|---|---|---|---|
| `M1a` | `<==` to `<--` (assignment without constraint) | nullifier output N assigned but never constrained | DETECTED (1 new) | INCONCLUSIVE (TOOL ERROR) [319s] | missed | **yes** (circomspect) |
| `M1b` | `<==` to `<--` (assignment without constraint) | commitment C assigned but never constrained, so the Merkle leaf floats free | DETECTED (2 new) | missed [27s] | missed | **yes** (circomspect) |
| `M2` | removed range check | pathIndex in-range enforcement (selAcc[i][W] === 1) deleted | missed | missed [22s] | missed | **NO — SURVIVOR** |
| `M3` | swapped equality operand | root checked against cur[depth-1], leaving the top Merkle level unconstrained | missed | missed [22s] | DETECTED (1) | **yes** (harness) |
| `M4a` | weakened nullifier binding | ctx dropped from the nullifier hash, giving one N across every context | DETECTED (1 new) | missed [26s] | DETECTED (1) | **yes** (circomspect, harness) |
| `M4b` | weakened nullifier binding | epochAction dropped from the nullifier hash, so N never rotates | DETECTED (1 new) | missed [26s] | missed | **yes** (circomspect) |
| `M5` | unintended signal alias | epochAction aliased to epochTree, the coupled-counter regression the epoch split removed | DETECTED (1 new) | missed [27s] | DETECTED (1) | **yes** (circomspect, harness) |
| `M6` | RLN degree-1 binding broken | share no longer depends on signalHash, so two shares never determine the line | DETECTED (1 new) | missed [27s] | DETECTED (2) | **yes** (circomspect, harness) |
| `M7` | removed constraint (revocation) | non-membership constraint deleted, so a revoked credential can still prove | DETECTED (2 new) | missed [29s] | DETECTED (2) | **yes** (circomspect, harness) |
| `M8` | disabled verification gadget | EdDSA verifier disabled at enrolment, so credentials mint with no attester signature | missed | missed [16s] | DETECTED (2) | **yes** (harness) |

Notes on this table (see docs/SELF-AUDIT.md section 11 and
docs/self-audit/two_witness_results.md; the columns above are the RAW mutation
run and are superseded by the filtered analysis there):

- **"DETECTED" means a method produced a signal, not that an exploitable bug
  existed.** A tool-independent two-witness search (`scripts/two_witness_search.mjs`)
  filters the ten to genuine signal-level under-constraints — a second satisfying
  witness that moves a public output at fixed honest inputs. **Exactly one
  qualifies: M1a.**
- `M1a` (`N <-- hN.out`) IS genuinely under-constrained and exploitable: the
  two-witness search finds a verified second witness moving `(a1x, N, y)`, i.e.
  the public nullifier. A free nullifier defeats sybil resistance. circomspect
  catches it syntactically; the adversarial harness MISSES it (its tamper tests
  move one signal at a time and never do the `(a1x, N, y)` move). An earlier note
  here claimed "no exploit demonstrated" after two incomplete hand forgeries that
  never perturbed `a1x`; that claim is withdrawn.
- `M1b` (`C <-- hC.out`): NOT under-constrained. `C` stays pinned by the Merkle
  path against the public `root`.
- `M2`: equivalent mutant (behavioural test, section 11.2). Accepts/rejects
  identical witnesses.
- `M3`: honest input does not satisfy the mutant; wrong-tree bug, not a signal
  freedom.
- `M4a`/`M4b`/`M5`/`M6`: the circuit computes a different but still deterministic
  function; every signal is determined.
- `M7`/`M8`: widen the accepted INPUT set (revoked `C`, or arbitrary signatures) —
  a real bug the adversarial harness catches by trying bad inputs, not a
  signal-level under-constraint.
- **Picus** returned NO verdict on M1a (crash + timeout), and could not be
  validated as an oracle for this circuit at all (section 11.4c): it returns
  *unknown* on a small Poseidon+RLN circuit with a freed output and does not
  terminate on the full one.
