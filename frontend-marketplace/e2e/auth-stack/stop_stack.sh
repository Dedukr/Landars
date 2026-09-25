#!/usr/bin/env bash
# Stop the auth-E2E stack (Django :8011, Next :3011) and remove its pid files. Only touches those two ports.
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
E2E_DIR="${AUTH_E2E_DIR:-$TMP_BASE/landars-auth-e2e}"; E2E_DIR="${E2E_DIR%/}"
for f in django next; do
  if [ -f "$E2E_DIR/run/$f.pid" ]; then kill "$(cat "$E2E_DIR/run/$f.pid")" 2>/dev/null; rm -f "$E2E_DIR/run/$f.pid"; fi
done
sleep 1
for port in 8011 3011; do pids=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null); [ -n "$pids" ] && kill $pids 2>/dev/null; done
sleep 1
for port in 8011 3011; do pids=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null); [ -n "$pids" ] && kill -9 $pids 2>/dev/null; done
pkill -f "next dev --turbopack -p 3011" 2>/dev/null
sleep 1
lsof -i :8011 -i :3011 2>/dev/null | head -3; echo "stopped"
