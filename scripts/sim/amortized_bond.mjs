// "Two Answers" note, Falsification #3 (the most-likely break): does an AMORTISED
// loyalty bond -- posted once, covering M corruptions -- break the P <~ b bound
// and inflate the required whistleblower bounty B?
//
//   node scripts/sim/amortized_bond.mjs -> docs/self-audit/sim_amortized_bond.{json,md}
//
// Setup. An attester signs M fake credentials for one attacker, earning delta*b
// each (escrow-on-non-revocation). They post ONE trustless bond P, forfeited if
// ANY of the M credentials is revoked within T (the non-attributing trigger:
// condition on revocation, not on reporting -- "Two Answers" Q2.1).
//
// Rational bond cap. P is the attester's OWN capital. They will risk at most what
// the relationship pays them: P <= M * delta * b  (the whole batch's earnings).
// The single-corruption bound P <~ b is the M=1 case.
//
// Reporting calculus for the attester, deciding on one credential, given:
//   - pi   : belief that some OTHER attester reports this credential
//   - h    : per-epoch hazard that a given batch credential is revoked by an
//            independent channel (another bribed attester defecting elsewhere,
//            downstream detection q). Over T epochs the batch's survival prob is
//            s = (1-h)^T per credential; P_live = prob the bond is still unspent
//            when the decision is made ~ (1-h)^{T} ^ (M-1) for the other M-1.
//   - casc : probability that revoking one corrupt attester triggers cluster
//            scrutiny that revokes the WHOLE batch (Result 2 cascading detection).
//
//   Report  : + B (bounty) + immunity  - P (bond, forfeited on the revocation it causes)
//             - (M-1)*delta*b * (future income lost if the attacker cuts ties)   [naive]
//   Silent  : with prob [1-(1-pi)] * something the bond is forfeited anyway; and
//             with prob casc the whole batch (bond + all future income) is lost
//             regardless of the attester's choice.
//
// We compute B_required = smallest B making "report" weakly dominant, and the
// EFFECTIVE M after batch-decay and cascade are accounted for.

import { writeFileSync } from "node:fs";

const b = 1, delta = 0.95;

function Brequired({ M, pi, h, T, casc, riskFrac }) {
  // P the attester actually posts: riskFrac of the cap M*delta*b
  const P = riskFrac * M * delta * b;
  // prob the bond is still live (no batch credential revoked yet) at decision time
  const perCredSurvive = Math.pow(1 - h, T);
  const Plive = Math.pow(perCredSurvive, Math.max(0, M - 1));       // the other M-1 all still alive
  // future income the attester would forfeit by reporting (only meaningful if the
  // batch would otherwise survive AND no cascade): (M-1) creds * escrowed bribe
  const futureIncome = (M - 1) * delta * b * perCredSurvive * (1 - casc);
  // Silent branch: bond lost anyway with prob  q_lose = 1 - (1-pi)*Plive*(1-casc)
  //   (someone else reports, or an independent revocation, or a cascade)
  const qLoseIfSilent = 1 - (1 - pi) * Plive * (1 - casc);
  // Report dominates iff:
  //   B + [keep immunity]  >=  Plive * P  (bond you still had to lose by acting)
  //                            + futureIncome
  //                            - qLoseIfSilent * P   (bond you'd have lost anyway)
  // => B >= Plive*P + futureIncome - qLoseIfSilent*P
  const Breq = Plive * P + futureIncome - qLoseIfSilent * P;
  return { P: +P.toFixed(3), Plive: +Plive.toFixed(4), futureIncome: +futureIncome.toFixed(3), qLoseIfSilent: +qLoseIfSilent.toFixed(3), B_required_over_b: +Math.max(0, Breq).toFixed(3) };
}

const rows = [];
for (const M of [1, 3, 10, 30, 100]) {
  for (const h of [0.0, 0.02, 0.05, 0.1]) {          // per-epoch independent revocation hazard on a batch credential
    for (const casc of [0.0, 0.5, 0.9]) {            // cascade probability (Result 2)
      for (const pi of [0, 0.2]) {
        const r = Brequired({ M, pi, h, T: 10, casc, riskFrac: 1.0 });   // attester posts the full rational cap
        rows.push({ M, h, casc, pi, ...r });
      }
    }
  }
}

// headline slices
const naive = rows.filter((r) => r.h === 0 && r.casc === 0 && r.pi === 0);      // no decay, no cascade
const withHazard = rows.filter((r) => r.h === 0.05 && r.casc === 0 && r.pi === 0);
const withCascade = rows.filter((r) => r.h === 0.02 && r.casc === 0.9 && r.pi === 0);

