// Runs the C++->WASM rapidsnark prover (prover.js) inside a dedicated Worker.
// A Worker thread may block on Atomics.wait, so callMain() + child pthread joins
// work here (they cannot on the page main thread).
let factory = null;
try {
  importScripts("prover.js");
  factory = self.RSProver || (typeof RSProver !== "undefined" ? RSProver : null);
} catch (e) {
  postMessage({ kind: "error", where: "importScripts", msg: String(e && e.message || e) });
}

self.onmessage = async (ev) => {
  const { zkey, wtns, runs } = ev.data;
  try {
    const N = runs || 20;
    const t0 = Date.now();
    const M = await factory({
      printErr: (s) => { if (!/madvise/.test(s)) postMessage({ kind: "log", s: String(s) }); },
      print: () => {},
      noInitialRun: true,
    });
    const initMs = Date.now() - t0;
    M.FS.writeFile("/c.zkey", new Uint8Array(zkey));
    M.FS.writeFile("/w.wtns", new Uint8Array(wtns));

    // thread sanity: how many pthread workers did Emscripten spin up?
    const threadsRunning = (M.PThread && M.PThread.runningWorkers) ? M.PThread.runningWorkers.length : null;
    const threadsUnused  = (M.PThread && M.PThread.unusedWorkers)  ? M.PThread.unusedWorkers.length  : null;

    const times = [];
    let coldMs = null, proofB64 = null, publicJson = null, ok = false;
    for (let i = 0; i < N + 1; i++) {
      try { M.FS.unlink("/proof.json"); M.FS.unlink("/public.json"); } catch {}
      const a = performance.now();
      M.callMain(["/c.zkey", "/w.wtns", "/proof.json", "/public.json"]);
      const dt = performance.now() - a;
      const exists = M.FS.analyzePath("/proof.json").exists;
      if (!exists) { postMessage({ kind: "error", where: "prove#" + i, msg: "no /proof.json produced" }); return; }
      if (i === 0) {
        coldMs = dt;
        publicJson = M.FS.readFile("/public.json", { encoding: "utf8" });
        proofB64 = btoa(M.FS.readFile("/proof.json", { encoding: "utf8" }));
        ok = true;
      } else times.push(+dt.toFixed(1));
      postMessage({ kind: "progress", i, n: N, ms: +dt.toFixed(0) });
    }
    times.sort((a, b) => a - b);
    postMessage({
      kind: "done",
      initMs, coldMs: +coldMs.toFixed(1),
      warmMs: times,
      warmMin: times[0], warmMedian: times[(times.length - 1) >> 1],
      warmP95: times[Math.min(times.length - 1, Math.floor(0.95 * times.length))],
      warmMax: times[times.length - 1],
      threadsRunning, threadsUnused,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      proofB64, publicJson, verifyOK: ok,
    });
  } catch (e) {
    postMessage({ kind: "error", where: "run", msg: String(e && e.stack || e) });
  }
};
