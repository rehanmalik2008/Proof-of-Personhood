# Reproducible builds & supply-chain integrity

> **Authoritative document:** [`MASTER-SPECIFICATION.md`](MASTER-SPECIFICATION.md)
> (§6 "Verified and closed" — reproducible builds; §6 gate #5 — the trusted-setup
> ceremony is still `Open`). Reviewer walkthrough: [`docs/EVALUATION.md`](docs/EVALUATION.md) Track A.

**Gate this closes:** the supply-chain track of the enterprise-review gates
— "what's your supply-chain integrity story?" A ZK circuit's trust collapses if the deployed
binary ≠ the audited circuit. This document + `scripts/repro_build.mjs` let an
auditor or a big-tech supply-chain team confirm, byte-for-byte, that the WASM
prover and the constraint system in `web/` and `build/` are exactly what compiles
from the source in `circuits/`.

**What this is not:** a trusted-setup ceremony. The spike's `_final.zkey` files
come from a throwaway single-contribution setup. `supply-chain/TRUSTED-SETUP.md`
covers that artifact and how a production deployment replaces it.

---

## TL;DR for a reviewer

```bash
npm ci                                 # exact deps from package-lock.json
node scripts/repro_build.mjs --double  # compile twice, assert byte-identical
node scripts/repro_build.mjs --verify  # compile once, check against supply-chain/artifacts.lock.json
node scripts/gen_sbom.mjs              # regenerate supply-chain/SBOM.json (deterministic)
```

Then confirm the **deployed** artifacts match the reproduction:

```bash
# every hash in this file must match build-repro/ and web/ and build/
sha256sum -c supply-chain/ARTIFACTS.sha256
```

`--double` on this machine prints **`REPRODUCIBLE: both builds byte-identical`**
for all 3 deployed circuits (r1cs, wasm prover, pre-ceremony zkey, and the circom
source include-tree hash).

---

## What is reproducible, and what is verified instead

| artifact | how produced | reproducible? | how a reviewer checks it |
|---|---|---|---|
| `circuits/*.circom` (+ `circomlib` includes) | the source | it **is** the input | `circom_src_tree` sha256 in the lock; `circomlib` version pinned in the SBOM |
| `*.r1cs` (constraint system) | `circom2` compile | **yes — byte-identical** | `sha256sum -c supply-chain/ARTIFACTS.sha256` |
| `*.wasm` (the prover binary that ships to the device) | `circom2` compile | **yes — byte-identical** | same; this is the "binary == audited circuit" line |
| `*_0.zkey` (Groth16 setup, pre-contribution) | `snarkjs groth16 setup(r1cs, ptau)` | **yes — byte-identical** | same; proves the setup step used exactly this r1cs + ptau |
| `pot15_final.ptau` (powers of tau) | a ceremony (here: local, spike-only) | **no** (ceremony) | pinned by sha256 as an *input*; provenance in `TRUSTED-SETUP.md` |
| `*_final.zkey` (after contributions) | `snarkjs zkey contribute` × N (secret entropy) | **no** (by design) | `snarkjs zkey verify <r1cs> <ptau> <final.zkey>` → **`ZKey Ok!`** + the contribution transcript |
| `*_vkey.json` (verification key the RP pins) | `snarkjs zkey export verificationkey(final.zkey)` | **yes — given a fixed `_final.zkey`** | re-run the export, `sha256` must match `deployed_vkeys` in the lock |

The chain an auditor walks:

1. `circom2` on the audited `.circom` → **byte-identical** `.r1cs` + `.wasm`
   (`--double` proves determinism; `--verify` proves the committed artifacts match).
2. `groth16 setup(r1cs, ptau)` → **byte-identical** `_0.zkey`
   (proves the ceremony started from exactly this circuit + this ptau).
3. `zkey verify(r1cs, ptau, _final.zkey)` → `ZKey Ok!`
   (proves the shipped `_final.zkey` is a valid setup for exactly this r1cs — the
   contributions can't change *which circuit* it's for).
