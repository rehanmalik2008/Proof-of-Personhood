# Task 1 -- does a non-attributing bond trigger exist? (measured)

_`scripts/sim/bond_trigger.mjs`. Units of b (bribe=1). V=3, S=2, pd=0.35, pd0=0.02._

## (a) Trustless bond -- can an on-chain predicate forfeit attester i's bond?

| predicate | verifiable on chain? | attributes to i? | note |
|---|---|---|---|
| forfeit if attester i's key appears in a report tx | true | false | anonymous reporting emits no per-attester identifier -- no such tx field exists |
| forfeit if i's signing history correlates with the revoked cohort | partially (needs the cohort, which is the Thm 7 leak) | probabilistically, 1-of-k at best (Thm 8) | reduces to the attribution the whole layer is built to deny; also not a clean on-chain predicate |
| forfeit ALL k bonds if the credential is revoked within T | true | false | THIS is the Dark-DAO-style escape: conditions on a public event, not on attribution. Triggerable. Deterrent analysed in (b). |
| forfeit i's bond if i fails to periodically re-prove loyalty (produce a fresh signing receipt) | true | true | works, but requires i to VOLUNTARILY produce a receipt (Thm 6) -- re-creates the out-of-band reputation channel; not anonymous-reporting-safe, it is a different mechanism |

**No on-chain predicate is both verifiable AND attributable to i under anonymous reporting. The only triggerable predicate is collective (forfeit all k on revocation-within-T); analysed in (b).**

## (b) Collective forfeiture -- forfeit all k bonds if the credential is revoked within T

Verifiable (public revocation), needs no attribution. But -P now falls in the "someone else reported" branch too, so silence is penalised whenever anyone reports.

Silence-NE region over the (delta,B,P) grid, by attester belief pi that another reports: **60%** at pi=0, **55.7%** at pi=0.1, **45%** at pi=0.3, **37.3%** at pi=0.5.

### pi sweep (pi = belief another of the k reports); effective deterrent = (1-pi)^{k-1} P

P/b needed to keep all-silent a NE at B/b=2, delta=0.95:

| k \ pi | 0 | 0.05 | 0.1 | 0.2 | 0.3 | 0.5 | 0.7 | 0.9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 1.15 | 1.21 | 1.28 | 1.44 | 1.64 | 2.3 | 3.83 | 11.5 |
| 3 | 1.15 | 1.27 | 1.42 | 1.8 | 2.35 | 4.6 | 12.78 | >50 |
| 5 | 1.15 | 1.41 | 1.75 | 2.81 | 4.79 | 18.4 | >50 | >50 |

## (c) Attacker-held bond

With no attribution the attacker cannot selectively withhold P from a reporter. Options: (i) collective seizure on revocation == (b); (ii) uniform seizure probability psi<1 == a flat tax with ZERO marginal deterrent on reporting. Neither is an attributing bond. (c) yields no enforceable bond.

## Verdict

- (a) trustless attributing bond: DOES NOT EXIST under anonymous reporting -- no verifiable+attributable predicate.
- (b) trustless collective-forfeiture bond: CAN be triggered (public revocation event), but the deterrent scales (1-pi)^{k-1}. Silence-NE region over the (delta,B,P) grid: 60% at belief pi=0, 55.7% at pi=0.1, 45% at pi=0.3, 37.3% at pi=0.5. Any real doubt that another reports collapses the bond.
- (c) attacker-held bond: collapses to (b) or to a zero-deterrent tax. No enforceable bond.
- => Theorem 11 HOLDS. No enforceable attributing bond exists under anonymous reporting.
- => A3's downgrade does NOT stand. The reporting race is restored as the operative outcome, with one residual: a well-coordinated attacker who can credibly commit a collective-forfeiture contract AND enforce the belief pi=0 (no attester thinks any other will report) can hold silence as a FRAGILE Nash equilibrium. Enforcing pi=0 requires observable coordination among the k -- the out-of-band channel Theorem 12 closes.

## Re-statement of A3

Result A3 (anonymous reporting + first-reporter bounty => a leniency race) is **NOT downgraded**. Theorem 11 shows the bond that would defeat the race cannot be enforced under anonymous reporting: no attributing predicate exists (a), collective forfeiture self-defeats as (1-pi)^{k-1} (b), and an attacker-held bond is not a bond (c). The race is the operative outcome for f^k << 1. Residual: an attacker who can both commit a collective-forfeiture contract and enforce common knowledge that no attester will report can sustain silence as a fragile NE -- but enforcing that belief needs the observable coordination channel Theorem 12 closes.
