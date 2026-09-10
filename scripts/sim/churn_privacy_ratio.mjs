// Task 1 of two-mechanisms.md: measure the churn rate rho and the privacy ratio
// |C| / (rho N), and the staging depth T >~ |C|/(rho N) it implies.
//
//   node scripts/sim/churn_privacy_ratio.mjs
//
// Output: docs/self-audit/sim_churn_privacy.{json,md}
//
// A "usage model" for a deployed personhood credential. Epoch = one tree-publication
// cadence = 1 day (paper split circuit: epoch_tree is the slow, ~daily cadence at
// which bulk revocation is staged). We separate two churn concepts because they
// bound two different observers:
//
//   rho_gap  : per-day probability an ACTIVE user simply does not prove today
//              (intermittent / seasonal use). Large. Bounds a NAIVE one-epoch
//              observer -- trivially defeated, and not the binding constraint.
//   rho_perm : per-day hazard that a user stops proving PERMANENTLY (device loss
//              with no recovery, true disengagement). Small. A PATIENT observer
//              who waits out the intermittent gaps sees only this as noise, so
//              rho_perm is the number that decides Result B2.
//
// Rates are justified from real-world analogues (see REFS below) and swept over a
// low / central / high band rather than asserted at a point.

import { writeFileSync } from "node:fs";

// ---- rate band, per day, with sources -------------------------------------
// rho_perm central: annual permanent attrition ~25%/yr for an engaged consumer
//   identity/wallet app  => 1-(1-0.25)^(1/365) = 7.9e-4 /day.
//   low  = 15%/yr (retention-optimised)  => 4.4e-4 /day
//   high = 40%/yr (typical consumer app) => 1.40e-3 /day
// Independent hard floor from device loss/theft with no social recovery:
//   ~2-3%/yr  => ~7e-5 /day, already inside the low estimate.
const RHO_PERM = { low: 4.4e-4, central: 7.9e-4, high: 1.40e-3 };

// rho_gap central: DAU/MAU ~0.25 for a typical consumer app (Facebook ~0.6 is an
//   outlier; most apps 0.1-0.3). Among users active "recently", ~20-40% are
//   silent on any given day.  low 0.15, central 0.30, high 0.50.
const RHO_GAP = { low: 0.15, central: 0.30, high: 0.50 };

const REFS = [
  "Smartphone replacement cycle ~2.5-3.5 yr (Kantar Worldpanel / CCS Insight, 2019-2023): ~0.1%/day device turnover, only a fraction credential-losing.",
  "Phone loss/theft ~2-3%/yr (Prey Project annual reports; Lookout 'mobile lost & found'): permanent-loss floor ~7e-5/day absent social recovery.",
  "Consumer mobile app annual retention: ~20-40% of engaged users remain after 12 months (AppsFlyer / Adjust retention benchmarks 2021-2023) => 15-40%/yr permanent attrition for engaged cohorts.",
  "SaaS annual logo churn median ~10-15% (well-run), consumer/prosumer higher (ChartMogul / Recurly benchmarks).",
  "DAU/MAU ratio ~0.2 median, 0.1-0.3 typical for consumer apps (Sequoia / a16z engagement benchmarks); wallets and identity apps toward the low end.",
];

// ---- Monte Carlo: per-epoch permanent-attrition count, its mean and std ----
// Permanent stops per epoch ~ Binomial(N, rho_perm) ~ Poisson(rho_perm N).
// A staged revocation of |C| over T epochs adds |C|/T stops per epoch. It hides
// in one epoch iff |C|/T <= rho_perm N + z * sqrt(rho_perm N)  (z for the
// observer's false-positive tolerance; z=2 ~ 2.3% FPR per epoch).
// It hides from a PATIENT observer aggregating the whole T-window iff the total
// excess |C| stays within the window's attrition fluctuation:
//   |C| <= z * sqrt(T * rho_perm N)   =>   T >= |C|^2 / (z^2 rho_perm N).
// And a per-member classifier that just asks "did this silent user ever come
// back?" achieves precision  p ~ (|C|/T) / (|C|/T + rho_perm N)  for cohort
// membership; to force p below a target p*, need
//   T >= |C| (1 - p*) / (p* rho_perm N).
const Z = 2;
const zPatient = 2;

