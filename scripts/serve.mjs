// Minimal static file server for the timing harness.
//   node scripts/serve.mjs [port]        (default 8080)
//
// Sets COOP/COEP so `crossOriginIsolated` is true on a secure context
// (localhost, or HTTPS) -> snarkjs runs multi-threaded there.
// Over plain http on a LAN IP the phone is NOT a secure context, so it stays
// single-threaded -- that is the deliberately conservative device measurement.
//
//   node scripts/serve.mjs [port]           COOP/COEP on  (multi-thread on localhost)
//   NO_ISOLATION=1 node scripts/serve.mjs   COOP/COEP off (force single-thread everywhere)

import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";
import { networkInterfaces } from "os";

const port = Number(process.argv[2] ?? 8080);
const isolate = !process.env.NO_ISOLATION;
const root = new URL("../web/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const nm = new URL("../node_modules/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// vendor routes for @noble/* so the Lever C harness can do BLS verify in-browser
// without a bundler (importmap in index.html points the bare specifier here)
const VENDOR = {
  "/vendor/nc/": join(nm, "@noble/curves/"),
  "/vendor/nh/": join(nm, "@noble/curves/node_modules/@noble/hashes/"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".zkey": "application/octet-stream",
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file;
    const vk = Object.keys(VENDOR).find((p) => urlPath.startsWith(p));
    if (vk) {
      file = join(VENDOR[vk], normalize(urlPath.slice(vk.length)).replace(/^(\.\.[/\\])+/, ""));
    } else {
      const rel = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
      file = join(root, rel);
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...(isolate ? {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      } : {}),
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
  console.log(`serving ${root}   (cross-origin isolation: ${isolate ? "ON" : "OFF -> single-thread"})`);
  console.log(`  local : http://localhost:${port}/`);
  for (const ip of lan) console.log(`  LAN   : http://${ip}:${port}/    <-- open this in Chrome on the Android device`);
  console.log("Ctrl+C to stop.");
});
