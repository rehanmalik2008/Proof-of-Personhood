// Task 2 of two-mechanisms.md: the staging-correlation attack.
//
//   node scripts/sim/staging_correlation_attack.mjs
//   -> docs/self-audit/sim_staging_attack.{json,md}
//
// Monte Carlo. Every user's only observable is its silent-run-length at the
// observer's horizon H (epochs since its last accepted proof). We sample each
// user's "stop epoch" directly (the per-epoch loop is collapsed analytically):
//
//   benignQuit    ~ Geometric(rho_perm)         permanent attrition, device loss / disengagement
//   scheduledRev  = staged revocation epoch      (cohort members only)
//   stopEpoch     = min(benignQuit, scheduledRev)
//   lastAccept    = stopEpoch - 1 - Geom0(1-rho_gap)     (last proof before stopping; alive users: H - Geom0)
//   silentRun     = H - lastAccept
//
// Staging modes (randomisation quality):
//   burst   : entire cohort at epoch 2                       (T ignored)
//   index   : |C|/T per epoch in leaf-index order            (correlated)
//   uniform : |C|/T random cohort members/epoch, +-1 jitter  (interleaved with benign churn)
//
// Observer classifier: "silentRun >= theta". This is information-optimal when the
// client fails uniformly (paper B.4): a revoked user and a benign permanent
// quitter are identical; only an intermittent user, who resumes, is separable,
// and more so as H grows. We report ROC AUC (0.5 = hidden, 1 = recovered),
// precision at TPR 0.9 and 0.5, and the recovered-member anonymity set. Plus an
// adaptive observer that calibrates theta to 1% FPR on a known pilot cohort.

import { writeFileSync } from "node:fs";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const geom = (rnd, p) => Math.floor(Math.log(1 - rnd()) / Math.log(1 - p));   // >=0, P(k)=p(1-p)^k... first-success index
const geomFirst = (rnd, p) => 1 + geom(rnd, p);                               // >=1 epoch of the first success

const RHO_PERM = 7.9e-4;   // per epoch (Task 1 central)
const RHO_GAP = 0.30;
const N = 40_000;
const EPOCHS = 300;
const SEEDS = 8;

function silentRuns({ C, T, mode, H, seed }) {
  const rnd = mulberry32(seed);
  // schedule: revocation epoch per cohort member (index 0..C-1)
  const revEpoch = new Int32Array(C);
  if (mode === "burst") {
    revEpoch.fill(2);
  } else if (mode === "index") {
    for (let i = 0; i < C; i++) revEpoch[i] = 2 + Math.min(T - 1, Math.floor((i / C) * T));
  } else { // uniform
    const order = Array.from({ length: C }, (_, i) => i);
    for (let i = C - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    for (let s = 0; s < C; s++) {
      const i = order[s];
      let e = 2 + Math.floor(((s + 0.5) / C) * T) + ((rnd() < 0.5 ? 0 : 1) - (rnd() < 0.5 ? 0 : 1));
      revEpoch[i] = Math.max(2, Math.min(2 + T, e));
    }
  }
  const runs = new Float64Array(N);
  const isC = new Uint8Array(N);
  for (let u = 0; u < N; u++) {
    const benign = geomFirst(rnd, RHO_PERM);                 // epoch of permanent benign stop
    let stop;
    if (u < C) { isC[u] = 1; stop = Math.min(benign, revEpoch[u]); }
    else stop = benign;
    let lastAccept;
    if (stop >= H) lastAccept = H - geom(rnd, 1 - RHO_GAP);  // still alive at H
    else lastAccept = stop - 1 - geom(rnd, 1 - RHO_GAP);
    runs[u] = H - lastAccept;
  }
  return { runs, isC };
}

function roc({ runs, isC }) {
  const idx = Array.from({ length: runs.length }, (_, i) => i).sort((a, b) => runs[a] - runs[b]);
  let P = 0; for (let i = 0; i < isC.length; i++) if (isC[i]) P++;
  const Ng = runs.length - P;
  // AUC via rank sum (Mann-Whitney), average ranks for ties
  let rankSum = 0;
  for (let r = 0; r < idx.length; ) {
    let j = r; while (j < idx.length && runs[idx[j]] === runs[idx[r]]) j++;
    const avg = (r + j - 1) / 2 + 1;
    for (let t = r; t < j; t++) if (isC[idx[t]]) rankSum += avg;
    r = j;
  }
  const auc = (rankSum - (P * (P + 1)) / 2) / (P * Ng);
  // sweep theta over distinct run values, descending (higher theta = stricter)
  const vals = [...new Set(Array.from(runs))].sort((a, b) => b - a);
  let at90 = null, at50 = null;
  // precompute sorted arrays
  const posV = []; const negV = [];
  for (let i = 0; i < runs.length; i++) (isC[i] ? posV : negV).push(runs[i]);
  posV.sort((a, b) => a - b); negV.sort((a, b) => a - b);
  const geCount = (arr, th) => arr.length - lowerBound(arr, th);
  for (let vi = vals.length - 1; vi >= 0; vi--) {
    const th = vals[vi];
    const tp = geCount(posV, th), fp = geCount(negV, th);
    const tpr = tp / P, prec = tp + fp ? tp / (tp + fp) : 0;
    if (tpr >= 0.9 && !at90) at90 = { theta: th, tpr: +tpr.toFixed(3), fpr: +(fp / Ng).toFixed(4), precision: +prec.toFixed(3), flagged: tp + fp };
    if (tpr >= 0.5 && !at50) at50 = { theta: th, precision: +prec.toFixed(3), flagged: tp + fp };
  }
  return { auc: +auc.toFixed(4), at90, at50 };
}
function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }

