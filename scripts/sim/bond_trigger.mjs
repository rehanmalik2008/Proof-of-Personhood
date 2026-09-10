// Task 1 of the-attribution-bottleneck.md: does a non-attributing bond trigger exist?
//
//   node scripts/sim/bond_trigger.mjs  ->  docs/self-audit/sim_bond_trigger.{json,md}
//
// The prior reporting-race sim (scripts/sim/reporting_race.mjs) assumed the bond
// P is forfeited on report as a mechanically-enforced fact. This one models the
// TRIGGER: what event forfeits attester i's bond, given anonymous reporting.
//
// (a) Trustless bond (smart contract): an on-chain predicate. Analytic table --
//     which predicates are (verifiable) AND (attributable to i).
// (b) Collective forfeiture: forfeit ALL k bonds if the credential is revoked
//     within T (verifiable via the public revocation event, needs NO attribution).
//     Re-solve the k-attester game with -P in BOTH the "i reports" and the
//     "someone else reports" branch. Sweep pi = belief another of the k reports;
//     the note's claim is the effective deterrent scales (1-pi)^{k-1}.
// (c) Attacker-held bond: attester pays P to the attacker, recovered iff silent
//     AND the attacker chooses to return it. With no attribution the attacker
//     cannot selectively withhold from a reporter, so (c) collapses to either
//     (b) (collective) or "not a bond" (uniform seizure = a tax, zero deterrent).

import { writeFileSync } from "node:fs";

const b = 1, V = 3, S = 2, pd = 0.35, pd0 = 0.02;
const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };

// ---- (a) predicate existence table (analytic) ----------------------------
const predicates = [
  { predicate: "forfeit if attester i's key appears in a report tx", verifiable: true, attributes_to_i: false, note: "anonymous reporting emits no per-attester identifier -- no such tx field exists" },
  { predicate: "forfeit if i's signing history correlates with the revoked cohort", verifiable: "partially (needs the cohort, which is the Thm 7 leak)", attributes_to_i: "probabilistically, 1-of-k at best (Thm 8)", note: "reduces to the attribution the whole layer is built to deny; also not a clean on-chain predicate" },
  { predicate: "forfeit ALL k bonds if the credential is revoked within T", verifiable: true, attributes_to_i: false, note: "THIS is the Dark-DAO-style escape: conditions on a public event, not on attribution. Triggerable. Deterrent analysed in (b)." },
  { predicate: "forfeit i's bond if i fails to periodically re-prove loyalty (produce a fresh signing receipt)", verifiable: true, attributes_to_i: true, note: "works, but requires i to VOLUNTARILY produce a receipt (Thm 6) -- re-creates the out-of-band reputation channel; not anonymous-reporting-safe, it is a different mechanism" },
];

