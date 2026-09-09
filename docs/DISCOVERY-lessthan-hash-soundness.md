<!-- Ready-to-file note for the circom / circomlib ecosystem.
     Filing bodies + exact `gh issue create` commands: docs/filings/
       - docs/filings/circomlib-lessthan-issue.md    -> iden3/circomlib
       - docs/filings/zk-bug-tracker-lessthan.md      -> 0xPARC/zk-bug-tracker
       - docs/filings/lessthan-hash-writeup.md        -> standalone public post
     Title: circomlib LessThan(n) silently accepts false comparisons when fed
            field elements >= 2^n (e.g. Poseidon outputs) -->

# `LessThan` on hash outputs: a demonstrated silent soundness bug

## The result

A stock `circomlib` `LessThan(252)` circuit, given the field element
`a = p − 1` and `b = 1`, produces a **fully satisfying witness whose output
asserts `a < b`** — i.e. `p − 1 < 1`. No error, no `assert` failure, no warning
at compile or witness-generation time. Two more inputs (`a = p − 2²⁵² + 1`,
`a = p − 2²⁵¹`) do the same. Run it yourself:

```bash
git clone https://github.com/rehanmalik2008/Proof-of-Personhood && cd Proof-of-Personhood
npm ci
node scripts/repro_lessthan_hash.mjs
```

Output (abridged):

```
  a = P - 1 , b = 1
      -> circuit lt = 1   true (a<b) = 0   *** WRONG ***
  3 case(s) where LessThan(252) asserted a false comparison with a satisfying witness.
  sampled 200,000 Poseidon(1) outputs:  >= 2^252 : 66.79 %   (uniform (P-2^252)/P = 66.93 %)
```

## Why it matters

`LessThan(n)` is correct **only when both inputs are `< 2^n`**. That precondition
is `assert`ed on `n` (`n <= 252`) but **never on the inputs**, and it is not
stated in the gadget's doc-comment at the point of use. **66.9%** of BN254 field
elements — and of sampled `Poseidon(1)` outputs — are `>= 2²⁵²`, so any circuit
that feeds a hash output straight into `LessThan(252)` is comparing values that
are outside the gadget's contract most of the time.

The bug is invisible to honest-path testing: an honest prover never emits a
`>= 2²⁵²` value for a small logical quantity, so every functional test passes. It
is exercised only by a malicious prover supplying a high-field-element input, and
it silently defeats: sorted/indexed-Merkle non-membership, range checks on
commitments, ordering constraints on nullifier sets — any "is `x` between these
two hashes" construction.

(An earlier internal estimate of "~30%" was the fraction `>= 2²⁵³`, which is
33.9%. The number that matters for `LessThan(252)` is the `2²⁵²` fraction,
**66.9%**.)

## The gadget

```circom
// circomlib/circuits/comparators.circom
template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
    component n2b = Num2Bits(n+1);
    n2b.in <== in[0] + (1<<n) - in[1];
    out <== 1 - n2b.out[n];
}
```

Correctness argument (the one in every explainer): if `in[0], in[1] ∈ [0, 2^n)`
then `in[0] + 2^n - in[1] ∈ (0, 2^{n+1})`, fits in `n+1` bits, and bit `n` is the
"no borrow" flag, i.e. `1` iff `in[0] >= in[1]`. So `out = 1 - bit[n]` is `1` iff
`in[0] < in[1]`.

`Num2Bits(n+1)` uniquely pins `n2b.in` into `[0, 2^{n+1})` (for `n+1 <= 253`,
`2^{n+1}-1 < p`, so no modular aliasing). The moment `in[0] + 2^n - in[1]`, taken
**mod p**, leaves the `[0, 2^{n+1})` window that the honest argument assumes — or
re-enters it after wrapping past `p` — bit `n` no longer means "no borrow", and
`out` is whatever that stray bit happens to be.

## Minimal reproducer

Circuit (`circuits/cmp_hash_repro.circom` in this repo):

```circom
pragma circom 2.1.0;
include "comparators.circom";
template CmpHash() {
    signal input a;
    signal input b;
    signal output lt;            // claims: 1 iff a < b
    component c = LessThan(252);
    c.in[0] <== a;
    c.in[1] <== b;
    lt <== c.out;
}
component main = CmpHash();
```

Driver (`scripts/repro_lessthan_hash.mjs`), witness computed with `snarkjs`:

| a | b | true `a < b` | circuit `lt` | |
|---|---|:--:|:--:|---|
| 3 | 5 | 1 | 1 | ok |
| 5 | 3 | 0 | 0 | ok |
| `p − 2²⁵² + 1` | 0 | **0** | **1** | **wrong — witness generates fine** |
| `p − 1` | 1 | **0** | **1** | **wrong** |
| `p − 2²⁵¹` | 7 | **0** | **1** | **wrong** |

Worked example, row `a = p−1, b = 1`:
`n2b.in = (p−1) + 2²⁵² − 1 = p + 2²⁵² − 2 ≡ 2²⁵² − 2  (mod p)`.
`2²⁵² − 2 < 2²⁵³`, so `Num2Bits(253)` accepts it; bit 252 of `2²⁵² − 2` is `0`;
`out = 1 − 0 = 1`. The circuit asserts `p − 1 < 1`. A malicious prover supplying
`a = p − 1` has a fully satisfying witness for a false comparison.

No error, no `assert` failure, no warning at compile or witness time.

