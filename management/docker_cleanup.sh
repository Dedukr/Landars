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

# Human-readable size from KiB (df -k units).
human_kib() {
  awk -v kib="${1:-0}" 'BEGIN {
    bytes = kib * 1024
    split("B KiB MiB GiB TiB", u, " ")
    for (i = 5; i >= 1; i--) {
      p = 1024 ^ (i - 1)
      if (bytes >= p || i == 1) {
        printf "%.1f %s", bytes / p, u[i]
        break
      }
    }
  }'
}

# Show host disk taken / total / free (and Docker.raw on macOS if present).
show_host_disk() {
  local when="$1"
  echo "=== Host disk space (${when}) ==="

  # Prefer the filesystem that holds Docker Desktop data when present.
  local docker_raw="${HOME}/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"
  local target="/"
  if [ -e "$docker_raw" ]; then
    target="$docker_raw"
  fi

  # $2=1K-blocks total, $3=used, $4=available (POSIX df -k)
  local total_kib used_kib avail_kib
  read -r total_kib used_kib avail_kib < <(df -k "$target" | awk 'NR==2 {print $2, $3, $4}')

  if [ -z "$total_kib" ] || [ "$total_kib" -eq 0 ]; then
    echo "Could not read disk space for $target"
  else
    local pct_used
    pct_used=$(awk -v u="$used_kib" -v t="$total_kib" 'BEGIN { printf "%.0f", (u / t) * 100 }')
    echo "Taken:  $(human_kib "$used_kib") / $(human_kib "$total_kib") (${pct_used}% used)"
    echo "Free:   $(human_kib "$avail_kib")"
  fi

  if [ -f "$docker_raw" ]; then
    # du reports actual allocated blocks; ls -lh is the sparse virtual max size.
    local allocated virtual
    allocated=$(du -h "$docker_raw" 2>/dev/null | awk '{print $1}')
    virtual=$(ls -lh "$docker_raw" 2>/dev/null | awk '{print $5}')
    echo "Docker Desktop image: ${allocated:-?} allocated / ${virtual:-?} max"
    echo "  ($docker_raw)"
  fi
  echo
}

show_host_disk "before"

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
  show_host_disk "after"
  echo "Cleanup done."
else
  show_host_disk "after dry-run (unchanged)"
  echo "Dry run finished. Run without --dry-run to perform cleanup."
fi
