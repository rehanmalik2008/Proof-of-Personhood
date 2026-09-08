# Trusted-setup ceremony — coordinator, built and tested, not yet run

**Gate 5 status: `Open, disclosed`.** The proving keys shipped in this repository
still come from a throwaway single-contribution setup and are for evaluation
only. What changed is that the infrastructure to replace them now exists and has
been tested against deliberately invalid inputs. The ceremony itself has not
happened, and this document does not claim otherwise.

## Why it has not been run

Groth16 Phase-2 keys are bound to one exact circuit. The circuit changed twice in
recent work: the epoch split (`epoch` became `epoch_action` + `epoch_tree`), then
in-circuit revocation. Running a ceremony against a circuit that may still change
would ceremony-lock the wrong artefact and require doing the whole thing again.

**The trigger to run it is a declared circuit freeze for a named release**, not a
date. Until then the coordinator sits built and tested.

## What was built

`scripts/ceremony/coordinator.mjs` — a sequential contribution pipeline.

A Phase-2 ceremony is not a collection of contributions, it is an **ordered
chain**: contribution *i+1* transforms the state produced by contribution *i*.
The security property is *1-of-N honest* — the toxic waste is unrecoverable if
**any single** participant destroyed their entropy. That only holds if the chain
is genuinely sequential and every link is verified.

Per submission the coordinator checks four things, and refuses to advance the
head unless all four hold:

| # | check | what it stops |
|---|---|---|
| 1 | **structural** — parses as a zkey, section table intact | corrupt or non-zkey uploads |
| 2 | **chain** — `snarkjs zKey.verifyFromInit(init, ptau, submission)` | contributions with no valid proof of knowledge of the delta |
| 3 | **extends** — exactly one more contribution than the head, and the head's contribution records are a **byte-exact prefix** of the submission's | a participant forking from the initial zkey with their own chain, rolling the ceremony back, or submitting two contributions at once |
| 4 | **progress** — the submission is not byte-identical to the head | replaying the current state as if it were work |

**Check 3 is the one that matters and the one a naive coordinator omits.** A fork
from the initial zkey passes `verifyFromInit` on its own — the test suite asserts
exactly that (`zKey.verifyFromInit alone says valid=true`) and then confirms the
coordinator rejects it anyway. Without check 3 the ceremony is a tree, and an
attacker can discard every honest contribution by submitting a length-1 chain of
their own.

### The transcript

`transcript.jsonl` is append-only and **hash-chained**: every entry records the
SHA-256 of the entire log preceding it, so a later edit to an earlier entry is
detectable. `transcript.md` is the human-readable rendering.

Each entry records the contributor's handle, timestamp, the SHA-256 of the
resulting zkey, the contribution count, and the coordinator's verdict on all four
checks. **Rejected submissions are recorded too** — an append-only log that
records only successes is not an audit trail.

### The beacon

The final step mixes in a public value nobody could predict when the ceremony
began (the intended source is a future Bitcoin block hash, fixed by height in
advance). Groth16 Phase-2 needs one honest participant; the beacon removes the
last-participant advantage, so the ceremony is sound even if every human
contributor colluded. `finalize` refuses to run without a beacon.

## Testing the coordinator itself

The coordinator verifies cryptographic transcripts, so **the coordinator can be
wrong**. `scripts/ceremony/test_ceremony.mjs` runs a complete ceremony against a
throwaway Poseidon circuit — never a production circuit — with four honest
participants and six adversarial submissions.

```bash
node scripts/ceremony/test_ceremony.mjs      # 27 assertions
```

Adversarial cases, all rejected:

| attack | rejected because |
|---|---|
| replay the current head | contribution count did not increase |
| **fork from the initial zkey** | prior contributions are not a byte-exact prefix |
| roll back to an earlier accepted state | contribution count went backwards |
| byte-corrupted contribution | `verifyFromInit` failed the proof of knowledge |
| two contributions in one submission | expected exactly head+1 contributions |
| non-zkey garbage upload | bad magic, structural check |

Plus: the head does not move after any rejection; all rejections appear in the
transcript; an honest contribution still succeeds afterwards; a doctored
transcript entry breaks the hash chain and is detected; post-finalization
submissions are refused; and a proof made under the finalized key verifies.

**Two real bugs in the coordinator were found by this test and fixed:** snarkjs
`zKey.beacon` returns `false` rather than throwing when the beacon hash is
odd-length hex or `numIterationsExp` falls outside [10, 63], so an unchecked call
silently produces no output and a coordinator that did not check the return value
would report a beacon that never happened. The coordinator now validates both up
front and verifies the output file exists.

## Running it for real, when the circuit is frozen

The circuit is now frozen for v1.2 (`CIRCUIT-FREEZE.md`). The full operational
sequence — preconditions, per-participant steps, the four-check gate, beacon
announcement, finalisation, and transcript-publication format — is
**`docs/CEREMONY-RUNBOOK.md`**. The outline below is a summary of it.

```bash
node scripts/ceremony/coordinator.mjs init --dir ceremony \
  --r1cs build/wedge_mem_w8_d9_split.r1cs --ptau build/pot15_final.ptau \
  --circuit wedge_mem_w8_d9_split

# per participant, in sequence: publish the head, receive their upload
node scripts/ceremony/coordinator.mjs submit --dir ceremony --file upload.zkey --handle "their-handle"

# after the last participant, with a block hash fixed by height in advance
node scripts/ceremony/coordinator.mjs beacon --dir ceremony --hash <64-hex> --iters 10 \
  --source "Bitcoin block <height>"
node scripts/ceremony/coordinator.mjs finalize --dir ceremony
node scripts/ceremony/coordinator.mjs verify   --dir ceremony
```

Requirements before a real run, none of which are met yet:

- the circuit declared frozen for a named release;
- a published participant list and ordering, with contributors who are plausibly
  independent of each other and of this project;
- the ptau treated as a pinned input with its own documented provenance
  (`supply-chain/TRUSTED-SETUP.md`);
- the beacon source and block height announced **before** contributions open;
- the transcript published alongside the resulting keys, and
  `supply-chain/artifacts.lock.json` regenerated for the new `_final.zkey`.

Until all of that happens, Gate 5 stays open and the shipped keys stay labelled
evaluation-only.
