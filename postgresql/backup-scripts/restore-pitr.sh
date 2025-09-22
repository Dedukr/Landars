#!/bin/bash
# PostgreSQL Point-in-Time Recovery (PITR) Restore Script
# Restores database to a specific point in time using base backup and WAL files

set -e

# Configuration
BACKUP_DIR="/var/lib/postgresql/backups"
ARCHIVE_DIR="/var/lib/postgresql/archive"
DATA_DIR="/var/lib/postgresql/data"
RESTORE_DIR="/var/lib/postgresql/restore"

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

log_warning() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] $1"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -b, --backup BACKUP_NAME    Base backup name (default: latest)"
    echo "  -t, --target-time TIME      Target recovery time (ISO format)"
    echo "  -l, --target-lsn LSN        Target recovery LSN"
    echo "  -x, --target-xid XID        Target recovery transaction ID"
    echo "  -d, --dry-run               Show what would be done without executing"
    echo "  -f, --force                 Force recovery even if data directory exists"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --backup base_backup_20240101_120000 --target-time '2024-01-01 15:30:00'"
    echo "  $0 --target-lsn '0/1234567'"
    echo "  $0 --target-xid '12345'"
    echo "  $0 --dry-run --target-time '2024-01-01 15:30:00'"
    echo ""
    echo "Available backups:"
    ls -la "$BACKUP_DIR" | grep "^d" | awk '{print "  " $9}' | grep -v "^\s*\.$\|^\s*\.\.$"
}

# Parse command line arguments
BACKUP_NAME="latest"
TARGET_TIME=""
TARGET_LSN=""
TARGET_XID=""
DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--backup)
            BACKUP_NAME="$2"
            shift 2
            ;;
        -t|--target-time)
            TARGET_TIME="$2"
            shift 2
            ;;
        -l|--target-lsn)
            TARGET_LSN="$2"
            shift 2
            ;;
        -x|--target-xid)
            TARGET_XID="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate arguments
if [[ -z "$TARGET_TIME" && -z "$TARGET_LSN" && -z "$TARGET_XID" ]]; then
    log_error "You must specify one of: --target-time, --target-lsn, or --target-xid"
    show_usage
    exit 1
fi

# Check if running as postgres user
if [[ "$(whoami)" != "postgres" ]]; then
    log_error "This script must be run as the postgres user"
    exit 1
fi

# Resolve backup name if "latest"
if [[ "$BACKUP_NAME" == "latest" ]]; then
    if [[ -L "$BACKUP_DIR/latest" ]]; then
        BACKUP_NAME=$(readlink "$BACKUP_DIR/latest")
    else
        log_error "No latest backup found. Please specify a backup name."
        exit 1
    fi
fi

BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Validate backup exists
if [[ ! -d "$BACKUP_PATH" ]]; then
    log_error "Backup not found: $BACKUP_PATH"
    exit 1
fi

# Check if data directory exists and handle it
if [[ -d "$DATA_DIR" && "$FORCE" != true ]]; then
    log_error "Data directory exists: $DATA_DIR"
    log_error "Use --force to overwrite or stop PostgreSQL first"
    exit 1
fi

log_info "Starting Point-in-Time Recovery"
log_info "Backup: $BACKUP_NAME"
log_info "Target: ${TARGET_TIME:-${TARGET_LSN:-${TARGET_XID}}}"
log_info "Dry run: $DRY_RUN"

if [[ "$DRY_RUN" == true ]]; then
    log_info "DRY RUN MODE - No changes will be made"
fi

# Read backup metadata
if [[ -f "$BACKUP_PATH/backup_metadata.txt" ]]; then
    log_info "Backup metadata:"
    cat "$BACKUP_PATH/backup_metadata.txt" | sed 's/^/  /'
    echo ""
fi

