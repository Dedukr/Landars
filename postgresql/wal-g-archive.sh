#!/bin/bash
# wal-g archive command for PostgreSQL
# This script is called by PostgreSQL to archive WAL segments
# It compresses and uploads WAL files to S3 automatically
#
# PostgreSQL calls this with: archive_command = '/path/to/script.sh %p %f'
# %p = full path to WAL file
# %f = WAL file name only (optional, not used by wal-g but provided for logging)

set -euo pipefail

# WAL file path (provided by PostgreSQL as %p)
WAL_PATH="${1:-}"
WAL_NAME="${2:-$(basename "$WAL_PATH")}"

# Validate input
if [ -z "$WAL_PATH" ] || [ ! -f "$WAL_PATH" ]; then
    echo "ERROR: Invalid WAL file path: $WAL_PATH" >&2
    exit 1
fi

# Ensure wal-g is available
if ! command -v wal-g >/dev/null 2>&1; then
    echo "ERROR: wal-g not found" >&2
    exit 1
fi

# Check if AWS credentials are configured
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ] || [ -z "${AWS_STORAGE_BUCKET_NAME:-}" ]; then
    echo "ERROR: AWS credentials not configured" >&2
    exit 1
fi

# Configure wal-g for S3
export WALG_S3_PREFIX="s3://${AWS_STORAGE_BUCKET_NAME}/db_backups/wal-g/"
export WALG_S3_REGION="${AWS_S3_REGION_NAME:-us-east-1}"
export WALG_COMPRESSION_METHOD="lz4"  # Fast compression, good for WAL files
export WALG_S3_STORAGE_CLASS="${S3_STORAGE_CLASS:-STANDARD_IA}"

# Archive the WAL file using wal-g
# wal-g wal-push automatically compresses and uploads to S3
# Exit code 0 = success, non-zero = failure (PostgreSQL will retry)
if wal-g wal-push "$WAL_PATH" 2>&1; then
    # Success - WAL archived to S3
    exit 0
else
    # Failure - log error and return non-zero exit code
    echo "ERROR: Failed to archive WAL file $WAL_NAME to S3" >&2
    exit 1
fi

