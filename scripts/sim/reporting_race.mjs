// Task 3 of two-mechanisms.md: the k-attester leniency game under side payments.
//
//   node scripts/sim/reporting_race.mjs
//   -> docs/self-audit/sim_reporting_race.{json,md}
//
// k corrupted attesters on one credential. Anonymous reporting. First reporter(s)
// split bounty B and get immunity (keep franchise V, no slash). Escrowed bribe
// b (= 1, the unit) pays at T iff the credential is NOT revoked, discounted by
// delta. The attacker pre-collects a bond P from each attester, refunded iff the
// attester stays silent, FORFEITED on report.
//
// Symmetric mixed strategy: each attester reports with prob r. m ~ Bin(k-1, r)
// of the others also report.
//
//   E[report_i]  = sum_m Bin(k-1,r;m) [ B/(m+1) + V - P ]
//   E[silent_i]  = (1-r)^{k-1} [ delta*b + V - pd0(S+V) ]
//                + (1-(1-r)^{k-1}) [ (1-pd) V - pd S ]
//
// r* solves E[report]=E[silent] (interior), else r*=0 or r*=1.
// "Silence individually rational" == r*=0 is a Nash equilibrium, i.e.
//   delta*b + P >= B + pd0(S+V)      (k-INDEPENDENT for the r=0 NE)
// The grid also reports the mixed r* and cartel survival prob (1-r*)^k.
//
// f>1/k boundary: attacker controls fraction f of the pool; with prob f^k he
// controls ALL k of a set and can punish everyone cheaply, so anonymity's
// protection is scaled by (1 - f^k). Effective condition ~ delta*b + P >= (1-f^k) B.

import { writeFileSync } from "node:fs";

const b = 1;
const V = 3;       // honest franchise value, in units of b (V/b = 3; swept implicitly via B,P scaling)
const S = 2;       // stake, units of b
const pd = 0.35;   // detection hazard for a silent co-signer once the credential is revoked by someone else
const pd0 = 0.02;  // residual detection with no report at all

const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };
function eqReport(r, k, B, P) {
  let s = 0;
  for (let m = 0; m <= k - 1; m++) s += binom(k - 1, m) * r ** m * (1 - r) ** (k - 1 - m) * (B / (m + 1) + V - P);
  return s;
}
function eqSilent(r, k, delta) {
  const noOther = (1 - r) ** (k - 1);
  return noOther * (delta * b + V - pd0 * (S + V)) + (1 - noOther) * ((1 - pd) * V - pd * S);
}
function equilibrium(k, B, P, delta) {
  const f = (r) => eqReport(r, k, B, P) - eqSilent(r, k, delta);
  const f0 = f(0), f1 = f(1);
  if (f0 <= 0) return { rStar: 0, kind: "SILENCE" };            // no incentive to deviate to report
  if (f1 >= 0) return { rStar: 1, kind: "REPORT" };             // dominant to report
  // bisection for interior root
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (f(mid) > 0 ? (hi = mid) : (lo = mid)); }
  const rStar = (lo + hi) / 2;
  return { rStar, kind: "MIXED" };
}

const deltas = [0.5, 0.7, 0.85, 0.95, 0.99, 0.999];
const Bs = [0.1, 0.3, 0.5, 1, 2, 3, 5, 10];        // B/b
const Ps = [0, 0.5, 1, 2, 3, 5];                   // P/b
const ks = [2, 3, 5];

const grid = [];
for (const k of ks) for (const delta of deltas) for (const B of Bs) for (const P of Ps) {
  const { rStar, kind } = equilibrium(k, B, P, delta);
  grid.push({ k, delta, B, P, rStar: +rStar.toFixed(4), survival: +((1 - rStar) ** k).toFixed(4), kind });
}

// the analytic r=0 NE boundary: delta*b + P >= B + pd0(S+V)
const boundary = { form: "delta*b + P >= B + pd0*(S+V)", pd0_SplusV: +(pd0 * (S + V)).toFixed(3), note: "k-independent for the r*=0 Nash equilibrium; k affects only the mixed r* and how fast the cartel unravels once r>0" };

// slice: minimal P that restores silence (r*=0) as a function of B, at delta=0.95
const restoreP = [];
for (const k of ks) for (const B of Bs) {
  let need = null;
  for (const P of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 15]) {
    if (equilibrium(k, B, P, 0.95).kind === "SILENCE") { need = P; break; }
  }
  restoreP.push({ k, B, delta: 0.95, min_P_over_b_for_silence: need });
}

// f>1/k boundary: scale the bounty's bite by (1 - f^k)
const fBoundary = [];
for (const k of ks) for (const f of [0.1, 0.2, 1 / k, 0.4, 0.6, 0.8, 0.95]) {
  const scale = 1 - f ** k;
  // effective condition delta*b + P >= scale*B ; report the B/b beyond which no P<=5 restores silence
  let Bmax = null;
  for (const B of [0.5, 1, 2, 3, 5, 8, 12, 20, 40]) {
    const effB = scale * B;
    const need = Math.max(0, effB - 0.95 * b);          // P needed at delta=0.95
    if (need > 5) { Bmax = B; break; }
  }
  fBoundary.push({ k, f: +f.toFixed(3), anonymity_scale_1_minus_fk: +scale.toFixed(3), B_over_b_where_P5_fails: Bmax });
}

