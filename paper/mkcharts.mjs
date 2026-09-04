// Emits the three measurement charts as inline SVG, geometry computed from the
// same numbers that appear in results/*.json. No chart library, no rounding by hand.
import { writeFileSync } from "node:fs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const F = 'font-family="Helvetica, Arial, sans-serif"';

/* ---------- Chart A: prove-only time by engine (Galaxy A12) ---------- */
function chartEngines() {
  const rows = [
    { label: "snarkjs (browser)", cold: 5187, warm: 3374 },
    { label: "C++→WASM", cold: 3071, warm: 2467 },
    { label: "rapidsnark (native)", cold: 510, warm: 477 },
  ];
  const W = 720, H = 250, L = 158, R = 26, T = 36, B = 42;
  const pw = W - L - R, ph = H - T - B;
  const max = 5500, x = (v) => L + (v / max) * pw;
  const band = ph / rows.length, bh = 16, gap = 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" ${F} font-size="13">`;
  // gridlines
  for (let v = 0; v <= 5000; v += 1000) {
    s += `<line x1="${x(v).toFixed(1)}" y1="${T - 6}" x2="${x(v).toFixed(1)}" y2="${T + ph}" stroke="#ccc" stroke-width="0.5"/>`;
    s += `<text x="${x(v).toFixed(1)}" y="${T + ph + 17}" text-anchor="middle" font-size="11" fill="#333">${v}</text>`;
  }
  s += `<text x="${L + pw / 2}" y="${H - 5}" text-anchor="middle" font-size="11.5" fill="#333">prove-only, milliseconds (lower is better)</text>`;
  s += `<text x="${L}" y="${T - 16}" font-size="11.5" fill="#333">cold (first proof, dark)  /  warm median of 20 runs (light)</text>`;
  rows.forEach((r, i) => {
    const y0 = T + i * band + (band - 2 * bh - gap) / 2;
    s += `<text x="${L - 6}" y="${y0 + bh + 1}" text-anchor="end" font-size="12.5">${esc(r.label)}</text>`;
    s += `<rect x="${L}" y="${y0}" width="${(x(r.cold) - L).toFixed(1)}" height="${bh}" fill="#444"/>`;
    s += `<text x="${(x(r.cold) + 5).toFixed(1)}" y="${y0 + bh - 4}" font-size="11.5">${r.cold}</text>`;
    s += `<rect x="${L}" y="${y0 + bh + gap}" width="${(x(r.warm) - L).toFixed(1)}" height="${bh}" fill="#bbb" stroke="#666" stroke-width="0.4"/>`;
    s += `<text x="${(x(r.warm) + 5).toFixed(1)}" y="${y0 + 2 * bh + gap - 4}" font-size="11.5">${r.warm}</text>`;
  });
  // 7.1x annotation
  const yA = T + 2 * band + band / 2;
  s += `<line x1="${x(477).toFixed(1)}" y1="${yA}" x2="${x(3374).toFixed(1)}" y2="${yA}" stroke="#000" stroke-dasharray="2,2" stroke-width="0.7"/>`;
  s += `<text x="${((x(477) + x(3374)) / 2).toFixed(1)}" y="${yA - 5}" text-anchor="middle" font-size="11.5" font-style="italic">7.1&#215; warm</text>`;
  return s + `</svg>`;
}

