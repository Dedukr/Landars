#!/bin/bash
# PostgreSQL Base Backup Script for PITR
# Creates a base backup that can be used for Point-in-Time Recovery

set -e

# Configuration
BACKUP_DIR="/var/lib/postgresql/backups"
ARCHIVE_DIR="/var/lib/postgresql/archive"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="base_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Logging functions
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
}

# Check if running as postgres user
if [[ "$(whoami)" != "postgres" ]]; then
    log_error "This script must be run as the postgres user"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_PATH"

log_info "Starting base backup: $BACKUP_NAME"

# Get current WAL LSN before backup
WAL_START_LSN=$(psql -t -c "SELECT pg_current_wal_lsn();" | tr -d ' ')

# Record backup start in database
psql -c "INSERT INTO backup_info (backup_name, backup_type, start_time, wal_start_lsn, status, notes) 
         VALUES ('$BACKUP_NAME', 'base_backup', NOW(), '$WAL_START_LSN', 'in_progress', 'Base backup started');"

# Perform base backup using pg_basebackup
log_info "Executing pg_basebackup..."

if pg_basebackup \
    -D "$BACKUP_PATH" \
    -Ft \
    -z \
    -P \
    -v \
    -W; then
    log_success "pg_basebackup completed successfully"
else
    log_error "pg_basebackup failed"
    psql -c "UPDATE backup_info SET status = 'failed', end_time = NOW(), notes = 'pg_basebackup failed' WHERE backup_name = '$BACKUP_NAME';"
    exit 1
fi

# Get WAL LSN after backup
WAL_END_LSN=$(psql -t -c "SELECT pg_current_wal_lsn();" | tr -d ' ')

# Calculate backup size
BACKUP_SIZE=$(du -sb "$BACKUP_PATH" | cut -f1)

# Update backup record
psql -c "UPDATE backup_info 
         SET end_time = NOW(), 
             wal_end_lsn = '$WAL_END_LSN', 
             backup_size_bytes = $BACKUP_SIZE, 
             status = 'completed', 
             notes = 'Base backup completed successfully' 
         WHERE backup_name = '$BACKUP_NAME';"

# Create backup metadata file
cat > "$BACKUP_PATH/backup_metadata.txt" << EOF
Backup Name: $BACKUP_NAME
Backup Type: base_backup
Start Time: $(date -d "@$(date +%s)" '+%Y-%m-%d %H:%M:%S UTC')
End Time: $(date '+%Y-%m-%d %H:%M:%S UTC')
WAL Start LSN: $WAL_START_LSN
WAL End LSN: $WAL_END_LSN
Backup Size: $BACKUP_SIZE bytes ($(du -sh "$BACKUP_PATH" | cut -f1))
PostgreSQL Version: $(psql -t -c "SELECT version();" | head -1)
Archive Mode: $(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'archive_mode';" | tr -d ' ')
Archive Command: $(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'archive_command';" | tr -d ' ')
EOF

# Create symbolic link to latest backup
ln -sfn "$BACKUP_NAME" "$BACKUP_DIR/latest"

log_success "Base backup completed: $BACKUP_NAME"
log_info "Backup location: $BACKUP_PATH"
log_info "Backup size: $(du -sh "$BACKUP_PATH" | cut -f1)"
log_info "WAL range: $WAL_START_LSN to $WAL_END_LSN"

# Show backup summary
echo ""
echo "=== Backup Summary ==="
psql -c "SELECT * FROM backup_summary WHERE backup_name = '$BACKUP_NAME';"

echo ""
echo "=== Next Steps ==="
echo "1. Ensure WAL files are being archived to: $ARCHIVE_DIR"
echo "2. Test recovery using: /usr/local/bin/restore-pitr.sh"
echo "3. Monitor WAL archiving with: /usr/local/bin/check-archiving.sh"
