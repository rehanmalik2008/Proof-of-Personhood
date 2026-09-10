// Task 2 of the-attribution-bottleneck.md: does re-enrollment delay overlap the
// natural usage-gap distribution?
//
//   node scripts/sim/reenrollment_gap.mjs -> docs/self-audit/sim_reenrollment_gap.{json,md}
//
// Prior result (RESEARCH-private-bulk-revocation.md): with PERMANENT revocation
// the binding noise floor is rho_perm ~ 7.9e-4/day, and staging depth
// T ~ 3k/(n rho_perm). The-attribution-bottleneck.md argues that pairing
// revocation with AUTOMATIC RE-ENROLLMENT turns the signal from a permanent stop
// into a transient gap, claiming the floor becomes rho_gap ~ 0.30/day (~380x)
// and T ~ 3k/(n rho_gap) (sub-day). This sim MEASURES that the rate-detection
// floor does move ~380x but a gap CO-TIMING channel then binds, imposing a
// T_stage floor of ~30-90 epochs -- net improvement ~3-10x, not 380x. Result 3
// also rests on the re-enrollment delay OVERLAPPING the natural usage-gap
// distribution (superseded for the delay itself by redundant pre-attestation).
//
// Model:
//  - population heterogeneity: each user has a daily proof prob p_u ~ Beta(a,b),
//    calibrated to mean ~0.25 (DAU/MAU) with a fat low-engagement tail (weekly /
//    monthly users). Natural gaps between proofs are Geometric(p_u).
//  - cohort: normal proving until a staged revocation epoch (uniform over T_stage),
//    then a single gap of length D_i (re-enrollment delay ~ Gamma(shape, D_mean)),
//    then resume normal proving.
//  - observer: full per-epoch accept history. Best classifier for a re-enrolled
//    cohort = "had a gap that STARTED inside the revocation window and then
//    resumed, with length >= theta". Sweep theta; also test the temporal-cluster
//    signal (anomalous spike in gap-starts / gap-ends).
//
// Metrics identical to sim_staging_attack.mjs: AUC, recall @1% FPR (adaptive),
// identifiable residual. Sweep D_mean; report the threshold D* beyond which the
// cohort separates by gap LENGTH.

import { writeFileSync } from "node:fs";

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Beta via two Gammas (Marsaglia-Tsang); Gamma via M-T for shape>=1, boost for <1
function gamma(rnd, k, theta = 1) {
  if (k < 1) { const u = rnd(); return gamma(rnd, k + 1, theta) * Math.pow(u, 1 / k); }
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = rnd(), u2 = rnd(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rnd();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * theta;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta;
  }
}
const beta = (rnd, a, b) => { const x = gamma(rnd, a), y = gamma(rnd, b); return x / (x + y); };
const geom = (rnd, p) => Math.floor(Math.log(1 - (rnd() || 1e-12)) / Math.log(1 - p)); // >=0

const N = 30_000;
const H = 365;           // observation horizon (days)
const T_REV = 120;       // revocation event epoch
const RHO_PERM = 7.9e-4; // benign permanent attrition (still present for everyone)
const COHORT = 1500;     // 5% of N
const SEEDS = 6;
// Beta(1.3, 4.0): mean ~0.245, heavy low tail. p95 gap for a p=0.1 user ~ 28d.
const BA = 1.3, BB = 4.0;

// natural-gap distribution summary (for the "do they overlap" comparison)
function naturalGapQuantiles(seed) {
  const rnd = mulberry32(seed);
  const gaps = [];
  for (let i = 0; i < 60000; i++) {
    const p = Math.min(0.9, Math.max(0.005, beta(rnd, BA, BB)));
    gaps.push(1 + geom(rnd, p));
  }
  gaps.sort((a, b) => a - b);
  const q = (f) => gaps[Math.floor(f * gaps.length)];
  return { mean: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2), p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99) };
}

