#!/usr/bin/env bash
# Self-audit Step 1: run circomspect against every deployed circuit + the templates
# they instantiate. Runs inside WSL Ubuntu; circomspect at /opt/circomspect/bin.
set -u
export PATH="/opt/circomspect/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CIRC="$REPO/circuits"
LIB="$REPO/node_modules/circomlib/circuits"
OUT="$REPO/docs/self-audit"
mkdir -p "$OUT"

echo "circomspect: $(command -v circomspect)"
circomspect --help 2>&1 | sed -n '1,3p;/OPTIONS/,/verbose/p'
echo "circomlib: $(sed -n 's/.*\"version\": \"\([^\"]*\)\".*/\1/p' "$REPO/node_modules/circomlib/package.json" | head -1)"
echo "date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "======================================================================"

DEPLOYED="main_mem_w8_d9_split main_mem_w8_d9_split_rev64 main_mem_w8_d9_split_rev256 main_mem_w8_d9_split_rev1024 main_mem_w8_d9_rev64 main_mem_w8_d9_rev256 main_mem_w8_d9_rev1024 main_mem_w8_d9 main_wedge_direct_k3"
TEMPLATES="wedge_membership.circom wedge_revocation.circom wedge_core.circom wedge_residual.circom wedge_haggr.circom"

for c in $DEPLOYED; do
  echo
  echo "## circomspect [-l INFO]: $c.circom"
  timeout 240 circomspect -L "$LIB" -l INFO --sarif-file "$OUT/circomspect_$c.sarif" "$CIRC/$c.circom" 2>&1
  echo "## exit: $?"
done

echo
echo "=== direct pass on template files (not just the thin main_ wrappers) ==="
for f in $TEMPLATES; do
  echo
  echo "## circomspect [-l INFO]: $f"
  timeout 240 circomspect -L "$LIB" -l INFO "$CIRC/$f" 2>&1
  echo "## exit: $?"
done

echo
echo "=== SARIF result objects (deployed circuits) ==="
for c in $DEPLOYED; do
  n=$(sed -n 's/.*"results":\[\(.*\)\].*/\1/p' "$OUT/circomspect_$c.sarif" | tr -cd '{' | wc -c)
  echo "$c: results=$n  ($(wc -c < "$OUT/circomspect_$c.sarif") bytes)"
done