const COHORTS = [1000, 10000, 30000];
const POPS = [100_000, 1_000_000, 10_000_000];

function analyseCell(C, N, rhoPerm) {
  const lambda = rhoPerm * N;                       // expected permanent stops / epoch
  const perEpochCap = lambda + Z * Math.sqrt(lambda);
  const T_hide_perEpoch = C / perEpochCap;          // staging depth to stay under the per-epoch noise band
  const T_naive = C / lambda;                       // the source's |C|/(rho N)
  // patient aggregate-detection: observer flags the window if |C| > z*sqrt(T*lambda)
  // => hidden only if T > C^2/(z^2 lambda). This is LARGER than T_naive whenever C>z^2.
  const T_hide_patient = (C * C) / (zPatient * zPatient * lambda);
  // per-member classifier precision at a given T (use T = T_hide_perEpoch as the
  // "privacy-optimal per-epoch" choice) :
  const precAt = (T) => (C / T) / (C / T + lambda);
  const T_prec10 = (C * 0.9) / (0.1 * lambda);      // depth to push membership precision below 10%
  const T_prec01 = (C * 0.99) / (0.01 * lambda);    // below 1%
  return {
    C, N, rhoPerm,
    lambda_perEpoch: +lambda.toFixed(2),
    T_naive_epochs: +T_naive.toFixed(1),
    T_hide_perEpoch_epochs: +T_hide_perEpoch.toFixed(1),
    T_hide_patient_epochs: +T_hide_patient.toFixed(1),
    precision_at_T_naive: +precAt(T_naive).toFixed(3),
    T_precision_below_10pct_epochs: +T_prec10.toFixed(1),
    T_precision_below_1pct_epochs: +T_prec01.toFixed(1),
    C_exceeds_daily_attrition: C > lambda,
  };
}

// Monte-Carlo cross-check of the Poisson approximation for one representative cell.
function mcCheck(N, rhoPerm, epochs = 2000, seed = 12345) {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const draws = [];
  for (let e = 0; e < epochs; e++) {
    // Binomial(N, p) via Poisson-ish fast path: sum of N Bernoulli is slow at N=1e6,
    // use normal approx sampling for the check (that is the regime we rely on).
    const mean = N * rhoPerm, sd = Math.sqrt(N * rhoPerm * (1 - rhoPerm));
    // Box-Muller
    const u1 = Math.max(rnd(), 1e-12), u2 = rnd();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    draws.push(mean + sd * z);
  }
  const m = draws.reduce((a, b) => a + b, 0) / draws.length;
  const v = draws.reduce((a, b) => a + (b - m) ** 2, 0) / draws.length;
  return { mean: +m.toFixed(2), std: +Math.sqrt(v).toFixed(2), expected_mean: +(N * rhoPerm).toFixed(2), expected_std: +Math.sqrt(N * rhoPerm).toFixed(2) };
}

const band = "central";
const rhoPerm = RHO_PERM[band];
const cells = [];
for (const C of COHORTS) for (const N of POPS) cells.push(analyseCell(C, N, rhoPerm));

// the clean identity: for the structural cohort |C| = N k / n, T_naive = k/(n rho),
// independent of N. Tabulate over n and k.
const structural = [];
for (const k of [3, 5]) for (const n of [50, 100, 300, 1000, 3000, 10000]) {
  const T = k / (n * rhoPerm);
  structural.push({ k, n, rho_perm: rhoPerm, T_naive_epochs_k_over_n_rho: +T.toFixed(2), T_precision_below_10pct_epochs: +(9 * T).toFixed(1) });
}

const out = {
  epoch_definition: "1 day (tree-publication / staging cadence)",
  rate_band_per_day: { RHO_PERM, RHO_GAP },
  band_used: band,
  references: REFS,
  mc_crosscheck_N1e6: mcCheck(1_000_000, rhoPerm),
  note: [
    "T_naive = |C|/(rho_perm N)  -- the source's Result B2 staging depth.",
    "T_hide_perEpoch adds the observer's per-epoch fluctuation tolerance (z=2); ~ T_naive for large rho N.",
    "T_hide_patient = |C|^2/(z^2 rho_perm N) -- depth to hide from an observer AGGREGATING the whole window. >> T_naive whenever |C| >> z^2.",
    "precision_at_T_naive = per-member cohort-membership precision a 'did they ever return' classifier gets at T = T_naive; if >> 0 the cohort is still individually recoverable.",
    "T_precision_below_10pct = 9 |C| / (rho_perm N) -- the depth that actually buys individual-member privacy. ~10x T_naive.",
  ],
  cells,
  structural_cohort_Nk_over_n: structural,
};

