// Builds the paper: regenerates the charts, inlines them into paper.html, and
// renders a PDF with headless Chrome.   node paper/build.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)));
const p = (f) => join(HERE, f);

execFileSync(process.execPath, [p("mkcharts.mjs")], { cwd: HERE, stdio: "inherit" });

let html = readFileSync(p("paper.html"), "utf8");
for (const [tag, file] of [["CHART_A", "_chartA.svg"], ["CHART_B", "_chartB.svg"], ["CHART_C", "_chartC.svg"]]) {
  const svg = readFileSync(p(file), "utf8");
  if (!html.includes(`<!--${tag}-->`)) throw new Error(`missing placeholder ${tag}`);
  html = html.replace(`<!--${tag}-->`, svg);
}
writeFileSync(p("_built.html"), html);
console.log("inlined 3 charts -> _built.html");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find(existsSync);
if (!CHROME) { console.error("Chrome not found; _built.html is ready to print manually."); process.exit(1); }

const out = p("proof-of-personhood-without-a-registry.pdf");
execFileSync(CHROME, [
  "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
  `--print-to-pdf=${out.replace(/\//g, "\\")}`,
  "file:///" + p("_built.html").replace(/\\/g, "/"),
], { stdio: ["ignore", "ignore", "pipe"] });

const pdf = readFileSync(out).toString("latin1");
const counts = (pdf.match(/\/Count\s+(\d+)/g) || []).map((s) => +s.split(/\s+/)[1]);
console.log(`wrote ${out}`);
console.log(`pages: ${Math.max(...counts, 0)}`);
