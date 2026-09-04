# The paper

`proof-of-personhood-without-a-registry.pdf` is the single public research paper.
`MASTER-SPECIFICATION.md` in the repository root is its authoritative source; the
paper is that specification written for an outside reader, with the negative results
kept in.

## Rebuild

```bash
node paper/mkproof.mjs      # regenerates Appendix A: a real proof, its verification,
                            # the tampered-input negative control, artefact hashes
node paper/build.mjs        # regenerates the 3 charts, inlines them, renders the PDF
```

`build.mjs` needs Chrome or Chromium for the PDF step. It prints the page count. If
no browser is found it still writes `_built.html`, which prints to PDF from any
browser.

## Files

| file | role |
|---|---|
| `paper.html` | the source. Chart positions are `<!--CHART_A-->` placeholders. |
| `mkcharts.mjs` | emits the three measurement charts as SVG. Geometry is computed from the same numbers that appear in `results/*.json`; nothing is positioned by hand. |
| `mkproof.mjs` | proves, verifies, runs the negative control, hashes the artefacts. Exits non-zero if the proof fails to verify, if a tampered input is accepted, or if the public signal count is not 6. |
| `build.mjs` | charts → inline → PDF. |
| `_built.html`, `_chart*.svg`, `_proof.json`, `_appendixA.txt` | generated, not checked in. |

## Every number in the paper traces to a measurement

| paper | source |
|---|---|
| Table 2, constraint counts | `snarkjs r1cs info build/wedge_mem_w8_d9.r1cs` (4,309) and `wedge_direct_k3.r1cs` (13,099) |
| Table 3, Figure 2, memory | `results/phone-SM-A125F-2026-09-02T17-50-43-934Z.json` (361.5 MB) and `...T17-54-15-218Z.json` (378.8 MB under 900 MB ballast) |
| Table 4, Figure 3, prover times | `results/CPU-WALL-INVESTIGATION.json`, `results/rapidsnark-SM-A125F-*.json`, `results/wasmprover-SM-A125F-*.json` |
| Table 5, Figure 4, thread sweep | `results/attrib-native-SM-A125F-*.json`, `results/attrib-wasm-SM-A125F-*.json` |
| Table 6, deployment matrix | measured rows as above; desktop row from `results/sample-desktop-i7-9850H.json`; the mid-range row is labelled projected |
| Table 7, broadcast sizes | `WITNESS-MAINTENANCE.md` §2 |
| Tables 9–11, Appendix A | `node paper/mkproof.mjs` |

Projected figures are labelled "projected" in the text. The mid-range deployment row
and the native end-to-end figure are the only two.
