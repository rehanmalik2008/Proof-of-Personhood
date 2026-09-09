# circomlib `LessThan` silently accepts `p − 1 < 1`

*A demonstrated, silent soundness bug when comparing hash outputs in Circom, and
how to avoid it.*

## TL;DR

- `circomlib`'s `LessThan(n)` is sound only if both inputs are `< 2ⁿ`. That
  condition is asserted on `n`, never on the inputs, and isn't in the
  doc-comment.
- A stock `LessThan(252)` circuit accepts a **satisfying witness asserting
  `p − 1 < 1`** (where `p` is the BN254 scalar field order). No error, no warning.
- **66.9%** of BN254 field elements — and of Poseidon hash outputs — are `≥ 2²⁵²`,
  so any circuit comparing hash outputs with `LessThan(252)` is off-contract most
  of the time.
- It never shows up in normal testing; only a malicious prover triggers it. It
  breaks sorted-Merkle non-membership, commitment range checks, nullifier
  ordering — anything of the form "is `x` between these two hashes".
- Fix: range-check the operands to 252 bits first (cheap, ~126-bit birthday cost
  if derived from a hash), or use a full-field 254-bit comparison (~1.5k
  constraints, sound everywhere).

## The gadget

```circom
// circomlib/circuits/comparators.circom
template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + (1 << n) - in[1];
    out <== 1 - n2b.out[n];
}
```

The idea: if `in[0], in[1] ∈ [0, 2ⁿ)` then `in[0] + 2ⁿ − in[1] ∈ (0, 2ⁿ⁺¹)`,
which fits in `n + 1` bits, and bit `n` is a "no borrow" flag — set iff
`in[0] ≥ in[1]`. So `out = 1 − bit[n]` is `1` iff `in[0] < in[1]`.

`Num2Bits(n + 1)` does pin `n2b.in` into `[0, 2ⁿ⁺¹)` (for `n + 1 ≤ 253`, since
`2²⁵³ − 1 < p`, the decomposition is unique). The unstated assumption is that the
*integer* `in[0] + 2ⁿ − in[1]` already lands in that window. If it doesn't —
because an operand is `≥ 2ⁿ`, so the sum wraps modulo `p` — bit `n` is just
whatever bit happens to sit there, and `out` is meaningless.

## The demonstration

Circuit:

```circom
pragma circom 2.1.0;
include "comparators.circom";
template CmpHash() {
    signal input a;
    signal input b;
    signal output lt;          // claims: 1 iff a < b
    component c = LessThan(252);
    c.in[0] <== a;
    c.in[1] <== b;
    lt <== c.out;
}
component main = CmpHash();
```

Witnesses (computed with `snarkjs`), `p =
21888242871839275222246405745257275088548364400416034343698204186575808495617`:

| `a` | `b` | true `a < b` | circuit `lt` | |
|---|---|:--:|:--:|---|
| 3 | 5 | 1 | 1 | ok |
| 5 | 3 | 0 | 0 | ok |
| `p − 2²⁵² + 1` | 0 | **0** | **1** | wrong |
| `p − 1` | 1 | **0** | **1** | wrong |
| `p − 2²⁵¹` | 7 | **0** | **1** | wrong |

Worked example, `a = p − 1`, `b = 1`, `n = 252`:

```
n2b.in = (p − 1) + 2²⁵² − 1 = p + 2²⁵² − 2 ≡ 2²⁵² − 2   (mod p)
2²⁵² − 2 < 2²⁵³           → Num2Bits(253) accepts it
bit 252 of (2²⁵² − 2) = 0 → out = 1 − 0 = 1  → "p − 1 < 1"
```

A malicious prover who can choose `a = p − 1` has a fully valid proof that
`p − 1 < 1`.

## How often the precondition is violated

For uniform field elements, `Pr[x ≥ 2ᵏ] = (p − 2ᵏ)/p`:

