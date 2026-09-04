// Generate a CycloneDX 1.5 SBOM from package-lock.json (lockfileVersion 3).
//   node scripts/gen_sbom.mjs   ->  supply-chain/SBOM.json
//
// Every component carries its exact version, npm registry URL, and the sha512
// integrity hash npm recorded at install time -- so a consumer can confirm the
// dependency tree byte-for-byte.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (lock.lockfileVersion !== 3) {
  console.error(`expected lockfileVersion 3, got ${lock.lockfileVersion}`);
  process.exit(1);
}

const purl = (name, version) => {
  // pkg:npm/@scope/name@version   (scope is percent-encoded per purl spec)
  const [scope, bare] = name.startsWith("@") ? name.slice(1).split("/") : [null, name];
  return scope ? `pkg:npm/%40${scope}/${bare}@${version}` : `pkg:npm/${bare}@${version}`;
};

const components = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || !path.startsWith("node_modules/")) continue;
  if (!meta.version) continue;
  const name = path.replace(/^.*node_modules\//, "");
  const comp = {
    type: "library",
    "bom-ref": purl(name, meta.version),
    name,
    version: meta.version,
    purl: purl(name, meta.version),
    scope: meta.dev ? "optional" : "required",
  };
  if (meta.resolved) comp.externalReferences = [{ type: "distribution", url: meta.resolved }];
  if (meta.integrity) {
    // npm integrity is "sha512-<base64>"; CycloneDX wants hex
    const [alg, b64] = meta.integrity.split("-");
    if (alg === "sha512") {
      comp.hashes = [{ alg: "SHA-512", content: Buffer.from(b64, "base64").toString("hex") }];
    } else {
      comp.hashes = [{ alg: alg.toUpperCase(), content: b64 }];
    }
  }
  if (meta.license) comp.licenses = [{ license: { id: meta.license } }];
  components.push(comp);
}
components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const lockHash = createHash("sha256").update(readFileSync("package-lock.json")).digest("hex");
// deterministic serial number: RFC-4122-shaped, derived from the lockfile hash,
// so a re-run on the same dependency tree produces a byte-identical SBOM.
const h = lockHash;
const serial = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
// SOURCE_DATE_EPOCH support for a reproducible timestamp (falls back to epoch 0)
const sde = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : 0;

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${serial}`,
  version: 1,
  metadata: {
    timestamp: new Date(sde).toISOString(),
    tools: [{ vendor: "sybil-wedge-bench", name: "gen_sbom.mjs", version: "1" }],
    component: {
      type: "application",
      "bom-ref": `pkg:npm/${pkg.name}@${pkg.version}`,
      name: pkg.name,
      version: pkg.version,
    },
    properties: [
      { name: "node:engine", value: pkg.engines?.node ?? "unset" },
      { name: "npm:lockfileVersion", value: String(lock.lockfileVersion) },
      { name: "npm:package-lock.json:sha256", value: lockHash },
      { name: "component:count", value: String(components.length) },
    ],
  },
  components,
};

mkdirSync("supply-chain", { recursive: true });
writeFileSync("supply-chain/SBOM.json", JSON.stringify(sbom, null, 2) + "\n");
console.log(`wrote supply-chain/SBOM.json  (${components.length} components, CycloneDX 1.5)`);
console.log(`package-lock.json sha256: ${lockHash}`);
