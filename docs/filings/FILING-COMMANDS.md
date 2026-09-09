# Filing commands — run these yourself

Four items, three destinations. The bodies are finished markdown files in this
directory / `docs/self-audit/`. Nothing here has been filed; no credentials have
been used against a third-party tracker.

Run from the repo root. Each `gh issue create` opens an editor-less issue from
the given body file; add `--web` to review in the browser first.

---

## 1. circomlib — `LessThan` on hash outputs

```bash
gh issue create --repo iden3/circomlib \
  --title "LessThan(n) silently accepts false comparisons when an input is >= 2^n (e.g. Poseidon outputs)" \
  --body-file docs/filings/circomlib-lessthan-issue.md
```

If issues are disabled or unresponsive, the fallback is a PR adding the
doc-comment warning + a `LessThanFull` variant to `circuits/comparators.circom`;
say so and I'll prepare the patch.

## 2. 0xPARC/zk-bug-tracker — bug class entry

```bash
gh issue create --repo 0xPARC/zk-bug-tracker \
  --title "Bug class: magnitude comparison on an un-range-checked wide value (circomlib LessThan on hash outputs)" \
  --body-file docs/filings/zk-bug-tracker-lessthan.md
```

That repo takes catalogue additions as PRs too; the issue is the proposal, a PR
adding the entry to the Circom vulnerabilities section is the follow-up.

## 3. Standalone public writeup

`docs/filings/lessthan-hash-writeup.md` is self-contained (no repo-internal
references assumed). Post as-is to a personal blog, HackMD, or
`ethresear.ch` / `zkresear.ch`. No command — it is a paste.

Optionally also open it as a discussion on the project repo:

```bash
gh issue create --repo rehanmalik2008/Proof-of-Personhood \
  --title "Writeup: circomlib LessThan silently accepts p-1 < 1 on hash outputs" \
  --body-file docs/filings/lessthan-hash-writeup.md
```

## 4. Picus non-termination — chyanju/picus

Verified current: `circuits/poseidon_rln_freed.r1cs` and `poseidon_rln.r1cs` are
both 262 constraints, matching the issue body; environment lines (Picus
`138b151`, cvc5 1.3.4, circomlib 2.0.5) unchanged.

```bash
gh issue create --repo chyanju/picus \
  --title "cvc5 FF + Picus both stall on Poseidon-output-feeds-arithmetic (minimal 262-constraint repro)" \
  --body-file docs/self-audit/picus-upstream-issue.md
```

---

### One-liners (no line continuations)

```
gh issue create --repo iden3/circomlib --title "LessThan(n) silently accepts false comparisons when an input is >= 2^n (e.g. Poseidon outputs)" --body-file docs/filings/circomlib-lessthan-issue.md
gh issue create --repo 0xPARC/zk-bug-tracker --title "Bug class: magnitude comparison on an un-range-checked wide value (circomlib LessThan on hash outputs)" --body-file docs/filings/zk-bug-tracker-lessthan.md
gh issue create --repo chyanju/picus --title "cvc5 FF + Picus both stall on Poseidon-output-feeds-arithmetic (minimal 262-constraint repro)" --body-file docs/self-audit/picus-upstream-issue.md
```
