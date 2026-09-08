# Circuit freeze — v1.2

**Status:** VALID.  Frozen 2026-09-08.

The deployed circuit set has been stable for four rounds of work (rounds
5&ndash;8 were analysis &mdash; two-witness search, multi-point probing, taint
proof, compositional and finite-field-SMT verification, and the structural
forward-determination proof &mdash; not circuit modification). A freeze is
therefore defensible now.

**These R1CS hashes are the trusted-setup ceremony's target.** Any post-freeze
change to a circuit &mdash; source, included template, or toolchain version
&mdash; changes its `r1cs` hash, **invalidates this freeze for that circuit,**
and requires a fresh ceremony for it (`docs/CEREMONY-RUNBOOK.md`). Ceremony
keys produced against a stale hash must not be used.

This freeze does **not** close any gate. Gate 5 stays Open until the ceremony
runs with genuinely independent contributors; the shipped keys remain
evaluation-only until then. Gate 1 stays Open until independent review.

## Toolchain (pinned)

```
node       24.14.0
circom2    0.2.23   (circom 2.x compiled to WASM)
circomlib  2.0.5
snarkjs    0.7.6
ptau       build/pot15_final.ptau  sha256 cfff419aa176b97cea40d29bc58baaa3c6c998586e764511ae93efa70d860725
```

A different toolchain version can produce a different R1CS from the same
source. The freeze is defined by the hashes below **and** this toolchain.

## Frozen circuits

`circom_src_tree` = SHA-256 of the entrypoint `.circom` plus every local
file it transitively `include`s (circomlib is pinned by the toolchain line,
not re-hashed). `r1cs` / `wasm` = SHA-256 of the compiled artifact in
`build/`. Counts are read from the `.r1cs` header.

### `wedge_mem_w8_d9_split` &mdash; Phase-2 login — headline (v1.1+), split epoch

| field | value |
|---|---|
| tier | production |
| entrypoint | `circuits/main_mem_w8_d9_split.circom` |
| constraints | **4,309** |
| wires | 4,378 |
| public signals | 7 (outputs 2, inputs 5) |
| private inputs | 82 |
| `circom` sha256 | `fec6aa717fa4a6c30adf7877c4f12941edea67af0422a1266a062c09eee61f3e` |
| `circom_src_tree` sha256 | `b40f234c1f69027af347b119a213997a4517bc4065132238a8871a6e8050fb7f` |
| `r1cs` sha256 (**ceremony target**) | `fbd04ecd35b39f62ffb3c0d3ad03389154264ef935f0657f71f46c2983eddc27` |
| `wasm` prover sha256 | `f016efcf0812d04062b8fe475f19946cfb05858023361a5beae74661b4def3a1` |
| vs `artifacts.lock.json[wedge_mem_w8_d9_split]` | r1cs &#x2713; match &nbsp; src_tree &#x2713; match &nbsp; wasm &#x2713; match |

### `wedge_mem_w8_d9_split_rev64` &mdash; Phase-2 login + individual revocation, R=64 (Gate 6)

| field | value |
|---|---|
| tier | production |
| entrypoint | `circuits/main_mem_w8_d9_split_rev64.circom` |
| constraints | **4,373** |
| wires | 4,506 |
| public signals | 71 (outputs 2, inputs 69) |
| private inputs | 82 |
| `circom` sha256 | `fb2b98fea4ca37973911009a7b0a54bd4795f26cfad1e4fc2709183d60f3c1c6` |
| `circom_src_tree` sha256 | `9726155ccd6695105dfd1ed7207b4f613de44421ab7c2db3039d7c02b7aa7739` |
| `r1cs` sha256 (**ceremony target**) | `9807021631647135b8c5561ea9626af7fb0d1130bcb68b98e09cefa67dc91365` |
| `wasm` prover sha256 | `a2decac131abbf5bb5afc307aff211121cc5c3f89f6c9e080cf202ea60a11e0f` |
| vs `artifacts.lock.json[wedge_mem_w8_d9_split_rev64]` | r1cs &#x2713; match &nbsp; src_tree &#x2713; match &nbsp; wasm &#x2713; match |

