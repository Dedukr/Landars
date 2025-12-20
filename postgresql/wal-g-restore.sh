#!/bin/bash
# wal-g restore command for PostgreSQL
# This script is called by PostgreSQL to restore WAL segments during recovery
# It downloads and decompresses WAL files from S3 automatically
#
# PostgreSQL calls this with: restore_command = '/path/to/script.sh %f %p'
# %f = WAL file name only
# %p = full path where to restore the WAL file

set -euo pipefail

# WAL file name (provided by PostgreSQL as %f)
WAL_NAME="$1"
# Path where to restore the WAL file (provided by PostgreSQL as %p)
RESTORE_PATH="$2"

# Ensure wal-g is available
if ! command -v wal-g >/dev/null 2>&1; then
    echo "ERROR: wal-g not found" >&2
    exit 1
fi

# Check if AWS credentials are configured
# If not configured, exit 1 (failure) so PostgreSQL can try the fallback restore_command
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ] || [ -z "${AWS_STORAGE_BUCKET_NAME:-}" ]; then
    # Exit 1 (failure) so restore_command can fallback to local archive
    # Don't print error - let the fallback handle it silently
    exit 1
fi

# Configure wal-g for S3
export WALG_S3_PREFIX="s3://${AWS_STORAGE_BUCKET_NAME}/wal-g/"
export WALG_S3_REGION="${AWS_S3_REGION_NAME:-us-east-1}"

# Restore the WAL file using wal-g
# wal-g wal-fetch automatically downloads and decompresses from S3
# Exit code 0 = success, non-zero = failure
if wal-g wal-fetch "$WAL_NAME" "$RESTORE_PATH" 2>&1; then
    # Success - WAL restored from S3
    exit 0
else
    # Failure - log error and return non-zero exit code
    echo "ERROR: Failed to restore WAL file $WAL_NAME from S3" >&2
    exit 1
fi

