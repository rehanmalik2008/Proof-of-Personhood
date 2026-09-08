# Pre-push classification audit

**Classification audit run 2026-09-08. Decisions R1/R4/R5 executed 2026-09-08
(see Execution log). Nothing pushed. Staged for review only.**

Repo: `github.com/rehanmalik2008/Proof-of-Personhood` · Local branch `main`

## Execution log (decisions applied)

- **R1 — excluded the anonymised-paper trio.** `paper/_built_anon.html`,
  `paper/build_anon.mjs`, `paper/proof-of-personhood-anonymous.pdf` added to
  `.gitignore` (`paper/*anon*` + two explicit lines). Confirmed **0 commits** for
  each in any ref — no history rewrite needed. They will never be pushed.
- **R4 — sanitised local paths.** Every absolute working-tree path prefix (the
  Windows `<drive>:\...\<repo-dir>` form, the WSL `/mnt/<drive>/...` form, and the
  bare `/mnt/<drive>/...` shorthand) replaced with the neutral token `<repo>`
  across 15 self-audit files (`SELF-AUDIT.md`
  and `docs/self-audit/*.{txt,json}`, both the new and the already-public ones)
  and `paper/build_anon.mjs`, and in this report. **Only path strings changed** —
  no hash, constraint count, timing, or result value was touched (verified by
  diff). JSON/NDJSON re-validated. `npm test` and paper QC re-run green.
- **R5 — added `build/README.md`.** One paragraph: tracked `build/` ships only
  `*_vkey.json`; all proving keys in the repo are evaluation-only; points at
  `NOTICE` and `docs/CEREMONY-RUNBOOK.md`.

The rest of this document is the audit as it stood before those edits.

---

## 0. Push state — what a push would actually publish

The repo is **already public.** `origin/main` is at `0897768` ("Retire the superseded root-level PDF"), 15 commits, tag `v1.1` pushed. The local tree is:

- **1 local commit ahead of the remote:** `7ce7fa7` "Add CITATION.cff for academic citation" — not yet pushed. Reviewed: adds `CITATION.cff` only, no secrets. Safe.
- **13 modified tracked files + 84 untracked files** (97 total) — not committed. A push publishes these only after they are committed.

**Consequence for this audit:** several items flagged below (`docs/research-history/closing-the-broker.md`, `pricing-personhood.md`, `<repo>/...` paths in `docs/self-audit/circomspect_full_run.txt` and `SELF-AUDIT.md`) are **already public in the pushed history.** They are reported for completeness and for a decision about *future* handling; they are not new exposure created by this push.

---

## Task 1 — Bucket classification of the 97 pending files

### PUBLISH — 94 files

