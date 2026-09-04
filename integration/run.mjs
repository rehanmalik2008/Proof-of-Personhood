// End-to-end: OIDC + W3C VP drop-in for the split-epoch Phase-2 nullifier proof,
// with multi-source root consistency (closing-two-gates.md Item 1).
//   node integration/run.mjs
//
// Starts THREE independent root mirrors, a self-issued OpenID Provider (the
// user's agent), and TWO relying parties. Both the prover (OP) and the verifier
// (RP) cross-check the mirrors before proving / accepting. Demonstrates:
//   * RP-A login  -> allowed, subject = N_A
//   * RP-A again (same epochAction) -> 403 "already acted this action window"
//   * RP-B login  -> allowed, subject = N_B, uncorrelatable with N_A
//   * advance epochAction -> RP-A login allowed again, subject rotates
//   * advance epochTree ONLY (tree republishes) -> RP-A still 403, subject unchanged
//   * advance epochAction again -> RP-A allowed, subject rotates once more
//   * one mirror serves a forged root -> login FAILS closed (root consistency)
//   * restore the mirror -> login works again
//   * kill two of three mirrors -> login FAILS closed (below quorum)

import { startRootMirrors } from "./lib/roots.mjs";
import { startOP } from "./lib/op.mjs";
import { startRP } from "./lib/rp.mjs";

const GET = (url) => fetch(url, { redirect: "manual" });

// follow RP/login -> OP/authorize -> RP/callback ; return the final JSON + status.
// If /authorize refuses (non-302), surface that instead of throwing.
async function loginFlow(rpBase) {
  let r = await GET(`${rpBase}/login`);
  if (r.status !== 302) throw new Error(`login: expected 302, got ${r.status}`);
  r = await GET(r.headers.get("location"));               // OP /authorize
  if (r.status !== 302) return { status: r.status, body: await r.json().catch(() => ({})) };
  const cb = r.headers.get("location");
  r = await GET(cb);                                      // RP /callback
  return { status: r.status, body: await r.json() };
}

const R = await startRootMirrors({ n: 3, basePort: 4010, window_w: 3, actionRecency: 1 });
const { ledger, mirrors, urls } = R;
const op = await startOP({ port: 4001, mirrorUrls: urls, quorum: 2 });
const rpA = await startRP({ port: 4002, clientId: "rp-alpha.example",
  opConfigUrl: `${op.issuer}/.well-known/openid-configuration`, mirrorUrls: urls, quorum: 2 });
const rpB = await startRP({ port: 4003, clientId: "rp-bravo.example",
  opConfigUrl: `${op.issuer}/.well-known/openid-configuration`, mirrorUrls: urls, quorum: 2 });

const line = (s = "") => console.log(s);
line(`3 root mirrors @ ${urls.join(", ")}  (window w=3)`);
line(`epochTree ${ledger.currentEpochTree}, epochAction ${ledger.currentEpochAction}`);
line(`OP    @ ${op.issuer}  cross-checks all 3 mirrors before proving`);
line(`RP-A / RP-B cross-check all 3 mirrors before accepting`);
line();

const check = (name, cond) => { results.push([name, !!cond]); line(`   [${cond ? "PASS" : "FAIL"}] ${name}`); };
const results = [];

