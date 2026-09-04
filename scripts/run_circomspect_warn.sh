#!/usr/bin/env bash
set -u
export PATH="/opt/circomspect/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CIRC="$REPO/circuits"; LIB="$REPO/node_modules/circomlib/circuits"

echo "### WARNING+ only, INSTANTIATED deployed entrypoints"
for c in main_mem_w8_d9_split main_mem_w8_d9_split_rev64 main_mem_w8_d9_split_rev1024 main_mem_w8_d9_rev1024 main_wedge_direct_k3; do
  printf '%-34s ' "$c"
  out=$(circomspect -L "$LIB" -l WARNING "$CIRC/$c.circom" 2>&1)
  echo "$out" | grep -qE '^(warning|error):' && echo "$out" | grep -E '^(warning|error):|issues found' || echo "(no warnings/errors)"
done

echo
echo "### WARNING+ only, SYMBOLIC template files"
for f in wedge_membership.circom wedge_revocation.circom wedge_core.circom wedge_haggr.circom wedge_residual.circom; do
  echo "--- $f ---"
  circomspect -L "$LIB" -l WARNING "$CIRC/$f" 2>&1 | grep -E '^(warning|error):|issues found' || echo "(no warnings/errors)"
done
