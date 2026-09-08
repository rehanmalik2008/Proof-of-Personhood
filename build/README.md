# `build/` — what is and is not committed here

Almost everything in this directory is a **derived build artifact** and is
git-ignored. Regenerate it with `node scripts/build.mjs` (or verify a rebuild
against `supply-chain/artifacts.lock.json` with `node scripts/repro_build.mjs
--verify`). The reproducible parts are pinned by SHA-256 in that lock file and in
`CIRCUIT-FREEZE.md`.

**The only files committed from `build/` are the verification keys**
(`*_vkey.json`) — kept because a verifier needs them and they are small. They are
**not** proving keys and carry no trusted-setup risk.

**No production proving keys exist in this repository.** Any `*_final.zkey` you
build here (or find in `web/`) comes from a **throwaway single-contribution**
Groth16 setup and is **for evaluation only** — not suitable for production. The
multi-party ceremony that would replace them has not been run; the circuit set is
frozen for it (`CIRCUIT-FREEZE.md`) and the procedure is written up in
`docs/CEREMONY-RUNBOOK.md`. See the `TRUSTED SETUP` section of the root `NOTICE`
and `supply-chain/TRUSTED-SETUP.md`.
