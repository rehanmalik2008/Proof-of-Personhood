// ===========================================================================
// Groth16 Phase-2 ceremony coordinator  (closing-what-code-can-close.md §3)
//
//   node scripts/ceremony/coordinator.mjs init     --dir D --r1cs F --ptau F --circuit NAME
//   node scripts/ceremony/coordinator.mjs status   --dir D
//   node scripts/ceremony/coordinator.mjs submit   --dir D --file F --handle NAME
//   node scripts/ceremony/coordinator.mjs beacon   --dir D --hash HEX --iters N [--source TEXT]
//   node scripts/ceremony/coordinator.mjs finalize --dir D
//   node scripts/ceremony/coordinator.mjs verify   --dir D
//
// A Groth16 Phase-2 ceremony is SEQUENTIAL: contribution i+1 transforms the
// state produced by contribution i. A valid ceremony is therefore not a bag of
// contributions, it is an ordered, verified, attestable chain. This coordinator
// enforces that ordering and publishes the chain.
//
// WHAT THE COORDINATOR CHECKS BEFORE ACCEPTING A CONTRIBUTION
//   1. structural : the upload parses as a zkey and its section table is intact
//   2. chain      : snarkjs zKey.verifyFromInit(init, ptau, submission) -- the
//                   whole chain from the frozen initial zkey is cryptographically
//                   valid, every delta has a matching proof of knowledge
//   3. extends    : exactly ONE new contribution vs. the current head, AND the
//                   head's contribution records are a byte-exact prefix of the
//                   submission's. (2) alone is not enough: a participant could
//                   fork from the initial zkey with their own length-1 chain and
//                   still pass it. This check is what makes the ceremony a line
//                   rather than a tree.
//   4. progress   : deltaAfter actually moved, so a replay of the head is rejected
//
// Rejections are appended to the transcript too. An append-only log that only
// records successes is not an audit trail.
//
// SECURITY NOTE ON THE BEACON
//   The final step mixes in a public value that nobody could predict when the
//   ceremony started (e.g. a future Bitcoin block hash). Groth16 Phase-2 is
//   1-of-N honest: the toxic waste is safe if ANY single contributor was honest.
//   The beacon removes the last-participant advantage -- even if every human
//   contributor colluded, none of them chose the final randomness.
//
// STATUS: built and tested against a throwaway circuit. NOT run against the
// production circuit, deliberately -- see docs/CEREMONY.md.
// ===========================================================================

import * as snarkjs from "snarkjs";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// minimal zkey section-table reader (format: "zkey" u32:ver u32:nSections,
// then per section u32:id u64:size payload)
// ---------------------------------------------------------------------------
export function zkeySections(buf) {
  if (buf.slice(0, 4).toString("ascii") !== "zkey") throw new Error("not a zkey file (bad magic)");
  const nSections = buf.readUInt32LE(8);
  let p = 12;
  const secs = new Map();
  for (let i = 0; i < nSections; i++) {
    if (p + 12 > buf.length) throw new Error("truncated section table");
    const id = buf.readUInt32LE(p);
    const size = Number(buf.readBigUInt64LE(p + 4));
    p += 12;
    if (p + size > buf.length) throw new Error(`section ${id} runs past end of file`);
    if (!secs.has(id)) secs.set(id, { pos: p, size });
    p += size;
  }
  return secs;
}

