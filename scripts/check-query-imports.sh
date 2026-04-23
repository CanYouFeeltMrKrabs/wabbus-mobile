#!/usr/bin/env bash
#
# Sealed query layer enforcement — Layer 3 of 3.
#
# Hard CI/merge gate. Fails if either of two boundary violations exist:
#   1. Any file outside lib/queries/_internal/ imports '@tanstack/react-query'.
#   2. Any file outside lib/queries/** imports from '@/lib/queries/_internal/*'.
#
# Intentionally dumb: no AST, no ESLint dependency, no config-drift surface.
# This is the deterministic gatekeeper — if it passes, the topology rule is
# satisfied regardless of whether ESLint config is correct.
#
# All domains are migrated and lib/queryKeys.ts is deleted. STRICT=1 is the
# default — any boundary violation fails the check.
#
# Mode:
#   default       — fail with exit 1 when violations exist (hard mode)
#   STRICT=0      — report findings only, always exit 0 (soft override)

set -euo pipefail

cd "$(dirname "$0")/.."

violations=0

# ─── Check 1: direct @tanstack/react-query imports outside the bridge file ──
# Allowed only in lib/queries/_internal/react-query.ts.
direct=$(
  grep -rln --include='*.ts' --include='*.tsx' \
    -E "from ['\"]@tanstack/react-query['\"]" \
    app components hooks lib i18n 2>/dev/null \
  | grep -v '^lib/queries/_internal/react-query\.ts$' \
  | grep -v '^lib/queryClient\.ts$' \
  | grep -v '^components/QueryProvider\.tsx$' \
  || true
)

if [ -n "$direct" ]; then
  echo "[FAIL] Direct '@tanstack/react-query' imports found outside lib/queries/_internal/react-query.ts:"
  echo "$direct" | sed 's/^/   /'
  echo ""
  violations=$((violations + 1))
fi

# ─── Check 2: imports of lib/queries/_internal/* from outside lib/queries ──
internal=$(
  grep -rln --include='*.ts' --include='*.tsx' \
    -E "from ['\"](@/lib/queries/_internal/|\.\./.*/queries/_internal/|\./_internal/)" \
    app components hooks i18n 2>/dev/null \
  || true
)

if [ -n "$internal" ]; then
  echo "[FAIL] Imports of 'lib/queries/_internal/*' found outside lib/queries/**:"
  echo "$internal" | sed 's/^/   /'
  echo ""
  violations=$((violations + 1))
fi

if [ "$violations" -eq 0 ]; then
  echo "[OK] Sealed query layer: no boundary violations."
  exit 0
fi

echo "Sealed query layer policy: see .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §1.2"

# Hard mode (default): fail on violations. Set STRICT=0 to override.
if [ "${STRICT:-1}" = "0" ]; then
  echo ""
  echo "(Reporting only — STRICT=0 override active.)"
  exit 0
fi

exit 1