| files | bucket rationale |
|---|---|
| **`.gitignore`** (MOD) | adds `.mut/`, `.ceremony-test/`, `circuits/prln_in.json`, `build/multipoint/` to ignore list — correct, tightens exclusion |
| **`CITATION.cff`, `NOTICE`, `AUTHORS`** (MOD/MOD/NEW) | licensing / attribution. See Task 3. |
| **`README.md`, `MASTER-SPECIFICATION.md`, `THREAT-MODEL.md`, `docs/EVALUATION.md`, `docs/SELF-AUDIT.md`** (MOD) | technical docs; edits are self-audit results + framing corrections. Diff scanned: no secrets, no business content. |
| **`package.json`** (MOD) | adds `forward_determination.mjs` to the `test` script. |
| **`CIRCUIT-FREEZE.md`** (NEW) | v1.2 freeze: source/r1cs/constraint hashes, lock cross-check. Explicitly requested public. |
| **`docs/CEREMONY.md`, `docs/CEREMONY-RUNBOOK.md`** (NEW) | ceremony coordinator doc + operational run-book. No secrets; states keys are evaluation-only. |
| **`docs/DISCOVERY-redundancy-heuristic.md`** (NEW) | standalone auditing-methodology note. |
| **`circuits/*.circom`** — `abstract/poseidon.circom`, `main_abstract_split`, `poseidon_only_k3`, `poseidon_only_k8`, `poseidon_rln`, `poseidon_rln_freed`, `residual_abstract`, `residual_abstract_freed` (8 NEW) | self-audit / compositional-verification circuit fixtures. Scanned: no comments with paths, names, or TODOs. |
| **`scripts/*.mjs` + `scripts/*.sh`** — `build_selfaudit_circuits`, `circuit_freeze`, `compositional_verify`, `ff_smt_two_witness`, `forward_determination`, `gen_input_abstract`, `gen_input_multipoint`, `mem_ceiling_probe`, `mem_ceiling_test.sh`, `mutation_test`, `nullspace_harness`, `nullspace_harness_regression`, `taint_iszero`, `two_witness_multipoint`, `two_witness_search`, `wsl_setup_avd.sh`, `wsl_setup_cvc5.sh`, `wsl_setup_node.sh` (18 NEW); `build.mjs`, `test_soundness_adversarial.mjs` (2 MOD) | self-audit tooling + build. Path handling is computed from `import.meta.url` / runtime `WSLREPO`, no hardcoded machine paths. `.mut/` references are a **relative** scratch-dir name, not a leak. |
| **`scripts/ceremony/coordinator.mjs`, `scripts/ceremony/test_ceremony.mjs`** (NEW) | trusted-setup ceremony coordinator + its test. |
| **`docs/self-audit/*.md` result docs** — `compositional_verify.md`, `ff_smt.md`, `forward_determination.md`, `gate3_android_emulator.md`, `mutation_table.md`, `picus-upstream-report.md`, `picus-upstream-issue.md`, `taint_iszero.md`, `two_witness_multipoint.md`, `two_witness_results.md` (10 NEW) | self-audit write-ups. Scanned: `two_witness_multipoint.md` has no path leak; the others clean. |
| **`docs/self-audit/*.json`** — `compositional_verify.json`, `ff_smt_*` (10), `forward_determination.json`, `mutation_results.json`, `taint_iszero.json`, `two_witness_multipoint.json` (~15 NEW) | machine-readable results. **`mutation_results.json` L35 contains a local path — see Task 2, hit #3.** |
| **`docs/self-audit/*.txt` logs** — `compositional_verify.txt`, `ff_smt_*` (12), `mem_ceiling_results.txt`, `nullspace_harness_m1a_regression.txt`, `taint_iszero.txt`, `two_witness_deployed.txt`, `two_witness_multipoint.txt` (~17 NEW) | raw run logs. **Several contain `<repo>\...` / `<repo>/...` — see Task 2, hits #1, #2, #4–#7.** |
| **`paper/paper.html`, `paper/proof-of-personhood-without-a-registry.pdf`** (MOD) | the paper (v1.2 draft). No author-identity issue (name is intended). |

### EXCLUDE-BUSINESS — 0 files in the pending set

Cross-check of the named files (all: **0 commits in any ref**, i.e. never tracked):

| file | on disk | ignore rule | tracked? | status |
|---|---|---|---|---|
| `PARTNER-BRIEF.md` | repo root | `.gitignore:31` (exact) | **no** (0 commits) | **correctly excluded** |
| `the-open-source-moat.md` | `../private-business-notes/` (**outside repo**) | `.gitignore` `**/the-open-source-moat.md` (belt-and-braces) | **no** | **cannot be pushed** — outside the repo tree |
| `playing-against-giants.md` | `../private-business-notes/` (outside repo) | `.gitignore` `**/playing-against-giants.md` | **no** | cannot be pushed |
| `surviving-due-diligence.md` | `../private-business-notes/` (outside repo) | `.gitignore` `**/surviving-due-diligence.md` | **no** | cannot be pushed |
| `closing-what-code-can-close.md` | `<parent>/` (**outside repo**) | n/a | **no** (0 commits) | cannot be pushed — a round-note, outside the repo |
| `which-extensions-and-when.md` | not found anywhere | n/a | **no** | n/a |

> Note: the `.gitignore` line `../private-business-notes/` is an **ineffective pattern** (gitignore cannot match paths above the repo root). It is harmless because that directory is outside the repo and unreachable by git. No fix required; could be removed for clarity.

### EXCLUDE-JUNK — correctly ignored (not in the pending set; confirmed via `git status --ignored`)

