#!/usr/bin/env bash
#
# Docker cleanup script – frees disk space by removing unneeded Docker resources.
# Usage:
#   ./docker_cleanup.sh           # Safe cleanup (default)
#   ./docker_cleanup.sh --dry-run # Show what would be removed
#   ./docker_cleanup.sh --all     # Aggressive: also remove unused images & volumes
#

set -e

DRY_RUN=false
AGGRESSIVE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --all)     AGGRESSIVE=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--all]"
      echo "  --dry-run  Show what would be removed without deleting"
      echo "  --all      Also remove unused images and volumes (aggressive)"
      exit 0
      ;;
  esac
done

if ! command -v docker &> /dev/null; then
  echo "Docker is not installed or not in PATH."
  exit 1
fi

echo "=== Docker disk usage (before) ==="
docker system df
echo

run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would run: $*"
  else
    "$@"
  fi
}

echo "--- Removing stopped containers, unused networks, dangling images ---"
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] docker system prune -f"
  docker system df -v 2>/dev/null | head -80 || true
else
  docker system prune -f
fi
echo

echo "--- Removing build cache ---"
run_cmd docker builder prune -f
echo

if [ "$AGGRESSIVE" = true ]; then
  echo "--- Aggressive: removing all unused images (not just dangling) ---"
  run_cmd docker image prune -a -f
  echo
  echo "--- Aggressive: removing unused volumes ---"
  run_cmd docker volume prune -f
  echo
fi

if [ "$DRY_RUN" = false ]; then
  echo "=== Docker disk usage (after) ==="
  docker system df
  echo
  echo "Cleanup done."
else
  echo "Dry run finished. Run without --dry-run to perform cleanup."
fi
