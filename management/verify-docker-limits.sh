#!/usr/bin/env bash
# Verify docker compose memory limits are applied (HostConfig.Memory > 0).
# Usage: ./scripts/verify-docker-limits.sh [compose-project-name]
set -euo pipefail

PROJECT="${1:-foodplatform}"
SERVICES=(postgres redis backend)

failed=0
for svc in "${SERVICES[@]}"; do
  cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    echo "WARN: service '$svc' not running — skip"
    continue
  fi
  mem="$(docker inspect "$cid" --format '{{.HostConfig.Memory}}')"
  name="$(docker inspect "$cid" --format '{{.Name}}')"
  echo "${name} Memory=${mem}"
  if [[ "$mem" == "0" ]]; then
    echo "FAIL: ${name} has no memory limit (0)"
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  echo "Memory limits not enforced. Use top-level mem_limit in docker-compose.yml."
  exit 1
fi

echo "OK: memory limits are set."
