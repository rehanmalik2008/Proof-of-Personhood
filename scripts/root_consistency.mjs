// ---------------------------------------------------------------------------
// STEP 4 -- the eclipse attack (§5.1), surfaced + prototyped.
//
// Broadcast-refresh (Steps 1-2) is privacy-safe against an honest-but-curious
// backend. A MALICIOUS backend can still eclipse a targeted client: serve it a
// different epoch broadcast / root than everyone else, so its witness diverges
// and its next proof fails or is distinguishable.
//
// Defense prototyped here: each epoch root is folded into a hash-CHAINED
// transparency head  head_e = Poseidon(head_{e-1}, root_e, e)  which is mirrored
// to several INDEPENDENT sources. A client cross-checks the head it derives from
// the root it was served against the heads those sources report. Divergence =>
// the client knows it was eclipsed and refuses to proceed.
//
// This file demonstrates:
//   (A) honest case            -- all sources agree, check passes
//   (B) targeted eclipse       -- backend feeds victim a bad root => CAUGHT by cross-check
//   (C) full gossip eclipse    -- adversary also controls ALL of the victim's
//                                 head sources => NOT caught. This is the exact
//                                 trust boundary (Falsification #4).
// ---------------------------------------------------------------------------

import { buildPoseidon } from "circomlibjs";
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (a) => F.toObject(poseidon(a));

// ---- the chained transparency head -------------------------------------------
function extendHead(prevHead, root, epoch) {
  return H([prevHead, root, BigInt(epoch)]);
}
// full recompute of a head from a root history (audit)
function headFromHistory(roots) {
  let h = 0n;
  roots.forEach((r, i) => (h = extendHead(h, r, i + 1)));
  return h;
}

// ---- a source that mirrors the head (bulletin board / chain / gossip peer) ---
class HeadSource {
  constructor(name, { dishonest = false } = {}) { this.name = name; this.dishonest = dishonest; this.head = 0n; }
  publish(head) { this.head = head; }                 // honest mirror
  report(realHead, forgedHead) { return this.dishonest ? forgedHead : realHead; }
}

// ---- client-side root-consistency check -------------------------------------
// Inputs: the root the client was served this epoch, the head it had last epoch,
// and the heads reported by its independent sources. NO leaf index, no per-user
// query -- identical check for every client.
function rootConsistencyCheck({ servedRoot, epoch, prevHead, sourceHeads }) {
  const derived = extendHead(prevHead, servedRoot, epoch);
  const agree = sourceHeads.filter((h) => h === derived).length;
  const disagree = sourceHeads.length - agree;
  return {
    derivedHead: derived,
    sourcesAgree: agree,
    sourcesDisagree: disagree,
    // accept only if EVERY source the client can reach corroborates the derived head
    verdict: disagree === 0 ? "ACCEPT" : "ECLIPSE DETECTED -- refuse refresh",
  };
}

// ===========================================================================
const roots = [111n, 222n, 333n, 444n]; // canonical epoch roots (epochs 1..4)
const canonicalHeads = roots.map((_, i) => headFromHistory(roots.slice(0, i + 1)));
console.log("canonical chained heads:", canonicalHeads.map((h) => h.toString().slice(0, 10) + "..."));

const EPOCH = 4;
const prevHead = canonicalHeads[EPOCH - 2];
const goodRoot = roots[EPOCH - 1];
const badRoot = 999999n; // what an eclipsing backend feeds the victim

// (A) honest: 3 independent honest sources
{
  const S = [new HeadSource("chain"), new HeadSource("board"), new HeadSource("peer")];
  S.forEach((s) => s.publish(canonicalHeads[EPOCH - 1]));
  const r = rootConsistencyCheck({
    servedRoot: goodRoot, epoch: EPOCH, prevHead,
    sourceHeads: S.map((s) => s.report(canonicalHeads[EPOCH - 1])),
  });
  console.log(`\n(A) honest backend + honest sources:`);
  console.log(`    agree=${r.sourcesAgree} disagree=${r.sourcesDisagree}  =>  ${r.verdict}`);
}

// (B) targeted eclipse: backend serves victim badRoot; sources still honest
{
  const S = [new HeadSource("chain"), new HeadSource("board"), new HeadSource("peer")];
  S.forEach((s) => s.publish(canonicalHeads[EPOCH - 1]));
  const r = rootConsistencyCheck({
    servedRoot: badRoot, epoch: EPOCH, prevHead,
    sourceHeads: S.map((s) => s.report(canonicalHeads[EPOCH - 1])),
  });
  console.log(`\n(B) eclipsing backend (bad root to victim) + honest sources:`);
  console.log(`    victim-derived head = ${r.derivedHead.toString().slice(0, 10)}...`);
  console.log(`    agree=${r.sourcesAgree} disagree=${r.sourcesDisagree}  =>  ${r.verdict}`);
}

// (C) full eclipse: adversary ALSO controls every source the victim can reach
{
  const forgedHead = extendHead(prevHead, badRoot, EPOCH); // consistent-looking but off canon
  const S = [new HeadSource("chain", { dishonest: true }),
             new HeadSource("board", { dishonest: true }),
             new HeadSource("peer", { dishonest: true })];
  const r = rootConsistencyCheck({
    servedRoot: badRoot, epoch: EPOCH, prevHead,
    sourceHeads: S.map((s) => s.report(canonicalHeads[EPOCH - 1], forgedHead)),
  });
  console.log(`\n(C) eclipsing backend + adversary controls ALL victim's sources:`);
  console.log(`    agree=${r.sourcesAgree} disagree=${r.sourcesDisagree}  =>  ${r.verdict}`);
  console.log(`    (a later audit by ANY party with the real root history still exposes the fork:`);
  console.log(`     forged head ${forgedHead.toString().slice(0, 10)}... is absent from the canonical chain)`);
}

console.log(`\n---- trust the root-publisher requires (Falsification #4) ----`);
console.log(`
The chained head makes equivocation:
  * DETECTABLE always -- the append-only hash chain means a forked head can never
    be reconciled with the canonical one; any auditor holding the real root
    history catches it after the fact.
  * PREVENTED for a client only under a 1-of-N honest assumption on that client's
    head sources. If every source a given client reaches is adversarial (case C),
    the fork is not caught in-band at refresh time.

So the honest statement of the trust model:
  - NOT zero-trust. Root-consistency needs a broadcast medium where the client has
    >=1 honest head source: a public blockchain, OR a gossip network with 1-of-N
    honesty, OR a bulletin board that is trusted-not-to-equivocate.
  - A single bulletin board operator IS a trusted party (they can equivocate; the
    chain only makes it publicly accountable after the fact). Using one weakens
    the project's "no trusted party" claim to "one publicly-accountable publisher
    who can equivocate but cannot do so undetectably."
  - The strongest honest version: publish head_e to an existing public chain. Then
    "trust" = "the chain does not reorg / is not 51%-attacked," which is a
    weaker and more externally-audited assumption than trusting this backend.
`);