# Create recovery configuration
create_recovery_config() {
    local recovery_conf="$RESTORE_DIR/recovery.conf"
    
    log_info "Creating recovery configuration..."
    
    cat > "$recovery_conf" << EOF
# Recovery configuration for Point-in-Time Recovery
# Generated on $(date)

# Restore command to get WAL files from archive
restore_command = 'cp $ARCHIVE_DIR/%f %p'

# Recovery target settings
EOF

    if [[ -n "$TARGET_TIME" ]]; then
        echo "recovery_target_time = '$TARGET_TIME'" >> "$recovery_conf"
        log_info "Recovery target time: $TARGET_TIME"
    elif [[ -n "$TARGET_LSN" ]]; then
        echo "recovery_target_lsn = '$TARGET_LSN'" >> "$recovery_conf"
        log_info "Recovery target LSN: $TARGET_LSN"
    elif [[ -n "$TARGET_XID" ]]; then
        echo "recovery_target_xid = '$TARGET_XID'" >> "$recovery_conf"
        log_info "Recovery target XID: $TARGET_XID"
    fi

    cat >> "$recovery_conf" << EOF

# Recovery action
recovery_target_action = 'promote'

# Archive cleanup
archive_cleanup_command = 'pg_archivecleanup $ARCHIVE_DIR %r'
EOF

    log_info "Recovery configuration created: $recovery_conf"
}

# Perform the recovery
perform_recovery() {
    log_info "Performing Point-in-Time Recovery..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would perform the following steps:"
        log_info "1. Stop PostgreSQL if running"
        log_info "2. Backup current data directory to $DATA_DIR.backup.$(date +%s)"
        log_info "3. Extract base backup to $RESTORE_DIR"
        log_info "4. Create recovery.conf with target settings"
        log_info "5. Start PostgreSQL in recovery mode"
        log_info "6. Monitor recovery progress"
        return 0
    fi

    # Stop PostgreSQL if running
    log_info "Stopping PostgreSQL..."
    pg_ctl stop -D "$DATA_DIR" -m fast || true

    # Backup current data directory
    if [[ -d "$DATA_DIR" ]]; then
        local backup_suffix=$(date +%s)
        log_info "Backing up current data directory to $DATA_DIR.backup.$backup_suffix"
        mv "$DATA_DIR" "$DATA_DIR.backup.$backup_suffix"
    fi

    # Create restore directory
    mkdir -p "$RESTORE_DIR"

    # Extract base backup
    log_info "Extracting base backup..."
    if [[ -f "$BACKUP_PATH/base.tar.gz" ]]; then
        tar -xzf "$BACKUP_PATH/base.tar.gz" -C "$RESTORE_DIR"
    else
        log_error "Base backup archive not found: $BACKUP_PATH/base.tar.gz"
        exit 1
    fi

    # Create recovery configuration
    create_recovery_config

    # Set proper permissions
    chown -R postgres:postgres "$RESTORE_DIR"
    chmod 700 "$RESTORE_DIR"

    # Start PostgreSQL in recovery mode
    log_info "Starting PostgreSQL in recovery mode..."
    pg_ctl start -D "$RESTORE_DIR" -l "$RESTORE_DIR/recovery.log"

    # Monitor recovery
    log_info "Monitoring recovery progress..."
    log_info "Recovery log: $RESTORE_DIR/recovery.log"
    
    # Wait for recovery to complete
    local max_wait=300  # 5 minutes
    local wait_time=0
    
    while [[ $wait_time -lt $max_wait ]]; do
        if pg_ctl status -D "$RESTORE_DIR" >/dev/null 2>&1; then
            if grep -q "database system is ready to accept connections" "$RESTORE_DIR/recovery.log" 2>/dev/null; then
                log_success "Recovery completed successfully!"
                break
            fi
        fi
        
        sleep 5
        wait_time=$((wait_time + 5))
        log_info "Waiting for recovery to complete... (${wait_time}s/${max_wait}s)"
    done

    if [[ $wait_time -ge $max_wait ]]; then
        log_warning "Recovery may still be in progress. Check the recovery log: $RESTORE_DIR/recovery.log"
    fi

    # Show recovery status
    log_info "Recovery status:"
    pg_ctl status -D "$RESTORE_DIR"
    
    # Show current WAL position
    if psql -c "SELECT pg_current_wal_lsn() as current_lsn, pg_walfile_name(pg_current_wal_lsn()) as current_wal_file;" 2>/dev/null; then
        log_success "Database is ready for connections"
    else
        log_warning "Database may not be ready yet. Check recovery log for details."
    fi
}

# Main execution
if [[ "$DRY_RUN" == true ]]; then
    perform_recovery
else
    perform_recovery
fi

log_info "Point-in-Time Recovery process completed"
log_info "Recovery directory: $RESTORE_DIR"
log_info "Recovery log: $RESTORE_DIR/recovery.log"
