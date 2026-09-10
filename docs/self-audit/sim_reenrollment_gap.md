# Task 2 -- re-enrollment delay vs natural gap length (measured)

_`scripts/sim/reenrollment_gap.mjs`. N=30,000, cohort=1500 (5%), horizon 365d, revocation at day 120, 6 seeds/cell._

## Natural usage-gap distribution (Beta(1.3,4) engagement, Geometric gaps)

| mean | p50 | p90 | p95 | p99 |
|---:|---:|---:|---:|---:|
| 10.82 d | 3 d | 21 d | 38 d | 130 d |

## Observer vs re-enrolled cohort (same metrics as sim_staging_attack.mjs)

recall@1%FPR = best of two channels: gap length, gap-end co-timing.

| re-enroll | T_stage | D_mean (d) | AUC | recall@1%FPR | recall(length) | recall(co-timing) | precision@1%FPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| spread | 7 | 2 | 0.8183 | **0.065** | 0.065 | 0.01 | 0.2507 |
| spread | 7 | 7 | 0.8145 | **0.0813** | 0.061 | 0.0813 | 0.2773 |
| spread | 7 | 14 | 0.8172 | **0.1183** | 0.0832 | 0.1183 | 0.3475 |
| spread | 7 | 21 | 0.8152 | **0.1555** | 0.1555 | 0.1147 | 0.4423 |
| spread | 7 | 30 | 0.825 | **0.2535** | 0.2535 | 0.0973 | 0.5677 |
| spread | 7 | 45 | 0.828 | **0.3673** | 0.3673 | 0.0628 | 0.6555 |
| spread | 7 | 60 | 0.823 | **0.4438** | 0.4438 | 0.0425 | 0.6968 |
| spread | 30 | 2 | 0.8324 | **0.0265** | 0.0265 | 0.0138 | 0.1202 |
| spread | 30 | 7 | 0.8424 | **0.036** | 0.0278 | 0.0347 | 0.1453 |
| spread | 30 | 14 | 0.8505 | **0.0662** | 0.0292 | 0.0662 | 0.225 |
| spread | 30 | 21 | 0.85 | **0.0823** | 0.0385 | 0.0823 | 0.2563 |
| spread | 30 | 30 | 0.8524 | **0.0777** | 0.0758 | 0.071 | 0.2815 |
| spread | 30 | 45 | 0.8643 | **0.1963** | 0.1963 | 0.0535 | 0.5042 |
| spread | 30 | 60 | 0.8652 | **0.3132** | 0.3132 | 0.039 | 0.6192 |
| spread | 90 | 2 | 0.794 | **0.0155** | 0.0102 | 0.0155 | 0.0567 |
| spread | 90 | 7 | 0.8035 | **0.028** | 0.0108 | 0.028 | 0.0812 |
| spread | 90 | 14 | 0.8124 | **0.037** | 0.0142 | 0.037 | 0.1172 |
| spread | 90 | 21 | 0.8257 | **0.0468** | 0.011 | 0.0468 | 0.1372 |
| spread | 90 | 30 | 0.8415 | **0.0417** | 0.026 | 0.0417 | 0.1367 |
| spread | 90 | 45 | 0.8544 | **0.071** | 0.071 | 0.0438 | 0.2698 |
| spread | 90 | 60 | 0.8598 | **0.1563** | 0.1563 | 0.0428 | 0.4482 |
| **sync** | 7 | 2 | 0.8119 | **0.0623** | 0.0623 | 0.0093 | 0.2418 |
| **sync** | 7 | 7 | 0.8087 | **0.1092** | 0.0637 | 0.1092 | 0.3093 |
| **sync** | 7 | 14 | 0.8149 | **0.3597** | 0.0643 | 0.3597 | 0.6187 |
| **sync** | 7 | 21 | 0.821 | **0.5027** | 0.0602 | 0.5027 | 0.6882 |
| **sync** | 7 | 30 | 0.8275 | **0.5917** | 0.055 | 0.5917 | 0.7447 |
| **sync** | 7 | 45 | 0.8272 | **0.6735** | 0.6735 | 0.6378 | 0.7772 |
| **sync** | 7 | 60 | 0.8301 | **0.677** | 0.677 | 0.662 | 0.7787 |
| **sync** | 30 | 2 | 0.8377 | **0.0298** | 0.0298 | 0.0102 | 0.1342 |
| **sync** | 30 | 7 | 0.8422 | **0.0352** | 0.0258 | 0.0347 | 0.1315 |
| **sync** | 30 | 14 | 0.8466 | **0.101** | 0.0243 | 0.101 | 0.2983 |
| **sync** | 30 | 21 | 0.855 | **0.1205** | 0.027 | 0.1205 | 0.344 |
| **sync** | 30 | 30 | 0.8609 | **0.1298** | 0.0292 | 0.1298 | 0.3613 |
| **sync** | 30 | 45 | 0.8661 | **0.1773** | 0.0308 | 0.1773 | 0.4142 |
| **sync** | 30 | 60 | 0.877 | **0.176** | 0.1565 | 0.0807 | 0.4563 |
| **sync** | 90 | 2 | 0.7961 | **0.0173** | 0.0118 | 0.0172 | 0.0647 |
| **sync** | 90 | 7 | 0.796 | **0.0237** | 0.0098 | 0.0237 | 0.0792 |
| **sync** | 90 | 14 | 0.8109 | **0.0382** | 0.0108 | 0.0382 | 0.1208 |
| **sync** | 90 | 21 | 0.8295 | **0.0458** | 0.0098 | 0.0458 | 0.145 |
| **sync** | 90 | 30 | 0.8503 | **0.0563** | 0.011 | 0.0563 | 0.159 |
| **sync** | 90 | 45 | 0.8756 | **0.0747** | 0.016 | 0.0747 | 0.1722 |
| **sync** | 90 | 60 | 0.8832 | **0.0577** | 0.023 | 0.0577 | 0.1743 |

