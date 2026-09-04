// Client-side multi-source root consistency check. Run BEFORE proving.
// closing-two-gates.md Item 1.
//
// The client queries N independent root mirrors, fetches each mirror's
// hash-chained head (head_chain.mjs) plus its current root and epoch, and
// classifies every reachable mirror into exactly one of three cases:
//
//   AGREE       -- at the leading epoch, self-consistent head, same head as the
//                  other leaders. Corroborates the root the client will prove against.
//   LAG         -- behind the leader by k epochs, but its head is a genuine PREFIX
//                  of the leader's published chain (history not rewritten) and
//                  k < w (the staleness window). Tolerated.
//   DISAGREE    -- same epoch as a leader but different root/head; OR a "lagging"
//                  mirror whose head is NOT on the leader's chain (a rewrite); OR
//                  a self-inconsistent head (head != Poseidon(prevHead, root, e)).
//                  This is an attack signal. Fail closed.
//
// UNREACHABLE mirrors are counted. If fewer than `quorum` mirrors respond, the
// client cannot cross-check and fails closed. `quorum` defaults to 2: for N = 3,
// 2-of-3 reachable is acceptable for liveness, but ANY disagreement among the
// reachable set fails closed regardless of count.
//
// What this does NOT do: it does not defeat a full eclipse. An adversary that
// controls EVERY mirror the client can reach, simultaneously and consistently,
// still passes this check; the fork is only auditable after the fact by a party
// with the real root history. Multi-source checking raises the bar from "control
// one source" to "control all of them at once"; it does not remove the item.

import { extendHead } from "./head_chain.mjs";

const DEFAULTS = { quorum: 2, timeoutMs: 2000 };

async function fetchMirror(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/roots`, { signal: ac.signal });
    if (!r.ok) return { url, reachable: false, reason: `HTTP ${r.status}` };
    const j = await r.json();
    return {
      url, reachable: true,
      epoch: Number(j.currentEpochTree),
      root: String(j.currentRoot),
      head: String(j.head),
      headChain: Array.isArray(j.headChain) ? j.headChain.map(String) : null,
      acceptedRoots: (j.acceptedRoots || []).map(String),
      name: j.mirror || url,
    };
  } catch (e) {
    return { url, reachable: false, reason: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {object} p
 * @param {string[]} p.mirrorUrls          N independent mirror base URLs
 * @param {string|bigint} p.prevHead       the head the client trusted last epoch (head_0 = 0 for a fresh client)
 * @param {number} [p.w]                    staleness window in epoch_tree units (from the ledger)
 * @param {number} [p.quorum]              min mirrors that must respond to cross-check (default 2)
 * @param {number} [p.timeoutMs]           per-mirror fetch timeout
 * @returns {Promise<{ok, verdict, root, epoch, reachable, agree, lag, disagree, unreachable, reason, details}>}
 */
export async function checkRootConsistency({ mirrorUrls, prevHead = 0n, w = 3, quorum = DEFAULTS.quorum, timeoutMs = DEFAULTS.timeoutMs }) {
  const results = await Promise.all(mirrorUrls.map((u) => fetchMirror(u, timeoutMs)));
  const reachable = results.filter((r) => r.reachable);
  const unreachable = results.filter((r) => !r.reachable);

  const fail = (verdict, reason) => ({
    ok: false, verdict, reason, root: null, epoch: null,
    reachable: reachable.length, unreachable: unreachable.length,
    agree: 0, lag: 0, disagree: 0, details: results,
  });

  if (reachable.length < quorum)
    return fail("FAIL_CLOSED_QUORUM",
      `only ${reachable.length}/${mirrorUrls.length} mirrors reachable; need ${quorum} to cross-check ` +
      `(unreachable: ${unreachable.map((u) => `${u.url} (${u.reason})`).join(", ")})`);

  const leadEpoch = Math.max(...reachable.map((r) => r.epoch));
  const leaders = reachable.filter((r) => r.epoch === leadEpoch);

  // pick a reference chain from a leader that carries one
  const refChain = leaders.find((l) => l.headChain && l.headChain.length >= leadEpoch)?.headChain || null;

  const classify = (m) => {
    // 1. self-consistency of the mirror's own head against its own chain link.
    if (m.headChain && m.headChain.length >= m.epoch) {
      const prevLink = m.epoch >= 2 ? BigInt(m.headChain[m.epoch - 2]) : 0n;
      if (extendHead(prevLink, BigInt(m.root), m.epoch).toString() !== m.head)
        return { cls: "DISAGREE", why: "head != Poseidon(prevHead, root, epoch) -- self-inconsistent" };
    } else {
      return { cls: "DISAGREE", why: "no headChain -- cannot verify head is chained, not just asserted" };
    }
    // 2. if the client carries a trusted prevHead, it must appear on this mirror's
    //    chain (the client's history must be a prefix of the mirror's).
    if (prevHead && String(prevHead) !== "0" && !m.headChain.includes(String(prevHead)))
      return { cls: "DISAGREE", why: "the client's trusted prevHead is not on this mirror's chain -- fork" };

    // 3. leading epoch: must match the other leaders exactly.
    if (m.epoch === leadEpoch) {
      const other = leaders.find((l) => l !== m);
      if (other && (other.root !== m.root || other.head !== m.head))
        return { cls: "DISAGREE", why: `leader disagreement: root/head differ from ${other.name}` };
      return { cls: "AGREE" };
    }

    // 4. behind the leader.
    const k = leadEpoch - m.epoch;
    if (k >= w) return { cls: "DISAGREE", why: `lag ${k} >= staleness window w=${w}` };
    if (!refChain) return { cls: "DISAGREE", why: `behind by ${k} and no leader chain to prove it is a prefix, not a rewrite` };
    if (refChain[m.epoch - 1] === m.head) return { cls: "LAG", why: `behind by ${k}, on the leader's chain` };
    return { cls: "DISAGREE", why: `head at epoch ${m.epoch} is NOT on the leader's chain -- history rewrite` };
  };

  const tagged = reachable.map((m) => ({ ...m, ...classify(m) }));
  const agree = tagged.filter((t) => t.cls === "AGREE");
  const lag = tagged.filter((t) => t.cls === "LAG");
  const disagree = tagged.filter((t) => t.cls === "DISAGREE");

  if (disagree.length > 0)
    return {
      ok: false, verdict: "FAIL_CLOSED_DISAGREEMENT",
      reason: `${disagree.length} mirror(s) disagree: ` + disagree.map((d) => `${d.name}: ${d.why}`).join("; "),
      root: null, epoch: leadEpoch,
      reachable: reachable.length, unreachable: unreachable.length,
      agree: agree.length, lag: lag.length, disagree: disagree.length, details: tagged,
    };

  if (agree.length < 1)
    return fail("FAIL_CLOSED_NO_LEADER", `no mirror at the leading epoch corroborates the root (${lag.length} lagging, ${unreachable.length} unreachable)`);

  return {
    ok: true, verdict: "ACCEPT",
    reason: `${agree.length} agree at epoch ${leadEpoch}, ${lag.length} lagging-but-consistent, ${unreachable.length} unreachable (quorum ${quorum} met, 0 disagreements)`,
    root: agree[0].root, epoch: leadEpoch,
    reachable: reachable.length, unreachable: unreachable.length,
    agree: agree.length, lag: lag.length, disagree: disagree.length, details: tagged,
  };
}