const results = [];
for (const C of [400, 2000]) {              // 1% and 5% of N
  for (const mode of ["burst", "index", "uniform"]) {
    for (const T of (mode === "burst" ? [1] : [7, 30, 90, 180])) {
      for (const H of [EPOCHS, 2 * EPOCHS]) {
        const acc = [];
        for (let s = 0; s < SEEDS; s++) acc.push(roc(silentRuns({ C, T, mode, H, seed: (C * 131 + T * 977 + H * 17 + mode.length * 7 + s * 101) >>> 0 })));
        const mean = (f) => +(acc.reduce((a, r) => a + f(r), 0) / acc.length).toFixed(4);
        results.push({
          C, cohortPct: (100 * C) / N, mode, T, H,
          auc: mean((r) => r.auc),
          precision_tpr90: mean((r) => (r.at90 ? r.at90.precision : 0)),
          fpr_tpr90: mean((r) => (r.at90 ? r.at90.fpr : 0)),
          anonset_tpr90: Math.round(mean((r) => (r.at90 ? r.at90.flagged : N))),
          precision_tpr50: mean((r) => (r.at50 ? r.at50.precision : 0)),
        });
      }
    }
  }
}

// adaptive observer: theta calibrated to 1% FPR on a known pilot cohort; the
// decisive metric = what fraction of the real cohort it then recovers, at what
// precision, and the per-member anonymity set (flagged total). Sweep mode/T/H.
const FLOOR = RHO_PERM * N;   // benign permanent quits per epoch
const adaptive = [];
for (const C of [2000]) for (const mode of ["burst", "index", "uniform"]) {
  for (const T of (mode === "burst" ? [1] : [30, 90, 180])) for (const H of [EPOCHS, 2 * EPOCHS]) {
    const acc = [];
    for (let s = 0; s < SEEDS; s++) {
      const { runs, isC } = silentRuns({ C, T, mode, H, seed: (9001 + mode.length * 700 + T * 13 + H + s * 41) >>> 0 });
      const neg = [], pos = [];
      for (let i = 0; i < runs.length; i++) (isC[i] ? pos : neg).push(runs[i]);
      neg.sort((a, b) => a - b); pos.sort((a, b) => a - b);
      const th = neg[Math.floor(neg.length * 0.99)];      // ~1% FPR
      const tp = pos.length - lowerBound(pos, th), fp = neg.length - lowerBound(neg, th);
      acc.push({ tpr: tp / pos.length, precision: tp / (tp + fp || 1), flagged: tp + fp });
    }
    const m = (f) => +(acc.reduce((a, r) => a + f(r), 0) / acc.length).toFixed(3);
    adaptive.push({
      C, mode, T, H,
      staged_rate_per_epoch: +(C / T).toFixed(1), attrition_floor_per_epoch: +FLOOR.toFixed(1),
      above_floor: C / T > FLOOR,
      recall: m((r) => r.tpr), precision: m((r) => r.precision),
      members_identified: Math.round(m((r) => r.tpr) * C),
      anon_set_per_identified_member: Math.round(m((r) => r.flagged)),
    });
  }
}

