#!/usr/bin/env bash
# Start the auth-E2E stack: scratch Django (127.0.0.1:8011, throw-away SQLite) + `next dev` (127.0.0.1:3011).
# Usage: e2e/auth-stack/start_stack.sh [--fresh-db]
# Work dir (DB, mail, logs, pids): ${AUTH_E2E_DIR:-${TMPDIR:-/tmp}/landars-auth-e2e}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$HERE/../.." && pwd)"          # frontend-marketplace/
REPO="$(cd "$FRONTEND/.." && pwd)"             # repo root
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
E2E_DIR="${AUTH_E2E_DIR:-$TMP_BASE/landars-auth-e2e}"; E2E_DIR="${E2E_DIR%/}"
PY="${AUTH_E2E_PYTHON:-$REPO/backend/venv/bin/python}"
export AUTH_E2E_DIR="$E2E_DIR" DJANGO_SETTINGS_MODULE=e2e_settings PYTHONPATH="$HERE" PYTHONDONTWRITEBYTECODE=1
mkdir -p "$E2E_DIR/run" "$E2E_DIR/mail"
if lsof -i :8011 -i :3011 -sTCP:LISTEN >/dev/null 2>&1; then echo "ports 8011/3011 already in use"; lsof -i :8011 -i :3011 -sTCP:LISTEN | head -5; exit 1; fi
if [ "$1" = "--fresh-db" ] || [ ! -f "$E2E_DIR/e2e.sqlite3" ]; then
  rm -f "$E2E_DIR/e2e.sqlite3" "$E2E_DIR"/mail/*
  (cd "$REPO/backend" && "$PY" manage.py migrate --noinput >"$E2E_DIR/run/migrate.log" 2>&1) || { echo "migrate failed"; tail -5 "$E2E_DIR/run/migrate.log"; exit 1; }
fi
(cd "$REPO/backend" && nohup "$PY" manage.py runserver 127.0.0.1:8011 --noreload >"$E2E_DIR/run/django.log" 2>&1 & echo $! >"$E2E_DIR/run/django.pid")
(cd "$FRONTEND" && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8011 NEXT_TELEMETRY_DISABLED=1 nohup npm run dev -- -p 3011 >"$E2E_DIR/run/next.log" 2>&1 & echo $! >"$E2E_DIR/run/next.pid")
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:8011/api/auth/csrf-token/ 2>/dev/null && break; sleep 1; done
curl -sS -o /dev/null -w "django csrf-token: %{http_code}\n" http://127.0.0.1:8011/api/auth/csrf-token/
# warm Next (first compile of each route is slow)
for i in $(seq 1 90); do code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 http://127.0.0.1:3011/auth/ 2>/dev/null); [ "$code" = "200" ] && break; sleep 2; done
echo "next /auth/: $code"
for p in "" "verify-email/?token=x" "reset-password/?token=x" "cart/"; do curl -s -o /dev/null --max-time 120 "http://127.0.0.1:3011/$p"; done
curl -s -o /dev/null -w "proxied csrf-token via next: %{http_code}\n" --max-time 30 http://127.0.0.1:3011/api/auth/csrf-token/
echo "work dir: $E2E_DIR"
