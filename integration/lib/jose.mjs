// Minimal JWS (RS256) sign/verify + JWKS, using only node:crypto.
// Deliberately tiny -- a real deployment uses `jose` or a platform lib. The point
// of the PoC is that NOTHING here is protocol-novel: it is a plain RS256-signed
// OIDC ID Token with a JWKS endpoint, exactly what "Sign in with X" relying
// parties already validate.

import {
  generateKeyPairSync, createSign, createVerify, createPublicKey, createHash,
} from "node:crypto";

export const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64urlJson = (obj) => b64url(JSON.stringify(obj));
export const unb64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const unb64urlJson = (s) => JSON.parse(unb64url(s).toString("utf8"));

export function newSigningKey() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const kid = b64url(createHash("sha256").update(JSON.stringify(jwk)).digest()).slice(0, 16);
  return { privateKey, publicKey, jwk: { ...jwk, kid, use: "sig", alg: "RS256" }, kid };
}

export function signJwt(payload, { privateKey, kid }) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${b64url(sig)}`;
}

// Verify signature + standard OIDC claims against a JWKS (array of public JWK).
export function verifyJwt(jwt, jwks, { iss, aud, nonce, now = Date.now() } = {}) {
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) throw new Error("jwt: malformed");
  const header = unb64urlJson(h);
  const payload = unb64urlJson(p);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`jwt: no JWKS key for kid=${header.kid}`);
  const pub = createPublicKey({ key: jwk, format: "jwk" });
  const ok = createVerify("RSA-SHA256")
    .update(`${h}.${p}`)
    .verify(pub, unb64url(s));
  if (!ok) throw new Error("jwt: bad signature");
  if (iss && payload.iss !== iss) throw new Error(`jwt: iss ${payload.iss} != ${iss}`);
  if (aud && payload.aud !== aud) throw new Error(`jwt: aud ${payload.aud} != ${aud}`);
  if (nonce && payload.nonce !== nonce) throw new Error("jwt: nonce mismatch (replay?)");
  if (payload.exp && now / 1000 > payload.exp) throw new Error("jwt: expired");
  return payload;
}

export const sha256 = (s) => createHash("sha256").update(s).digest();
