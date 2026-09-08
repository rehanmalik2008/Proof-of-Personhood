// ===========================================================================
// Structurally diverse honest witnesses for the deployed Phase-2 split circuit
//   WedgeMembershipWideSplit(8,9)          (after-the-oracle.md, Task 1)
//
//   node scripts/gen_input_multipoint.mjs [N]
//
// Writes  build/multipoint/point_XX.json   (>= 50 by default)
//         build/multipoint/manifest.json   (structure tag for each point)
//
// Each point is a genuine satisfying assignment: C = Poseidon(s) is placed at
// slot pathIndex[i] of level i, the other seven slots are arbitrary "sibling"
// field elements, and the level is hashed with Poseidon(8). root is the top of
// that chain, so root === cur[9] holds by construction. The point of the file
// is to vary EVERY structural axis the two-witness search's Jacobian could
// depend on:
//   - pathIndex shape  (leftmost / rightmost / max-depth / alternating / random)
//   - sibling vectors   (all-zero / all-one / random / alternating / max)
//   - secret s, ctx, epochAction, epochTree, signalHash  (random + field edges)
//
// The two-witness search is then re-run at each point; if the null-space
// dimension or its support changes at ANY point, that is a first-class finding.
// ===========================================================================

import { buildPoseidon } from "circomlibjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (arr) => poseidon(arr);

const OUT = join("build", "multipoint");
mkdirSync(OUT, { recursive: true });

const W = 8, DEPTH = 9;
const rndField = () => F.e("0x" + randomBytes(31).toString("hex"));
const rndSlot = () => randomBytes(1)[0] % W;

// ---- structural axis catalogues -----------------------------------------
const PATH_PATTERNS = {
  allzero:   () => Array(DEPTH).fill(0),                       // leftmost leaf, matches deployed
  allseven:  () => Array(DEPTH).fill(7),                       // rightmost leaf, index 8^9-1
  ascending: () => Array.from({ length: DEPTH }, (_, i) => i % W),
  descending:() => Array.from({ length: DEPTH }, (_, i) => (W - 1 - (i % W))),
  alt_0_7:   () => Array.from({ length: DEPTH }, (_, i) => (i % 2 ? 7 : 0)),
  alt_1_4:   () => Array.from({ length: DEPTH }, (_, i) => (i % 2 ? 4 : 1)),
  allmid:    () => Array(DEPTH).fill(4),
  onlyL0:    () => Array.from({ length: DEPTH }, (_, i) => (i === 0 ? 3 : 0)),
  onlyL4:    () => Array.from({ length: DEPTH }, (_, i) => (i === 4 ? 5 : 0)),
  onlyLlast: () => Array.from({ length: DEPTH }, (_, i) => (i === DEPTH - 1 ? 7 : 0)),
  maxdepth:  () => Array.from({ length: DEPTH }, (_, i) => 1 + (i % (W - 1))), // every level non-zero
  random:    () => Array.from({ length: DEPTH }, () => rndSlot()),
};

const SIB_PATTERNS = {
  zero:  () => F.e(0),
  one:   () => F.e(1),
  max:   () => F.e(P - 1n),
  rand:  () => rndField(),
  // alternating handled inline (needs slot index)
};

// value sets: [s, ctx, epochAction, epochTree, signalHash] as bigint|Field
const VALUE_SETS = {
  random:     () => ({ s: rndField(), ctx: rndField(), ea: rndField(), et: rndField(), sh: rndField() }),
  edge_zero:  () => ({ s: F.e(1), ctx: F.e(0), ea: F.e(0), et: F.e(0), sh: F.e(0) }),
  edge_one:   () => ({ s: F.e(2), ctx: F.e(1), ea: F.e(1), et: F.e(1), sh: F.e(1) }),
  big_epoch:  () => ({ s: rndField(), ctx: rndField(), ea: F.e(1099511627776n), et: F.e(1099511628800n), sh: rndField() }),
  equal_epoch:() => { const e = rndField(); return { s: rndField(), ctx: rndField(), ea: e, et: e, sh: rndField() }; },
  s_max:      () => ({ s: F.e(P - 1n), ctx: rndField(), ea: rndField(), et: rndField(), sh: rndField() }),
  sh_zero:    () => ({ s: rndField(), ctx: rndField(), ea: rndField(), et: rndField(), sh: F.e(0) }),   // y = s
  ctx_big:    () => ({ s: rndField(), ctx: F.e(P - 2n), ea: rndField(), et: rndField(), sh: rndField() }),
};

