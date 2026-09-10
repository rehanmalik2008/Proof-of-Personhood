# Falsification #1 -- is holding / switching surplus attestations observable? (measured)

_`scripts/sim/surplus_attestation_leak.mjs`. N=40,000, pool n=100, k=3._

## Scenario A -- subsets HIDDEN (paper Phase-2 reveals only {N, y})

| k' | AUC | recall @1%FPR |
|---:|---:|---:|
| 5 | 0.4987 | 0.009 |

With k'-1 >= k, cohort members re-prove with a spare subset at their next ordinary use -- **no gap, no proof-content change, AUC = 0.5**. Result 1 holds.

## Scenario B -- subsets REVEALED (grinding-resistance 'verifier-checked assignment' exposes the k keys)

| k' | background rotation | AUC | recall @1%FPR | precision @1%FPR |
|---:|---:|---:|---:|---:|
| 4 | 0 | **1** | 1 | 0.0405 |
| 4 | 0.001 | **0.9997** | 1 | 0.0408 |
| 4 | 0.005 | **0.9953** | 0.6057 | 0.6803 |
| 4 | 0.02 | **0.977** | 0.1383 | 0.1767 |
| 5 | 0 | **1** | 1 | 0.0495 |
| 5 | 0.001 | **0.9998** | 1 | 0.0505 |
| 5 | 0.005 | **0.9954** | 0.611 | 0.7322 |
| 5 | 0.02 | **0.9777** | 0.1363 | 0.2152 |
| 6 | 0 | **1** | 1 | 0.0597 |
| 6 | 0.001 | **0.9998** | 1 | 0.0602 |
| 6 | 0.005 | **0.9954** | 0.609 | 0.7718 |
| 6 | 0.02 | **0.977** | 0.132 | 0.2447 |

A subset change whose dropped element is the revoked attester is a direct per-user signal. Background rotation adds false positives but does not hide the cohort.

## Verdict

- SCENARIO A (subsets hidden -- the paper's current Phase-2 design reveals only {N,y}): switching to a spare k-subset is INVISIBLE in proof content. With k'-1 >= k every cohort member re-proves at their next ordinary use with no gap, so AUC = 0.5 (hidden). Result 1 holds cleanly. The surplus itself (k' vs k) is set at enrolment and never appears in a Phase-2 proof.
- SCENARIO B (subsets revealed -- the grinding-resistance construction from three-attacks.md exposes the k attester keys/indices as verifier-checked public inputs): a subset change between consecutive proofs, with the dropped element == the revoked attester, is a DIRECT per-user signal. AUC ~0.98+, recall@1%FPR high, even with background subset rotation as cover -- rotation adds false positives but does not hide the cohort because the DROPPED element identifies A.
- => Falsification #1 verdict: Result 1 (redundant pre-attestation) is SAFE ONLY IF the active k-subset is NOT revealed by Phase-2 proofs. This is a DIRECT CONFLICT with the grinding-resistance construction's 'verifier-checked assignment' variant, which reveals the k keys.
- Resolution: keep the assignment check IN-CIRCUIT (the ~6.8k-11.2k constraint variant from three-attacks.md 1.3), so the proof attests 'my k signers were correctly derived from (commit, beacon)' WITHOUT revealing which k. Then grinding resistance and subset-switch privacy coexist. The cost is the added constraints; the alternative (verifier-checked, keys revealed) forecloses Result 1.
- k' joins the parameter set. Recommended k'=5 at k=3 (surplus 2 -> survives one revocation with margin, 1.67x enrolment cost).
