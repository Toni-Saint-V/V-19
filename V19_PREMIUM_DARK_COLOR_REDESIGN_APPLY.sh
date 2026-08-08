#!/usr/bin/env bash
(
  set -euo pipefail
  umask 077

  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "ОШИБКА: запусти скрипт внутри Git-проекта V-19" >&2
    exit 1
  }
  cd "$ROOT"

  [ -f package.json ] && [ -f src/shared/ui/tokens/index.css ] || {
    echo "ОШИБКА: текущий репозиторий не похож на V-19" >&2
    exit 1
  }

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PATCH=""
  for CANDIDATE in \
    "$SCRIPT_DIR/V19_PREMIUM_DARK_COLOR_REDESIGN.patch" \
    "$ROOT/V19_PREMIUM_DARK_COLOR_REDESIGN.patch" \
    "$HOME/Downloads/V19_PREMIUM_DARK_COLOR_REDESIGN.patch"
  do
    if [ -f "$CANDIDATE" ]; then
      PATCH="$CANDIDATE"
      break
    fi
  done

  [ -n "$PATCH" ] || {
    echo "ОШИБКА: не найден V19_PREMIUM_DARK_COLOR_REDESIGN.patch" >&2
    exit 1
  }

  EXPECTED_SHA="18a91733f200257462a43041a8894a28cf76ad69a74d11459310992f23e4ac22"
  ACTUAL_SHA="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
  [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || {
    echo "ОШИБКА: SHA-256 patch-файла не совпадает" >&2
    exit 1
  }

  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP="$(dirname "$ROOT")/V19-before-premium-dark-$STAMP.tar.gz"

  git ls-files --cached --others --exclude-standard -z | \
    COPYFILE_DISABLE=1 tar --null \
      --exclude='.env' \
      --exclude='.env.*' \
      --exclude='*/.env' \
      --exclude='*/.env.*' \
      --exclude='node_modules' \
      --exclude='*/node_modules' \
      -czf "$BACKUP" --files-from=-

  echo "PASS backup: $BACKUP"

  if git apply --reverse --check "$PATCH" >/dev/null 2>&1; then
    echo "PASS: редизайн уже применён"
  else
    git apply --check "$PATCH"
    git apply "$PATCH"
    echo "PASS: patch применён"
  fi

  git diff --check

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm install 22 >/dev/null
    nvm use 22 >/dev/null
  fi

  echo "Node: $(node --version)"
  echo "npm:  $(npm --version)"

  npm ci
  npm run format:check
  npm run typecheck
  npm run lint

  VITE_SUPABASE_BACKEND_TARGET=local-demo \
  VITE_SUPABASE_SANDBOX_PROBE_ENABLED=false \
    ./node_modules/.bin/vitest run tests/unit/drawerInteractions.spec.tsx

  npm run build:local-demo
  npm run verify:deployment-headers

  echo ""
  echo "======================================================"
  echo "PASS: premium dark source patch applied and validated"
  echo "Backup: $BACKUP"
  echo "No commit, push, deploy or Supabase mutation performed"
  echo "======================================================"
)
