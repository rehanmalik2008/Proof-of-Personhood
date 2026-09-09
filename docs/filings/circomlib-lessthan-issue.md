## `LessThan(n)` silently accepts false comparisons when an input is `>= 2^n` (e.g. a Poseidon output)

### What happens

`LessThan(n)` is sound only when **both inputs are `< 2^n`**. That precondition
is `assert`ed on `n` (`assert(n <= 252)`) but **never on the inputs**, and it is
not mentioned in the doc-comment where a caller reads it. When an input is
`>= 2^n`, the gadget still produces a satisfying witness and `out` can assert a
**false** ordering.

Concrete: a stock `LessThan(252)` fed `a = p - 1`, `b = 1` (both valid BN254
field elements) yields a fully satisfying witness with `out = 1`, i.e. it
certifies `p - 1 < 1`. No error at compile or witness generation.

### Why it's easy to hit

`LessThan(252)` is the natural choice for comparing hashes — sorted / indexed
Merkle non-membership (`leaf_low < x < leaf_high`), range checks on commitments,
strictly-increasing nullifier sets. But **66.9%** of BN254 field elements (and of
sampled `Poseidon(1)` outputs) are `>= 2^252`:

| threshold | `(p - 2^k)/p` | sampled `Poseidon(1)`, n=200k |
|---|---:|---:|
| `>= 2^252` (breaks `LessThan(252)`) | 66.93% | 66.79% |
| `>= 2^253` | 33.87% | 33.86% |

So a comparison of two hash outputs is outside the gadget's contract most of the
time. It passes every honest-path test (honest provers never produce a `>= 2^252`
value for a small logical quantity) and is exercised only by a malicious prover.

### Mechanism

```circom
template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
    component n2b = Num2Bits(n+1);
    n2b.in <== in[0] + (1<<n) - in[1];
    out <== 1 - n2b.out[n];
}
```

The correctness argument assumes `in[0] + 2^n - in[1] ∈ (0, 2^{n+1})`, so bit `n`
is the "no borrow" flag. With `in[0] = p-1`, `in[1] = 1`, `n = 252`:
`n2b.in = (p-1) + 2^252 - 1 = p + 2^252 - 2 ≡ 2^252 - 2 (mod p)`. That is
`< 2^253`, so `Num2Bits(253)` accepts it; bit 252 of `2^252 - 2` is `0`;
`out = 1 - 0 = 1`. The wrap past `p` flipped the borrow bit.

### Reproducer

```bash
git clone https://github.com/rehanmalik2008/Proof-of-Personhood
cd Proof-of-Personhood && npm ci
node scripts/repro_lessthan_hash.mjs
```

`circuits/cmp_hash_repro.circom` is `lt <== LessThan(252)(a, b)`; the driver
computes witnesses with `snarkjs` and prints the comparison table plus the
measured hash-output fraction. Toolchain: `circom2` npm `0.2.23`, `circomlib`
`2.0.5`, `snarkjs` `0.7.6`, node `24.14.0`.

### Suggested fix (either or both)

1. **Doc-comment at the gadget**: state "inputs MUST be `< 2^n`; this is NOT
   checked. Hash outputs (Poseidon, MiMC, Pedersen) are ~254-bit and routinely
   violate this — range-check them with `Num2Bits(n)` first, or use a full-field
   comparison." Same for `GreaterThan`, `LessEqThan`, `GreaterEqThan`, which
   wrap `LessThan`.
2. **A safe variant** in `comparators.circom`, e.g. `LessThanFull()` that
   bit-decomposes each operand with `Num2Bits(254)` (which range-checks it; every
   field element has a 254-bit rep since `2^254 > p`) and compares MSB-first.
   ~1.5k constraints vs ~252, but sound for all of `[0, p)`.

Happy to send the reproducer circuit + driver as a regression fixture, and/or a
PR for option 2.