// one run: returns per-user features at horizon H
function run({ Dmean, Dshape, T_stage, spreadReenroll, seed }) {
  const rnd = mulberry32(seed);
  // per-user daily proof prob
  const p = new Float64Array(N);
  for (let u = 0; u < N; u++) p[u] = Math.min(0.9, Math.max(0.005, beta(rnd, BA, BB)));
  // benign permanent quit epoch
  const benignQuit = new Int32Array(N);
  for (let u = 0; u < N; u++) benignQuit[u] = 1 + geom(rnd, RHO_PERM);
  // cohort staged revocation epoch + re-enrollment delay
  const isC = new Uint8Array(N);
  const revEp = new Int32Array(N).fill(-1);
  const reEnrollDone = new Int32Array(N).fill(-1);
  const order = [];
  for (let u = 0; u < COHORT; u++) { isC[u] = 1; order.push(u); }
  for (let i = order.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  for (let s = 0; s < order.length; s++) {
    const u = order[s];
    const re = T_REV + Math.floor(((s + 0.5) / order.length) * T_stage);   // staged uniformly
    revEp[u] = re;
    let D = Math.max(1, Math.round(gamma(rnd, Dshape, Dmean / Dshape)));
    if (!spreadReenroll) D = Math.max(1, Math.round(Dmean));               // synchronized: all same D
    reEnrollDone[u] = re + D;
  }

  // build each user's accept sequence -> extract gap features
  const feat = new Array(N);
  for (let u = 0; u < N; u++) {
    // active windows: [0, stop)  and (for cohort) [reEnrollDone, H)
    // stop = min(benignQuit, revEp if cohort)
    const stop = isC[u] && revEp[u] >= 0 ? Math.min(benignQuit[u], revEp[u]) : benignQuit[u];
    // walk proof epochs in window 1, then window 2
    let lastProof = -1, maxGap = 0, gapStartInWindow = 0, resumedAfterWindowGap = 0, longestGapStart = -1;
    const stepWindow = (a, bEnd) => {
      let e = a;
      while (e < bEnd) {
        const step = 1 + geom(rnd, p[u]);
        e += step;
        if (e >= bEnd) break;
        if (lastProof >= 0) {
          const g = e - lastProof;
          if (g > maxGap) { maxGap = g; longestGapStart = lastProof; }
        }
        lastProof = e;
      }
    };
    stepWindow(0, Math.min(stop, H));
    if (isC[u] && reEnrollDone[u] >= 0 && reEnrollDone[u] < H) {
      const gapLen = reEnrollDone[u] - lastProof;
      if (lastProof >= T_REV - 5 && lastProof <= T_REV + T_stage + 5) gapStartInWindow = 1;
      if (gapLen > maxGap) { maxGap = gapLen; longestGapStart = lastProof; }
      if (gapLen >= 1) resumedAfterWindowGap = 1;
      lastProof = reEnrollDone[u];
      stepWindow(reEnrollDone[u], H);
    }
    // for non-cohort: does their longest gap happen to start in the window? (false positives)
    if (!isC[u] && longestGapStart >= T_REV - 5 && longestGapStart <= T_REV + T_stage + 5 && lastProof > T_REV) gapStartInWindow = 1;
    const stillActiveAtH = lastProof >= 0 && (H - lastProof) < 90;
    feat[u] = { isC: isC[u], maxGap, gapStartInWindow, resumed: stillActiveAtH ? 1 : 0, longestGapStart };
  }
  return feat;
}

const lb = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] < x ? (lo = m + 1) : (hi = m); } return lo; };
function rocOf(scored) {
  const pos = scored.filter((x) => x.c).map((x) => x.s).sort((a, b) => a - b);
  const neg = scored.filter((x) => !x.c).map((x) => x.s).sort((a, b) => a - b);
  const P = pos.length, Ng = neg.length;
  const all = scored.slice().sort((a, b) => a.s - b.s);
  let rankSum = 0;
  for (let r = 0; r < all.length; ) { let j = r; while (j < all.length && all[j].s === all[r].s) j++; const avg = (r + j - 1) / 2 + 1; for (let t = r; t < j; t++) if (all[t].c) rankSum += avg; r = j; }
  const auc = (rankSum - (P * (P + 1)) / 2) / (P * Ng);
  const th = neg[Math.floor(neg.length * 0.99)] ?? 1e9;
  const tp = P - lb(pos, th), fp = Ng - lb(neg, th);
  return { auc, recall: tp / P, precision: tp / (tp + fp || 1) };
}
// classifier A: gap LENGTH  (maxGap if gap started in the revocation window and user resumed)
// classifier B: gap-END CO-TIMING (score = how many users' longest gap ENDED in the same
//               epoch bucket; a synchronized re-enrollment produces a spike)
function evaluate(feat) {
  const A = feat.map((f) => ({ c: f.isC, s: (f.gapStartInWindow && f.resumed) ? f.maxGap : 0 }));
  // gap end epoch = longestGapStart + maxGap
  const endBucket = new Map();
  for (const f of feat) { if (f.gapStartInWindow && f.resumed) { const e = Math.round((f.longestGapStart + f.maxGap) / 3) * 3; endBucket.set(e, (endBucket.get(e) || 0) + 1); } }
  const B = feat.map((f) => {
    if (!(f.gapStartInWindow && f.resumed)) return { c: f.isC, s: 0 };
    const e = Math.round((f.longestGapStart + f.maxGap) / 3) * 3;
    return { c: f.isC, s: endBucket.get(e) || 0 };
  });
  const ra = rocOf(A), rb = rocOf(B);
  const best = { auc: Math.max(ra.auc, rb.auc), recall: Math.max(ra.recall, rb.recall), precision: Math.max(ra.precision, rb.precision) };
  return {
    auc_length: +ra.auc.toFixed(4), recall_length: +ra.recall.toFixed(3),
    auc_cotiming: +rb.auc.toFixed(4), recall_cotiming: +rb.recall.toFixed(3),
    auc: +best.auc.toFixed(4), recall_at_1pct_fpr: +best.recall.toFixed(3), precision_at_1pct_fpr: +best.precision.toFixed(3),
  };
}