```bash
node scripts/repro_lessthan_hash.mjs
# (B) 3 case(s) where LessThan(252) asserted a false comparison with a satisfying witness.
# (C) sampled 200,000 Poseidon(1) outputs:  >= 2^252 : 66.79 %   >= 2^253 : 33.86 %
```

## Measured fraction affected (BN254, `p ≈ 2.188·10⁷⁶`)

| threshold | `(p − 2^k)/p` (uniform) | sampled `Poseidon(1)` (200k) |
|---|---:|---:|
| `>= 2²⁵²` (breaks `LessThan(252)`) | **66.93 %** | 66.79 % |
| `>= 2²⁵³` | 33.87 % | 33.86 % |

(An earlier internal estimate of "~30%" was for the `2²⁵³` threshold; the figure
that matters for `LessThan(252)` is the `2²⁵²` one, ≈ **67%**.)

## Classes of construction at risk

Any circuit that magnitude-compares a value that is not independently
range-constrained to `< 2^n`:

- **Sorted / indexed Merkle accumulators for non-membership** — `leaf_low < x <
  leaf_high`, where the leaves are hash commitments. A prover can place `x`
  outside the true gap.
- **Range checks on commitments / balances** carried as hash outputs or as
  values that can reach the top third of the field.
- **Ordering constraints on nullifier sets** — "these nullifiers are strictly
  increasing" used to prove no duplicates; a high-field-element nullifier
  defeats the ordering.
- **Any "is this leaf between those leaves" / rank / percentile gadget** over
  hashed keys.
- **Timestamp / epoch monotonicity** when the epoch value is derived from a hash.

The common precondition for exploitability: the compared value is (a)
attacker-influenced and (b) not already proven `< 2^n` by a separate
`Num2Bits(n)` / `AliasCheck`. Honest provers never emit a `>= 2^252` value for a
small logical quantity, which is why test suites pass.

## Two safe patterns

**1 — Restricted 252-bit domain (cheap; state the birthday cost).**
Define the compared identifier as a value provably `< 2²⁵²` and range-check it
before comparison:

```circom
component rc = Num2Bits(252);  rc.in <== x;   // now x < 2^252 is enforced
component lt = LessThan(252);  lt.in[0] <== x; lt.in[1] <== y;
```

If `x` must come from a hash, use `x = hashLow252 = Poseidon(...) \ 4` (drop the
top 2 bits) or a 252-bit domain-separated hash. Collision resistance drops from
~128-bit to **~126-bit** (birthday over 2²⁵²); for identifiers/keys that is
still infeasible to collide, and the only consequence of a collision is that two
distinct values become order-equivalent. Adds `252` constraints per bounded
value.

**2 — Full-field comparison (sound for all of `[0, p)`; ~2× the cost).**
Bit-decompose each operand with `Num2Bits(254)` (which range-checks it, and
`2²⁵⁴ > p` so every field element has a rep) and compare most-significant-bit
first:

```circom
template LtField() {                 // out = 1 iff a < b, for any a,b in [0,p)
    signal input a; signal input b; signal output out;
    component ab = Num2Bits(254);  ab.in <== a;
    component bb = Num2Bits(254);  bb.in <== b;
    signal lt[255]; signal eqPrefix[255];
    lt[254] <== 0; eqPrefix[254] <== 1;
    signal dd[254]; signal dlt[254];
    for (var i = 253; i >= 0; i--) {
        dd[i]  <== (ab.out[i] - bb.out[i]) * (ab.out[i] - bb.out[i]);
        dlt[i] <== (1 - ab.out[i]) * bb.out[i];
        lt[i]  <== lt[i+1] + eqPrefix[i+1] * dlt[i];
        eqPrefix[i] <== eqPrefix[i+1] * (1 - dd[i]);
    }
    out <== lt[0];
}
```

Cost ≈ `4·254 + 2·254 ≈ 1.5k` constraints per comparison (vs `~252` for the
unsound `LessThan(252)`). This repo uses this gadget in
`circuits/wedge_nonmembership_imt.circom`.

*(A stricter variant of pattern 2 also rejects any `a` or `b` that is `>= p`
via `AliasCheck`; not needed when the operands are already reduced field
elements, which snarkjs witness values always are.)*

## Suggested remediation upstream

- **circomlib:** either add an input range assertion to `LessThan` (breaking for
  callers who pass wide values, but those are already unsound), or ship a
  clearly-named `LessThanFull` / `LessThanBits(254)` alternative and cross-link
  it from `LessThan`'s doc-comment with an explicit "inputs MUST be `< 2^n`; hash
  outputs are not" warning.
- **circom / lint:** a warning when a signal that transitively derives from a
  known permutation gadget (`Poseidon`, `MiMC`, `Pedersen`) flows into
  `LessThan`/`GreaterThan`/`LessEqThan`/`GreaterEqThan` without an intervening
  `Num2Bits(<=252)` / `AliasCheck`.
- **zk-bug-tracker:** catalogue as a named class ("magnitude comparison on
  unrange-checked wide value").

## Environment

- circom `2.x` via `circom2` npm `0.2.23`; circomlib `2.0.5`; snarkjs `0.7.6`;
  node `24.14.0`.
- Reproducer: `circuits/cmp_hash_repro.circom`, `scripts/repro_lessthan_hash.mjs`
  in `github.com/rehanmalik2008/Proof-of-Personhood`.
- BN254 scalar field
  `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.

Happy to contribute the reproducer circuit and driver as a regression fixture.
