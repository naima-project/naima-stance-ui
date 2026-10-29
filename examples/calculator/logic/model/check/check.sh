#!/bin/sh
# Checks every property of model/properties on the calculator's control (mCRL2 202607.0).
# The state space is small (about 16,000 states with the 12-digit limit), so each formula
# is checked on the linear process directly (lps2pbes, then pbessolve).
set -e
cd "$(dirname "$0")"
sh build.sh
mcrl22lps -q system.mcrl2 system.lps
lps2lts -q -D system.lps system.lts 2>deadlock.log || true
if [ -s deadlock.log ]; then echo "deadlock:"; cat deadlock.log; exit 1; fi
ltsinfo system.lts 2>&1 | grep -E "states|transitions" | head -2
status=0
for f in ../properties/*.mcf; do
  lps2pbes -q -f "$f" system.lps prop.pbes
  r=$(pbessolve -q prop.pbes)
  echo "$(basename "$f" .mcf): $r"
  [ "$r" = "true" ] || status=1
done
rm -f prop.pbes deadlock.log system.lps system.lts system.mcrl2
exit $status
