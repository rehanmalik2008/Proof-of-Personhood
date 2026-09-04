// W3C Verifiable Presentation container for the Phase-2 nullifier proof.
//
// Split-epoch: this maps the proof + public signals
//   [ N, y, root, ctx, epochAction, epochTree, signalHash ]   (nPublic 7)
// into a standard VP. It introduces exactly ONE new artifact: a proof `type`
// ("GrothBn254NullifierProof2025") inside an otherwise-standard VP -- which the
// note explicitly permits ("one new proof type ... into existing containers").
// No new credential format, no token.

import { verify as groth16Verify, namedSignals, SIGNAL_NAMES } from "./proof.mjs";
import { checkFreshness } from "./freshness.mjs";
import { b64url, unb64url, sha256 } from "./jose.mjs";

export const NULLIFIER_PROOF_TYPE = "GrothBn254NullifierProof2025";
export const VP_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://sybil-wedge.example/contexts/nullifier-presentation/v1",
];

// challenge binding: the circuit's public `signalHash` MUST equal H(nonce || "|" || domain),
// so a proof is inseparable from the exact (login nonce, relying-party) it was made for.
// Take 31 bytes (248 bits) so the value is unconditionally < the BN254 scalar field
// and survives the circuit un-reduced (same reason gen_input_membership uses 31 bytes).
export const challengeBinding = (nonce, domain) =>
  BigInt("0x" + sha256(`${nonce}|${domain}`).subarray(0, 31).toString("hex")).toString();

export function buildVP({ proof, publicSignals, nonce, domain, holder }) {
  const sig = namedSignals(publicSignals);
  return {
    "@context": VP_CONTEXT,
    type: ["VerifiablePresentation", "NullifierPresentation"],
    ...(holder ? { holder } : {}),
    // no VC is disclosed: personhood is proven in zero knowledge, never shown
    verifiableCredential: [],
    proof: {
      type: NULLIFIER_PROOF_TYPE,
      cryptosuite: "groth16-bn254-poseidon",
      created: new Date().toISOString(),
      proofPurpose: "authentication",
      verificationMethod:
        "https://sybil-wedge.example/circuits/wedge_mem_w8_d9_split#vkey-v1",
      challenge: nonce,
      domain,
      publicSignals: sig,
      proofValue: b64url(JSON.stringify({ pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c })),
    },
  };
}

// Returns { ok, subject: N, epochAction, epochTree, context, reason? }.
// `acceptedRoots` is the value-keyed staleness window (current epochTree root plus
// the last w-1). `freshness` is the epoch-number policy from freshness.mjs:
//   { currentEpochTree, currentEpochAction, w, actionRecency }
// A root older than w is rejected regardless of epochAction, and vice versa.
export async function verifyVP(vp, { expectedNonce, expectedDomain, acceptedRoots, freshness }) {
  const fail = (reason) => ({ ok: false, reason });
  if (!vp || !Array.isArray(vp["@context"]) || vp["@context"][0] !== VP_CONTEXT[0])
    return fail("not a VC-2.0 VP");
  if (!vp.type?.includes("VerifiablePresentation")) return fail("type missing VerifiablePresentation");
  const p = vp.proof;
  if (!p || p.type !== NULLIFIER_PROOF_TYPE) return fail(`proof.type != ${NULLIFIER_PROOF_TYPE}`);
  if (p.proofPurpose !== "authentication") return fail("proofPurpose != authentication");
  if (p.challenge !== expectedNonce) return fail("challenge != expected nonce (stale/replayed)");
  if (p.domain !== expectedDomain) return fail("domain != this relying party (wrong-audience proof)");

  const sig = p.publicSignals || {};
  // challenge binding: proof is cryptographically tied to (nonce, domain)
  if (sig.signalHash !== challengeBinding(expectedNonce, expectedDomain))
    return fail("signalHash not bound to (nonce, domain)");

  // staleness window w (value-keyed): the membership root must be one the verifier
  // still accepts -- current epochTree root plus the last w-1
  if (!acceptedRoots.includes(sig.membershipRoot))
    return fail("membershipRoot outside the accepted staleness window w");

  // split-epoch freshness (epoch-number policy): epochTree within w AND
  // epochAction within the tighter actionRecency bound. Independent checks.
  if (freshness) {
    const fr = checkFreshness({ epochTree: sig.epochTree, epochAction: sig.epochAction }, freshness);
    if (!fr.ok) return fail("freshness: " + fr.reason);
  }

  // the actual zero-knowledge check
  const ordered = SIGNAL_NAMES.map((n) => sig[n]);
  let zkOk = false;
  try {
    const proof = { ...JSON.parse(unb64url(p.proofValue).toString("utf8")), protocol: "groth16", curve: "bn128" };
    zkOk = await groth16Verify(ordered, proof);
  } catch (e) {
    return fail("proofValue undecodable: " + e.message);
  }
  if (!zkOk) return fail("groth16 verification failed");

  return {
    ok: true,
    subject: sig.nullifier,
    epochAction: sig.epochAction,
    epochTree: sig.epochTree,
    context: sig.context,
  };
}
