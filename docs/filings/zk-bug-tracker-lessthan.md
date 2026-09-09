## Proposed entry: "Magnitude comparison on an un-range-checked wide value"

Suggested section: **Circom / Common Vulnerabilities** (bug class), with the
circomlib `LessThan` case as the worked instance.

### The bug class

A comparison gadget (`<`, `<=`, `>`, `>=`) is implemented by adding an offset and
reading a sign/borrow bit out of a fixed-width bit decomposition:

```
n2b = Num2Bits(n+1);  n2b.in <== a + (1<<n) - b;  out <== 1 - n2b.out[n];
```

This is sound **only if `a, b < 2^n`**. If either operand can reach `2^n` or
beyond, `a + 2^n - b` can wrap modulo the scalar field `p`, the bit `n` no longer
means "no borrow", and the gadget returns a **satisfying witness for a false
comparison** — with no error. It is invisible to honest-path tests because
honest witnesses never carry an out-of-range value for a small logical quantity;
only a malicious prover triggers it.

### Why it recurs

The operands are very often **hash outputs** (Poseidon / MiMC / Pedersen), which
are ~254-bit and NOT bounded below `2^n` for the usual `n ≤ 252`. On BN254,
**66.9%** of field elements are `>= 2^252`. Any of these patterns is at risk when
the compared value is attacker-influenced and not separately range-checked:

- sorted / indexed Merkle trees for **non-membership** (`leaf_low < x < leaf_high`)
- **range checks** on commitments / balances stored as hashes
- **strictly-increasing nullifier / key sets** used to prove no duplicates
- rank / percentile / "between" gadgets over hashed keys
- epoch / timestamp monotonicity where the value derives from a hash

### Worked instance — circomlib `LessThan`

`circomlib/circuits/comparators.circom` `LessThan(n)` asserts `n <= 252` but not
`in[i] < 2^n`, and the doc-comment does not state the input precondition.
Demonstrated: `LessThan(252)` on `a = p - 1`, `b = 1` gives `out = 1`
(asserts `p - 1 < 1`). Reproducer:
`https://github.com/rehanmalik2008/Proof-of-Personhood` →
`node scripts/repro_lessthan_hash.mjs` (circuit `circuits/cmp_hash_repro.circom`).

### Detection

- Static: any signal transitively derived from a permutation gadget flowing into
  `LessThan` / `GreaterThan` / `LessEqThan` / `GreaterEqThan` without an
  intervening `Num2Bits(<=252)` or `AliasCheck` on that signal.
- Review heuristic: "does this comparison assume the operand is `< 2^252`? is
  that enforced anywhere on the path from its definition?"

### Fix

- Range-check first: `Num2Bits(252)` on the operand (adds 252 constraints);
  if it is a hash, derive it as a 252-bit value (`Poseidon(...) \ 4` or a
  domain-separated 252-bit hash) and state the ~126-bit birthday bound.
- Or full-field comparison: bit-decompose both operands with `Num2Bits(254)` and
  compare MSB-first; sound for all of `[0, p)`, ~1.5k constraints.

### Prior art / relation

Same family as "unchecked `Num2Bits` / missing `AliasCheck`" entries and the
general "using a gadget outside its precondition" class; distinct in that the
precondition failure is on *magnitude* semantics rather than on representation
uniqueness, and in the specific fact that hash outputs violate it a majority of
the time.
