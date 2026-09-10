# Task 1 -- does a non-attributing bond trigger exist? (measured)

_`scripts/sim/bond_trigger.mjs`. Units of b (bribe=1). V=3, S=2, pd=0.35, pd0=0.02._

## (a) Trustless bond -- can an on-chain predicate forfeit attester i's bond?

| predicate | verifiable on chain? | attributes to i? | note |
|---|---|---|---|
| forfeit if attester i's key appears in a report tx | true | false | anonymous reporting emits no per-attester identifier -- no such tx field exists |
| forfeit if i's signing history correlates with the revoked cohort | partially (needs the cohort, which is the Thm 7 leak) | probabilistically, 1-of-k at best (Thm 8) | reduces to the attribution the whole layer is built to deny; also not a clean on-chain predicate |
| forfeit ALL k bonds if the credential is revoked within T | true | false | THIS is the Dark-DAO-style escape: conditions on a public event, not on attribution. Triggerable. Deterrent analysed in (b). |
| forfeit i's bond if i fails to periodically re-prove loyalty (produce a fresh signing receipt) | true | true | works, but requires i to VOLUNTARILY produce a receipt (Thm 6) -- re-creates the out-of-band reputation channel; not anonymous-reporting-safe, it is a different mechanism |

**No on-chain predicate is both verifiable AND attributable to i under anonymous reporting. But the COLLECTIVE predicate (forfeit all k on revocation-within-T) IS verifiable-and-trustless -- it conditions on the public revocation event, not on attribution. A non-attributing TRIGGER therefore exists; whether it DETERS is analysed in (b).**

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

- CANONICAL Theorem 11 (bond attribution): a non-attributing bond TRIGGER exists -- collective forfeiture conditioned on the public revocation event (the inverse of Dark-DAO escrow-on-non-revocation). But no non-attributing bond DETERS.
- (a) trustless ATTRIBUTING predicate: does not exist -- anonymous reporting emits no per-attester identifier.
- (b) trustless COLLECTIVE-forfeiture trigger: exists and is enforceable, but the deterrent scales (1-pi)^{k-1} in the per-attester belief pi that another of the k reports. Silence-NE region over the (delta,B,P) grid: 60% at pi=0, 55.7% at pi=0.1, 45% at pi=0.3, 37.3% at pi=0.5. Any real doubt collapses it.
- (c) attacker-held bond: with no attribution the attacker cannot selectively withhold from a reporter -> collapses to (b) or to a zero-deterrent tax. Not a bond.
- BOUND: the bond is the attester's OWN capital, so P <~ b (single corruption) or P <~ M*b (amortised over M). Worst case pi=0: reporting dominates iff B > (1-pi)^{k-1} P = P, so B > 2b dominates for every pi against any rationally-posted bond.
- => Result A3 recovered in bounded form: for f^k << 1 the leniency race survives the bond provided B > 2b, with b >= p_d(S+V). The amortised bond pushes required B toward M*b ONLY without cascading correlation-driven detection (amortized_bond.mjs).

## Canonical Theorem 11 (propagated to every document)

A non-attributing bond **trigger** exists (collective forfeiture conditioned on the public revocation event), but no non-attributing bond **deters**: the collective trigger's deterrent decays as `(1-pi)^{k-1}`, and `P <~ b` because the bond is the attester's own capital, so `B > 2b` dominates for every `pi`. Result A3 is recovered in that bounded form. Supersedes both "no enforceable bond" (commit 4009065) and "trustless branch withdrawn" (85a80a4) -- same mechanics, one headline.
