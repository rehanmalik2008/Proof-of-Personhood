// The hash-chained transparency head.
//
//   head_e = Poseidon(head_{e-1}, root_e, e)      head_0 = 0
//
// Each epoch's tree root is folded into an append-only chain. A client that knows
// its previous head and is served a root for the current epoch derives the new
// head locally; independent mirrors publish the head they hold; the client
// cross-checks. Because the chain is append-only, a forked head can never be
// reconciled with the canonical one, so history rewriting (not just current-root
// disagreement) is detectable -- see integration/lib/root_consistency.mjs.
//
// Same construction as scripts/root_consistency.mjs; this is the shared library
// form the integration code and its tests use.

import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (a) => F.toObject(poseidon(a));

/** head_e = Poseidon(head_{e-1}, root_e, e) */
export function extendHead(prevHead, root, epoch) {
  return H([BigInt(prevHead), BigInt(root), BigInt(epoch)]);
}

/** recompute the head from a full root history [root_1, root_2, ...] (audit) */
export function headFromHistory(roots) {
  let h = 0n;
  roots.forEach((r, i) => { h = extendHead(h, r, i + 1); });
  return h;
}

/** the whole chain [head_1, ..., head_e] for a root history */
export function headChain(roots) {
  const chain = [];
  let h = 0n;
  roots.forEach((r, i) => { h = extendHead(h, r, i + 1); chain.push(h); });
  return chain;
}