`.mut/`, `build-repro/`, `build/multipoint/`, `scratch_mem/`, `node_modules/`, `circuits/*.r1cs`, `circuits/*.sym`, `circuits/*_js/`, `circuits/prln_in.json`, `build/*.sym`, `paper/_built.html`, `paper/_chart*.svg`, `paper/_proof.json`.
**Confirmed still needed and NOT junk:** `build/*_vkey.json` (28 verification keys, kept via `!build/*_vkey.json` negation — a verifier needs these); `web/*_final.zkey` + `web/*.wasm` + `web/*_vkey.json` (12 files, the browser "verify it yourself" bundle, already tracked, labelled evaluation-only).

### REVIEW-NEEDED — 5 items for your decision

| # | file(s) | why flagged | my read |
|---|---|---|---|
| R1 | `paper/_built_anon.html`, `paper/build_anon.mjs`, `paper/proof-of-personhood-anonymous.pdf` (3 NEW) | Anonymised copy of the paper for **double-blind review**. Anonymisation itself worked (0 occurrences of "Rehan Malik" in the HTML/PDF). **But** publishing it in the *same public repo* that carries `AUTHORS`, `NOTICE` (Copyright Rehan Malik), the non-anon paper, and the byline **defeats the double-blind** — any reviewer who finds the repo (it is linked from `CITATION.cff` and the paper) can trivially de-anonymise. `build_anon.mjs` also hardcodes `<repo>/paper` and a local Chrome path. | **Recommend EXCLUDE** (do not push). Keep local, or add to `.gitignore`. If a venue needs the anon PDF hosted, that is a separate private artifact, not this repo. |
| R2 | `docs/research-history/closing-the-broker.md` (**already tracked & public**, commit `f90d1f9`) | Named in the request as "the redacted `closing-the-broker.md`". **Redaction verified intact:** §1 ("What you asked for") and §4 ("The money, concretely") are replaced with `[Section removed for publication: business and revenue material…]` placeholders. Remaining content = Result 3 (broker dilemma, technical), an honest self-grading, and research-process steps ("call five companies", "publish Result 3"). No revenue figures, valuation, cap table, or GTM strategy survive. | **Leave as-is** (already public, redaction holds). No new action. |
| R3 | `docs/research-history/pricing-personhood.md` (**already tracked & public**, commit `f90d1f9`) | Name implies pricing. Content is the **security-economics derivation** behind the paper's §4 (`γ ≥ β·m·E`, the rental-market bound, the poisoning attack) with runnable verification code. **No** company/product-revenue framing (grep for `we will charge`/`SaaS`/`subscription`/`runway`/`round`/`term sheet` → 0 hits). Two words to be aware of: **"go-to-market"** appears once (L202, meaning "self-attestation by a single verifier must be a complete deployment" — an architecture requirement), and **"moat"** appears once (L212, "the actual moat around every large platform… is reputation hostage-taking" — analysis of the *problem domain*, not this project's competitive position). | **Leave as-is / PUBLISH.** It is research, and already public. Flagged only so you can veto the two word-hits if you want them edited. |
| R4 | Local absolute-path prefixes in ~15 self-audit logs (`<repo>\…` / `/mnt/<drive>/…`) — full list in Task 2 | Low severity: exposed the drive letter, the local working-directory name, and the internal repo dir name (the public repo is named `Proof-of-Personhood`). **No username, no home dir, no credential, no PII.** The same pattern was **already public** in `docs/self-audit/circomspect_full_run.txt` and `SELF-AUDIT.md`. | **DONE (R4).** A one-line `sed` on the path prefix across every affected `.txt` / `.json` (new and already-public), replacing it with `<repo>`. No hash / count / timing / result touched. |
| R5 | `build/` proving-key disclosure | `web/README.md` carries the "⚠ EVALUATION ONLY" banner next to `web/*_final.zkey`. Tracked `build/` contains **only `*_vkey.json`** (verification keys — no toxic-waste risk) and no `_final.zkey`, so a `build/` disclosure is arguably unnecessary; `NOTICE` also covers `*_final.zkey, *_vkey.json` globally. | **Optional:** add a one-line `build/README.md` pointing at `NOTICE` / `supply-chain/TRUSTED-SETUP.md` to close it explicitly. Not blocking. |

---

## Task 2 — Secret & PII scan

