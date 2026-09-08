# Trusted-setup ceremony — run-book (v1.2)

**This ceremony has NOT been run. The proving keys shipped in this repository are
from a throwaway single-contribution setup and are EVALUATION-ONLY. They stay
that way until this run-book is executed with genuinely independent contributors.
Gate 5 stays Open until then.**

This document is the operational sequence for running the already-tested
coordinator (`scripts/ceremony/coordinator.mjs`, 27/27 assertions, six
adversarial submissions rejected — `docs/CEREMONY.md`) against the **frozen v1.2
circuit set** (`CIRCUIT-FREEZE.md`). It is documentation. Do not execute it: a
real run requires real, independent human contributors, which is out of scope for
any automated process.

---

## 0. Preconditions (all must hold before contributions open)

| # | precondition | how to check |
|---|---|---|
| 1 | Circuit frozen for a named release | `node scripts/circuit_freeze.mjs` prints `FREEZE VALID`; `git describe` resolves to `v1.2-frozen` with a clean `circuits/` tree |
| 2 | Reproducible build verified | `node scripts/repro_build.mjs --double` — two clean builds byte-identical; every `r1cs` sha256 matches `CIRCUIT-FREEZE.md` |
| 3 | ptau pinned with provenance | `sha256sum build/pot15_final.ptau` == the value in `supply-chain/artifacts.lock.json` and `CIRCUIT-FREEZE.md`; provenance in `supply-chain/TRUSTED-SETUP.md` |
| 4 | Participant list published, with ordering | see §2 |
| 5 | Beacon source + block height announced **in advance** | see §4 |
| 6 | For any circuit not yet in `artifacts.lock.json` (`*_split_rev256`, `*_split_rev1024`, `wedge_direct_k3`): added to the lock via `scripts/repro_build.mjs --update` and the freeze reissued | `CIRCUIT-FREEZE.md` shows it under the lock cross-check |

A Groth16 Phase-2 key is bound to **one exact R1CS**. The ceremony is run **once
per frozen circuit** that will be used in production. At minimum that is the
headline `wedge_mem_w8_d9_split`; each revocation variant (`_rev64/256/1024`) and
the enrolment circuit `wedge_direct_k3` needs its own independent chain and its
own `_final.zkey`.

---

## 1. Initialise (coordinator, once per circuit)

The initial zkey is produced by `snarkjs groth16 setup` from the **frozen** r1cs
and the pinned ptau. `scripts/build.mjs` already does this; the coordinator's
`init` copies that zkey in as `0000_init.zkey` and records its hash.

```bash
CID=wedge_mem_w8_d9_split          # repeat for each frozen circuit
node scripts/ceremony/coordinator.mjs init \
  --dir  ceremony/$CID \
  --r1cs build/$CID.r1cs \
  --ptau build/pot15_final.ptau \
  --circuit $CID

node scripts/ceremony/coordinator.mjs status --dir ceremony/$CID
```

Publish, alongside the participant list: `ceremony/$CID/0000_init.zkey`, its
SHA-256, the `r1cs` SHA-256 from `CIRCUIT-FREEZE.md`, and the ptau SHA-256.
Contributors verify these before contributing.

---

## 2. Contributions — sequential, one participant at a time

A Phase-2 ceremony is an **ordered chain**: contribution *i+1* transforms the
state from contribution *i*. It is not a bag of contributions.

**Security property: 1-of-N honest.** The toxic waste (the trapdoor) is
unrecoverable if **at least one** participant generated real entropy and then
**destroyed it** (closed the laptop, wiped the VM, discarded the dice). Every
other participant can be adversarial and colluding.

**The real requirement is independence, not a count.** A ceremony run by one
person, or by one person and their friends, or by N machines one operator
controls, provides **no** security regardless of N — because "at least one honest
participant" is only meaningful if the participants cannot all be the same
interest. Publishing such a ceremony as if it conferred security would be worse
than shipping evaluation-only keys honestly.

**Minimum for a defensible run: ≥ 5 contributors with no relationship to each
other or to this project** — different people, different organisations, different
countries where practical, recruited in the open (a mailing list, a ZK
community forum, a conference call for participants), each publishing their own
attestation of what entropy source they used and that they destroyed it. Five is
a floor, not a target; more independent contributors is strictly better and costs
only their time. Contributor independence is itself the first real contact with
the community whose review Gate 1 ultimately needs.

Per participant, in the published order:

```bash
# 1. coordinator publishes the current head zkey + its sha256
node scripts/ceremony/coordinator.mjs status --dir ceremony/$CID

# 2. participant, OFFLINE on their own machine, contributes entropy:
#      snarkjs zkey contribute <head>.zkey out.zkey --name "handle" -e="<their entropy>"
#    then DESTROYS the entropy and the intermediate state, uploads out.zkey only.

# 3. coordinator ingests it
node scripts/ceremony/coordinator.mjs submit \
  --dir ceremony/$CID --file uploads/out.zkey --handle "their-handle"
```