try {
  line("1) RP-A login ..........................................");
  const a1 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a1.status}  ${JSON.stringify(a1.body)}`);

  line("2) RP-A login again, same action window (Sybil attempt) .");
  const a2 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a2.status}  ${JSON.stringify(a2.body)}`);

  line("3) RP-B login (same human, different relying party) .....");
  const b1 = await loginFlow(rpB.base);
  line(`   -> HTTP ${b1.status}  ${JSON.stringify(b1.body)}`);

  line("4) advance epochAction, RP-A login again ................");
  ledger.advanceEpochAction();
  const a3 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a3.status}  ${JSON.stringify(a3.body)}`);

  line("5) advance epochTree ONLY (tree republishes), RP-A login ");
  ledger.advanceEpochTree();
  const a4 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a4.status}  ${JSON.stringify(a4.body)}`);

  line("6) advance epochAction again, RP-A login ................");
  ledger.advanceEpochAction();
  const a5 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a5.status}  ${JSON.stringify(a5.body)}`);

  line("7) one mirror serves a FORGED root, RP-A login .........");
  mirrors[2].setMode("dishonest", { forgedRoot: 424242 });
  const a6 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a6.status}  ${JSON.stringify(a6.body)}`);

  line("8) restore the mirror, RP-A login .....................");
  mirrors[2].setMode("honest");
  ledger.advanceEpochAction();
  const a7 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a7.status}  ${JSON.stringify(a7.body)}`);

  line("9) kill two of three mirrors, RP-A login ..............");
  mirrors[1].server.close();
  mirrors[2].server.close();
  const a8 = await loginFlow(rpA.base);
  line(`   -> HTTP ${a8.status}  ${JSON.stringify(a8.body)}`);

  // -------- assertions --------
  line();
  line("ASSERTIONS");
  const subA = a1.body.sub, subB = b1.body.sub, subA3 = a3.body.sub, subA4 = a4.body.sub, subA5 = a5.body.sub;
  check("RP-A first login allowed", a1.status === 200 && a1.body.allowed);
  check("RP-A replay in same action window blocked (403)", a2.status === 403);
  check("RP-B login allowed", b1.status === 200 && b1.body.allowed);
  check("subject differs across RPs (pairwise / sector-scoped)", subA && subB && subA !== subB);
  check("neither subject is a prefix/suffix/rotation of the other (opaque)",
    subA && subB && subA.length === subB.length && !subA.includes(subB.slice(0, 12)));
  check("subject rotates on epochAction change (N = Poseidon(s,ctx,epochAction))", subA3 && subA3 !== subA);
  check("RP-A allowed again in the new action window", a3.status === 200 && a3.body.allowed);
  check("advancing epochTree alone does NOT grant a new action (still 403)", a4.status === 403);
  check("advancing epochTree alone does NOT rotate the subject", subA4 && subA4 === subA3);
  check("advancing epochAction again rotates the subject and re-allows", a5.status === 200 && subA5 && subA5 !== subA3);
  check("a forged mirror fails the login closed (not 200)", a6.status !== 200 && a6.body.verdict === "FAIL_CLOSED_DISAGREEMENT");
  check("restoring the mirror restores login", a7.status === 200 && a7.body.allowed);
  check("below quorum (1 of 3 mirrors) fails the login closed", a8.status !== 200 && a8.body.verdict === "FAIL_CLOSED_QUORUM");
  line();
  line(`   N @ RP-A window 12 = ${subA}`);
  line(`   N @ RP-A window 13 = ${subA3}   (epochAction advanced)`);
  line(`   N @ RP-A after tree republish = ${subA4}   (== previous: tree cadence does not touch the nullifier)`);
} finally {
  R.closeAll();
  op.server.close(); rpA.server.close(); rpB.server.close();
}

line();
line("=".repeat(70));
line("FINDING  --  drop-in (SDK + endpoint)  vs  rearchitecture?");
line("=".repeat(70));
line(`
DROP-IN, with three bounded additions plus one client-side check. In one paragraph:

The relying party runs STOCK OIDC: /login redirect, /callback, JWT validation
against the OP's JWKS, nonce/aud/exp checks. On top of that: (1) a VP verifier
call -- ~80 LoC + the snarkjs verifier + the pinned verification key -- the "SDK";
(2) a poll of the published-roots feed for the staleness window w and the current
epochAction -- the "endpoint"; (3) a (sub, epochAction) dedupe. And (4), new here:
BOTH the prover and the verifier cross-check N independent root mirrors' chained
heads before proving / accepting, and fail closed on any disagreement or below
quorum. That converts the 1-of-N-honest assumption from a stated hope into an
enforced check. It does NOT defeat a full eclipse -- an adversary controlling
every mirror the client reaches, consistently, still passes. It raises the bar
from "control one source" to "control all of them at once", and the fork remains
auditable after the fact by any party with the real root history.

INDEPENDENCE IS NORMATIVE. Three endpoints on the project's own infrastructure
are ONE source with three URLs. Mirrors must differ in operator, network path,
and ideally trust root (a public chain, a CDN-backed static endpoint, a
third-party bulletin board). See THREAT-MODEL.md and this README.

THE ONE SEMANTIC CHANGE the RP must accept: 'sub' is PAIRWISE and scoped to
epochAction -- a per-window action token, not an account key.
`);

process.exit(results.some(([, ok]) => !ok) ? 1 : 0);
