#!/bin/sh
# Builds the system the properties are checked on: Core with an observer summand that
# signals a state where more digits are held than the limit allows, and the initial state.
set -e
cd "$(dirname "$0")"
sed 's/^%@observers$/  + (whole + frac > limit) -> too_many . Core()/' ../core.mcrl2 \
  | sed 's/^act  c_digit: Nat;/act  too_many;\n     c_digit: Nat;/' > system.mcrl2
cat ../codegen-init.mcrl2 >> system.mcrl2