| threshold | analytic | 200k sampled `Poseidon(1)` outputs |
|---|---:|---:|
| `≥ 2²⁵²` (breaks `LessThan(252)`) | 66.93% | 66.79% |
| `≥ 2²⁵³` | 33.87% | 33.86% |

So if you compare two Poseidon outputs with `LessThan(252)`, in ~89% of random
pairs at least one operand is off-contract (`1 − 0.331²`), and a prover who
controls one operand can always choose one that is.

## What's at risk

Any construction that magnitude-compares a value that isn't independently
range-checked to `< 2ⁿ`, where that value is attacker-influenced:

- **Sorted / indexed Merkle trees for non-membership** — `leaf_low < x <
  leaf_high` over hash leaves; a prover can place `x` outside the real gap and
  prove non-membership of a value that IS in the set.
- **Range checks on commitments / balances** stored as hashes.
- **Strictly-increasing nullifier sets** used to prove no double-spend; a
  high-field-element nullifier defeats the ordering.
- **Rank / percentile / "between" gadgets** over hashed keys.
- **Epoch / timestamp monotonicity** where the value comes from a hash.

Honest-path tests won't catch any of it: honest witnesses don't carry `≥ 2²⁵²`
values for small quantities.

## Fixes

### 1. Restricted 252-bit domain (cheap)

Range-check the operand before comparing:

```circom
component rc = Num2Bits(252);  rc.in <== x;    // enforces x < 2²⁵²
component lt = LessThan(252);  lt.in[0] <== x;  lt.in[1] <== y;
```

If `x` comes from a hash, define it as a 252-bit value — `Poseidon(...) \ 4`
(drop the top 2 bits) or a domain-separated 252-bit hash. Collision resistance
drops from ~128-bit to ~126-bit (birthday over `2²⁵²`); still infeasible, and the
only effect of a collision is that two distinct values become order-equivalent.
Cost: +252 constraints per bounded operand.

### 2. Full-field comparison (sound for all of `[0, p)`)

```circom
template LtField() {                 // out = 1 iff a < b, any a,b in [0,p)
    signal input a; signal input b; signal output out;
    component ab = Num2Bits(254);  ab.in <== a;   // range-checks a (2²⁵⁴ > p)
    component bb = Num2Bits(254);  bb.in <== b;
    signal lt[255]; signal eqPrefix[255];
    lt[254] <== 0; eqPrefix[254] <== 1;
    signal dd[254]; signal dlt[254];
    for (var i = 253; i >= 0; i--) {
        dd[i]  <== (ab.out[i] - bb.out[i]) * (ab.out[i] - bb.out[i]); // bits differ
        dlt[i] <== (1 - ab.out[i]) * bb.out[i];                       // a_i=0, b_i=1
        lt[i]  <== lt[i+1] + eqPrefix[i+1] * dlt[i];
        eqPrefix[i] <== eqPrefix[i+1] * (1 - dd[i]);
    }
    out <== lt[0];
}
```

~1.5k constraints per comparison (vs ~252). Add `AliasCheck` on the operands too
if they might exceed `p` (not needed for reduced witness values).

## Reproducer

```bash
git clone https://github.com/rehanmalik2008/Proof-of-Personhood
cd Proof-of-Personhood && npm ci
node scripts/repro_lessthan_hash.mjs
```

Toolchain: `circom2` npm 0.2.23, `circomlib` 2.0.5, `snarkjs` 0.7.6, node
24.14.0. The same math applies to any Circom/circomlib version whose `LessThan`
has this shape, and to `GreaterThan` / `LessEqThan` / `GreaterEqThan`, which wrap
it.

## Takeaway

`LessThan` on a hash output isn't a smaller-than-expected security margin — it's
a gadget used outside its precondition, silently, on a majority of inputs. If you
have a Circom circuit that magnitude-compares Poseidon outputs with
`LessThan(≤252)` and doesn't range-check them first, treat it as a soundness bug
until shown otherwise.
