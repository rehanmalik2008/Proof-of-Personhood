#!/usr/bin/env bash
# Install Node in WSL so the prover can be run under a cgroup memory limit
# (scripts/mem_ceiling_test.sh, Gate 3 simulated evidence).
set -eux
export DEBIAN_FRONTEND=noninteractive
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
command -v node >/dev/null && { node -v; exit 0; }
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y -qq nodejs
node -v; npm -v
