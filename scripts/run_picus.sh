#!/usr/bin/env bash
# Self-audit Step 1: Picus (Veridise) SMT under-constrained detection over every
# deployed circuit. Runs in WSL; Picus at /opt/Picus, racket 9.3 at /opt/racket,
# z3 as the SMT backend. Exit-code legend (picus/exit.rkt):
#   8 = safe (properly constrained)   9 = unsafe (underconstrained)   0 = unknown
set -u
export PATH="/opt/racket/bin:$HOME/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OUT="$REPO/docs/self-audit"
mkdir -p "$OUT"
cd /opt/Picus

SOLVER=z3
echo "Picus:  $(git -C /opt/Picus log -1 --format='%h %ci')"
echo "racket: $(racket --version)"
echo "solver: $SOLVER $(z3 --version)"
echo "legend: exit 8 = properly constrained | 9 = underconstrained | 0 = unknown"
echo "======================================================================"

run_one () {
  local name="$1" tmo="${2:-30000}"
  local r1cs="$REPO/build/$name.r1cs"
  echo
  echo "#### Picus: $name   (z3, ${tmo}ms/query)"
  ./run-picus --solver "$SOLVER" --timeout "$tmo" --json "$OUT/picus_$name.json" "$r1cs" 2>&1 | grep -vE '^\s*$'
  echo "#### exit: $?"
}

run_one wedge_mem_w8_d9_split        30000
run_one wedge_mem_w8_d9_split_rev64  45000
run_one wedge_mem_w8_d9_split_rev256 60000
run_one wedge_mem_w8_d9_split_rev1024 90000
run_one wedge_mem_w8_d9              30000
run_one wedge_direct_k3             90000

echo
echo "======================================================================"
grep -h '"msg"' "$OUT"/picus_*.json | sed 's/.*"msg":"//;s/".*//' | sort | uniq -c