// Section 10 = MPC params: csHash(64) | u32 nContributions | contribution records
export function mpcParams(buf) {
  const s = zkeySections(buf).get(10);
  if (!s) throw new Error("zkey has no MPC-params section (10) -- not a ceremony zkey");
  const csHash = buf.subarray(s.pos, s.pos + 64);
  const n = buf.readUInt32LE(s.pos + 64);
  const recordsPos = s.pos + 68;
  const recordsEnd = s.pos + s.size;
  return { csHash, n, records: buf.subarray(recordsPos, recordsEnd), recordsLen: recordsEnd - recordsPos };
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const nowISO = () => new Date().toISOString();

// ---------------------------------------------------------------------------
export class Coordinator {
  constructor(dir) {
    this.dir = dir;
    this.metaPath = join(dir, "ceremony.json");
    this.logPath = join(dir, "transcript.jsonl");
  }
  get meta() { return JSON.parse(readFileSync(this.metaPath, "utf8")); }
  set meta(m) { writeFileSync(this.metaPath, JSON.stringify(m, null, 1) + "\n"); }
  p(f) { return join(this.dir, f); }

  append(entry) {
    const prev = existsSync(this.logPath)
      ? sha256(Buffer.from(readFileSync(this.logPath))) : "0".repeat(64);
    // each line commits to the whole log before it -> the transcript is
    // append-only in a checkable way, not merely by convention
    const line = JSON.stringify({ ...entry, prevLogSha256: prev });
    appendFileSync(this.logPath, line + "\n");
    return line;
  }

  async init({ r1cs, ptau, circuit }) {
    mkdirSync(this.dir, { recursive: true });
    const init = this.p("0000_init.zkey");
    await snarkjs.zKey.newZKey(r1cs, ptau, init);
    copyFileSync(r1cs, this.p("circuit.r1cs"));
    const buf = readFileSync(init);
    const mp = mpcParams(buf);
    this.meta = {
      circuit, createdAt: nowISO(),
      r1csSha256: sha256(readFileSync(r1cs)),
      ptauPath: ptau, ptauSha256: sha256(readFileSync(ptau)),
      initSha256: sha256(buf),
      head: basename(init), headSha256: sha256(buf), headContributions: mp.n,
      state: "open", accepted: 0, rejected: 0,
    };
    this.append({ seq: 0, ts: nowISO(), action: "init", circuit,
      zkeySha256: sha256(buf), contributions: mp.n, accepted: true,
      note: "initial zkey from groth16 setup; contains no contributions yet" });
    return init;
  }

  /** Verify a submission against the current head. Returns a detailed report. */
  async check(file) {
    const m = this.meta;
    const rep = { structural: false, chainValid: false, extendsHead: false, progressed: false,
                  reasons: [], contributions: null, sha256: null };
    let buf;
    try { buf = readFileSync(file); rep.sha256 = sha256(buf); }
    catch (e) { rep.reasons.push(`unreadable: ${e.message}`); return rep; }

    let sub;
    try { sub = mpcParams(buf); rep.structural = true; rep.contributions = sub.n; }
    catch (e) { rep.reasons.push(`structural: ${e.message}`); return rep; }

    const headBuf = readFileSync(this.p(m.head));
    const head = mpcParams(headBuf);

    // (3) extends-head, checked BEFORE the expensive crypto so a fork is cheap to reject
    if (!sub.csHash.equals(head.csHash)) rep.reasons.push("csHash differs: submission is for a different circuit/setup");
    if (sub.n !== head.n + 1) {
      rep.reasons.push(`expected exactly ${head.n + 1} contributions, submission has ${sub.n}`);
    } else if (!sub.records.subarray(0, head.recordsLen).equals(head.records)) {
      rep.reasons.push("prior contributions are not a byte-exact prefix: submission forks the chain instead of extending it");
    } else {
      rep.extendsHead = true;
    }
    if (rep.sha256 === m.headSha256) { rep.reasons.push("submission is byte-identical to the head: no contribution was made"); }
    else rep.progressed = true;

    // (2) full cryptographic chain check from the frozen initial zkey
    try {
      rep.chainValid = await snarkjs.zKey.verifyFromInit(this.p("0000_init.zkey"), m.ptauPath, file);
      if (!rep.chainValid) rep.reasons.push("zKey.verifyFromInit: contribution chain failed cryptographic verification");
    } catch (e) {
      rep.reasons.push(`zKey.verifyFromInit threw: ${String(e.message || e).split("\n")[0]}`);
    }
    rep.ok = rep.structural && rep.chainValid && rep.extendsHead && rep.progressed;
    return rep;
  }

  async submit(file, handle) {
    const m = this.meta;
    if (m.state !== "open") throw new Error(`ceremony is ${m.state}, not accepting contributions`);
    const rep = await this.check(file);
    const seq = m.accepted + m.rejected + 1;
    if (!rep.ok) {
      m.rejected++; this.meta = m;
      this.append({ seq, ts: nowISO(), action: "submit", handle, accepted: false,
        zkeySha256: rep.sha256, contributions: rep.contributions,
        verification: { structural: rep.structural, chainValid: rep.chainValid,
                        extendsHead: rep.extendsHead, progressed: rep.progressed },
        reasons: rep.reasons });
      return { accepted: false, rep };
    }
    const idx = String(m.accepted + 1).padStart(4, "0");
    const dest = this.p(`${idx}_${handle.replace(/[^A-Za-z0-9_.-]/g, "_")}.zkey`);
    copyFileSync(file, dest);
    m.accepted++; m.head = basename(dest); m.headSha256 = rep.sha256; m.headContributions = rep.contributions;
    this.meta = m;
    this.append({ seq, ts: nowISO(), action: "submit", handle, accepted: true,
      zkeySha256: rep.sha256, contributions: rep.contributions,
      verification: { structural: true, chainValid: true, extendsHead: true, progressed: true },
      file: basename(dest) });
    return { accepted: true, rep, head: dest };
  }

  async beacon({ hash, iters = 10, source = "" }) {
    const m = this.meta;
    if (m.state !== "open") throw new Error(`ceremony is ${m.state}`);
    // snarkjs validates these and returns FALSE rather than throwing, so an
    // unchecked call silently produces no file. Validate up front and check the
    // return value; a beacon that quietly did not happen is the worst outcome.
    if (!/^[0-9a-fA-F]+$/.test(hash) || hash.length % 2 !== 0)
      throw new Error("beacon hash must be an even-length hex string");
    if (hash.length / 2 > 255) throw new Error("beacon hash must be at most 255 bytes");
    if (!Number.isInteger(iters) || iters < 10 || iters > 63)
      throw new Error(`numIterationsExp must be an integer in [10, 63], got ${iters}`);
    const dest = this.p("9999_beacon.zkey");
    const res = await snarkjs.zKey.beacon(this.p(m.head), dest, "final beacon", hash, iters);
    if (res === false || !existsSync(dest))
      throw new Error("snarkjs zKey.beacon refused the parameters and produced no output");
    const rep = await this.check(dest);
    const seq = m.accepted + m.rejected + 1;
    if (!rep.ok) {
      this.append({ seq, ts: nowISO(), action: "beacon", accepted: false, beaconHash: hash,
        zkeySha256: rep.sha256, reasons: rep.reasons });
      throw new Error("beacon output failed verification: " + rep.reasons.join("; "));
    }
    m.accepted++; m.head = basename(dest); m.headSha256 = rep.sha256;
    m.headContributions = rep.contributions; m.beacon = { hash, iters, source };
    this.meta = m;
    this.append({ seq, ts: nowISO(), action: "beacon", accepted: true, beaconHash: hash,
      iterationsExp: iters, source, zkeySha256: rep.sha256, contributions: rep.contributions,
      verification: { structural: true, chainValid: true, extendsHead: true, progressed: true },
      note: "public unpredictable randomness applied after the last human contribution" });
    return dest;
  }

  async finalize() {
    const m = this.meta;
    if (!m.beacon) throw new Error("refusing to finalize: no beacon applied");
    const vkey = await snarkjs.zKey.exportVerificationKey(this.p(m.head));
    writeFileSync(this.p("verification_key.json"), JSON.stringify(vkey, null, 1));
    const finalName = `${m.circuit}_final.zkey`;
    copyFileSync(this.p(m.head), this.p(finalName));
    m.state = "finalized"; m.finalizedAt = nowISO();
    m.finalZkey = finalName; m.finalZkeySha256 = sha256(readFileSync(this.p(finalName)));
    m.vkeySha256 = sha256(readFileSync(this.p("verification_key.json")));
    this.meta = m;
    this.append({ seq: m.accepted + m.rejected + 1, ts: nowISO(), action: "finalize", accepted: true,
      zkeySha256: m.finalZkeySha256, vkeySha256: m.vkeySha256, contributions: m.headContributions });
    this.renderMarkdown();
    return finalName;
  }

  /** Independent re-verification of the published transcript, from the files alone. */
  async verifyTranscript() {
    const m = this.meta;
    const lines = readFileSync(this.logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const out = { linkOk: true, chainOk: false, entries: lines.length, problems: [] };
    // the log's own hash chain
    let acc = "0".repeat(64);
    const raw = readFileSync(this.logPath, "utf8").trim().split("\n");
    for (let i = 0; i < raw.length; i++) {
      const e = JSON.parse(raw[i]);
      if (e.prevLogSha256 !== acc) { out.linkOk = false; out.problems.push(`entry ${i} prevLogSha256 mismatch`); }
      acc = sha256(Buffer.from(raw.slice(0, i + 1).join("\n") + "\n"));
    }
    // every accepted zkey still on disk hashes to what the transcript recorded
    for (const e of lines.filter((x) => x.accepted && x.file)) {
      const got = sha256(readFileSync(this.p(e.file)));
      if (got !== e.zkeySha256) out.problems.push(`${e.file}: sha256 does not match transcript`);
    }
    try {
      out.chainOk = await snarkjs.zKey.verifyFromInit(this.p("0000_init.zkey"), m.ptauPath, this.p(m.head));
    } catch (e) { out.problems.push(`final verifyFromInit threw: ${e.message}`); }
    out.ok = out.linkOk && out.chainOk && out.problems.length === 0;
    return out;
  }

  renderMarkdown() {
    const m = this.meta;
    const lines = readFileSync(this.logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const md = [];
    md.push(`# Ceremony transcript — ${m.circuit}`);
    md.push("");
    md.push(`- state: **${m.state}**`);
    md.push(`- created: ${m.createdAt}`);
    md.push(`- r1cs sha256: \`${m.r1csSha256}\``);
    md.push(`- ptau sha256: \`${m.ptauSha256}\``);
    md.push(`- initial zkey sha256: \`${m.initSha256}\``);
    if (m.beacon) md.push(`- beacon: \`${m.beacon.hash}\` (2^${m.beacon.iters} iterations)${m.beacon.source ? " — " + m.beacon.source : ""}`);
    if (m.finalZkeySha256) md.push(`- final zkey sha256: \`${m.finalZkeySha256}\``);
    md.push("");
    md.push("| # | when | who | action | accepted | contributions | zkey sha256 | notes |");
    md.push("|---|---|---|---|---|--:|---|---|");
    for (const e of lines) {
      md.push(`| ${e.seq} | ${e.ts} | ${e.handle || "—"} | ${e.action} | ${e.accepted ? "yes" : "**NO**"} | ` +
              `${e.contributions ?? "—"} | \`${(e.zkeySha256 || "").slice(0, 16)}…\` | ` +
              `${(e.reasons || []).join("; ") || e.note || ""} |`);
    }
    md.push("");
    md.push("Rejected submissions are listed too: an append-only log that records only");
    md.push("successes is not an audit trail.");
    writeFileSync(this.p("transcript.md"), md.join("\n") + "\n");
  }
}

// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("coordinator.mjs")) {
  const a = process.argv.slice(2);
  const cmd = a[0];
  const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const dir = opt("dir");
  if (!cmd || !dir) {
    console.log("usage: coordinator.mjs <init|status|submit|beacon|finalize|verify> --dir DIR [...]");
    process.exit(2);
  }
  const c = new Coordinator(dir);
  if (cmd === "init") {
    await c.init({ r1cs: opt("r1cs"), ptau: opt("ptau"), circuit: opt("circuit", "circuit") });
    console.log(`initialised ${dir} (head ${c.meta.head})`);
  } else if (cmd === "status") {
    console.log(JSON.stringify(c.meta, null, 1));
  } else if (cmd === "submit") {
    const r = await c.submit(opt("file"), opt("handle", "anonymous"));
    console.log(r.accepted ? `ACCEPTED — head is now ${c.meta.head}`
                           : `REJECTED — ${r.rep.reasons.join("; ")}`);
    process.exit(r.accepted ? 0 : 1);
  } else if (cmd === "beacon") {
    const f = await c.beacon({ hash: opt("hash"), iters: +opt("iters", "10"), source: opt("source", "") });
    console.log(`beacon applied -> ${basename(f)}`);
  } else if (cmd === "finalize") {
    console.log(`finalized -> ${await c.finalize()}`);
  } else if (cmd === "verify") {
    const v = await c.verifyTranscript();
    console.log(JSON.stringify(v, null, 1));
    process.exit(v.ok ? 0 : 1);
  } else { console.log(`unknown command ${cmd}`); process.exit(2); }
}
