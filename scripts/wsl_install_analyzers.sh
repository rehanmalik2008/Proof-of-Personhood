#!/usr/bin/env bash
# Reproducible install of the two static analyzers used by the self-audit,
# inside a fresh Ubuntu 22.04 (WSL or container). Idempotent-ish.
#
#   circomspect 0.9.0  (Trail of Bits) -- linter / dataflow
#   Picus       138b151 (Veridise)     -- SMT under-constrained detection
#
# Ubuntu 22.04 ships cargo 1.75 (too old for circomspect deps -> rustup stable)
# and racket 8.2 (too old for Picus -> Racket 9.3 from the official installer).
set -eux
export DEBIAN_FRONTEND=noninteractive
export PATH="$HOME/.cargo/bin:/opt/racket/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

apt-get update -qq
apt-get install -y -qq build-essential pkg-config libssl-dev libgmp-dev curl git wget z3

# ---- Rust (stable) + circomspect -------------------------------------------
if ! command -v rustup >/dev/null; then
  curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
fi
"$HOME/.cargo/bin/cargo" install circomspect --root /opt/circomspect
/opt/circomspect/bin/circomspect --help | head -3

# ---- Racket 9.3 + Picus ---------------------------------------------------
RK=9.3
URL="https://mirror.racket-lang.org/installers/${RK}/racket-${RK}-x86_64-linux-cs.sh"
cd /tmp
wget -q --tries=5 --retry-connrefused -c -O racket.sh "$URL"
REM=$(curl -fsSIL "$URL" | awk 'tolower($1)=="content-length:"{v=$2} END{print v+0}')
[ "$(stat -c%s racket.sh)" = "$REM" ]                 # fail loudly on a truncated download
rm -rf /opt/racket
printf 'yes\n\n\n\n' | sh /tmp/racket.sh --unix-style --dest /opt/racket
/opt/racket/bin/racket --version

[ -d /opt/Picus ] || git clone --depth 1 https://github.com/Veridise/Picus.git /opt/Picus
cd /opt/Picus
/opt/racket/bin/raco pkg install --auto --batch --no-docs --skip-installed
./run-picus 2>&1 | head -3 || true

echo "OK: circomspect at /opt/circomspect/bin, Picus at /opt/Picus (./run-picus)"
