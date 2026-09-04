# Contributing

The most valuable contribution to this project is **an attack, a measurement, or
a retraction.** Code is welcome too, but the scarce thing here is evidence.

## The evidence standard

This is a research repository whose credibility rests entirely on the numbers
being real and the gaps being stated. Two rules govern every change:

1. **Every number traces to a measurement in this repository.** If it is
   extrapolated, it is labelled `projected` in the same sentence. If it is
   derived, it says so. `paper/qc.mjs` enforces part of this and must pass.
2. **No disclosure gets softened.** Do not remove a caveat, narrow a limitation,
   or upgrade a `projected` figure to a measured one without the capture to back
   it. If a new measurement contradicts an old estimate, **the measurement wins**
   and the old claim is annotated as superseded, not silently deleted.

Retractions are first-class. [`docs/research-history/`](docs/research-history/)
exists precisely to keep the wrong turns visible, including the ones that
invalidated earlier results. Adding to that record is a contribution.

## Before you open a PR

```bash
npm install
node scripts/build.mjs                 # first time only, ~18 min
npm test                               # must be green: 6 suites, 72 assertions
node scripts/repro_build.mjs --verify  # artefacts must still match the lock file
```

If you touched `paper/paper.html`:

```bash
cd paper && node build.mjs && node qc.mjs   # qc must report 0 failures, 0 warnings
```

If you touched a circuit, you must also re-run the soundness surface:

```bash
node scripts/test_soundness_adversarial.mjs   # 24 adversarial witnesses, all rejected
bash scripts/wsl_install_analyzers.sh         # Linux/WSL: circomspect + Picus
bash scripts/run_circomspect_warn.sh          # expect (no warnings/errors) on every main_*
bash scripts/run_picus.sh                     # expect "properly constrained" for each circuit
```

and update [`docs/SELF-AUDIT.md`](docs/SELF-AUDIT.md) with the new output. **A
circuit change with an unchanged self-audit will not be merged.**

## Changing a circuit

Circuit changes are the highest-risk changes in the repository, because an
under-constrained signal is invisible to honest-path testing. Requirements:

- Re-measure the constraint count and state the delta against the current
  baseline (4,309 for the split login circuit). Do not estimate it.
- Add an adversarial case to `scripts/test_soundness_adversarial.mjs` for any new
  property the change is supposed to enforce. A test that only exercises the
  honest prover does not count as coverage.
- Re-run `scripts/repro_build.mjs --update` and commit the new
  `supply-chain/artifacts.lock.json`, explaining in the PR why the hashes moved.
- Say plainly in the PR whether the change alters the public signal set, the
  nullifier derivation, or any privacy property. Those three need an explicit
  argument, not just green tests.

## Style

- No new dependencies without a reason stated in the PR. The toolchain is pinned
  (`package.json` `engines`, and the `toolchain` block in the lock file) because
  reproducibility is a claim this project makes.
- Comments explain *why*, not *what*. The circuits are the exception: constraint
  intent is worth spelling out.
- Keep prose direct and quantitative. The paper has a forbidden-word list checked
  by `paper/qc.mjs`; the same register applies to the docs.

## Licensing of contributions

By contributing you agree your contribution is licensed under **Apache-2.0**,
including the §3 patent grant, consistent with [LICENSE](LICENSE) and
[NOTICE](NOTICE). That licence choice is committed irrevocably in
MASTER-SPECIFICATION §7 — there will be no relicense to BSL, SSPL, or anything
else.

## Reporting a vulnerability

Do not open a normal PR for a security finding. See [SECURITY.md](SECURITY.md).
