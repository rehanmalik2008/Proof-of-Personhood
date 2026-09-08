#!/usr/bin/env bash
# ===========================================================================
# Simulated memory-ceiling test  (closing-what-code-can-close.md §2, Gate 3)
#
#   sudo bash scripts/mem_ceiling_test.sh [ceiling_MB ...]
#
# Runs the deployed prover inside a cgroup v2 slice with a hard memory.max and
# SWAP DISABLED, and reports, per ceiling: did it complete, peak memory the
# cgroup actually charged, whether the kernel OOM-killed it, and prove time.
#
# WHAT THIS IS NOT
#   Gate 3 asks for peak RSS and p95 on a physical device with <= 3 GB of RAM.
#   A cgroup cap on a desktop x86 core is NOT that device: it does not reproduce
#   a weak in-order mobile core, Android's allocator, its low-memory killer, or
#   a browser tab's effective budget. Every number this prints must be labelled
#   "simulated on <machine>, pending confirmation on physical <=3 GB hardware".
#   It brackets the likely behaviour. It does not close the gate.
#
# Swap is pinned to 0 on purpose: with swap available a cgroup under pressure
# pages out instead of failing, which would silently turn a memory test into a
# throughput test and report a pass that a real phone would not reproduce.
# ===========================================================================
set -u
CEILINGS=("$@"); [ ${#CEILINGS[@]} -eq 0 ] && CEILINGS=(4096 3072 2560 2048 1536 1024)
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CG=/sys/fs/cgroup/memceil
PROBE="$REPO/scripts/mem_ceiling_probe.mjs"

[ "$(id -u)" -eq 0 ] || { echo "must run as root (needs cgroup write access)"; exit 2; }
grep -q memory /sys/fs/cgroup/cgroup.controllers || { echo "cgroup v2 memory controller unavailable"; exit 2; }

echo "host      : $(uname -sr)"
echo "cpu       : $(sed -n 's/^model name\s*: //p' /proc/cpuinfo | head -1)"
echo "total RAM : $(free -m | awk '/^Mem:/{print $2}') MB"
echo "node      : $(node -v)"
echo "circuit   : wedge_mem_w8_d9_split (4,309 constraints), witness-calc + Groth16 prove + verify"
echo "swap      : disabled inside the cgroup (memory.swap.max=0)"
echo "=========================================================================="
printf '%-10s %-8s %-12s %-11s %-9s %s\n' "ceiling" "result" "cgroup peak" "self VmHWM" "prove ms" "note"

# make sure the memory controller is delegated to children
grep -q memory /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || \
  echo "+memory" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true

RESULTS="$REPO/docs/self-audit/mem_ceiling_results.txt"
mkdir -p "$(dirname "$RESULTS")"
: > "$RESULTS.tmp"

for MB in "${CEILINGS[@]}"; do
  rmdir "$CG" 2>/dev/null
  mkdir -p "$CG" || { echo "cannot create $CG"; exit 2; }
  echo $((MB * 1024 * 1024)) > "$CG/memory.max"
  echo 0                     > "$CG/memory.swap.max" 2>/dev/null || true
  echo 0                     > "$CG/memory.peak"     2>/dev/null || true

  OUT=$(
    ( echo $BASHPID > "$CG/cgroup.procs"
      cd "$REPO" && exec node "$PROBE" ) 2>&1
  )
  RC=$?
  PEAK=$(( $(cat "$CG/memory.peak" 2>/dev/null || echo 0) / 1048576 ))
  OOM=$(awk '/^oom_kill /{print $2}' "$CG/memory.events" 2>/dev/null || echo 0)
  JSON=$(printf '%s\n' "$OUT" | sed -n 's/^PROBE_JSON //p' | tail -1)
  VMHWM=$(printf '%s' "$JSON" | sed -n 's/.*"peakRssMB":\([0-9]*\).*/\1/p')
  PMS=$(printf '%s'  "$JSON" | sed -n 's/.*"proveMs":\([0-9]*\).*/\1/p')
  ERR=$(printf '%s'  "$JSON" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')

  if [ "$RC" -eq 0 ]; then RES=PASS; NOTE="verified"
  elif [ "${OOM:-0}" -gt 0 ]; then RES=FAIL; NOTE="OOM-killed by kernel (oom_kill=$OOM)"
  else RES=FAIL; NOTE="${ERR:-exit $RC}"; fi

  printf '%-10s %-8s %-12s %-11s %-9s %s\n' "${MB}MB" "$RES" "${PEAK}MB" "${VMHWM:-–}MB" "${PMS:-–}" "$NOTE"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "${MB}MB" "$RES" "${PEAK}MB" "${VMHWM:-NA}MB" "${PMS:-NA}" "$NOTE" >> "$RESULTS.tmp"
done
rmdir "$CG" 2>/dev/null

{
  echo "# simulated memory-ceiling test — Gate 3 supporting evidence, NOT gate closure"
  echo "# host: $(uname -sr) | $(sed -n 's/^model name\s*: //p' /proc/cpuinfo | head -1)"
  echo "# date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# circuit: wedge_mem_w8_d9_split, witness-calc + Groth16 prove + verify, swap disabled"
  echo "# columns: ceiling, result, cgroup peak, process VmHWM, prove ms, note"
  cat "$RESULTS.tmp"
} > "$RESULTS"
rm -f "$RESULTS.tmp"
echo "=========================================================================="
echo "wrote $RESULTS"
echo
echo "REMINDER: these are SIMULATED ceilings on desktop x86. Gate 3 requires a"
echo "physical device with <= 3 GB RAM. This evidence brackets; it does not close."