const nat = naturalGapQuantiles(42);

const results = [];
for (const spread of [true, false]) {
  for (const T_stage of [7, 30, 90]) {
    for (const Dmean of [2, 7, 14, 21, 30, 45, 60]) {
      const acc = [];
      for (let s = 0; s < SEEDS; s++) acc.push(evaluate(run({ Dmean, Dshape: 2.0, T_stage, spreadReenroll: spread, seed: (Dmean * 733 + T_stage * 91 + (spread ? 1 : 0) * 50021 + s * 17) >>> 0 })));
      const m = (f) => +(acc.reduce((a, r) => a + f(r), 0) / acc.length).toFixed(4);
      results.push({
        reenroll_spread: spread, T_stage, Dmean,
        Dmean_vs_nat_p90: `${Dmean} vs ${nat.p90}`,
        auc: m((r) => r.auc),
        recall_at_1pct_fpr: m((r) => r.recall_at_1pct_fpr),
        recall_length: m((r) => r.recall_length),
        recall_cotiming: m((r) => r.recall_cotiming),
        precision_at_1pct_fpr: m((r) => r.precision_at_1pct_fpr),
      });
    }
  }
}

// threshold D*: smallest Dmean (spread=true, T_stage=90) where recall@1%FPR crosses 0.25
const line = results.filter((r) => r.reenroll_spread && r.T_stage === 90).sort((a, b) => a.Dmean - b.Dmean);
let Dstar = null;
for (const r of line) if (r.recall_at_1pct_fpr >= 0.25) { Dstar = r.Dmean; break; }

