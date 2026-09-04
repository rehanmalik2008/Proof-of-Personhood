// Multi-source root consistency test. closing-two-gates.md Item 1.
//   node scripts/test_root_consistency.mjs
//
// Scenarios:
//   1  honest sources           -> ACCEPT (proceed)
//   2  one disagreeing mirror   -> FAIL_CLOSED_DISAGREEMENT (attack signal)
//   3  one lagging-but-consistent-> ACCEPT (a mirror behind but on the chain, within w)
//   4  below quorum (1 of 3 up) -> FAIL_CLOSED_QUORUM
//   5  full eclipse (all forged, consistently) -> ACCEPT  [documents the undefeated case]
//   6  a "lagging" mirror off the chain (history rewrite) -> FAIL_CLOSED_DISAGREEMENT
//
// Exit 0 only if every expected verdict matched.

import { startRootMirrors } from "../integration/lib/roots.mjs";
import { checkRootConsistency } from "../integration/lib/root_consistency.mjs";
import { extendHead } from "../integration/lib/head_chain.mjs";

let pass = 0, fail = 0;
const expect = (name, got, want) => {
  if (got === want) { pass++; console.log(`  PASS  ${name}  -> ${got}`); }
  else { fail++; console.log(`  FAIL  ${name}\n          got  ${got}\n          want ${want}`); }
};

const W = 3;
const R = await startRootMirrors({ n: 3, basePort: 4030, window_w: W });
const { ledger, mirrors, urls } = R;

try {
  // advance the tree a few epochs so there is a real chain to reason about
  ledger.advanceEpochTree("1001");
  ledger.advanceEpochTree("1002");
  ledger.advanceEpochTree("1003");   // currentEpochTree = 10

  console.log("=== 1  three honest mirrors ===");
  {
    const r = await checkRootConsistency({ mirrorUrls: urls, w: W });
    console.log(`      ${r.reason}`);
    expect("honest sources proceed", r.ok && r.verdict, "ACCEPT");
    expect("agreed root is the ledger's current root", r.root, ledger.rootAt(ledger.currentEpochTree));
  }

  console.log("\n=== 2  one mirror serves a forged current root ===");
  {
    mirrors[2].setMode("dishonest", { forgedRoot: "66666" });
    const r = await checkRootConsistency({ mirrorUrls: urls, w: W });
    console.log(`      ${r.reason}`);
    expect("one disagreeing -> fail closed", r.verdict, "FAIL_CLOSED_DISAGREEMENT");
    expect("disagree count", r.disagree, 1);
    mirrors[2].setMode("honest");
  }

  console.log("\n=== 3  one mirror lagging by 1 epoch, still on the chain ===");
  {
    mirrors[1].setMode("lagging", { lagEpochs: 1 });   // serves epoch 9, w=3 so tolerated
    const r = await checkRootConsistency({ mirrorUrls: urls, w: W });
    console.log(`      ${r.reason}`);
    expect("lagging-but-consistent -> proceed", r.ok && r.verdict, "ACCEPT");
    expect("lag count", r.lag, 1);
    expect("agree count (the two leaders)", r.agree, 2);
    mirrors[1].setMode("honest");
  }

  console.log("\n=== 4  only one mirror reachable (below quorum 2) ===");
  {
    mirrors[1].server.close();
    mirrors[2].server.close();
    const r = await checkRootConsistency({ mirrorUrls: urls, w: W, timeoutMs: 800 });
    console.log(`      ${r.reason}`);
    expect("below quorum -> fail closed", r.verdict, "FAIL_CLOSED_QUORUM");
    expect("reachable count", r.reachable, 1);
  }

  console.log("\n=== 5  full eclipse: all mirrors forged, consistently (UNDEFEATED, documented) ===");
  {
    const R2 = await startRootMirrors({ n: 3, basePort: 4040, window_w: W });
    R2.ledger.advanceEpochTree("2001");
    const e = R2.ledger.currentEpochTree;
    const forged = "777777";
    // every mirror serves the SAME forged root + a head chained from the real prefix
    for (const m of R2.mirrors) m.setMode("dishonest", { forgedRoot: forged });
    const r = await checkRootConsistency({ mirrorUrls: R2.urls, w: W });
    console.log(`      ${r.reason}`);
    expect("full eclipse still passes the in-band check", r.ok && r.verdict, "ACCEPT");
    console.log(`      note: the forged head ${extendHead(R2.ledger.headAt(e - 1), BigInt(forged), e).toString().slice(0, 12)}...`);
    console.log(`      is absent from the canonical chain -> auditable after the fact, not in-band.`);
    R2.closeAll();
  }

  console.log("\n=== 6  a mirror behind the leader but whose chain FORKS (history rewrite) ===");
  {
    const R3 = await startRootMirrors({ n: 3, basePort: 4050, window_w: W });
    R3.ledger.advanceEpochTree(3001);
    R3.ledger.advanceEpochTree(3002);    // epoch 9
    // mirror 3 claims epoch 8 but with a forged root there: its head at 8 is not
    // on the leaders' published chain -> a rewrite, not a genuine lag.
    R3.mirrors[2].setMode("rewrite", { lagEpochs: 1, forgedRoot: 314159 });
    const r = await checkRootConsistency({ mirrorUrls: R3.urls, w: W });
    console.log(`      ${r.reason}`);
    expect("off-chain divergence -> fail closed", r.verdict, "FAIL_CLOSED_DISAGREEMENT");
    R3.closeAll();
  }
} finally {
  R.closeAll();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