// "effective M": the M beyond which B_required stops growing because the bond
// decays / cascades faster than it amortises. Find where dB/dM ~ 0 in the
// hazard+cascade slice.
function effectiveM(slice) {
  let prev = 0, peak = { M: 1, B: 0 };
  for (const r of slice.sort((a, b2) => a.M - b2.M)) {
    if (r.B_required_over_b >= peak.B) peak = { M: r.M, B: r.B_required_over_b };
    prev = r.B_required_over_b;
  }
  return peak;
}

const out = {
  model: { b, delta, T: 10, note: "P = riskFrac * M * delta * b, riskFrac=1 (attester risks the whole batch's earnings)" },
  rows,
  slices: {
    naive_no_decay_no_cascade: naive.map((r) => ({ M: r.M, B_required_over_b: r.B_required_over_b })),
    with_independent_hazard_h005: withHazard.map((r) => ({ M: r.M, B_required_over_b: r.B_required_over_b, bond_still_live_prob: r.Plive })),
    with_cascade_09_h002: withCascade.map((r) => ({ M: r.M, B_required_over_b: r.B_required_over_b })),
  },
  effective_M_under_hazard005_cascade0: effectiveM(withHazard),
  effective_M_under_cascade09_hazard002: effectiveM(withCascade),
  reading: [
    "NAIVE (no batch decay, no cascade, pi=0): B_required grows ~linearly in M -- an amortised bond covering M corruptions demands B ~ (2M-1)*b. This is the break Falsification #3 names: the P <~ b bound becomes P <~ M*b and the required bounty scales with M.",
    "BUT the amortised bond is FRAGILE. It is forfeited on the FIRST revocation anywhere in the batch. With a per-credential independent revocation hazard h, the probability the bond is still unspent decays as (1-h)^{T(M-1)} -- for M=10, h=0.05, T=10 that is (0.95)^90 ~ 0.01. A bond that is almost certainly already gone deters nothing: B_required collapses back toward the single-corruption value.",
    "CASCADING DETECTION (Result 2) finishes it: if revoking one corrupt attester triggers cluster scrutiny that revokes the whole batch with prob casc, then silence does not protect the bond OR the future income -- both are lost regardless of the attester's choice -- so reporting (for bounty + immunity) strictly dominates. At casc=0.9 the amortised advantage is essentially gone at every M.",
    "=> Falsification #3 is REAL but SELF-LIMITING. An amortised bond inflates B_required only in the absence of (a) independent batch-revocation hazard and (b) cascading correlation-driven detection. Both are present in the design 'Two Answers' already requires (Result 2). The effective B_required with hazard+cascade stays within a small multiple of b, so the B > 2b rule survives PROVIDED cascading detection is deployed -- which Result 2 already makes mandatory for redundancy to be safe.",
    "The residual honest statement: without cascading detection, an amortised bond does break B > 2b and the required bounty scales with the attacker's batch size. Cascading detection is therefore load-bearing for BOTH redundancy safety (Result 2) AND the bounty bound (Result 3).",
  ],
};
writeFileSync("docs/self-audit/sim_amortized_bond.json", JSON.stringify(out, null, 2));

let md = `# Falsification #3 -- the amortised bond (measured)\n\n`;
md += `_\`scripts/sim/amortized_bond.mjs\`. Units of b (bribe=1), delta=${delta}, T=10 epochs. P = full rational cap = M*delta*b._\n\n`;
md += `## B_required (multiples of b) to make reporting dominant\n\n`;
md += `| M (batch size) | naive (h=0, casc=0) | + independent hazard h=0.05 | + cascade casc=0.9, h=0.02 |\n|---:|---:|---:|---:|\n`;
for (const M of [1, 3, 10, 30, 100]) {
  const n = naive.find((r) => r.M === M).B_required_over_b;
  const hh = withHazard.find((r) => r.M === M).B_required_over_b;
  const cc = withCascade.find((r) => r.M === M).B_required_over_b;
  md += `| ${M} | ${n} | ${hh} | ${cc} |\n`;
}
md += `\n(bond-still-live probability at M=10, h=0.05: ${withHazard.find((r) => r.M === 10).Plive}; at M=30: ${withHazard.find((r) => r.M === 30).Plive})\n\n`;
md += `## Reading\n\n` + out.reading.map((x) => `- ${x}`).join("\n") + `\n`;
writeFileSync("docs/self-audit/sim_amortized_bond.md", md);
console.log(md);