4. `zkey export verificationkey(_final.zkey)` → **byte-identical** `vkey.json`
   (proves the RP's pinned vkey is the one derived from that `_final.zkey`).

Nothing in that chain requires trusting the person who ran step 2/3 — a bad
ceremony breaks *soundness* (see `TRUSTED-SETUP.md`), not the identity of the
circuit being proven.

---

## Determinism: what makes the compile byte-identical

- **Pinned toolchain.** `package.json` pins exact versions; `repro_build.mjs`
  asserts them and aborts on drift:
  `node 24.14.0`, `circom2 0.2.23`, `circomlib 2.0.5`, `snarkjs 0.7.6`.
  Reproducibility is only claimed for this set.
- **`circom2`** (circom 2.2.3 compiled to WASM) emits no timestamps, no build
  paths, no RNG into `.r1cs`/`.wasm`. Verified: two clean compiles → identical
  sha256 (`--double`).
- **`snarkjs groth16 setup`** is deterministic given `(r1cs, ptau)` — the only
  randomness in a Groth16 setup is in `zkey contribute`, which is a *separate*
  step. Verified: two runs → identical `_0.zkey` sha256.
- **The ptau is a pinned input**, not regenerated (powers-of-tau is itself a
  ceremony). `PTAU=/path/to/other.ptau node scripts/repro_build.mjs` swaps it;
  the lock records which one was used.

## Pinned dependencies & SBOM

- `package.json` — exact versions (no `^`/`~`). `engines.node` pins the runtime.
- `package-lock.json` (lockfileVersion 3) — the authoritative tree; `npm ci`
  installs exactly it. Its sha256 is recorded in the SBOM metadata.
- `supply-chain/SBOM.json` — CycloneDX 1.5, one component per locked package
  (129), each with its exact version, npm registry URL, and the **SHA-512
  integrity** hash npm recorded at install. Regenerate with
  `node scripts/gen_sbom.mjs`; output is deterministic (serial number derived
  from the lockfile hash, timestamp from `SOURCE_DATE_EPOCH` or epoch 0).

## Files

```
scripts/repro_build.mjs         --double | --verify | --update
scripts/gen_sbom.mjs            -> supply-chain/SBOM.json
supply-chain/artifacts.lock.json  full manifest: toolchain, ptau, per-circuit sha256, deployed vkey/zkey hashes
supply-chain/ARTIFACTS.sha256     sha256sum -c compatible, the reproducible subset
supply-chain/SBOM.json            CycloneDX 1.5 dependency SBOM
supply-chain/TRUSTED-SETUP.md     the Groth16 ceremony as a supply-chain artifact
build-repro/                      output of a clean reproduction (git-ignored)
```

## Deployed-artifact hashes (this checkout)

From `supply-chain/artifacts.lock.json` — the headline circuit:

| artifact | sha256 |
|---|---|
| `wedge_mem_w8_d9.circom` source tree | `2c39eecacee9babe9fdac623217ac29b2b0b065e80941dd50117674976ad09ae` |
| `wedge_mem_w8_d9.r1cs` | `b6f46f8fe2e5524ec266b9220aaaa7629ad22664268ed8343f127662a34ff65a` |
| `wedge_mem_w8_d9.wasm` (prover) | `d5b327cc8401df5e9c77305172f729f90207683d1fc3b26a5cf81f11fa061b51` |
| `wedge_mem_w8_d9_0.zkey` (pre-ceremony) | `658fb873451584c246ed30a7324ac8944475d018b825a6868ebe6a0cbbdd5e33` |
| `wedge_mem_w8_d9_vkey.json` (deployed, ceremony-derived) | `5f165cf086a4904d3381d18976ec756f3e42f07fe20b38519595f3b06584da94` |
| `pot15_final.ptau` (spike input) | `cfff419aa176b97cea40d29bc58baaa3c6c998586e764511ae93efa70d860725` |

Confirmed this checkout: `build-repro/wedge_mem_w8_d9.wasm` ==
`build/wedge_mem_w8_d9.wasm` == `web/wedge_mem_w8_d9.wasm` (identical sha256).
The other two deployed circuits (`wedge_mem_w4_d8`, `wedge_mem_bin_d16`) are in
the lock file and verify the same way.
