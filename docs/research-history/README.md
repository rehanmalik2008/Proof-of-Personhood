# Research history — chronological record, superseded by the master spec

> **This directory is not the entry point.** The authoritative document is
> [`../../MASTER-SPECIFICATION.md`](../../MASTER-SPECIFICATION.md). It consolidates
> everything below, resolves every retraction, and governs wherever a note here
> disagrees with it.

## What these files are

These are the working research notes and result write-ups produced while the
protocol was designed and the prover was benchmarked, in roughly the order they
were written. They are kept because they show **the reasoning and the
retractions** — why each design decision was made, which ideas were tried and
rejected, and where earlier claims were walked back. That trail is valuable for an
auditor or a technical reviewer who wants to understand *how* a claim was reached.
It is confusing as a starting point, which is why it now lives here and not at the
repo root.

**Every note here is superseded by the master spec.** Where a note says something
the master spec contradicts, the master spec is correct and the note is a
historical record of what was believed at the time. The notes have **not** been
edited to match the master spec — editing them would destroy the record of the
reasoning. Read them as "what we thought on the date written," not as current
claims.

## Known claims in these notes that the master spec has since narrowed or retracted

| appears in these notes as… | current claim (master spec) |
|---|---|
| "zero trusted parties" / "no trusted party" / "trustless" | **"no *single* trusted party, given a 1-of-N-honest publication medium."** A single bulletin-board publisher **is** a trusted (if publicly accountable) party. See MASTER-SPEC §5 and `../../THREAT-MODEL.md` §7. Several notes here (`layer1-sybil-wedge-spec.md`, `personhood-agent-close-blockers.md`) predate the narrowing; `from-circuit-to-standard.md`, `the-last-open-item.md`, and the `witness-maintenance` line already carry the correction. |
| "Result 1: deterrence needs `γ ≥ β`" (the single-context recap) | **`γ ≥ β·m·E`** — `m` = monetizable contexts per credential, `E` = credential lifetime in epochs. `γ ≥ β` is the special case `m = E = 1`. Context-scoped attestation is what collapses `m → 1`. See MASTER-SPEC §3.1. `layer1-sybil-wedge-spec.md` itself states both forms (Result 1 recap, then Result 5). |
| "GO = full-flow p95 < 2 s" stated flatly (harness verdict, several notes + `web/README.md`) | The 2 s bar assumed **per-login** proving. Revised target: **≤2 s on mid-range; ≤5 s cold on entry-level, proven once per epoch, not per login** (epoch-scoped nullifiers + RP-side caching). Entry-level per-login proving should use the native SDK. See MASTER-SPEC §4.3. |
| "the memory wall is beaten" / "zero-install holds" (conditional, in `the-memory-wall*.md`) | **Still `Open`.** The formal gate needs peak RSS on a **≤3 GB** device under load; the measured device (Galaxy A12) is 3.75 GB. Strong evidence, not closure. See MASTER-SPEC §4.1 and §6 gate #3. The notes state this conditionally; the collator (`scripts/collate_results.mjs`) never prints "beaten" unless the ≤3 GB-under-load condition is met. |

## Rough chronology / index

**Protocol design**
- `the-missing-layer.md` — the problem statement: personhood without a central registry.
- `layer1-sybil-wedge-spec.md` — the sybil-resistance wedge; Results 1–7, the `γ ≥ β·m·E` economics.
- `pricing-personhood.md` — personhood as a priced dial, not a boolean.
- `task-2.1-out-of-band-reputation.md` — out-of-band seller reputation (adjacent problem).
- `personhood-agent-close-blockers.md` — early "close the blockers" brief.

**Circuit / prover cost reduction**
- `the-signature-floor.md` — the ~13k-constraint EdDSA floor; Lever C (out-of-circuit BLS, leaks attesters — rejected).
- `killing-the-merkle-cost.md` — the Merkle ladder; membership is not the problem, signatures are.
- `speed-without-the-leak.md` — Lever H (in-circuit half-aggregation — measured, costs *more* than direct; rejected).
- `the-no-shared-key-bridge.md` — the decision that resolved it: prove **membership** at login, verify signatures once at enrollment → Phase-2 collapses to 4,309 constraints, attester-unlinkable by construction.

**Follow-on engineering**
- `the-last-open-item.md` — witness maintenance framed as the sole open item.
- `the-memory-wall.md`, `the-memory-wall_UPDATE.md` — the ~2 GB WASM-memory scare → ~411 MB working set → the still-open ≤3 GB gate.
- `the-cpu-wall.md` — the entry-level prove-time problem; browser levers exhausted; rapidsnark native anchor (477 ms).
- `the-wasm-bridge.md` + `THE-WASM-BRIDGE-STEPA.md` — compile rapidsnark to WASM; gate failed at 5.17× native.
- `after-the-bridge.md` + `AFTER-THE-BRIDGE-EXP1.md` + `AFTER-THE-BRIDGE-EXP2-AND-ENDPOINT.md` — attribute the 5× (codegen, not field arithmetic → no assembly), check the Rust/arkworks path (same layer), land on the deployment matrix.

**Adoption / standardisation strategy**
- `from-circuit-to-standard.md` — working circuit → adoptable standard; the trust-claim correction.
- `closing-the-broker.md` — Result 3 (the broker dilemma) and its honest grading. Two business sections were removed for publication; the technical content is unchanged.

The measured numbers behind MASTER-SPEC §4 live in `../../results/*.json`; the
attribution detail behind §4.2 is `AFTER-THE-BRIDGE-EXP1.md`.
