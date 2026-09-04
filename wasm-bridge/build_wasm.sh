#!/usr/bin/env bash
# Compile rapidsnark's C++ Groth16 prover to WASM (Emscripten), threaded + SIMD.
# mini-gmp (64-bit limbs) substitutes for GMP -> no autotools.
set -e
SP="${WBSP:?set WBSP to a working dir with emsdk/ and rapidsnark-src/}"
RS="$SP/rapidsnark-src"
MG="$RS/depends/gmp-dl/gmp-6.3.0/mini-gmp"
OUT="$SP/wasmprover"
EMROOT="$SP/emsdk/upstream/emscripten"
export EM_CONFIG="$SP/emsdk/.emscripten"
export EMSDK="$SP/emsdk"
EMXX="$EMROOT/em++.exe"
EMCC="$EMROOT/emcc.exe"

rm -rf "$OUT"; mkdir -p "$OUT/inc"
cd "$OUT"

# --- gmp.h shim over mini-gmp + the 3 missing bitwise mpn ops ---
cat > inc/gmp.h <<'EOF'
#ifndef RS_WASM_GMP_SHIM
#define RS_WASM_GMP_SHIM
#include "mini-gmp.h"
#ifdef __cplusplus
extern "C" {
#endif
void mpn_and_n (mp_ptr rp, mp_srcptr s1p, mp_srcptr s2p, mp_size_t n);
void mpn_ior_n (mp_ptr rp, mp_srcptr s1p, mp_srcptr s2p, mp_size_t n);
void mpn_xor_n (mp_ptr rp, mp_srcptr s1p, mp_srcptr s2p, mp_size_t n);
#ifdef __cplusplus
}
#endif
#endif
EOF
cp "$MG/mini-gmp.h" inc/
cat > gmp_extra.c <<'EOF'
#include "mini-gmp.h"
void mpn_and_n(mp_ptr r, mp_srcptr a, mp_srcptr b, mp_size_t n){ for(mp_size_t i=0;i<n;i++) r[i]=a[i]&b[i]; }
void mpn_ior_n(mp_ptr r, mp_srcptr a, mp_srcptr b, mp_size_t n){ for(mp_size_t i=0;i<n;i++) r[i]=a[i]|b[i]; }
void mpn_xor_n(mp_ptr r, mp_srcptr a, mp_srcptr b, mp_size_t n){ for(mp_size_t i=0;i<n;i++) r[i]=a[i]^b[i]; }
EOF

cat > prelude.h <<'PRE'
#pragma once
#include <cstdint>
#include <cstddef>
typedef unsigned int uint;
typedef uint8_t  u_int8_t;
typedef uint16_t u_int16_t;
typedef uint32_t u_int32_t;
typedef uint64_t u_int64_t;
PRE

# --- flags ---
LIMB='-DMINI_GMP_LIMB_TYPE=long\ long'
COMMON="-O3 -pthread -fopenmp -msimd128 -DNDEBUG"
INCS="-I$OUT/inc -I$RS/build -I$RS/depends/ffiasm/c -I$RS/src -I$RS/depends/json/single_include"
DEFS="-DUSE_OPENMP"

echo "== compile mini-gmp + extra (C) =="
"$EMCC" $COMMON -Iinc -DMINI_GMP_LIMB_TYPE="long long" -c "$MG/mini-gmp.c" -o mini-gmp.o
"$EMCC" $COMMON -Iinc -DMINI_GMP_LIMB_TYPE="long long" -c gmp_extra.c -o gmp_extra.o

# --- source list ---
FIELD="$RS/build/fr.cpp $RS/build/fr_generic.cpp $RS/build/fr_raw_generic.cpp $RS/build/fq.cpp $RS/build/fq_generic.cpp $RS/build/fq_raw_generic.cpp"
FFIASM="$RS/depends/ffiasm/c/misc.cpp $RS/depends/ffiasm/c/naf.cpp $RS/depends/ffiasm/c/splitparstr.cpp $RS/depends/ffiasm/c/alt_bn128.cpp"
RSSRC="$RS/src/main_prover.cpp $RS/src/prover.cpp $RS/src/verifier.cpp $RS/src/zkey_utils.cpp $RS/src/wtns_utils.cpp $RS/src/binfile_utils.cpp $RS/src/fileloader.cpp"

echo "== compile + link prover.js =="
"$EMXX" $COMMON -std=c++17 -include "$OUT/prelude.h" $INCS $DEFS \
  $FIELD $FFIASM $RSSRC mini-gmp.o gmp_extra.o \
  -DMINI_GMP_LIMB_TYPE="long long" \
  -s MODULARIZE=1 -s EXPORT_NAME=RSProver -s EXPORT_ES6=0 \
  -s EXPORTED_RUNTIME_METHODS=callMain,FS,cwrap,PThread \
  -s INVOKE_RUN=0 -s EXIT_RUNTIME=0 \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=268435456 -s MAXIMUM_MEMORY=2147483648 \
  -s PTHREAD_POOL_SIZE=8 -s PTHREAD_POOL_SIZE_STRICT=0 -s PROXY_TO_PTHREAD=1 \
  -s FORCE_FILESYSTEM=1 -s ASSERTIONS=1 \
  -lnodefs.js \
  -o prover.js

ls -la prover.js prover.wasm 2>/dev/null
echo "DONE"
