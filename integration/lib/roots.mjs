// The published-roots feed.
//
// In production the epoch root and its hash-chained head (head_chain.mjs) are
// mirrored to SEVERAL INDEPENDENT sources -- a public chain, a CDN-backed static
// endpoint, a third-party bulletin board -- and the client cross-checks them
// before proving (integration/lib/root_consistency.mjs). "Independent" is a
// normative requirement: different operator, different network path, ideally
// different trust root. Three endpoints on one infrastructure are ONE source
// (see THREAT-MODEL.md and integration/README.md).
//
// Split-epoch: the tree publishes on the slow `epoch_tree` cadence; the rate
// limit runs on the fast `epoch_action` counter. This stub tracks both. A relying
// party accepts a proof only if (a) its membershipRoot is in
// acceptedRoots = { current epoch_tree root } u { previous w-1 }, and (b) its
// epoch_action is within `actionRecency` of now (integration/lib/freshness.mjs).

import { createServer } from "node:http";
import { holderSecretFromBuild } from "./proof.mjs";
import { extendHead, headChain } from "./head_chain.mjs";

// --- the canonical ledger every honest mirror serves ------------------------
export function makeLedger({ window_w = 3, actionRecency = 1 } = {}) {
  const realRoot = holderSecretFromBuild().root;
  let currentEpochTree = 7;    // matches build/input_mem_w8_d9_split.json epochTree
  let currentEpochAction = 11; // matches ...epochAction
  const rootHistory = new Map([[7, realRoot]]);   // epoch_tree -> root

  const rootsUpTo = (e) => {
    const out = [];
    for (let k = 1; k <= e; k++) out.push(rootHistory.has(k) ? rootHistory.get(k) : realRoot);
    return out;
  };
  const headAt = (e) => headChain(rootsUpTo(e))[e - 1];
  const acceptedRootsAt = (e) => {
    const out = [];
    for (let k = e; k > e - window_w && rootHistory.has(k); k--) out.push(rootHistory.get(k));
    return out;
  };

  // canonical view for a given epoch_tree (a lagging mirror serves an earlier e)
  const viewAt = (e) => ({
    currentEpochTree: e,
    currentEpochAction,          // action counter is not tree-versioned in this stub
    window_w, actionRecency,
    currentRoot: rootHistory.has(e) ? rootHistory.get(e) : realRoot,
    head: headAt(e).toString(),
    headChain: headChain(rootsUpTo(e)).map(String),  // [head_1..head_e]; lets a client verify a lagging mirror is a prefix, not a rewrite
    acceptedRoots: acceptedRootsAt(e),
    realRoot,                    // demo convenience only
    currentEpoch: e,            // legacy alias
  });

  return {
    realRoot,
    get currentEpochTree() { return currentEpochTree; },
    get currentEpochAction() { return currentEpochAction; },
    get currentEpoch() { return currentEpochTree; },
    window_w, actionRecency,
    rootAt: (e) => (rootHistory.has(e) ? rootHistory.get(e) : realRoot),
    headAt,
    view: () => viewAt(currentEpochTree),
    viewAt,
    advanceEpochTree(newRoot) { currentEpochTree += 1; rootHistory.set(currentEpochTree, newRoot ?? realRoot); },
    advanceEpochAction(n = 1) { currentEpochAction += n; },
    advanceEpoch() { currentEpochAction += 1; }, // back-compat: rotate the nullifier
  };
}

// --- one mirror: honest | lagging(prefix, behind) | dishonest(forged current
//     root at the leading epoch) | rewrite(behind, but its chain forks) ---------
export function startMirror({ port, ledger, name = `m${port}`, mode = "honest", lagEpochs = 1, forgedRoot = 999999 }) {
  const server = createServer((req, res) => {
    if (!req.url.startsWith("/roots")) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("content-type", "application/json");
    const fr = BigInt(forgedRoot);
    let body;
    if (mode === "lagging") {
      const e = Math.max(1, ledger.currentEpochTree - lagEpochs);
      body = { ...ledger.viewAt(e), mirror: name, mode };            // still chain-consistent, just behind
    } else if (mode === "dishonest") {
      const e = ledger.currentEpochTree;
      const forgedHead = extendHead(ledger.headAt(e - 1), fr, e).toString();
      body = { ...ledger.view(), currentRoot: fr.toString(), head: forgedHead,
               acceptedRoots: [fr.toString()], mirror: name, mode };
    } else if (mode === "rewrite") {
      // reports an EARLIER epoch, but with a forged root there -> its chain forks
      // from the canonical one at that epoch. Not a genuine prefix.
      const e = Math.max(2, ledger.currentEpochTree - lagEpochs);
      const chain = ledger.viewAt(e).headChain.slice();
      const forkPrev = e >= 3 ? BigInt(chain[e - 3]) : 0n;
      chain[e - 2] = extendHead(forkPrev, fr, e - 1).toString();     // forged link one step back
      chain[e - 1] = extendHead(BigInt(chain[e - 2]), fr, e).toString();
      body = { ...ledger.viewAt(e), currentRoot: fr.toString(), head: chain[e - 1], headChain: chain, mirror: name, mode };
    } else {
      body = { ...ledger.view(), mirror: name, mode: "honest" };
    }
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, name, port, url: `http://127.0.0.1:${port}`,
                get mode() { return mode; },
                setMode(m, opts = {}) { mode = m; if (opts.lagEpochs != null) lagEpochs = opts.lagEpochs; if (opts.forgedRoot != null) forgedRoot = opts.forgedRoot; } }));
  });
}

// --- N independent mirrors over one ledger ---------------------------------
export async function startRootMirrors({ n = 3, basePort = 4010, window_w = 3, actionRecency = 1 } = {}) {
  const ledger = makeLedger({ window_w, actionRecency });
  const mirrors = [];
  for (let i = 0; i < n; i++) mirrors.push(await startMirror({ port: basePort + i, ledger, name: `mirror-${i + 1}` }));
  return {
    ledger, mirrors,
    urls: mirrors.map((m) => m.url),
    closeAll() { for (const m of mirrors) m.server.close(); },
  };
}

// --- back-compat: a single honest mirror with the pre-multi-source interface ---
export async function startRootsService({ port = 4000, window_w = 3, actionRecency = 1 } = {}) {
  const ledger = makeLedger({ window_w, actionRecency });
  const mirror = await startMirror({ port, ledger, name: "roots" });
  return {
    server: mirror.server, port, url: mirror.url,
    acceptedRoots: () => ledger.view().acceptedRoots,
    advanceEpochTree: ledger.advanceEpochTree,
    advanceEpochAction: ledger.advanceEpochAction,
    advanceEpoch: ledger.advanceEpoch,
    get currentEpochTree() { return ledger.currentEpochTree; },
    get currentEpochAction() { return ledger.currentEpochAction; },
    get currentEpoch() { return ledger.currentEpochTree; },
  };
}