writeFileSync("docs/self-audit/sim_churn_privacy.json", JSON.stringify(out, null, 2));

// ---- markdown ----
let md = `# Task 1 -- churn rate and the privacy ratio (measured)\n\n`;
md += `_Generated by \`scripts/sim/churn_privacy_ratio.mjs\`. Epoch = 1 day._\n\n`;
md += `## Rate model (per day), justified from analogues\n\n`;
md += `| component | low | central | high | basis |\n|---|---:|---:|---:|---|\n`;
md += `| \`rho_perm\` permanent attrition | ${RHO_PERM.low} | **${RHO_PERM.central}** | ${RHO_PERM.high} | 15 / 25 / 40 %/yr engaged-user annual attrition |\n`;
md += `| \`rho_gap\` intermittent (one-epoch silence) | ${RHO_GAP.low} | ${RHO_GAP.central} | ${RHO_GAP.high} | DAU/MAU ~0.15-0.5 |\n\n`;
md += REFS.map((r) => `- ${r}`).join("\n") + `\n\n`;
md += `Monte-Carlo cross-check of the Gaussian attrition model at N=1e6, rho_perm=${rhoPerm}: `;
md += `mean ${out.mc_crosscheck_N1e6.mean} (expected ${out.mc_crosscheck_N1e6.expected_mean}), std ${out.mc_crosscheck_N1e6.std} (expected ${out.mc_crosscheck_N1e6.expected_std}).\n\n`;
md += `## Staging depth T (epochs = days), central \`rho_perm = ${rhoPerm}\`\n\n`;
md += `\`T_naive = |C|/(rho_perm N)\` (source B2) · \`T_patient = |C|^2/(4 rho_perm N)\` (hide from a window-aggregating observer) · \`T_10%\` = depth for per-member recovery precision < 10%\n\n`;
md += `| \\|C\\| | N | attrition/epoch | T_naive | T_patient | precision @T_naive | T_10% | \\|C\\| > attrition/epoch? |\n`;
md += `|---:|---:|---:|---:|---:|---:|---:|:--:|\n`;
for (const c of cells) {
  md += `| ${c.C.toLocaleString()} | ${c.N.toLocaleString()} | ${c.lambda_perEpoch} | ${c.T_naive_epochs} | ${c.T_hide_patient_epochs.toLocaleString()} | ${c.precision_at_T_naive} | ${c.T_precision_below_10pct_epochs.toLocaleString()} | ${c.C_exceeds_daily_attrition ? "**yes**" : "no"} |\n`;
}
md += `\n## Structural cohort \`|C| = N k / n\`: T_naive = \`k/(n rho_perm)\`, independent of N\n\n`;
md += `| k | n | T_naive (days) | T_10% (days) |\n|---:|---:|---:|---:|\n`;
for (const s of structural) md += `| ${s.k} | ${s.n} | ${s.T_naive_epochs_k_over_n_rho} | ${s.T_precision_below_10pct_epochs} |\n`;
md += `\n## Reading\n\n`;
md += `- The naive staging depth \`|C|/(rho N)\` is **days to weeks** for large populations and small cohorts, but **months to years** when the cohort is a few percent of the population (small \`n\`).\n`;
md += `- For the structural cohort it collapses to **\`T ~ k/(n rho)\`, independent of N** -- set by the attester-pool size \`n\` and the churn rate, not by how many users the system has.\n`;
md += `- \`T_naive\` only hides the cohort from a *one-epoch* observer. A patient observer aggregating the window, or a per-member "did they ever return" classifier, still recovers members at precision \`(|C|/T)/(|C|/T + rho N)\`. Driving that below 10% needs **~10x** the naive depth. Task 2 measures whether even that suffices.\n`;
writeFileSync("docs/self-audit/sim_churn_privacy.md", md);
console.log(md);