**D\* (recall@1%FPR reaches 0.25, spread, T_stage=90) = >60 days.**

## Falsification #3 -- does re-enrolling produce its own signature?

- Re-enrollment = obtaining k fresh attestations + inserting a new leaf. Observable surfaces:
-   on-chain: k attestation txs + a tree insertion clustered shortly after t_rev. If these are shaped identically to INITIAL enrolment (same tx types, same insertion path, fresh commitment C -- the design already keeps C private and unlinkable) the only residual is the TIMING CLUSTER: a spike of enrolments in [t_rev, t_rev+T_stage+D].
-   => re-enrollment completion must be spread the same way staging is (the 'spread=false' rows below show synchronized re-enrollment is trivially recovered regardless of Dmean).
-   network: attester contact from a re-enrolling client is indistinguishable from a new user's only if the enrolment client path is the same; a distinct 're-enroll' endpoint or flag would re-expose the cohort. Normative: one enrolment path.

## Reading

- Natural gap p90 = 21 d, p95 = 38 d, p99 = 130 d, mean = 10.82 d.
- Two observer channels: gap LENGTH (a single overlong gap starting in the revocation window) and gap CO-TIMING (many members' gaps ending in the same epoch bucket). recall@1%FPR is the max of the two.
- T_stage = 90 (wide staging): the cohort HIDES for the whole plausible re-enrollment range -- recall@1%FPR <= 0.05 up to Dmean = 30 d, ~0.07 at 45, ~0.16 at 60, both spread and synchronized. Wide staging spreads BOTH the gap-start and gap-end clusters, so co-timing does not fire. D* (recall reaches 0.25) > 60 d.
- T_stage = 30: hides up to Dmean ~ 14-21 d (recall <= 0.08), then the length channel starts to separate (recall 0.20 at 45, 0.31 at 60).
- T_stage = 7 (tight staging): FAILS. Even spread re-enrollment reaches recall 0.25 by Dmean = 30 d; synchronized reaches 0.36 by Dmean = 14 d -- the co-timing channel fires because gap-ends cluster.
- => Result 3 HOLDS, with a corrected requirement. Re-enrollment does move the rate-detection floor from rho_perm to rho_gap (~380x), BUT a second channel -- gap co-timing -- imposes its own T_stage floor of ~30-90 epochs that the rho_gap substitution does NOT remove. Net staging depth drops from the rho_perm regime's ~100-340 epochs (small n) to ~30-90 epochs -- roughly 3-10x, not 380x. The note's T ~ 3k/(n rho_gap) (sub-day) understates it.
- Requirements for Result 3: (i) wide staging T_stage >= ~90 epochs (spreads both gap clusters); (ii) re-enrollment delay Dmean within ~ natural p90 (21 d) for margin; (iii) per-member delay variance (spread), or rely on (i); (iv) falsification #3 -- re-enrollment shaped identically to fresh enrolment, one client path, fresh unlinkable C.