### `wedge_mem_w8_d9_split_rev256` &mdash; Phase-2 login + individual revocation, R=256

| field | value |
|---|---|
| tier | production |
| entrypoint | `circuits/main_mem_w8_d9_split_rev256.circom` |
| constraints | **4,565** |
| wires | 4,890 |
| public signals | 263 (outputs 2, inputs 261) |
| private inputs | 82 |
| `circom` sha256 | `0d3620563cc39240ce52db7743ec5241d34a6e47d3978e53e6876479ab5ac180` |
| `circom_src_tree` sha256 | `01afaa74e28b443e891bebe26c2fec8741c184d07262e2f2c292c22deca31892` |
| `r1cs` sha256 (**ceremony target**) | `06597d22aa37a8e636c0340ca74501e3540ea20ab212ec8f636a34bf37f88bca` |
| `wasm` prover sha256 | `f1612dc1bb72d2f46f30a091dd3fc34c65dd8dcf7b50f1788ddde1805f98b113` |
| `artifacts.lock.json` | not present &mdash; see note |

### `wedge_mem_w8_d9_split_rev1024` &mdash; Phase-2 login + individual revocation, R=1024

| field | value |
|---|---|
| tier | production |
| entrypoint | `circuits/main_mem_w8_d9_split_rev1024.circom` |
| constraints | **5,333** |
| wires | 6,426 |
| public signals | 1031 (outputs 2, inputs 1029) |
| private inputs | 82 |
| `circom` sha256 | `f71f7fbb89b70b55b0822192431d0c51b54495d7019739bf6128a0d9d787aa56` |
| `circom_src_tree` sha256 | `80a4e6d441fcce1e911b2441724a2246c32fbb633bd7315e092f5b4ebb40d027` |
| `r1cs` sha256 (**ceremony target**) | `d8185b88984bbf6dd3fc77c9b5c9d6108517d985727ef9ca490cf6f3c51905c3` |
| `wasm` prover sha256 | `0072c0bac420906c63b332aea07abc9d41b7b6b49eae8e3811a8fd8433579f77` |
| `artifacts.lock.json` | not present &mdash; see note |

### `wedge_direct_k3` &mdash; Phase-1 enrolment, k=3 (one-time, off the hot path)

| field | value |
|---|---|
| tier | production |
| entrypoint | `circuits/main_wedge_direct_k3.circom` |
| constraints | **13,099** |
| wires | 13,110 |
| public signals | 6 (outputs 3, inputs 3) |
| private inputs | 19 |
| `circom` sha256 | `c90a1e3881425aedac09b7657bba07ebda793f35936928484e8cf8661bb9560f` |
| `circom_src_tree` sha256 | `ecbec1ee6462830801eda6cabc62815e4f5751ff484776e8c21878ef96b5ac19` |
| `r1cs` sha256 (**ceremony target**) | `3ce7fa2f3a65faa27348e289b9da08069d27301ce21ed9bdb35fb886c5e0c245` |
| `wasm` prover sha256 | `6e3672e600fff1268c7e0a466c4bf10b119a591dbacc0ec4044457bc68c61b99` |
| `artifacts.lock.json` | not present &mdash; see note |

### `wedge_mem_w8_d9` &mdash; Phase-2 login, pre-split (v1.0) — benchmarked, legacy

| field | value |
|---|---|
| tier | legacy |
| entrypoint | `circuits/main_mem_w8_d9.circom` |
| constraints | **4,309** |
| wires | 4,377 |
| public signals | 6 (outputs 2, inputs 4) |
| private inputs | 82 |
| `circom` sha256 | `e30a51103624d9163d1d2399448bb68bf5afa875bbcdcfbbbc89c7dc1b19b205` |
| `circom_src_tree` sha256 | `ee7d393515c8c7410574b5da01a44c1606e6fced4a579feef17d83f5bc079c68` |
| `r1cs` sha256 (**ceremony target**) | `b6f46f8fe2e5524ec266b9220aaaa7629ad22664268ed8343f127662a34ff65a` |
| `wasm` prover sha256 | `d5b327cc8401df5e9c77305172f729f90207683d1fc3b26a5cf81f11fa061b51` |
| vs `artifacts.lock.json[wedge_mem_w8_d9]` | r1cs &#x2713; match &nbsp; src_tree &#x2713; match &nbsp; wasm &#x2713; match |

