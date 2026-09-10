# Task 3 -- the reporting race under side payments (measured)

_`scripts/sim/reporting_race.mjs`. Units of `b` (bribe = 1). V=3, S=2, pd=0.35, pd0=0.02._

## The r*=0 Nash boundary (does the pre-paid bond defeat the race?)

All-silent is a Nash equilibrium iff **`delta*b + P >= B + pd0(S+V)`** (= B + 0.1). **k-independent** for the r*=0 NE; k only changes the mixed `r*` and how fast the cartel unravels once someone reports.

So the bond P substitutes one-for-one for the bribe against the bounty: **the pre-paid bond defeats the race exactly when `P >= B - delta*b + pd0(S+V)`.**

## Regime shares over the (delta, B/b, P/b) grid

| k | % SILENCE | % MIXED | % REPORT | % SILENCE with B >= b |
|---:|---:|---:|---:|---:|
| 2 | 59.7 | 0 | 40.3 | 22.6 |
| 3 | 59.7 | 0 | 40.3 | 22.6 |
| 5 | 59.7 | 4.2 | 36.1 | 22.6 |

## Minimum bond P/b that restores silence, at delta = 0.95

| k \ B/b | 0.1 | 0.3 | 0.5 | 1 | 2 | 3 | 5 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 0 | 0 | 0 | 0.25 | 1.5 | 2.5 | 5 | 10 |
| 3 | 0 | 0 | 0 | 0.25 | 1.5 | 2.5 | 5 | 10 |
| 5 | 0 | 0 | 0 | 0.25 | 1.5 | 2.5 | 5 | 10 |

(At delta=0.95 the bribe's discounted value is 0.95b, so silence needs P >~ B - 0.95 + 0.1. The table is that line, k-independent as predicted.)

## Boundary case f > 1/k (attacker controls most of the pool)

Anonymity's protection is scaled by `(1 - f^k)`: with prob `f^k` the attacker controls all k and punishes everyone cheaply.

| k | f | 1 - f^k | B/b beyond which no P<=5 restores silence |
|---:|---:|---:|---:|
| 2 | 0.1 | 0.99 | 8 |
| 2 | 0.2 | 0.96 | 8 |
| 2 | 0.5 | 0.75 | 8 |
| 2 | 0.4 | 0.84 | 8 |
| 2 | 0.6 | 0.64 | 12 |
| 2 | 0.8 | 0.36 | 20 |
| 2 | 0.95 | 0.098 | >40 |
| 3 | 0.1 | 0.999 | 8 |
| 3 | 0.2 | 0.992 | 8 |
| 3 | 0.333 | 0.963 | 8 |
| 3 | 0.4 | 0.936 | 8 |
| 3 | 0.6 | 0.784 | 8 |
| 3 | 0.8 | 0.488 | 20 |
| 3 | 0.95 | 0.143 | >40 |
| 5 | 0.1 | 1 | 8 |
| 5 | 0.2 | 1 | 8 |
| 5 | 0.2 | 1 | 8 |
| 5 | 0.4 | 0.99 | 8 |
| 5 | 0.6 | 0.922 | 8 |
| 5 | 0.8 | 0.672 | 12 |
| 5 | 0.95 | 0.226 | 40 |

## Reading

- **The pre-paid bond DOES defeat the race.** Silence is a Nash equilibrium whenever `P >= B - delta*b + pd0(S+V)`, and this is k-independent. A patient attacker who can post bonds neutralises any fixed bounty by setting `P ~ B`.
- The defender's counter is to make the bond unpostable or unrefundable-in-practice: the bond is paid to the *attacker*, who must be trusted to refund it on silence. A briber who reliably refunds bonds has a reputation among attesters -- the out-of-band reputation channel that anonymity was meant to remove -- and that channel is itself observable and attackable. **The race survives only to the extent the attacker cannot run a credible bond-refund reputation.**
- Result A3's race is therefore **conditional**, not unconditional: it holds against an attacker who cannot commit to refunding bonds, and fails against one who can. This should be stated as the boundary.
- For `f` near 1 (attacker controls most of the pool) the bounty is defeated regardless of P: `(1-f^k) -> 0`, collective punishment is cheap, and anonymity provides no protection. Matches the source's honest residual.