// summarise: fraction of the (delta,B,P) grid in each regime, per k
const summary = ks.map((k) => {
  const cells = grid.filter((g) => g.k === k);
  const n = cells.length;
  const cnt = (kind) => cells.filter((c) => c.kind === kind).length;
  const silentDespiteRace = cells.filter((c) => c.kind === "SILENCE" && c.B >= 1).length; // B>=b: bounty at least the bribe
  return {
    k,
    pct_SILENCE: +((100 * cnt("SILENCE")) / n).toFixed(1),
    pct_MIXED: +((100 * cnt("MIXED")) / n).toFixed(1),
    pct_REPORT: +((100 * cnt("REPORT")) / n).toFixed(1),
    pct_SILENCE_even_with_B_ge_b: +((100 * silentDespiteRace) / n).toFixed(1),
  };
});

const out = { model: { b, V, S, pd, pd0 }, boundary, summary, restore_P_for_silence_at_delta095: restoreP, f_gt_1_over_k_boundary: fBoundary, grid };
writeFileSync("docs/self-audit/sim_reporting_race.json", JSON.stringify(out, null, 2));

let md = `# Task 3 -- the reporting race under side payments (measured)\n\n`;
md += `_\`scripts/sim/reporting_race.mjs\`. Units of \`b\` (bribe = 1). V=${V}, S=${S}, pd=${pd}, pd0=${pd0}._\n\n`;
md += `## The r*=0 Nash boundary (does the pre-paid bond defeat the race?)\n\n`;
md += `All-silent is a Nash equilibrium iff **\`delta*b + P >= B + pd0(S+V)\`** (= B + ${boundary.pd0_SplusV}). `;
md += `**k-independent** for the r*=0 NE; k only changes the mixed \`r*\` and how fast the cartel unravels once someone reports.\n\n`;
md += `So the bond P substitutes one-for-one for the bribe against the bounty: **the pre-paid bond defeats the race exactly when \`P >= B - delta*b + pd0(S+V)\`.**\n\n`;
md += `## Regime shares over the (delta, B/b, P/b) grid\n\n`;
md += `| k | % SILENCE | % MIXED | % REPORT | % SILENCE with B >= b |\n|---:|---:|---:|---:|---:|\n`;
for (const s of summary) md += `| ${s.k} | ${s.pct_SILENCE} | ${s.pct_MIXED} | ${s.pct_REPORT} | ${s.pct_SILENCE_even_with_B_ge_b} |\n`;
md += `\n## Minimum bond P/b that restores silence, at delta = 0.95\n\n`;
md += `| k \\ B/b | ${Bs.join(" | ")} |\n|---|${Bs.map(() => "---:").join("|")}|\n`;
for (const k of ks) {
  md += `| ${k} | ` + Bs.map((B) => { const r = restoreP.find((x) => x.k === k && x.B === B); return r.min_P_over_b_for_silence === null ? ">15" : r.min_P_over_b_for_silence; }).join(" | ") + ` |\n`;
}
md += `\n(At delta=0.95 the bribe's discounted value is 0.95b, so silence needs P >~ B - 0.95 + ${boundary.pd0_SplusV}. The table is that line, k-independent as predicted.)\n\n`;
md += `## Boundary case f > 1/k (attacker controls most of the pool)\n\n`;
md += `Anonymity's protection is scaled by \`(1 - f^k)\`: with prob \`f^k\` the attacker controls all k and punishes everyone cheaply.\n\n`;
md += `| k | f | 1 - f^k | B/b beyond which no P<=5 restores silence |\n|---:|---:|---:|---:|\n`;
for (const x of fBoundary) md += `| ${x.k} | ${x.f} | ${x.anonymity_scale_1_minus_fk} | ${x.B_over_b_where_P5_fails ?? ">40"} |\n`;
md += `\n## Reading\n\n`;
md += `- **The pre-paid bond DOES defeat the race.** Silence is a Nash equilibrium whenever \`P >= B - delta*b + pd0(S+V)\`, and this is k-independent. A patient attacker who can post bonds neutralises any fixed bounty by setting \`P ~ B\`.\n`;
md += `- The defender's counter is to make the bond unpostable or unrefundable-in-practice: the bond is paid to the *attacker*, who must be trusted to refund it on silence. A briber who reliably refunds bonds has a reputation among attesters -- the out-of-band reputation channel that anonymity was meant to remove -- and that channel is itself observable and attackable. **The race survives only to the extent the attacker cannot run a credible bond-refund reputation.**\n`;
md += `- Result A3's race is therefore **conditional**, not unconditional: it holds against an attacker who cannot commit to refunding bonds, and fails against one who can. This should be stated as the boundary.\n`;
md += `- For \`f\` near 1 (attacker controls most of the pool) the bounty is defeated regardless of P: \`(1-f^k) -> 0\`, collective punishment is cheap, and anonymity provides no protection. Matches the source's honest residual.\n`;
writeFileSync("docs/self-audit/sim_reporting_race.md", md);
console.log(md);