**Scope:** working tree (tracked + untracked, `node_modules` excluded) **and** all 15 commits of history.

### Clean — no hits

| check | result |
|---|---|
| `.env` / `*.pem` / `*.key` / `id_rsa*` / `*.p12` / `credentials*` files | **none** anywhere |
| Private keys (`-----BEGIN … PRIVATE KEY-----`) | **none** |
| GitHub personal-access / OAuth token formats | **none** in tree or history. (The cached git push credential lives in the OS credential store — **not** in the repo, and was not used for anything.) |
| AWS keys (`AKIA…`), Slack tokens (`xox…`), OpenAI keys (`sk-…`) | **none** |
| `password =` / `secret =` / `api_key =` literals | **none** |
| Phone serial (the device serial flagged in the earlier sweep) | **0 occurrences** anywhere (tree + history). Earlier sweep's redaction held. |
| Windows username / home-directory path | **0 occurrences** in tracked or untracked files. |
| Temp-directory session path (the earlier sweep's leak, an AppData session-UUID path) | **0 occurrences.** Fixed in a prior round; not reintroduced. |
| Public IPv4 addresses | **none** (only `127.0.0.1` / private ranges in integration test config) |
| Real names in code/comments/commit metadata | Author name "Rehan Malik" appears **intentionally** in `NOTICE`, `AUTHORS`, `CITATION.cff`, `LICENSE`-adjacent docs, and the paper byline. No *other* personal names. Commit author identity: `rehanmalik2008 <rehanmalik2008@users.noreply.github.com>` (GitHub no-reply address — no real email exposed). |
| `docs/research-history/pricing-personhood.md`, `closing-the-broker.md` | business content: **only the redacted placeholders** in `closing-the-broker.md`; no revenue/valuation/GTM survives (see R2, R3). |

### Hits — local filesystem paths (all low-severity; no PII/credentials)

All of the form `<repo>\…` or `<repo>/…`. Reveals: drive letter, the working-directory name and the internal repo dir name. **No username, no credential, no PII.**

| # | file:line | content | status |
|---|---|---|---|
| 1 | `docs/self-audit/compositional_verify.txt:18-19` | `wrote <repo>\docs\self-audit\compositional_verify.{md,json}` | NEW / pending |
| 2 | `docs/self-audit/ff_smt_prln_freed_concrete.txt:9` | `driver::filename = <repo>/build/ff-smt/prln_freed_concrete.out1.smt2` | NEW / pending |
| 3 | `docs/self-audit/mutation_results.json:35` | `"picusTail": "<repo>/.mut/M2/build/wedge_mem_w8_d9_split.sym does not exist …"` | NEW / pending |
| 4 | `docs/self-audit/taint_iszero.txt:59-60` | `wrote <repo>\docs\self-audit\taint_iszero.{md,json}` | NEW / pending |
| 5 | `docs/self-audit/two_witness_deployed.txt:3-5` | `r1cs / sym / input   <repo>\build\…` | NEW / pending |
| 6 | `docs/self-audit/two_witness_multipoint.txt:3-4,94` | `r1cs / points / wrote   <repo>\…` | NEW / pending |
| 7 | `paper/build_anon.mjs:5,21` | `const dir = '<repo>/paper'` ; `const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'` | NEW / pending — **part of R1, recommend EXCLUDE anyway** |
| — | `docs/SELF-AUDIT.md:121,157` | `<repo>` (×2) | MOD — **but identical text is ALREADY PUBLIC** in the pushed `SELF-AUDIT.md` and `docs/self-audit/circomspect_full_run.txt` |

### Hits — informational (not secrets)

| file:line | content | assessment |
|---|---|---|
| `supply-chain/SBOM.json` — the `serialNumber` field (already tracked/public) | a `urn:uuid:` value | **Not a leak.** This is the CycloneDX SBOM *document identifier* — a required, randomly-generated field that names the SBOM document itself. Benign; leave it. |
| `results/*.json` filenames | device model `SM-A125F`, ISO timestamps | The paper already discloses the device ("Samsung Galaxy A12"). `SM-A125F` is a marketing model number, not a serial. No new information. PUBLISH. |
| `results/sample-desktop-i7-9850H.json` | CPU model in filename | Already in the paper. Fine. |

### Git history

15 commits, scanned blob-by-blob for the patterns above. **Only hit: the SBOM `serialNumber` UUID (benign, see above).** No deleted-then-hidden files except `proof-of-personhood-without-a-registry.pdf` at root (moved to `paper/`, benign). No business note has ever been committed to any ref.

---

## Task 3 — Licensing artifacts

| requirement | status |
|---|---|
| `LICENSE` (Apache-2.0) present at root | **yes** — `Apache License, Version 2.0, January 2004`, full text |
| `NOTICE` present at root | **yes** (modified: adds copyright line + AUTHORSHIP/CITATION + PRIOR ART/DEFENSIVE PUBLICATION sections) |
| NOTICE states the §3 patent grant as the irrevocable commitment | **yes** — `PATENT GRANT` section: *"Section 3 of the Apache License, Version 2.0 grants a perpetual, worldwide, non-exclusive, no-charge, royalty-free, **irrevocable** patent license… That grant is the patent commitment referred to in MASTER-SPECIFICATION.md §7. It is not conditional on any future licensing decision."* Plus a `RELICENSING` clause (no BSL/SSPL/relicense) and a `PRIOR ART / DEFENSIVE PUBLICATION` clause. |
| Evaluation-only-keys disclosure next to the proving keys in `web/` | **yes** — `web/README.md` line 3: `## ⚠ The proving keys in this directory are EVALUATION ONLY`, "throwaway single-contribution Groth16" |
| … in `build/` | **N/A / partial** — tracked `build/` ships only `*_vkey.json` (verification keys, no toxic-waste risk), no `_final.zkey`. `NOTICE` "TRUSTED SETUP" section covers `*_final.zkey, *_vkey.json` globally. No dedicated `build/README.md`. See **R5** — optional one-liner. |
| `CITATION.cff` | present (modified this session; valid CFF 1.2.0 per prior round) |
| `AUTHORS` | present (NEW) — sole author, points to LICENSE/NOTICE/CITATION.cff |

**Licensing verdict: compliant.** Apache-2.0 + NOTICE + explicit irrevocable §3 patent grant + prior-art statement + eval-only-key disclosure in `web/`. Only optional gap is an explicit `build/` disclosure (R5).

---

## Files that WOULD be pushed (after commit)

**94 PUBLISH + `7ce7fa7` (already-committed CITATION.cff).** In full:

```
MOD  .gitignore
MOD  CITATION.cff
MOD  MASTER-SPECIFICATION.md
MOD  NOTICE
MOD  README.md
MOD  THREAT-MODEL.md
MOD  docs/EVALUATION.md
MOD  docs/SELF-AUDIT.md            (contains 2 pre-existing /mnt/d/ path lines — already public)
MOD  package.json
MOD  paper/paper.html
MOD  paper/proof-of-personhood-without-a-registry.pdf
MOD  scripts/build.mjs
MOD  scripts/test_soundness_adversarial.mjs
NEW  AUTHORS
NEW  CIRCUIT-FREEZE.md
NEW  circuits/abstract/poseidon.circom
NEW  circuits/main_abstract_split.circom
NEW  circuits/poseidon_only_k3.circom
NEW  circuits/poseidon_only_k8.circom
NEW  circuits/poseidon_rln.circom
NEW  circuits/poseidon_rln_freed.circom
NEW  circuits/residual_abstract.circom
NEW  circuits/residual_abstract_freed.circom
NEW  docs/CEREMONY.md
NEW  docs/CEREMONY-RUNBOOK.md
NEW  docs/DISCOVERY-redundancy-heuristic.md
NEW  docs/self-audit/compositional_verify.{md,json,txt}      (txt has 1 path leak — hit #1)
NEW  docs/self-audit/ff_smt.md
NEW  docs/self-audit/ff_smt_layerB_c0{0..5}.{json,txt}
NEW  docs/self-audit/ff_smt_layerB_symbolic.{json,txt}
NEW  docs/self-audit/ff_smt_poseidon{3,8}_symbolic.{json,txt}
NEW  docs/self-audit/ff_smt_prln_concrete.{json,txt}
NEW  docs/self-audit/ff_smt_prln_freed_concrete.{json,txt}   (txt has 1 path leak — hit #2)
NEW  docs/self-audit/ff_smt_residual_abstract{,_freed}.{json,txt}
NEW  docs/self-audit/forward_determination.{md,json}
NEW  docs/self-audit/gate3_android_emulator.md
NEW  docs/self-audit/mem_ceiling_results.txt
NEW  docs/self-audit/mutation_results.json                    (1 path leak — hit #3)
NEW  docs/self-audit/mutation_table.md
NEW  docs/self-audit/nullspace_harness_m1a_regression.txt
NEW  docs/self-audit/picus-upstream-issue.md
NEW  docs/self-audit/picus-upstream-report.md
NEW  docs/self-audit/taint_iszero.{md,json,txt}               (txt has path leaks — hit #4)
NEW  docs/self-audit/two_witness_deployed.txt                 (path leaks — hit #5)
NEW  docs/self-audit/two_witness_multipoint.{md,json,txt}     (txt has path leaks — hit #6)
NEW  docs/self-audit/two_witness_results.md
NEW  scripts/build_selfaudit_circuits.mjs
NEW  scripts/ceremony/coordinator.mjs
NEW  scripts/ceremony/test_ceremony.mjs
NEW  scripts/circuit_freeze.mjs
NEW  scripts/compositional_verify.mjs
NEW  scripts/ff_smt_two_witness.mjs
NEW  scripts/forward_determination.mjs
NEW  scripts/gen_input_abstract.mjs
NEW  scripts/gen_input_multipoint.mjs
NEW  scripts/mem_ceiling_probe.mjs
NEW  scripts/mem_ceiling_test.sh
NEW  scripts/mutation_test.mjs
NEW  scripts/nullspace_harness.mjs
NEW  scripts/nullspace_harness_regression.mjs
NEW  scripts/taint_iszero.mjs
NEW  scripts/two_witness_multipoint.mjs
NEW  scripts/two_witness_search.mjs
NEW  scripts/wsl_setup_avd.sh
NEW  scripts/wsl_setup_cvc5.sh
NEW  scripts/wsl_setup_node.sh
```

## Files correctly EXCLUDED (stay out of the repo)

| file / dir | mechanism | verified |
|---|---|---|
| `PARTNER-BRIEF.md` | `.gitignore` exact match | on disk, 0 commits, never tracked |
| `../private-business-notes/` (`the-open-source-moat.md`, `playing-against-giants.md`, `surviving-due-diligence.md`) | **outside the repo tree** + `.gitignore` `**/` patterns | 0 commits |
| `<parent>/*.md` round-notes (`closing-what-code-can-close.md`, `the-structural-argument.md`, `after-the-oracle.md`, `what-was-actually-discovered.md`, …) | **outside the repo tree** | 0 commits |
| `.mut/`, `build-repro/`, `build/multipoint/`, `scratch_mem/`, `node_modules/` | `.gitignore` | scratch / regenerable |
| `build/*` except `*_vkey.json` | `.gitignore` `build/*` + `!build/*_vkey.json` | derived; hashes pinned in `artifacts.lock.json` |
| `circuits/*.r1cs`, `circuits/*.sym`, `circuits/*_js/`, `circuits/prln_in.json` | `.gitignore` | build outputs / test fixture |
| `paper/_built.html`, `paper/_chart*.svg`, `paper/_proof.json` | `.gitignore` | paper build intermediates |

## Decisions — status

1. **R1** — Exclude the anonymised-paper trio. **DONE** — added to `.gitignore`, confirmed 0 commits, will not be pushed.
2. **R4** — Sanitise local absolute-path prefixes to `<repo>` across the self-audit logs (new *and* already-public). **DONE** — path strings only; no hash/count/timing/result changed.
3. **R2 / R3** — `docs/research-history/closing-the-broker.md` (redaction confirmed intact) and `pricing-personhood.md` (research; the words "go-to-market" and "moat" appear in domain-analysis context, no revenue/valuation/GTM). **No action** — already public, no business content survives.
4. **R5** — `build/README.md` pointing at the eval-only-keys disclosure. **DONE.**
5. Everything else: **PUBLISH** — staged, awaiting your approval to push.
