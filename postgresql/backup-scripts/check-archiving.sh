#!/bin/bash
# PostgreSQL WAL Archiving Status Check Script
# Monitors WAL archiving status and provides diagnostics

set -e

# Configuration
ARCHIVE_DIR="/var/lib/postgresql/archive"
BACKUP_DIR="/var/lib/postgresql/backups"

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

# Check if running as postgres user
if [[ "$(whoami)" != "postgres" ]]; then
    log_error "This script must be run as the postgres user"
    exit 1
fi

# Check WAL archiving status
check_archiving_status() {
    log_info "Checking WAL archiving status..."
    
    # Check if archiving is enabled
    local archive_mode=$(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'archive_mode';" | tr -d ' ')
    local archive_command=$(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'archive_command';" | tr -d ' ')
    
    echo "Archive Mode: $archive_mode"
    echo "Archive Command: $archive_command"
    
    if [[ "$archive_mode" != "on" ]]; then
        log_error "WAL archiving is not enabled!"
        return 1
    fi
    
    if [[ -z "$archive_command" || "$archive_command" == "" ]]; then
        log_error "Archive command is not configured!"
        return 1
    fi
    
    log_success "WAL archiving is enabled and configured"
}

# Check archive directory
check_archive_directory() {
    log_info "Checking archive directory: $ARCHIVE_DIR"
    
    if [[ ! -d "$ARCHIVE_DIR" ]]; then
        log_error "Archive directory does not exist: $ARCHIVE_DIR"
        return 1
    fi
    
    local archive_count=$(find "$ARCHIVE_DIR" -name "*.wal" -o -name "*.partial" | wc -l)
    local archive_size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1 || echo "0")
    
    echo "Archive directory: $ARCHIVE_DIR"
    echo "WAL files count: $archive_count"
    echo "Archive size: $archive_size"
    
    if [[ $archive_count -eq 0 ]]; then
        log_warning "No WAL files found in archive directory"
    else
        log_success "Found $archive_count WAL files in archive"
    fi
}

# Check current WAL status
check_wal_status() {
    log_info "Checking current WAL status..."
    
    # Get current WAL information
    local current_lsn=$(psql -t -c "SELECT pg_current_wal_lsn();" | tr -d ' ')
    local current_wal_file=$(psql -t -c "SELECT pg_walfile_name(pg_current_wal_lsn());" | tr -d ' ')
    local wal_segment_size=$(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'wal_segment_size';" | tr -d ' ')
    
    echo "Current WAL LSN: $current_lsn"
    echo "Current WAL file: $current_wal_file"
    echo "WAL segment size: $wal_segment_size bytes"
    
    # Check if current WAL file exists in archive
    if [[ -f "$ARCHIVE_DIR/$current_wal_file" ]]; then
        log_success "Current WAL file is archived: $current_wal_file"
    else
        log_warning "Current WAL file not yet archived: $current_wal_file"
    fi
}

# Check recent WAL archiving activity
check_recent_activity() {
    log_info "Checking recent WAL archiving activity..."
    
    # Find recently modified WAL files
    local recent_wals=$(find "$ARCHIVE_DIR" -name "*.wal" -mmin -60 2>/dev/null | wc -l)
    local recent_partials=$(find "$ARCHIVE_DIR" -name "*.partial" -mmin -60 2>/dev/null | wc -l)
    
    echo "WAL files archived in last hour: $recent_wals"
    echo "Partial WAL files in last hour: $recent_partials"
    
    if [[ $recent_wals -gt 0 ]]; then
        log_success "Recent WAL archiving activity detected"
    else
        log_warning "No recent WAL archiving activity"
    fi
    
    # Show recent WAL files
    if [[ $recent_wals -gt 0 ]]; then
        echo ""
        echo "Recent WAL files:"
        find "$ARCHIVE_DIR" -name "*.wal" -mmin -60 -exec ls -la {} \; | head -10
    fi
}

# Check backup status
check_backup_status() {
    log_info "Checking backup status..."
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warning "Backup directory does not exist: $BACKUP_DIR"
        return 0
    fi
    
    local backup_count=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "base_backup_*" | wc -l)
    local latest_backup=$(ls -t "$BACKUP_DIR"/base_backup_* 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "None")
    
    echo "Total base backups: $backup_count"
    echo "Latest backup: $latest_backup"
    
    if [[ "$latest_backup" != "None" ]]; then
        local backup_path="$BACKUP_DIR/$latest_backup"
        local backup_size=$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "Unknown")
        local backup_age=$(find "$backup_path" -maxdepth 0 -printf '%T@' 2>/dev/null | xargs -I {} date -d @{} '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "Unknown")
        
        echo "Latest backup size: $backup_size"
        echo "Latest backup age: $backup_age"
        
        # Check if backup metadata exists
        if [[ -f "$backup_path/backup_metadata.txt" ]]; then
            echo ""
            echo "Latest backup metadata:"
            cat "$backup_path/backup_metadata.txt" | sed 's/^/  /'
        fi
    fi
}

# Test archive command
test_archive_command() {
    log_info "Testing archive command..."
    
    local archive_command=$(psql -t -c "SELECT setting FROM pg_settings WHERE name = 'archive_command';" | tr -d ' ')
    
    if [[ -z "$archive_command" ]]; then
        log_error "Archive command is not configured"
        return 1
    fi
    
    # Create a test WAL file
    local test_wal_file="test_$(date +%s).wal"
    local test_wal_path="/tmp/$test_wal_file"
    local test_archive_path="$ARCHIVE_DIR/$test_wal_file"
    
    echo "Test WAL content" > "$test_wal_path"
    
    # Test the archive command
    local test_command=$(echo "$archive_command" | sed "s/%f/$test_wal_file/g" | sed "s/%p/$test_wal_path/g")
    
    log_info "Testing command: $test_command"
    
    if eval "$test_command"; then
        if [[ -f "$test_archive_path" ]]; then
            log_success "Archive command test successful"
            rm -f "$test_wal_path" "$test_archive_path"
        else
            log_error "Archive command executed but file not found in archive"
            rm -f "$test_wal_path"
            return 1
        fi
    else
        log_error "Archive command test failed"
        rm -f "$test_wal_path"
        return 1
    fi
}

# Show WAL archiving statistics
show_statistics() {
    log_info "WAL Archiving Statistics:"
    
    # Get database statistics
    echo ""
    echo "=== Database Statistics ==="
    psql -c "SELECT 
        name, 
        setting, 
        unit, 
        short_desc 
    FROM pg_settings 
    WHERE name IN (
        'wal_level', 
        'archive_mode', 
        'archive_command', 
        'archive_timeout', 
        'wal_segment_size', 
        'max_wal_size', 
        'min_wal_size',
        'checkpoint_timeout'
    ) 
    ORDER BY name;"
    
    # Get WAL statistics
    echo ""
    echo "=== WAL Statistics ==="
    psql -c "SELECT 
        pg_current_wal_lsn() as current_lsn,
        pg_walfile_name(pg_current_wal_lsn()) as current_wal_file,
        pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') as total_wal_bytes,
        pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')) as total_wal_size;"
    
    # Get backup statistics from database
    echo ""
    echo "=== Backup Statistics ==="
    psql -c "SELECT * FROM backup_summary ORDER BY start_time DESC LIMIT 5;" 2>/dev/null || echo "No backup statistics available"
}

# Main execution
main() {
    echo "=== PostgreSQL WAL Archiving Status Check ==="
    echo "Timestamp: $(date)"
    echo ""
    
    # Run all checks
    check_archiving_status
    echo ""
    
    check_archive_directory
    echo ""
    
    check_wal_status
    echo ""
    
    check_recent_activity
    echo ""
    
    check_backup_status
    echo ""
    
    # Test archive command if requested
    if [[ "$1" == "--test" ]]; then
        test_archive_command
        echo ""
    fi
    
    # Show statistics
    show_statistics
    
    echo ""
    log_info "WAL archiving status check completed"
}

# Run main function
main "$@"