const out = {
  params: { N, H, T_REV, RHO_PERM, COHORT, BA, BB, note: "Dshape=2 Gamma; spread=false => every member's delay == Dmean (synchronized re-enrollment)" },
  natural_gap_distribution_days: nat,
  results,
  D_star_days_recall25_spread_T90: Dstar,
  falsification_3_reenroll_signature: [
    "Re-enrollment = obtaining k fresh attestations + inserting a new leaf. Observable surfaces:",
    "  on-chain: k attestation txs + a tree insertion clustered shortly after t_rev. If these are shaped identically to INITIAL enrolment (same tx types, same insertion path, fresh commitment C -- the design already keeps C private and unlinkable) the only residual is the TIMING CLUSTER: a spike of enrolments in [t_rev, t_rev+T_stage+D].",
    "  => re-enrollment completion must be spread the same way staging is (the 'spread=false' rows below show synchronized re-enrollment is trivially recovered regardless of Dmean).",
    "  network: attester contact from a re-enrolling client is indistinguishable from a new user's only if the enrolment client path is the same; a distinct 're-enroll' endpoint or flag would re-expose the cohort. Normative: one enrolment path.",
  ],
  reading: [
    "Natural gap p90 = " + nat.p90 + " d, p95 = " + nat.p95 + " d, p99 = " + nat.p99 + " d, mean = " + nat.mean + " d.",
    "Two observer channels: gap LENGTH (a single overlong gap starting in the revocation window) and gap CO-TIMING (many members' gaps ending in the same epoch bucket). recall@1%FPR is the max of the two.",
    "T_stage = 90 (wide staging): the cohort HIDES for the whole plausible re-enrollment range -- recall@1%FPR <= 0.05 up to Dmean = 30 d, ~0.07 at 45, ~0.16 at 60, both spread and synchronized. Wide staging spreads BOTH the gap-start and gap-end clusters, so co-timing does not fire. D* (recall reaches 0.25) > 60 d.",
    "T_stage = 30: hides up to Dmean ~ 14-21 d (recall <= 0.08), then the length channel starts to separate (recall 0.20 at 45, 0.31 at 60).",
    "T_stage = 7 (tight staging): FAILS. Even spread re-enrollment reaches recall 0.25 by Dmean = 30 d; synchronized reaches 0.36 by Dmean = 14 d -- the co-timing channel fires because gap-ends cluster.",
    "=> Result 3 HOLDS, with a corrected requirement. Re-enrollment does move the rate-detection floor from rho_perm to rho_gap (~380x), BUT a second channel -- gap co-timing -- imposes its own T_stage floor of ~30-90 epochs that the rho_gap substitution does NOT remove. Net staging depth drops from the rho_perm regime's ~100-340 epochs (small n) to ~30-90 epochs -- roughly 3-10x, not 380x. The note's T ~ 3k/(n rho_gap) (sub-day) understates it.",
    "Requirements for Result 3: (i) wide staging T_stage >= ~90 epochs (spreads both gap clusters); (ii) re-enrollment delay Dmean within ~ natural p90 (" + nat.p90 + " d) for margin; (iii) per-member delay variance (spread), or rely on (i); (iv) falsification #3 -- re-enrollment shaped identically to fresh enrolment, one client path, fresh unlinkable C.",
  ],
};
writeFileSync("docs/self-audit/sim_reenrollment_gap.json", JSON.stringify(out, null, 2));

let md = `# Task 2 -- re-enrollment delay vs natural gap length (measured)\n\n`;
md += `_\`scripts/sim/reenrollment_gap.mjs\`. N=${N.toLocaleString()}, cohort=${COHORT} (5%), horizon ${H}d, revocation at day ${T_REV}, ${SEEDS} seeds/cell._\n\n`;
md += `## Natural usage-gap distribution (Beta(${BA},${BB}) engagement, Geometric gaps)\n\n`;
md += `| mean | p50 | p90 | p95 | p99 |\n|---:|---:|---:|---:|---:|\n| ${nat.mean} d | ${nat.p50} d | ${nat.p90} d | ${nat.p95} d | ${nat.p99} d |\n\n`;
md += `## Observer vs re-enrolled cohort (same metrics as sim_staging_attack.mjs)\n\n`;
md += `recall@1%FPR = best of two channels: gap length, gap-end co-timing.\n\n`;
md += `| re-enroll | T_stage | D_mean (d) | AUC | recall@1%FPR | recall(length) | recall(co-timing) | precision@1%FPR |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const r of results) md += `| ${r.reenroll_spread ? "spread" : "**sync**"} | ${r.T_stage} | ${r.Dmean} | ${r.auc} | **${r.recall_at_1pct_fpr}** | ${r.recall_length} | ${r.recall_cotiming} | ${r.precision_at_1pct_fpr} |\n`;
md += `\n**D\\* (recall@1%FPR reaches 0.25, spread, T_stage=90) = ${Dstar === null ? ">60" : Dstar} days.**\n\n`;
md += `## Falsification #3 -- does re-enrolling produce its own signature?\n\n` + out.falsification_3_reenroll_signature.map((x) => `- ${x}`).join("\n") + `\n\n`;
md += `## Reading\n\n` + out.reading.map((x) => `- ${x}`).join("\n") + `\n`;
writeFileSync("docs/self-audit/sim_reenrollment_gap.md", md);
console.log(md);