`submit` refuses to advance the head unless **all four** checks pass:

| # | check | stops |
|---|---|---|
| 1 structural | parses as a zkey, section table intact | corrupt / non-zkey uploads |
| 2 chain | `zKey.verifyFromInit(0000_init.zkey, ptau, upload)` — every delta has a valid proof of knowledge | contributions with no real work |
| 3 extends | exactly head+1 contributions **and** the head's contribution records are a **byte-exact prefix** of the upload's | forking from `0000_init.zkey` with a private chain, rolling back, or batching two contributions |
| 4 progress | the delta actually moved | replaying the head as if it were work |

Check 3 is the one a naive coordinator omits and the one that makes the ceremony
a line rather than a tree. Rejected submissions are recorded in the transcript
too.

---

## 3. Beacon — finalisation

After the last human contribution, mix in a public value nobody could predict
when the ceremony opened. Intended source: a **future Bitcoin block hash, fixed
by height in advance** and announced in the participant materials (§0.5).

```bash
# once the announced block exists, take its header hash (64 hex chars):
node scripts/ceremony/coordinator.mjs beacon \
  --dir ceremony/$CID \
  --hash <64-hex-block-hash> \
  --iters 10 \
  --source "Bitcoin block <height> (announced <date>)"

node scripts/ceremony/coordinator.mjs finalize --dir ceremony/$CID
node scripts/ceremony/coordinator.mjs verify   --dir ceremony/$CID
```

Constraints the coordinator enforces (two real bugs were fixed here — snarkjs
`zKey.beacon` returns `false` instead of throwing on bad input):

- `--hash` must be **even-length** hexadecimal.
- `--iters` (`numIterationsExp`) must be an integer in **[10, 63]**.
- `finalize` refuses to run without a recorded beacon.
- `verify` re-runs `zKey.verifyFromInit` on the finalised head and checks the
  exported vkey.

`finalize` writes `ceremony/$CID/<CID>_final.zkey` and the matching
`<CID>_vkey.json`, and records both hashes in the transcript.

---

## 4. Beacon announcement (do this before §2, at §0.5)

Publish, before contributions open:

```
Ceremony:      <CID>  (r1cs sha256 <from CIRCUIT-FREEZE.md>)
Beacon source: Bitcoin mainnet block height <H>
               (expected ~<date>; whichever block is canonical at height <H>)
Beacon apply:  numIterationsExp = 10
```

Fixing the height in advance is what removes the last-participant advantage: no
contributor, not even the last one, can choose the final randomness.

---

## 5. Transcript publication format

Each ceremony directory after `finalize` contains:

| file | content |
|---|---|
| `transcript.jsonl` | append-only, **hash-chained** — every entry carries the SHA-256 of the entire log before it, so any later edit to an earlier entry is detectable. One entry per action: `init`, each `submit` (accepted **and** rejected), `beacon`, `finalize`. Fields: handle, ISO timestamp, resulting-zkey SHA-256, contribution count, and the verdict on all four checks. |
| `transcript.md` | human-readable rendering of the above (table). |
| `0000_init.zkey` | the frozen initial key. |
| `NNNN_<handle>.zkey` | each accepted contribution, in order. |
| `<CID>_final.zkey`, `<CID>_vkey.json` | the finalised, beaconed key and its verification key. |

**Publish the whole directory** alongside the keys, plus each contributor's own
signed attestation (entropy source + destruction). A verifier can then re-run
`coordinator.mjs verify` and `snarkjs zkey verify` against the frozen r1cs and
ptau, and independently walk the hash chain.

Then: regenerate `supply-chain/artifacts.lock.json` so its `zkey_final` entry for
each circuit points at the ceremony output (`scripts/repro_build.mjs --update` —
note that `_final.zkey` is a **ceremony artifact verified with `snarkjs zkey
verify`, not by hash-match against a rebuild**), remove the "evaluation-only"
disclosure from `README.md`, `paper/paper.html` §7.6, and
`supply-chain/TRUSTED-SETUP.md`, and mark Gate 5 closed **only after** the
transcript and keys are published and at least one external party has verified
the chain.

---

## 6. What running this does and does not do

- **Does:** replace the evaluation-only keys with keys whose trapdoor is
  unrecoverable under 1-of-N-honest, closing Gate 5 — *if* the contributors are
  genuinely independent and the transcript is public and verified.
- **Does not:** close Gate 1 (independent review of what the circuit computes),
  or change anything about circuit soundness. A post-freeze circuit change
  invalidates the freeze for that circuit (`CIRCUIT-FREEZE.md`) and requires
  re-running this run-book for it from §1.