### `wedge_mem_w4_d8` &mdash; arity-4 depth-8 variant (65,536 users)

| field | value |
|---|---|
| tier | variant |
| entrypoint | `circuits/main_mem_w4_d8.circom` |
| constraints | **2,947** |
| wires | 2,976 |
| public signals | 6 (outputs 2, inputs 4) |
| private inputs | 41 |
| `circom` sha256 | `4d54be759fe5654f00a34bff8b094b84c1d964b195b4e0f21473a8b759207e6a` |
| `circom_src_tree` sha256 | `dff5ed09517d3d095f76d609ebebe11489a5bd872d7892ec22da171664dd1831` |
| `r1cs` sha256 (**ceremony target**) | `105f0b43beb22e3a0747663353152922eb8786fb6f294004294c756da97f4aaa` |
| `wasm` prover sha256 | `76f97783ba2fd000dba6e8507cdd36e9fc011c55317723a5e38162ad169f248b` |
| vs `artifacts.lock.json[wedge_mem_w4_d8]` | r1cs &#x2713; match &nbsp; src_tree &#x2713; match &nbsp; wasm &#x2713; match |

### `wedge_mem_bin_d16` &mdash; binary depth-16 — guaranteed-sound backstop

| field | value |
|---|---|
| tier | backstop |
| entrypoint | `circuits/main_mem_bin_d16.circom` |
| constraints | **4,363** |
| wires | 4,384 |
| public signals | 6 (outputs 2, inputs 4) |
| private inputs | 33 |
| `circom` sha256 | `2c320e855c17bf02dff4c27af04f6701bc6c2546b2f5aacd0de4ff9d227a5fa3` |
| `circom_src_tree` sha256 | `856c40e884f6b190dc77cfd2acbb480c5fddec2c284fa3fed93fee2ca231479b` |
| `r1cs` sha256 (**ceremony target**) | `8a50f840177628f68793f077ad3f32298ad3c00bd2ce335104a25da50e57a60d` |
| `wasm` prover sha256 | `3c047e16ead0970aa5ed585521fab32c049b36f19053909193bc35892fe360be` |
| vs `artifacts.lock.json[wedge_mem_bin_d16]` | r1cs &#x2713; match &nbsp; src_tree &#x2713; match &nbsp; wasm &#x2713; match |

## Cross-check with `supply-chain/artifacts.lock.json`

5 / 5 circuits present in the reproducible-build lock
match it **exactly** (r1cs, source tree, and prover wasm).

Not in the lock: `wedge_mem_w8_d9_split_rev256`, `wedge_mem_w8_d9_split_rev1024`,
`wedge_direct_k3`. These are deployed-scope per `docs/SELF-AUDIT.md` &sect;1 but
were outside the original reproducible-build manifest. Their hashes are recorded
above from the current `build/` artifacts; **before any of them is used in
production, add it to `artifacts.lock.json` (via `scripts/repro_build.mjs
--update`), re-verify a clean double build, and reissue this freeze.**

## Applying the tag

The freeze is the set of hashes above. To mark it in git, tag the commit
that contains this file and the `circuits/` sources it hashes:

```bash
git tag -a v1.2-frozen -m "Circuit freeze v1.2 - ceremony target (CIRCUIT-FREEZE.md)"
```

The ceremony (`docs/CEREMONY-RUNBOOK.md`) is run against the artifacts at
this tag. If `git describe` at ceremony time does not resolve to
`v1.2-frozen` (clean, no local changes to `circuits/`), stop.

## Regenerating / verifying this file

```bash
node scripts/repro_build.mjs --double     # two clean builds are byte-identical
node scripts/circuit_freeze.mjs           # prints the table + lock cross-check
node scripts/circuit_freeze.mjs --write   # regenerates this file
```

A verifier re-runs the double build, then confirms every `r1cs` sha256 here
matches `build/<name>.r1cs`, and that the `circom_src_tree` hashes match the
`circuits/` sources at the tagged commit.

