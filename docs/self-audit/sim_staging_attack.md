# Task 2 -- staging-correlation attack (measured)

_`scripts/sim/staging_correlation_attack.mjs`. N=40,000, rho_perm=0.00079, rho_gap=0.3, 8 seeds/cell. Classifier: silent-run-length (uniform client failure). AUC 0.5 = hidden, 1.0 = recovered._

| \|C\| | mode | T | H | AUC | prec@TPR90 | FPR@TPR90 | anon-set@TPR90 | prec@TPR50 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 400 (1%) | burst | 1 | 300 | **0.9987** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | burst | 1 | 600 | **0.9988** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 7 | 300 | **0.9963** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 7 | 600 | **0.9965** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 30 | 300 | **0.9875** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 30 | 600 | **0.9874** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 90 | 300 | **0.9655** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 90 | 600 | **0.9657** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 180 | 300 | **0.9348** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | index | 180 | 600 | **0.9348** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 7 | 300 | **0.9964** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 7 | 600 | **0.9964** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 30 | 300 | **0.9875** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 30 | 600 | **0.9877** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 90 | 300 | **0.9655** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 90 | 600 | **0.9652** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 180 | 300 | **0.9345** | 0.01 | 1 | 40,000 | 0.01 |
| 400 (1%) | uniform | 180 | 600 | **0.9342** | 0.01 | 1 | 40,000 | 0.01 |
| 2000 (5%) | burst | 1 | 300 | **0.9988** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | burst | 1 | 600 | **0.9988** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 7 | 300 | **0.9964** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 7 | 600 | **0.9962** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 30 | 300 | **0.9873** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 30 | 600 | **0.9874** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 90 | 300 | **0.9649** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 90 | 600 | **0.9657** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 180 | 300 | **0.9341** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | index | 180 | 600 | **0.9342** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 7 | 300 | **0.9964** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 7 | 600 | **0.9964** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 30 | 300 | **0.9876** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 30 | 600 | **0.9874** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 90 | 300 | **0.9652** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 90 | 600 | **0.9649** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 180 | 300 | **0.9345** | 0.05 | 1 | 40,000 | 0.05 |
| 2000 (5%) | uniform | 180 | 600 | **0.9342** | 0.05 | 1 | 40,000 | 0.05 |

## Adaptive observer -- theta calibrated to ~1% FPR on a pilot cohort (|C|=2000, 5% of N)

Decisive metric: fraction of the real cohort a calibrated patient observer fingers, at what precision.
Attrition floor = rho_perm*N = 31.6 benign permanent stops/epoch.

| mode | T | staged rate /epoch | above floor? | H | recall | precision | members identified | anon-set / member |
|---|---:|---:|:--:|---:|---:|---:|---:|---:|
| burst | 1 | 2000 | yes | 300 | 1 | 0.836 | 2000 | 2,392 |
| burst | 1 | 2000 | yes | 600 | 1 | 0.836 | 2000 | 2,394 |
| index | 30 | 66.7 | yes | 300 | 0.399 | 0.671 | 798 | 1,188 |
| index | 30 | 66.7 | yes | 600 | 0.402 | 0.672 | 804 | 1,196 |
| index | 90 | 22.2 | **no** | 300 | 0.142 | 0.418 | 284 | 677 |
| index | 90 | 22.2 | **no** | 600 | 0.145 | 0.422 | 290 | 687 |
| index | 180 | 11.1 | **no** | 300 | 0.081 | 0.291 | 162 | 559 |
| index | 180 | 11.1 | **no** | 600 | 0.077 | 0.283 | 154 | 548 |
| uniform | 30 | 66.7 | yes | 300 | 0.412 | 0.676 | 824 | 1,219 |
| uniform | 30 | 66.7 | yes | 600 | 0.416 | 0.683 | 832 | 1,218 |
| uniform | 90 | 22.2 | **no** | 300 | 0.141 | 0.414 | 282 | 679 |
| uniform | 90 | 22.2 | **no** | 600 | 0.144 | 0.423 | 288 | 679 |
| uniform | 180 | 11.1 | **no** | 300 | 0.081 | 0.286 | 162 | 564 |
| uniform | 180 | 11.1 | **no** | 600 | 0.077 | 0.281 | 154 | 551 |

## Reading

- AUC here is NOT the headline: it is dominated by the alive-vs-stopped split (Theorem 9 -- a revocation event is always detectable). It says the observer knows a cohort exists, not who is in it.
- The decisive table is the adaptive observer: at a fixed 1% false-positive rate, what fraction of the cohort does a calibrated patient observer actually finger?
- burst / index (correlated) staging: high recall at high precision at every T -- the cohort IS recovered. Correlated staging only delays.
- uniform staging with |C|/T ABOVE the attrition floor rho_perm*N: still largely recovered (recall ~0.4, precision ~0.7 at T=30).
- uniform staging with |C|/T BELOW the floor (T=90,180): recall collapses to ~0.08-0.15 at precision ~0.28-0.42. The un-fingered majority of the cohort is genuinely mixed into benign permanent attrition, and a 2x horizon does not help -- benign quitters are a permanent equal-rate decoy. In this regime staging HIDES the bulk of the cohort, not merely delays.
- But it is PARTIAL: even in the good regime a 1%-FPR observer still fingers ~8-15% of members. Perfect cohort privacy is not achieved.
- Condition for the good regime: uniform randomised staging + T >= ~3x |C|/(rho_perm N) + uniform client failure. The 3x (vs the naive |C|/(rho N)) is what buys per-member privacy, and it multiplies the Theorem 10 economic cost accordingly.