/* ---------- Chart B: matched-thread ratio (the negative result) ---------- */
function chartThreads() {
  const th = [1, 2, 4, 8];
  const nat = [2743, 1442, 799, 518];
  const wasm = [13319, 7684, 4229, 2559];
  const ratio = wasm.map((w, i) => w / nat[i]);
  const W = 720, H = 300, L = 66, R = 250, T = 26, B = 52;
  const pw = W - L - R, ph = H - T - B;
  const lo = Math.log10(300), hi = Math.log10(20000);
  const y = (v) => T + ph - ((Math.log10(v) - lo) / (hi - lo)) * ph;
  const x = (i) => L + (i / (th.length - 1)) * pw;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" ${F} font-size="13">`;
  for (const v of [500, 1000, 2000, 5000, 10000, 20000]) {
    s += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${L + pw}" y2="${y(v).toFixed(1)}" stroke="#ddd" stroke-width="0.5"/>`;
    s += `<text x="${L - 5}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#333">${v}</text>`;
  }
  th.forEach((t, i) => s += `<text x="${x(i).toFixed(1)}" y="${T + ph + 19}" text-anchor="middle" font-size="12.5">${t}</text>`);
  s += `<text x="${L + pw / 2}" y="${T + ph + 41}" text-anchor="middle" font-size="12" fill="#333">threads</text>`;
  s += `<text x="16" y="${T + ph / 2}" text-anchor="middle" font-size="12" fill="#333" transform="rotate(-90 16 ${T + ph / 2})">prove-only ms (log scale)</text>`;
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  s += `<path d="${path(wasm)}" fill="none" stroke="#000" stroke-width="1.6"/>`;
  s += `<path d="${path(nat)}" fill="none" stroke="#000" stroke-width="1.6" stroke-dasharray="5,3"/>`;
  wasm.forEach((v, i) => s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="#000"/>`);
  nat.forEach((v, i) => s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="#fff" stroke="#000" stroke-width="1.2"/>`);
  // ratio brackets
  ratio.forEach((r, i) => {
    const xi = x(i);
    s += `<line x1="${(xi + 8).toFixed(1)}" y1="${y(wasm[i]).toFixed(1)}" x2="${(xi + 8).toFixed(1)}" y2="${y(nat[i]).toFixed(1)}" stroke="#777" stroke-width="0.7"/>`;
    s += `<text x="${(xi + 12).toFixed(1)}" y="${((y(wasm[i]) + y(nat[i])) / 2 + 4).toFixed(1)}" font-size="11.5" font-style="italic">${r.toFixed(2)}&#215;</text>`;
  });
  // labels
  s += `<text x="${(x(1) + 6).toFixed(1)}" y="${(y(wasm[1]) - 11).toFixed(1)}" font-size="12.5">WASM, portable C++</text>`;
  const ly = T + ph - 12;
  s += `<line x1="${(x(0) + 6).toFixed(1)}" y1="${ly - 3}" x2="${(x(0) + 26).toFixed(1)}" y2="${ly - 3}" stroke="#000" stroke-width="1.6" stroke-dasharray="5,3"/>`;
  s += `<circle cx="${(x(0) + 16).toFixed(1)}" cy="${ly - 3}" r="3.2" fill="#fff" stroke="#000" stroke-width="1.2"/>`;
  s += `<text x="${(x(0) + 32).toFixed(1)}" y="${ly}" font-size="12.5">native, ARM64 assembly</text>`;
  // conclusion box
  s += `<rect x="${W - R + 12}" y="${T + 6}" width="${R - 26}" height="112" fill="#f4f4f4" stroke="#888" stroke-width="0.5"/>`;
  s += `<text x="${W - R + 20}" y="${T + 26}" font-size="12" font-weight="bold">The ratio is flat.</text>`;
  const lines = ["Thread-synchronisation overhead", "would grow with thread count.", "It does not. The 1-thread build", "has no threading at all and is", "still 4.86×. The gap is code", "generation, not field arithmetic."];
  lines.forEach((t, i) => s += `<text x="${W - R + 20}" y="${T + 44 + i * 13}" font-size="11" fill="#222">${esc(t)}</text>`);
  return s + `</svg>`;
}

/* ---------- Chart C: memory ---------- */
function chartMemory() {
  const W = 720, H = 196, L = 262, R = 44, T = 28, B = 38;
  const pw = W - L - R, ph = H - T - B;
  const max = 3751, x = (v) => (v / max) * pw;
  const rows = [
    { label: "device RAM (Galaxy A12)", v: 3751, disp: "3,751", fill: "#fff", stroke: "#000", note: "" },
    { label: "WASM address space reserved", v: 2048, disp: "2,048", fill: "#eee", stroke: "#888", note: "reserved, not resident" },
    { label: "peak RSS under 900 MB ballast", v: 378.8, disp: "378.8", fill: "#555", stroke: "#000", note: "10.1% of RAM · survived 20/20" },
    { label: "peak RSS, no background load", v: 361.5, disp: "361.5", fill: "#555", stroke: "#000", note: "9.6% of RAM · survived 20/20" },
  ];
  const band = ph / rows.length, bh = 18;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" ${F} font-size="13">`;
  for (let v = 0; v <= 3500; v += 500) {
    s += `<line x1="${(L + x(v)).toFixed(1)}" y1="${T - 5}" x2="${(L + x(v)).toFixed(1)}" y2="${T + ph}" stroke="#ddd" stroke-width="0.5"/>`;
    s += `<text x="${(L + x(v)).toFixed(1)}" y="${T + ph + 16}" text-anchor="middle" font-size="11" fill="#333">${v}</text>`;
  }
  s += `<text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle" font-size="11.5" fill="#333">megabytes</text>`;
  rows.forEach((r, i) => {
    const y0 = T + i * band + (band - bh) / 2;
    s += `<text x="${L - 7}" y="${y0 + bh - 4}" text-anchor="end" font-size="12">${esc(r.label)}</text>`;
    s += `<rect x="${L}" y="${y0}" width="${x(r.v).toFixed(1)}" height="${bh}" fill="${r.fill}" stroke="${r.stroke}" stroke-width="0.6"/>`;
    s += `<text x="${(L + x(r.v) + 5).toFixed(1)}" y="${y0 + bh - 4}" font-size="11">${r.disp} ${r.note ? " · " + esc(r.note) : ""}</text>`;
  });
  return s + `</svg>`;
}

writeFileSync("_chartA.svg", chartEngines());
writeFileSync("_chartB.svg", chartThreads());
writeFileSync("_chartC.svg", chartMemory());
console.log("wrote _chartA.svg _chartB.svg _chartC.svg");
