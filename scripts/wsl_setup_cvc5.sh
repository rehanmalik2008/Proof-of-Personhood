#!/bin/bash
set -e
WORK=$HOME/cvc5dl
mkdir -p "$WORK" && cd "$WORK"
if [ ! -x /opt/cvc5/bin/cvc5 ] || ! /opt/cvc5/bin/cvc5 --version 2>/dev/null | grep -q 1.3.4; then
  echo "downloading cvc5-1.3.4 static-gpl (has --cocoa / finite fields)..."
  curl -sL -o cvc5.zip "https://github.com/cvc5/cvc5/releases/download/cvc5-1.3.4/cvc5-Linux-x86_64-static-gpl.zip"
  rm -rf x && mkdir x && unzip -o -q cvc5.zip -d x
  BIN=$(find x -name cvc5 -type f | head -1)
  sudo mkdir -p /opt/cvc5/bin
  sudo cp "$BIN" /opt/cvc5/bin/cvc5
  sudo chmod +x /opt/cvc5/bin/cvc5
fi
/opt/cvc5/bin/cvc5 --version | head -1
echo "=== FF sanity: x^2=4 & x!=2  -> SAT (x = p-2) ==="
cat > /tmp/s1.smt2 <<'EOF'
(set-logic QF_FF)
(set-option :produce-models true)
(define-sort F () (_ FiniteField 21888242871839275222246405745257275088548364400416034343698204186575808495617))
(declare-fun x () F)
(assert (= (ff.mul x x) (ff.add (as ff1 F) (as ff1 F) (as ff1 F) (as ff1 F))))
(assert (not (= x (ff.add (as ff1 F) (as ff1 F)))))
(check-sat)
(get-value (x))
EOF
/opt/cvc5/bin/cvc5 /tmp/s1.smt2
echo "=== FF sanity: also x!=-2  -> UNSAT ==="
cat > /tmp/s2.smt2 <<'EOF'
(set-logic QF_FF)
(define-sort F () (_ FiniteField 21888242871839275222246405745257275088548364400416034343698204186575808495617))
(declare-fun x () F)
(assert (= (ff.mul x x) (ff.add (as ff1 F) (as ff1 F) (as ff1 F) (as ff1 F))))
(assert (not (= x (ff.add (as ff1 F) (as ff1 F)))))
(assert (not (= x (ff.neg (ff.add (as ff1 F) (as ff1 F))))))
(check-sat)
EOF
/opt/cvc5/bin/cvc5 /tmp/s2.smt2
echo "DONE"