const out = {
  params: { N, RHO_PERM, RHO_GAP, EPOCHS, SEEDS },
  classifier: "silent-run-length >= theta (uniform client failure assumed)",
  results, adaptive_observer: adaptive,
  reading: [
    "AUC here is NOT the headline: it is dominated by the alive-vs-stopped split (Theorem 9 -- a revocation event is always detectable). It says the observer knows a cohort exists, not who is in it.",
    "The decisive table is the adaptive observer: at a fixed 1% false-positive rate, what fraction of the cohort does a calibrated patient observer actually finger?",
    "burst / index (correlated) staging: high recall at high precision at every T -- the cohort IS recovered. Correlated staging only delays.",
    "uniform staging with |C|/T ABOVE the attrition floor rho_perm*N: still largely recovered (recall ~0.4, precision ~0.7 at T=30).",
    "uniform staging with |C|/T BELOW the floor (T=90,180): recall collapses to ~0.08-0.15 at precision ~0.28-0.42. The un-fingered majority of the cohort is genuinely mixed into benign permanent attrition, and a 2x horizon does not help -- benign quitters are a permanent equal-rate decoy. In this regime staging HIDES the bulk of the cohort, not merely delays.",
    "But it is PARTIAL: even in the good regime a 1%-FPR observer still fingers ~8-15% of members. Perfect cohort privacy is not achieved.",
    "Condition for the good regime: uniform randomised staging + T >= ~3x |C|/(rho_perm N) + uniform client failure. The 3x (vs the naive |C|/(rho N)) is what buys per-member privacy, and it multiplies the Theorem 10 economic cost accordingly.",
  ],
};
writeFileSync("docs/self-audit/sim_staging_attack.json", JSON.stringify(out, null, 2));

let md = `# Task 2 -- staging-correlation attack (measured)\n\n`;
md += `_\`scripts/sim/staging_correlation_attack.mjs\`. N=${N.toLocaleString()}, rho_perm=${RHO_PERM}, rho_gap=${RHO_GAP}, ${SEEDS} seeds/cell. Classifier: silent-run-length (uniform client failure). AUC 0.5 = hidden, 1.0 = recovered._\n\n`;
md += `| \\|C\\| | mode | T | H | AUC | prec@TPR90 | FPR@TPR90 | anon-set@TPR90 | prec@TPR50 |\n`;
md += `|---:|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const r of results) md += `| ${r.C} (${r.cohortPct}%) | ${r.mode} | ${r.T} | ${r.H} | **${r.auc}** | ${r.precision_tpr90} | ${r.fpr_tpr90} | ${r.anonset_tpr90.toLocaleString()} | ${r.precision_tpr50} |\n`;
md += `\n## Adaptive observer -- theta calibrated to ~1% FPR on a pilot cohort (|C|=2000, 5% of N)\n\n`;
md += `Decisive metric: fraction of the real cohort a calibrated patient observer fingers, at what precision.\n`;
md += `Attrition floor = rho_perm*N = ${(RHO_PERM * N).toFixed(1)} benign permanent stops/epoch.\n\n`;
md += `| mode | T | staged rate /epoch | above floor? | H | recall | precision | members identified | anon-set / member |\n`;
md += `|---|---:|---:|:--:|---:|---:|---:|---:|---:|\n`;
for (const a of adaptive) md += `| ${a.mode} | ${a.T} | ${a.staged_rate_per_epoch} | ${a.above_floor ? "yes" : "**no**"} | ${a.H} | ${a.recall} | ${a.precision} | ${a.members_identified} | ${a.anon_set_per_identified_member.toLocaleString()} |\n`;
md += `\n## Reading\n\n` + out.reading.map((x) => `- ${x}`).join("\n") + `\n`;
writeFileSync("docs/self-audit/sim_staging_attack.md", md);
console.log(md);
