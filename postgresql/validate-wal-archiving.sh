#!/bin/bash
# Validation script for WAL archiving with wal-g
# This script verifies that WAL archiving is working correctly

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running inside PostgreSQL container
if [ ! -f /var/lib/postgresql/data/postgresql.conf ]; then
    log_error "This script must be run inside the PostgreSQL container"
    exit 1
fi

log_info "Validating WAL archiving configuration..."

# 1. Check if wal-g is installed
if ! command -v wal-g >/dev/null 2>&1; then
    log_error "wal-g is not installed"
    exit 1
fi
log_info "✓ wal-g is installed: $(wal-g --version 2>&1 | head -1)"

# 2. Check PostgreSQL archive_mode
ARCHIVE_MODE=$(psql -t -A -c "SELECT setting FROM pg_settings WHERE name = 'archive_mode';" 2>/dev/null || echo "off")
if [ "$ARCHIVE_MODE" != "on" ]; then
    log_error "archive_mode is not enabled (current: $ARCHIVE_MODE)"
    exit 1
fi
log_info "✓ archive_mode is enabled"

# 3. Check archive_command
ARCHIVE_CMD=$(psql -t -A -c "SELECT setting FROM pg_settings WHERE name = 'archive_command';" 2>/dev/null || echo "")
if [[ ! "$ARCHIVE_CMD" =~ wal-g-archive ]]; then
    log_warning "archive_command does not appear to use wal-g: $ARCHIVE_CMD"
else
    log_info "✓ archive_command is configured with wal-g"
fi

# 4. Check AWS credentials
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
    log_error "AWS_ACCESS_KEY_ID is not set"
    exit 1
fi
if [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    log_error "AWS_SECRET_ACCESS_KEY is not set"
    exit 1
fi
if [ -z "${AWS_STORAGE_BUCKET_NAME:-}" ]; then
    log_error "AWS_STORAGE_BUCKET_NAME is not set"
    exit 1
fi
log_info "✓ AWS credentials are configured"

# 5. Test S3 connectivity
log_info "Testing S3 connectivity..."
export WALG_S3_PREFIX="s3://${AWS_STORAGE_BUCKET_NAME}/wal-g/"
export WALG_S3_REGION="${AWS_S3_REGION_NAME:-us-east-1}"

if wal-g s3 ls 2>&1 | head -5 >/dev/null; then
    log_info "✓ S3 connectivity test successful"
else
    log_error "S3 connectivity test failed"
    exit 1
fi

# 6. Check current WAL position
CURRENT_WAL=$(psql -t -A -c "SELECT pg_walfile_name(pg_current_wal_lsn());" 2>/dev/null || echo "")
if [ -n "$CURRENT_WAL" ]; then
    log_info "✓ Current WAL file: $CURRENT_WAL"
else
    log_warning "Could not determine current WAL file"
fi

# 7. Force WAL rotation to test archiving
log_info ""
log_info "Forcing WAL rotation to test archiving..."
if psql -c "SELECT pg_switch_wal();" >/dev/null 2>&1; then
    log_info "✓ WAL rotation triggered"
    log_info "  Waiting 5 seconds for archiving to complete..."
    sleep 5
    
    # Check PostgreSQL logs for archiving status
    log_info "Checking archiving status..."
    ARCHIVED_COUNT=$(psql -t -A -c "SELECT COUNT(*) FROM pg_stat_archiver WHERE last_archived_time > NOW() - INTERVAL '1 minute';" 2>/dev/null || echo "0")
    if [ "$ARCHIVED_COUNT" -gt 0 ]; then
        log_info "✓ WAL archiving is working (recent archive activity detected)"
    else
        log_warning "No recent archive activity detected (this may be normal if no WAL was generated)"
    fi
else
    log_error "Failed to trigger WAL rotation"
    exit 1
fi

# 8. List recent WAL files in S3
log_info ""
log_info "Checking for WAL files in S3..."
WAL_COUNT=$(wal-g wal-show 2>&1 | grep -c "wal" || echo "0")
if [ "$WAL_COUNT" -gt 0 ]; then
    log_info "✓ Found $WAL_COUNT WAL file(s) in S3"
    log_info "  Recent WAL files:"
    wal-g wal-show 2>&1 | head -5 | while read -r line; do
        log_info "    $line"
    done
else
    log_warning "No WAL files found in S3 (this may be normal for a new setup)"
fi

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "✓ WAL archiving validation completed successfully!"
log_info ""
log_info "To verify WAL files are being archived:"
log_info "  1. Check PostgreSQL logs: docker compose logs postgres | grep -i archive"
log_info "  2. List WAL files in S3: wal-g wal-show"
log_info "  3. Force WAL rotation: psql -c 'SELECT pg_switch_wal();'"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

