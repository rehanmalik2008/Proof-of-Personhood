# Falsification #3 -- the amortised bond (measured)

_`scripts/sim/amortized_bond.mjs`. Units of b (bribe=1), delta=0.95, T=10 epochs. P = full rational cap = M*delta*b._

## B_required (multiples of b) to make reporting dominant

| M (batch size) | naive (h=0, casc=0) | + independent hazard h=0.05 | + cascade casc=0.9, h=0.02 |
|---:|---:|---:|---:|
| 1 | 0.95 | 0.95 | 0.095 |
| 3 | 4.75 | 0.331 | 0 |
| 10 | 18.05 | 0 | 0 |
| 30 | 56.05 | 0 | 0 |
| 100 | 189.05 | 0 | 0 |

(bond-still-live probability at M=10, h=0.05: 0.0099; at M=30: 0)

## Reading

- NAIVE (no batch decay, no cascade, pi=0): B_required grows ~linearly in M -- an amortised bond covering M corruptions demands B ~ (2M-1)*b. This is the break Falsification #3 names: the P <~ b bound becomes P <~ M*b and the required bounty scales with M.
- BUT the amortised bond is FRAGILE. It is forfeited on the FIRST revocation anywhere in the batch. With a per-credential independent revocation hazard h, the probability the bond is still unspent decays as (1-h)^{T(M-1)} -- for M=10, h=0.05, T=10 that is (0.95)^90 ~ 0.01. A bond that is almost certainly already gone deters nothing: B_required collapses back toward the single-corruption value.
- CASCADING DETECTION (Result 2) finishes it: if revoking one corrupt attester triggers cluster scrutiny that revokes the whole batch with prob casc, then silence does not protect the bond OR the future income -- both are lost regardless of the attester's choice -- so reporting (for bounty + immunity) strictly dominates. At casc=0.9 the amortised advantage is essentially gone at every M.
- => Falsification #3 is REAL but SELF-LIMITING. An amortised bond inflates B_required only in the absence of (a) independent batch-revocation hazard and (b) cascading correlation-driven detection. Both are present in the design 'Two Answers' already requires (Result 2). The effective B_required with hazard+cascade stays within a small multiple of b, so the B > 2b rule survives PROVIDED cascading detection is deployed -- which Result 2 already makes mandatory for redundancy to be safe.
- The residual honest statement: without cascading detection, an amortised bond does break B > 2b and the required bounty scales with the attacker's batch size. Cascading detection is therefore load-bearing for BOTH redundancy safety (Result 2) AND the bounty bound (Result 3).