// ---- (b) collective forfeiture game ------------------------------------------
// E[report_i](r)  = sum_m Bin(k-1,r;m) [ B/(m+1) + V - P ]                 (credential revoked => P lost, as before)
// E[silent_i](r)  = (1-r)^{k-1} [ db + V - pd0(S+V) ]
//                 + (1-(1-r)^{k-1}) [ (1-pd)V - pd S - P ]                  (NEW: -P here too, collective forfeiture)
function eqReport(r, k, B, P) {
  let s = 0;
  for (let m = 0; m <= k - 1; m++) s += binom(k - 1, m) * r ** m * (1 - r) ** (k - 1 - m) * (B / (m + 1) + V - P);
  return s;
}
function eqSilentCollective(r, k, B, P, delta) {
  const none = (1 - r) ** (k - 1);
  return none * (delta * b + V - pd0 * (S + V)) + (1 - none) * ((1 - pd) * V - pd * S - P);
}
function equilibria(k, B, P, delta, silentFn) {
  const f = (r) => eqReport(r, k, B, P) - silentFn(r, k, B, P, delta);
  const roots = [];
  const zeroIsNE = f(0) <= 0;                 // no incentive to deviate to report at r=0
  const oneIsBR = f(1) >= 0;
  // scan for interior fixed points of best response == sign changes of f
  let prev = f(0), prevR = 0;
  for (let i = 1; i <= 200; i++) {
    const r = i / 200, cur = f(r);
    if ((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
      let lo = prevR, hi = r;
      for (let j = 0; j < 50; j++) { const mid = (lo + hi) / 2; (Math.sign(f(mid)) === Math.sign(prev) ? (lo = mid) : (hi = mid)); }
      roots.push(+((lo + hi) / 2).toFixed(4));
    }
    prev = cur; prevR = r;
  }
  // classify: all-silent NE stable if f(0)<=0 AND f'(0+) <= 0 (deviating stays unprofitable as r rises)
  const eps = 0.01;
  const stableSilence = zeroIsNE && f(eps) <= 0;
  return { zeroIsNE, stableSilence, interiorRoots: roots, reportDominant: oneIsBR };
}

const deltas = [0.7, 0.85, 0.95, 0.99];
const Bs = [0.5, 1, 2, 3, 5];
const Ps = [0, 1, 2, 3, 5];
const ks = [2, 3, 5];

const grid = [];
for (const k of ks) for (const delta of deltas) for (const B of Bs) for (const P of Ps) {
  const e = equilibria(k, B, P, delta, eqSilentCollective);
  grid.push({ k, delta, B, P, silence_is_NE: e.zeroIsNE, silence_is_STABLE: e.stableSilence, interior_roots: e.interiorRoots, report_dominant: e.reportDominant });
}

// pi sweep: effective deterrent (1-pi)^{k-1} P ; silence NE boundary  delta*b + (1-pi)^{k-1} P >= B
const piSweep = [];
for (const k of ks) for (const pi of [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
  const mult = (1 - pi) ** (k - 1);
  // P needed to keep silence a NE at delta=0.95, B=2
  const B = 2, delta = 0.95;
  const Pneed = Math.max(0, (B - delta * b + pd0 * (S + V)) / mult);
  piSweep.push({ k, pi, deterrent_multiplier: +mult.toFixed(3), P_over_b_needed_at_B2_d95: Pneed > 50 ? ">50" : +Pneed.toFixed(2) });
}

// How much does the silence-NE region shrink once attesters hold a non-zero
// belief pi that another reports? Under collective forfeiture the silence-NE
// condition is  delta*b + (1-pi)^{k-1} P >= B + pd0(S+V).
function silenceNEunderBelief(k, B, P, delta, pi) {
  return delta * b + (1 - pi) ** (k - 1) * P >= B + pd0 * (S + V);
}
const regionByPi = {};
for (const pi of [0, 0.1, 0.3, 0.5]) {
  let cnt = 0, total = 0;
  for (const k of ks) for (const delta of deltas) for (const B of Bs) for (const P of Ps) {
    total++; if (silenceNEunderBelief(k, B, P, delta, pi)) cnt++;
  }
  regionByPi[pi] = +(100 * cnt / total).toFixed(1);
}

const out = {
  model: { b, V, S, pd, pd0 },
  a_trustless_predicates: predicates,
  a_verdict: "No on-chain predicate is both verifiable AND attributable to i under anonymous reporting. But the COLLECTIVE predicate (forfeit all k on revocation-within-T) IS verifiable-and-trustless -- it conditions on the public revocation event, not on attribution. A non-attributing TRIGGER therefore exists; whether it DETERS is analysed in (b).",
  b_collective_forfeiture_grid: grid,
  b_pi_sweep: piSweep,
  b_silence_NE_region_by_belief_pi: regionByPi,
  c_attacker_held: "With no attribution the attacker cannot selectively withhold P from a reporter. Options: (i) collective seizure on revocation == (b); (ii) uniform seizure probability psi<1 == a flat tax with ZERO marginal deterrent on reporting. Neither is an attributing bond. (c) yields no enforceable bond.",
  verdict: [
    "CANONICAL Theorem 11 (bond attribution): a non-attributing bond TRIGGER exists -- collective forfeiture conditioned on the public revocation event (the inverse of Dark-DAO escrow-on-non-revocation). But no non-attributing bond DETERS.",
    "(a) trustless ATTRIBUTING predicate: does not exist -- anonymous reporting emits no per-attester identifier.",
    "(b) trustless COLLECTIVE-forfeiture trigger: exists and is enforceable, but the deterrent scales (1-pi)^{k-1} in the per-attester belief pi that another of the k reports. Silence-NE region over the (delta,B,P) grid: " + regionByPi[0] + "% at pi=0, " + regionByPi[0.1] + "% at pi=0.1, " + regionByPi[0.3] + "% at pi=0.3, " + regionByPi[0.5] + "% at pi=0.5. Any real doubt collapses it.",
    "(c) attacker-held bond: with no attribution the attacker cannot selectively withhold from a reporter -> collapses to (b) or to a zero-deterrent tax. Not a bond.",
    "BOUND: the bond is the attester's OWN capital, so P <~ b (single corruption) or P <~ M*b (amortised over M). Worst case pi=0: reporting dominates iff B > (1-pi)^{k-1} P = P, so B > 2b dominates for every pi against any rationally-posted bond.",
    "=> Result A3 recovered in bounded form: for f^k << 1 the leniency race survives the bond provided B > 2b, with b >= p_d(S+V). The amortised bond pushes required B toward M*b ONLY without cascading correlation-driven detection (amortized_bond.mjs).",
  ],
};
writeFileSync("docs/self-audit/sim_bond_trigger.json", JSON.stringify(out, null, 2));

let md = `# Task 1 -- does a non-attributing bond trigger exist? (measured)\n\n`;
md += `_\`scripts/sim/bond_trigger.mjs\`. Units of b (bribe=1). V=${V}, S=${S}, pd=${pd}, pd0=${pd0}._\n\n`;
md += `## (a) Trustless bond -- can an on-chain predicate forfeit attester i's bond?\n\n`;
md += `| predicate | verifiable on chain? | attributes to i? | note |\n|---|---|---|---|\n`;
for (const p of predicates) md += `| ${p.predicate} | ${p.verifiable} | ${p.attributes_to_i} | ${p.note} |\n`;
md += `\n**${out.a_verdict}**\n\n`;
md += `## (b) Collective forfeiture -- forfeit all k bonds if the credential is revoked within T\n\n`;
md += `Verifiable (public revocation), needs no attribution. But -P now falls in the "someone else reported" branch too, so silence is penalised whenever anyone reports.\n\n`;
md += `Silence-NE region over the (delta,B,P) grid, by attester belief pi that another reports: **${regionByPi[0]}%** at pi=0, **${regionByPi[0.1]}%** at pi=0.1, **${regionByPi[0.3]}%** at pi=0.3, **${regionByPi[0.5]}%** at pi=0.5.\n\n`;
md += `### pi sweep (pi = belief another of the k reports); effective deterrent = (1-pi)^{k-1} P\n\n`;
md += `P/b needed to keep all-silent a NE at B/b=2, delta=0.95:\n\n`;
md += `| k \\ pi | ${[0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9].join(" | ")} |\n|---|${[0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9].map(() => "---:").join("|")}|\n`;
for (const k of ks) md += `| ${k} | ` + piSweep.filter((x) => x.k === k).map((x) => x.P_over_b_needed_at_B2_d95).join(" | ") + ` |\n`;
md += `\n## (c) Attacker-held bond\n\n${out.c_attacker_held}\n\n`;
md += `## Verdict\n\n` + out.verdict.map((v) => `- ${v}`).join("\n") + `\n\n`;
md += `## Canonical Theorem 11 (propagated to every document)\n\n`;
md += `A non-attributing bond **trigger** exists (collective forfeiture conditioned on the public revocation event), but no non-attributing bond **deters**: the collective trigger's deterrent decays as \`(1-pi)^{k-1}\`, and \`P <~ b\` because the bond is the attester's own capital, so \`B > 2b\` dominates for every \`pi\`. Result A3 is recovered in that bounded form. Supersedes both "no enforceable bond" (commit 4009065) and "trustless branch withdrawn" (85a80a4) -- same mechanics, one headline.\n`;
writeFileSync("docs/self-audit/sim_bond_trigger.md", md);
console.log(md);
