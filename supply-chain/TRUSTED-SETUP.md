# The Groth16 trusted setup as a supply-chain artifact

**Gate:** the security-review track of the enterprise-review gates — "Trusted setup — who ran it,
can it be subverted?" Answer, honestly: **Groth16 needs a per-circuit trusted
setup; a subverted setup lets an attacker forge proofs (breaks soundness). It does
NOT break privacy — `C`, `s`, and the witness stay hidden regardless.** This file
states exactly what the setup is, what the spike used, and what a production
deployment must do instead.

---

## What the setup consists of, per circuit

```
powers of tau (universal, circuit-independent)          pot15_final.ptau
        │  snarkjs groth16 setup(r1cs, ptau)   [deterministic]
        ▼
    _0.zkey  (initial proving key, before any contribution)
        │  snarkjs zkey contribute × N        [each adds secret entropy]
        ▼
  _final.zkey  (the proving key the prover uses)
        │  snarkjs zkey export verificationkey  [deterministic]
        ▼
   vkey.json  (the verification key every relying party pins)
```

The **toxic waste** is the secret entropy in the `contribute` steps. If *every*
contributor colludes (or there is only one and it is dishonest), they can produce
proofs for false statements. If *at least one* contributor is honest and discarded
their entropy, the setup is sound. This is the standard 1-of-N assumption.

## What the spike used (disclose, do not hide)

- **`pot15_final.ptau`** — powers of tau for `2^15` constraints, **generated
  locally** by `scripts/build.mjs` with a single `snarkjs powersoftau contribute`
  using `crypto.randomBytes` entropy. **This is a spike artifact. It is NOT
  suitable for production** — one machine, one contribution, entropy not
  ceremonially destroyed.
  - sha256: `cfff419aa176b97cea40d29bc58baaa3c6c998586e764511ae93efa70d860725`
- **`*_final.zkey`** — one `zkey contribute` (name `spike`, `crypto.randomBytes`
  entropy). `snarkjs zkey verify build/wedge_mem_w8_d9.r1cs
  build/pot15_final.ptau build/wedge_mem_w8_d9_final.zkey` →

  ```
  [INFO]  snarkJS: Circuit Hash: 5db39497 775c770a e0cc0a30 ea061314 …
  [INFO]  snarkJS: contribution #1 spike:
  [INFO]  snarkJS: ZKey Ok!
  ```

  `ZKey Ok!` means: this `_final.zkey` is a structurally valid Groth16 proving key
  **for exactly this r1cs and this ptau**. The contributions cannot change *which
  circuit* it proves — only whether the setup is sound.
- **`*_vkey.json`** — `zkey export verificationkey` of the above. Deterministic
  given the `_final.zkey`; sha256 in `supply-chain/artifacts.lock.json`
  (`deployed_vkeys`).

## What production must do instead

Pick one, and publish which:

1. **Reuse a public perpetual-powers-of-tau ceremony** for the universal phase.
   e.g. the Hermez / "perpetual powers of tau" transcript (hundreds of
   contributors, public transcript, 1-of-N honest). Substitute its `.ptau`:
   `PTAU=/path/to/ppot_final.ptau node scripts/repro_build.mjs --update` — the lock
   records the new ptau hash and its provenance line.
2. **Run a public multi-party Phase-2 ceremony** for each circuit's `zkey`
   (`snarkjs zkey contribute` from many independent participants + a public
   beacon), publish the full transcript and participant list. `zkey verify` then
   shows every contribution hash.
3. **Migrate off per-circuit setup entirely** — a universal/updatable setup
   (Halo2-KZG / PLONK) or a transparent one (a FRI-based system, no setup). This
   is the `proof-system-escape` Lever J path; it removes this gate rather than
   satisfying it.

Until one of those is done, the honest posture
is: **"we will run a ceremony / adopt a public one before production; here is the
spike setup and how to verify its structure in the meantime."** Not "trust us."

## Incident path (setup compromise found later)

- A compromised setup is detected by soundness failure or a whistle-blown
  contributor. Response: run a fresh ceremony, publish a new `_final.zkey` +
  `vkey.json`, and have relying parties **rotate the pinned vkey** (they accept a
  set of vetted vkeys and deprecate the bad one — no central operator needed).
  This is the same vkey-rotation mechanism used for a circuit bug fix.
- Privacy is unaffected by a setup compromise, so there is no retroactive
  disclosure of user data — only proofs produced under the bad key are suspect.