// ---- one point ---------------------------------------------------------
function buildPoint(pathName, sibName, valName) {
  const pathIndex = PATH_PATTERNS[pathName]();
  const v = VALUE_SETS[valName]();
  const C = H([v.s]);

  const sibOf = sibName === "alt"
    ? (lvl, slot) => ((lvl + slot) % 2 ? F.e(P - 1n) : F.e(0))
    : sibName === "dupC"
    ? () => C
    : (/* zero|one|max|rand */ () => SIB_PATTERNS[sibName]());

  let cur = C;
  const node = [];
  for (let i = 0; i < DEPTH; i++) {
    const grp = [];
    for (let j = 0; j < W; j++) grp.push(j === pathIndex[i] ? cur : sibOf(i, j));
    // sanity: the selected slot really holds the running hash
    if (toDec(grp[pathIndex[i]]) !== toDec(cur)) throw new Error("slot placement bug");
    node.push(grp.map(toDec));
    cur = H(grp);
  }
  const root = cur;

  return {
    obj: {
      s: toDec(v.s), ctx: toDec(v.ctx),
      epochAction: toDec(v.ea), epochTree: toDec(v.et),
      signalHash: toDec(v.sh),
      root: toDec(root),
      node,
      pathIndex: pathIndex.map(String),
    },
    tag: { path: pathName, sib: sibName === "alt" || sibName === "dupC" ? sibName : sibName, val: valName,
           pathIndex, leftmost: pathIndex.every((x) => x === 0),
           rightmost: pathIndex.every((x) => x === 7),
           maxdepth: pathIndex.every((x) => x !== 0) },
  };
}

// ---- point plan ------------------------------------------------------
const plan = [];
// (1) every pathIndex pattern, zero siblings, random values -> isolates path shape
for (const p of Object.keys(PATH_PATTERNS)) plan.push([p, "zero", "random"]);
// (2) leftmost path, every sibling pattern, random values -> isolates siblings
for (const sName of [...Object.keys(SIB_PATTERNS), "alt", "dupC"]) plan.push(["allzero", sName, "random"]);
// (3) leftmost path, zero siblings, every value set -> isolates s/ctx/epoch/signalHash
for (const val of Object.keys(VALUE_SETS)) plan.push(["allzero", "zero", val]);
// (4) deliberately awkward combinations
plan.push(["ascending", "rand", "big_epoch"]);
plan.push(["maxdepth", "alt", "s_max"]);
plan.push(["allseven", "max", "s_max"]);
plan.push(["alt_0_7", "dupC", "sh_zero"]);
plan.push(["allmid", "one", "equal_epoch"]);
plan.push(["descending", "rand", "ctx_big"]);
plan.push(["onlyL4", "rand", "edge_zero"]);
plan.push(["onlyLlast", "rand", "edge_one"]);
// (5) fill to >= 50 with fully random combinations
const pk = Object.keys(PATH_PATTERNS), sk = [...Object.keys(SIB_PATTERNS), "alt", "dupC"], vk = Object.keys(VALUE_SETS);
const want = Math.max(Number(process.argv[2] || 56), 50);
while (plan.length < want) {
  plan.push([pk[randomBytes(1)[0] % pk.length], sk[randomBytes(1)[0] % sk.length], vk[randomBytes(1)[0] % vk.length]]);
}

// ---- emit ----------------------------------------------------------
const manifest = [];
plan.forEach(([p, s, v], k) => {
  const id = String(k).padStart(2, "0");
  const { obj, tag } = buildPoint(p, s, v);
  writeFileSync(join(OUT, `point_${id}.json`), JSON.stringify(obj, null, 2));
  manifest.push({ id, file: `point_${id}.json`, ...tag });
});
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote ${plan.length} points to ${OUT}/`);
console.log(`  path patterns : ${[...new Set(manifest.map((m) => m.path))].join(", ")}`);
console.log(`  sib patterns  : ${[...new Set(manifest.map((m) => m.sib))].join(", ")}`);
console.log(`  value sets    : ${[...new Set(manifest.map((m) => m.val))].join(", ")}`);
console.log(`  leftmost=${manifest.filter((m) => m.leftmost).length} rightmost=${manifest.filter((m) => m.rightmost).length} maxdepth=${manifest.filter((m) => m.maxdepth).length}`);
