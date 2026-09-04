// Thin wrapper over the split-epoch Phase-2 artifacts. No circuit is changed here.
// build/wedge_mem_w8_d9_split.{wasm,_final.zkey,_vkey.json}  (4,309 constraints, nPublic 7)
//
// Public signal order (verified): [ N, y, root, ctx, epochAction, epochTree, signalHash ]
//   N           = Poseidon(s, ctx, epochAction)  -- per-context, per-action-window nullifier
//   y           = s + N*signalHash               -- RLN degree-1 Shamir share; slot binds to epochAction ONLY
//   root        = membership root for epochTree   -- must be an accepted root (staleness window w)
//   ctx         = the sector identifier          -- DIFFERENT ctx => uncorrelatable N
//   epochAction = fast rate-limit / nullifier window
//   epochTree   = slow tree-publication cadence the `root` was published for
//   signalHash  = H(login challenge)             -- binds the proof to THIS login (anti-replay)

import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WASM = path.join(ROOT, "build/wedge_mem_w8_d9_split.wasm");
const ZKEY = path.join(ROOT, "build/wedge_mem_w8_d9_split_final.zkey");
const VKEY = JSON.parse(readFileSync(path.join(ROOT, "build/wedge_mem_w8_d9_split_vkey.json"), "utf8"));
const BASE_WITNESS = JSON.parse(readFileSync(path.join(ROOT, "build/input_mem_w8_d9_split.json"), "utf8"));

export const SIGNAL_NAMES = ["nullifier", "rlnShare", "membershipRoot", "context", "epochAction", "epochTree", "signalHash"];

// A holder's Phase-2 secret + membership witness. In the PoC we reuse the one real
// self-verified witness in build/ (a real leaf in a real tree) and vary ctx +
// signalHash + epochAction + epochTree per login -- which is how a real client
// behaves: the witness (node/pathIndex/root) tracks the tree on the epochTree
// cadence; ctx/signalHash/epochAction are per-login.
export function holderSecretFromBuild() {
  return {
    s: BASE_WITNESS.s,
    node: BASE_WITNESS.node,
    pathIndex: BASE_WITNESS.pathIndex,
    root: BASE_WITNESS.root,
  };
}

// Produce a Phase-2 proof for (sector ctx, epochAction, epochTree, challenge).
export async function prove({ secret, ctx, epochAction, epochTree, signalHash }) {
  const input = {
    s: secret.s,
    node: secret.node,
    pathIndex: secret.pathIndex,
    root: secret.root,
    ctx: String(ctx),
    epochAction: String(epochAction),
    epochTree: String(epochTree),
    signalHash: String(signalHash),
  };
  const tmp = path.join(os.tmpdir(), `p2_${Math.random().toString(36).slice(2)}.wtns`);
  await snarkjs.wtns.calculate(input, WASM, tmp);
  const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, tmp);
  return { proof, publicSignals };
}

export async function verify(publicSignals, proof) {
  return snarkjs.groth16.verify(VKEY, publicSignals, proof);
}

export const namedSignals = (ps) =>
  Object.fromEntries(SIGNAL_NAMES.map((n, i) => [n, ps[i]]));

export { VKEY };
