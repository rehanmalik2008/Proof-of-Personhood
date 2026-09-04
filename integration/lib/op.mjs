// The OpenID Provider surface.
//
// IMPORTANT framing: this OP is a *self-issued* provider (SIOP-style) run by the
// user's own agent. It does NOT authenticate the user against a database and it
// learns nothing that lets it correlate the user across relying parties -- the
// pairwise subject N = Poseidon(s, ctx, epochAction) is computed inside the ZK
// circuit, so even this OP cannot link N@rp-A to N@rp-B without s (never seen).
//
// The identity trust root is the Groth16 proof + the published root, NOT this
// OP's signature. The OP signature only provides transport integrity for the
// id_token; an RP MAY ignore the id_token and verify the embedded VP directly.

import { createServer } from "node:http";
import { newSigningKey, signJwt, b64url, sha256 } from "./jose.mjs";
import { challengeBinding, buildVP } from "./vp.mjs";
import { prove, holderSecretFromBuild } from "./proof.mjs";
import { checkRootConsistency } from "./root_consistency.mjs";

// sector identifier -> ctx. In real OIDC the RP registers a sector_identifier_uri;
// here we derive ctx = H("sector:" || client_id), reduced to the BN254 scalar
// field (31 bytes), so "same human, same RP" is a stable subject within an epoch
// and "same human, different RP" is not. (A raw byte-truncation would collide on
// any shared suffix like ".example" -- use a hash.)
export const sectorCtx = (clientId) =>
  BigInt("0x" + sha256(`sector:${clientId}`).subarray(0, 31).toString("hex")).toString();

export function startOP({ port = 4001, rootsUrl = "http://127.0.0.1:4000", mirrorUrls = null, quorum = 2 } = {}) {
  // mirrorUrls: N independent root sources. If given, the prover cross-checks them
  // BEFORE proving (closing-two-gates.md Item 1) and refuses on any disagreement.
  const sources = mirrorUrls && mirrorUrls.length ? mirrorUrls : [rootsUrl];
  const issuer = `http://127.0.0.1:${port}`;
  const key = newSigningKey();
  const secret = holderSecretFromBuild(); // the user's Phase-2 secret + witness

  const json = (res, obj, code = 200) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };

  const server = createServer(async (req, res) => {
    const u = new URL(req.url, issuer);
    try {
      if (u.pathname === "/.well-known/openid-configuration") {
        return json(res, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          jwks_uri: `${issuer}/jwks.json`,
          response_types_supported: ["id_token"],
          response_modes_supported: ["query", "form_post"],
          subject_types_supported: ["pairwise"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid"],
          claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "epoch_action", "epoch_tree", "vp"],
        });
      }
      if (u.pathname === "/jwks.json") return json(res, { keys: [key.jwk] });

      if (u.pathname === "/authorize") {
        const clientId = u.searchParams.get("client_id");
        const redirectUri = u.searchParams.get("redirect_uri");
        const nonce = u.searchParams.get("nonce");
        const state = u.searchParams.get("state") || "";
        if (u.searchParams.get("response_type") !== "id_token") return json(res, { error: "unsupported_response_type" }, 400);
        if (!clientId || !redirectUri || !nonce) return json(res, { error: "invalid_request" }, 400);

        const ctx = sectorCtx(clientId);          // the sector

        // multi-source root consistency: cross-check N independent mirrors BEFORE
        // proving. Fail closed on disagreement or below quorum.
        const rc = await checkRootConsistency({ mirrorUrls: sources, w: 3, quorum });
        if (!rc.ok) return json(res, { error: "root_consistency_failed", verdict: rc.verdict, detail: rc.reason }, 502);

        const roots = await (await fetch(`${sources[0]}/roots`)).json();
        const epochTree = roots.currentEpochTree;      // slow: the tree's root cadence
        const epochAction = roots.currentEpochAction;  // fast: the rate-limit / nullifier window
        const signalHash = challengeBinding(nonce, clientId); // binds proof to (nonce, RP)

        const { proof, publicSignals } = await prove({ secret, ctx, epochAction, epochTree, signalHash });
        const N = publicSignals[0];
        const vp = buildVP({ proof, publicSignals, nonce, domain: clientId, holder: `${issuer}/self` });

        const nowSec = Math.floor(Date.now() / 1000);
        const idToken = signJwt({
          iss: issuer,
          sub: b64url(BigInt(N).toString(16).padStart(64, "0")), // pairwise subject id (from N)
          aud: clientId,
          iat: nowSec,
          exp: nowSec + 300,
          nonce,
          epoch_action: epochAction,
          epoch_tree: epochTree,
          sub_source: "poseidon(s,ctx,epoch_action) via groth16-bn254; pairwise, action-window-scoped",
          vp,
        }, key);

        const loc = `${redirectUri}?id_token=${encodeURIComponent(idToken)}&state=${encodeURIComponent(state)}`;
        res.statusCode = 302;
        res.setHeader("location", loc);
        return res.end();
      }
      json(res, { error: "not_found" }, 404);
    } catch (e) {
      json(res, { error: "server_error", detail: String(e.stack || e) }, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, issuer, port, jwks: [key.jwk] }));
  });
}
