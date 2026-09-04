// Verifier freshness policy for the split-epoch Phase-2 proof.
// splitting-the-epochs.md S3: with the epoch split, there are now TWO independent
// freshness parameters where before there was one.
//
//   w             -- how stale the epochTree root may be, in epochTree units.
//                    A proof is accepted only if its epochTree is within the last
//                    `w` published tree epochs. This is the staleness window from
//                    the witness-maintenance work, now named explicitly.
//   actionRecency -- how stale the epochAction may be, in epochAction units.
//                    Tighter than `w` on purpose: the fast counter exists for
//                    tight rate-limiting, so a proof citing an old action window
//                    is rejected even if its tree root is fine.
//
// These are deployment config. Typical: epochTree = 1 day, w = 3 (roots valid ~3
// days); epochAction = 10 min, actionRecency = 1 (only the current or the
// immediately-previous window).
//
// A root older than `w` is rejected REGARDLESS of epochAction -- the two checks
// are independent and both must pass.

export const DEFAULT_FRESHNESS = { w: 3, actionRecency: 1 };

export function checkFreshness({ epochTree, epochAction }, cfg) {
  const { currentEpochTree, currentEpochAction } = cfg;
  const w = BigInt(cfg.w ?? DEFAULT_FRESHNESS.w);
  const actionRecency = BigInt(cfg.actionRecency ?? DEFAULT_FRESHNESS.actionRecency);

  let et, ea, cet, cea;
  try {
    et = BigInt(epochTree); ea = BigInt(epochAction);
    cet = BigInt(currentEpochTree); cea = BigInt(currentEpochAction);
  } catch {
    return { ok: false, reason: "epoch value is not an integer" };
  }

  // --- epochTree staleness window (independent of epochAction) ---
  if (et > cet) return { ok: false, reason: `epochTree ${et} is in the future (current ${cet})` };
  if (cet - et >= w) return { ok: false, reason: `epochTree root too stale: ${cet - et} tree-epochs old, w=${w}` };

  // --- epochAction recency (independent of epochTree) ---
  if (ea > cea) return { ok: false, reason: `epochAction ${ea} is in the future (current ${cea})` };
  if (cea - ea > actionRecency) return { ok: false, reason: `epochAction too stale: ${cea - ea} windows old, actionRecency=${actionRecency}` };

  return { ok: true };
}
