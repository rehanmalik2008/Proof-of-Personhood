// A mock Relying Party. This is ORDINARY OIDC client code plus two small additions
// that are the whole integration cost:
//   (1) a VP verifier call  (verifyVP -> groth16)          -- the "SDK"
//   (2) a poll of the published-roots feed                 -- the "endpoint"
//   (3) a (sub, epochAction) dedupe for the Sybil property -- additive to existing anti-abuse
// There is NO custom protocol. The redirect/callback/JWT-validation is stock OIDC.

import { createServer } from "node:http";
import { verifyJwt } from "./jose.mjs";
import { verifyVP } from "./vp.mjs";
import { checkRootConsistency } from "./root_consistency.mjs";

export function startRP({ port, clientId, opConfigUrl, rootsUrl, mirrorUrls = null, quorum = 2 }) {
  const sources = mirrorUrls && mirrorUrls.length ? mirrorUrls : [rootsUrl];
  const base = `http://127.0.0.1:${port}`;
  const redirectUri = `${base}/callback`;
  const sessions = new Map();                 // state -> { nonce }
  const actedThisWindow = new Set();          // `${sub}:${epochAction}`  -- the Sybil gate
  const seenSubjects = new Set();             // for the "uncorrelatable across RPs" assertion

  const send = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj, null, 2));
  };

  const server = createServer(async (req, res) => {
    const u = new URL(req.url, base);
    try {
      if (u.pathname === "/login") {
        const nonce = "n_" + Math.random().toString(36).slice(2);
        const state = "s_" + Math.random().toString(36).slice(2);
        sessions.set(state, { nonce });
        const cfg = await (await fetch(opConfigUrl)).json();
        const q = new URLSearchParams({
          response_type: "id_token", scope: "openid", client_id: clientId,
          redirect_uri: redirectUri, nonce, state,
        });
        res.statusCode = 302;
        res.setHeader("location", `${cfg.authorization_endpoint}?${q}`);
        return res.end();
      }

      if (u.pathname === "/callback") {
        const idToken = u.searchParams.get("id_token");
        const state = u.searchParams.get("state");
        const sess = sessions.get(state);
        if (!sess) return send(res, 400, { error: "unknown state" });
        sessions.delete(state);

        const cfg = await (await fetch(opConfigUrl)).json();
        const { keys } = await (await fetch(cfg.jwks_uri)).json();

        // (stock OIDC) validate the ID token
        let payload;
        try {
          payload = verifyJwt(idToken, keys, { iss: cfg.issuer, aud: clientId, nonce: sess.nonce });
        } catch (e) {
          return send(res, 401, { error: "id_token invalid", detail: e.message });
        }

        // (+endpoint) the verifier ALSO cross-checks the N independent root
        // mirrors before accepting -- the independence requirement applies to the
        // verifier's root feed, not only the prover's.
        const rc = await checkRootConsistency({ mirrorUrls: sources, w: 3, quorum });
        if (!rc.ok) return send(res, 502, { error: "root consistency failed", verdict: rc.verdict, detail: rc.reason });

        // (+SDK) verify the embedded Verifiable Presentation / ZK proof
        const roots = await (await fetch(`${sources[0]}/roots`)).json();
        const vpr = await verifyVP(payload.vp, {
          expectedNonce: sess.nonce, expectedDomain: clientId,
          acceptedRoots: roots.acceptedRoots,
          freshness: {
            currentEpochTree: roots.currentEpochTree,
            currentEpochAction: roots.currentEpochAction,
            w: roots.window_w,
            actionRecency: roots.actionRecency,
          },
        });
        if (!vpr.ok) return send(res, 401, { error: "presentation invalid", detail: vpr.reason });

        const sub = vpr.subject;             // == N, pairwise + action-window-scoped
        const epochAction = String(vpr.epochAction);
        const epochTree = String(vpr.epochTree);
        seenSubjects.add(sub);

        // (+dedupe) the Sybil property: one action per (person, epochAction).
        // Rate-limiting binds to the FAST counter -- NOT epochTree.
        const gkey = `${sub}:${epochAction}`;
        if (actedThisWindow.has(gkey))
          return send(res, 403, { error: "already acted this action window", sub, epochAction });
        actedThisWindow.add(gkey);

        return send(res, 200, {
          allowed: true, sub, epochAction, epochTree,
          note: "one action per (sub, epochAction) enforced; sub is uncorrelatable with any other RP",
        });
      }

      if (u.pathname === "/_debug") return send(res, 200, { subjects: [...seenSubjects], acted: [...actedThisWindow] });
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: String(e.stack || e) });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, port, clientId, redirectUri, base,
                get subjects() { return [...seenSubjects]; } }));
  });
}
