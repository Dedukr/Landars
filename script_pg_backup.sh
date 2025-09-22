#!/bin/bash

#########################################################################
# Comprehensive PostgreSQL Backup and Recovery Script for FoodPlatform
#
# This unified script combines:
# - Traditional SQL dump backups (from script_pg_backup_restore.sh)
# - Point-in-Time Recovery (PITR) with WAL archiving
# - Unified backup management
#
# Features:
# - Traditional SQL dump backups for complete database snapshots
# - PITR base backups for precise point-in-time recovery
# - WAL archiving for continuous data protection
# - Flexible restore options (full restore or precise recovery)
# - Comprehensive monitoring and cleanup
# - Docker integration
#
# Usage:
#   chmod +x script_pg_backup.sh
#   ./script_pg_backup.sh [command] [options]
#
#########################################################################

# Simple logging functions
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo "[WARNING] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_info "Comprehensive PostgreSQL Backup Script started"

# Load configuration from environment file
if [[ -f ".env" ]]; then
    source .env
else
    log_error "Configuration file '.env' not found!"
    log_error "Please create the configuration file with your database credentials."
    exit 1
fi

# Validate required environment variables
required_vars=("POSTGRES_DB" "POSTGRES_USER" "POSTGRES_PASSWORD" "PROJECT_DIR")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    log_error "Missing required environment variables: ${missing_vars[*]}"
    log_error "Please check your .env file."
    exit 1
fi

# Set database configuration from environment variables
DB_NAME="$POSTGRES_DB"
DB_USER="$POSTGRES_USER"
DB_PASSWORD="$POSTGRES_PASSWORD"

# Set backup directories
DB_BACKUPS_DIR="${PROJECT_DIR}/${DB_BACKUPS_DIR:-db_backups}"
DB_DATA_DIR="${PROJECT_DIR}/${DB_DATA_DIR:-db_data}"
PITR_ARCHIVE_DIR="${PROJECT_DIR}/pitr_archive"
PITR_BACKUPS_DIR="${PROJECT_DIR}/pitr_backups"

# Backup filenames
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TIMESTAMPED_BACKUP="pg_backup_${TIMESTAMP}.sql"
CURRENT_BACKUP="pg.sql"

# Get PostgreSQL container name
get_postgres_container() {
    local container_name=$(cd "$PROJECT_DIR" && docker-compose ps --services --filter "status=running" | grep postgres 2>/dev/null)
    if [[ -z "$container_name" ]]; then
        log_error "PostgreSQL container not found. Make sure docker-compose is running."
        exit 1
    fi
    # Get the full container name with project prefix
    local full_container_name=$(cd "$PROJECT_DIR" && docker-compose ps postgres --format "{{.Name}}" 2>/dev/null)
    if [[ -z "$full_container_name" ]]; then
        log_error "Could not get PostgreSQL container name."
        exit 1
    fi
    echo "$full_container_name"
}

# Check if container is running
check_container_running() {
    local container="$1"
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "Container $container is not running."
        exit 1
    fi
}

#########################################################################
# TRADITIONAL SQL BACKUP FUNCTIONS
#########################################################################

# Create traditional SQL backup
create_sql_backup() {
    local container="$1"
    local timestamped_path="${DB_BACKUPS_DIR}/${TIMESTAMPED_BACKUP}"
    local current_path="${DB_DATA_DIR}/${CURRENT_BACKUP}"
    local container_tmp_dir="/tmp"
    local container_backup_path="${container_tmp_dir}/backup.sql"
    local start_time=$(date +%s)

    log_info "Starting SQL backup of database '$DB_NAME' from container '$container'..."

    # Create backup directories if they don't exist
    mkdir -p "$DB_BACKUPS_DIR"
    mkdir -p "$DB_DATA_DIR"

    # Perform pg_dump inside the container
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           pg_dump -U "$DB_USER" -d "$DB_NAME" -F p -f "$container_backup_path"; then
        log_success "pg_dump completed successfully inside container."
    else
        log_error "pg_dump failed. Aborting backup."
        exit 1
    fi

    # Copy to timestamped backup location
    if docker cp "${container}:${container_backup_path}" "$timestamped_path"; then
        log_success "Timestamped backup saved: $timestamped_path"
    else
        log_error "Failed to copy timestamped backup from container to host."
        docker exec "$container" rm -f "$container_backup_path" || true
        exit 1
    fi

    # Copy to current backup location (overwrites previous)
    if cp "$timestamped_path" "$current_path"; then
        log_success "Current backup updated: $current_path"
    else
        log_error "Failed to update current backup"
        exit 1
    fi

    # Clean up container file
    docker exec "$container" rm -f "$container_backup_path" || true
    
    local duration=$(($(date +%s) - start_time))
    log_success "SQL backup process completed successfully in ${duration}s!"
    log_info "Timestamped backup: $timestamped_path"
    log_info "Current backup: $current_path"
}

# Restore from traditional SQL backup
restore_sql_database() {
    local container="$1"
    local backup_file="${DB_DATA_DIR}/${CURRENT_BACKUP}"
    local container_tmp_dir="/tmp"
    local container_backup_path="${container_tmp_dir}/restore_backup.sql"

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        log_error "Please place your pg.sql file in the db_data/ directory"
        exit 1
    fi

    log_info "Starting SQL restore of database '$DB_NAME' from: $backup_file"

    # Copy backup file to container
    if docker cp "$backup_file" "${container}:${container_backup_path}"; then
        log_success "Backup file copied to container."
    else
        log_error "Failed to copy backup file to container."
        exit 1
    fi

    # Restore the database
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           psql -U "$DB_USER" -d "$DB_NAME" -f "$container_backup_path"; then
        log_success "Database restored successfully from $backup_file"
    else
        log_error "Database restore failed."
        docker exec "$container" rm -f "$container_backup_path" || true
        exit 1
    fi

    # Clean up
    docker exec "$container" rm -f "$container_backup_path" || true
    
    log_success "SQL restore process completed successfully!"
}

# Start PostgreSQL with restored data
start_with_sql_restore() {
    log_info "Starting PostgreSQL with restored SQL data..."

    # Change to project directory
    cd "$PROJECT_DIR"

    # Stop existing PostgreSQL container
    log_info "Stopping existing PostgreSQL container..."
    docker-compose down postgres 2>/dev/null || true

    # Remove existing data volume to ensure clean start
    log_info "Removing existing PostgreSQL data volume..."
    docker volume rm foodplatform_postgres_data 2>/dev/null || true

    # Start PostgreSQL container
    log_info "Starting fresh PostgreSQL container..."
    docker-compose up -d postgres

    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 5

    # Check if container is running
    if ! docker-compose ps postgres | grep -q "Up"; then
        log_error "Failed to start PostgreSQL container"
        exit 1
    fi

    # Get container name and restore
    local container=$(get_postgres_container)
    check_container_running "$container"
    
    # Restore from backup
    restore_sql_database "$container"

    log_success "PostgreSQL started successfully with restored SQL data!"
}

# Show SQL backup statistics
show_sql_stats() {
    log_info "SQL Backup Statistics:"
    echo "Backup Directory: $DB_BACKUPS_DIR"
    echo "Data Directory: $DB_DATA_DIR"
    echo "Total Backups: $(find "$DB_BACKUPS_DIR" -name "pg_backup_*.sql" -type f 2>/dev/null | wc -l)"
    echo "Total Size: $(du -sh "$DB_BACKUPS_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
    echo "Current Backup: $(ls -t "$DB_DATA_DIR"/pg.sql 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'None')"
    echo "Current Backup Size: $(du -sh "$DB_DATA_DIR"/pg.sql 2>/dev/null | cut -f1 || echo 'N/A')"
}

# Clean up old SQL backups
cleanup_old_sql_backups() {
    local retention_days=31
    log_info "Cleaning up SQL backups older than $retention_days days..."
    local deleted_count=$(find "$DB_BACKUPS_DIR" -name "pg_backup_*.sql" -type f -mtime +$retention_days -delete -print 2>/dev/null | wc -l)
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old SQL backup files"
    else
        log_info "No old SQL backup files to delete"
    fi
}

#########################################################################
# PITR BACKUP FUNCTIONS
#########################################################################

# Create PITR base backup
create_pitr_backup() {
    local container="$1"
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local backup_name="base_backup_${timestamp}"
    
    log_info "Creating PITR base backup: $backup_name"
    
    # Create backup directories
    mkdir -p "$PITR_BACKUPS_DIR"
    mkdir -p "$PITR_ARCHIVE_DIR"
    
    # Execute base backup inside container
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           /usr/local/bin/base-backup.sh; then
        log_success "PITR base backup completed successfully"
    else
        log_error "PITR base backup failed"
        exit 1
    fi
    
    # Copy backup from container to host
    local container_backup_dir="/var/lib/postgresql/backups/latest"
    local host_backup_dir="$PITR_BACKUPS_DIR/$backup_name"
    
    if docker cp "${container}:${container_backup_dir}/." "$host_backup_dir"; then
        log_success "PITR base backup copied to host: $host_backup_dir"
    else
        log_error "Failed to copy PITR base backup from container"
        exit 1
    fi
    
    # Copy WAL archive from container to host
    if docker cp "${container}:/var/lib/postgresql/archive/." "$PITR_ARCHIVE_DIR"; then
        log_success "WAL archive copied to host: $PITR_ARCHIVE_DIR"
    else
        log_warning "Failed to copy WAL archive from container"
    fi
    
    log_success "PITR base backup process completed: $backup_name"
}

# Check WAL archiving status
check_archiving() {
    local container="$1"
    
    log_info "Checking WAL archiving status..."
    
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           /usr/local/bin/check-archiving.sh; then
        log_success "WAL archiving status check completed"
    else
        log_error "WAL archiving status check failed"
        exit 1
    fi
}

# Test WAL archiving
test_archiving() {
    local container="$1"
    
    log_info "Testing WAL archiving..."
    
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           /usr/local/bin/check-archiving.sh --test; then
        log_success "WAL archiving test completed"
    else
        log_error "WAL archiving test failed"
        exit 1
    fi
}

# Perform Point-in-Time Recovery
restore_pitr() {
    local container="$1"
    local target_time="$2"
    local target_lsn="$3"
    local target_xid="$4"
    local dry_run="$5"
    
    log_info "Performing Point-in-Time Recovery..."
    
    # Build restore command
    local restore_cmd="/usr/local/bin/restore-pitr.sh"
    
    if [[ -n "$target_time" ]]; then
        restore_cmd="$restore_cmd --target-time '$target_time'"
    elif [[ -n "$target_lsn" ]]; then
        restore_cmd="$restore_cmd --target-lsn '$target_lsn'"
    elif [[ -n "$target_xid" ]]; then
        restore_cmd="$restore_cmd --target-xid '$target_xid'"
    fi
    
    if [[ "$dry_run" == "true" ]]; then
        restore_cmd="$restore_cmd --dry-run"
    fi
    
    log_info "Executing restore command: $restore_cmd"
    
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           bash -c "$restore_cmd"; then
        log_success "Point-in-Time Recovery completed"
    else
        log_error "Point-in-Time Recovery failed"
        exit 1
    fi
}

# Clean up PITR archives and backups
cleanup_pitr_archives() {
    local container="$1"
    local wal_days="$2"
    local backup_days="$3"
    local dry_run="$4"
    
    log_info "Cleaning up PITR archives and backups..."
    
    # Build cleanup command
    local cleanup_cmd="/usr/local/bin/cleanup-archive.sh"
    
    if [[ -n "$wal_days" ]]; then
        cleanup_cmd="$cleanup_cmd --wal-days $wal_days"
    fi
    
    if [[ -n "$backup_days" ]]; then
        cleanup_cmd="$cleanup_cmd --backup-days $backup_days"
    fi
    
    if [[ "$dry_run" == "true" ]]; then
        cleanup_cmd="$cleanup_cmd --dry-run"
    fi
    
    log_info "Executing cleanup command: $cleanup_cmd"
    
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           bash -c "$cleanup_cmd"; then
        log_success "PITR archive cleanup completed"
    else
        log_error "PITR archive cleanup failed"
        exit 1
    fi
}

#########################################################################
# UNIFIED FUNCTIONS
#########################################################################

# Create both types of backups
create_full_backup() {
    log_info "Creating comprehensive backup (SQL + PITR)..."
    
    local container=$(get_postgres_container)
    check_container_running "$container"
    
    # Create traditional backup first
    create_sql_backup "$container"
    echo ""
    
    # Create PITR backup
    create_pitr_backup "$container"
    echo ""
    
    log_success "Comprehensive backup completed successfully"
}

# Show unified status
show_unified_status() {
    local container=$(get_postgres_container)
    
    log_info "Comprehensive Backup System Status"
    echo "====================================="
    echo ""
    
    # Container status
    echo "Container Status:"
    docker ps --filter "name=$container" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    
    # SQL backup status
    echo "SQL Backup Status:"
    echo "------------------"
    show_sql_stats
    echo ""
    
    # PITR status
    echo "PITR Backup Status:"
    echo "-------------------"
    if docker exec -e PGPASSWORD="$DB_PASSWORD" "$container" \
           /usr/local/bin/check-archiving.sh 2>/dev/null; then
        echo "PITR system is operational"
    else
        echo "PITR system not available or not configured"
    fi
    echo ""
    
    # Disk usage
    echo "Disk Usage:"
    echo "-----------"
    if [[ -d "$DB_BACKUPS_DIR" ]]; then
        echo "SQL Backups: $(du -sh "$DB_BACKUPS_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
    fi
    
    if [[ -d "$PITR_BACKUPS_DIR" ]]; then
        echo "PITR Backups: $(du -sh "$PITR_BACKUPS_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
    fi
    
    if [[ -d "$PITR_ARCHIVE_DIR" ]]; then
        echo "PITR Archive: $(du -sh "$PITR_ARCHIVE_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
    fi
}

# Clean up both systems
cleanup_all() {
    local wal_days="$1"
    local backup_days="$2"
    local dry_run="$3"
    
    log_info "Cleaning up both backup systems..."
    
    # Clean up traditional backups
    echo "Cleaning up traditional SQL backups..."
    cleanup_old_sql_backups
    echo ""
    
    # Clean up PITR archives
    local container=$(get_postgres_container)
    if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        echo "Cleaning up PITR archives and backups..."
        cleanup_pitr_archives "$container" "$wal_days" "$backup_days" "$dry_run"
    else
        log_warning "PostgreSQL container not running, skipping PITR cleanup"
    fi
}

#########################################################################
# MAIN COMMAND HANDLERS
#########################################################################

# Show usage information
show_usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  backup                    - Create traditional SQL backup"
    echo "  restore                   - Restore from traditional SQL backup"
    echo "  start-restore             - Stop PostgreSQL, start fresh, and restore from SQL backup"
    echo "  stats                     - Show SQL backup statistics"
    echo "  cleanup                   - Clean up old SQL backup files"
    echo ""
    echo "  pitr-backup               - Create PITR base backup"
    echo "  pitr-check                - Check WAL archiving status"
    echo "  pitr-test                 - Test WAL archiving functionality"
    echo "  pitr-restore [options]    - Perform Point-in-Time Recovery"
    echo "  pitr-cleanup [options]    - Clean up PITR archives and backups"
    echo ""
    echo "  full-backup               - Create both SQL and PITR backups"
    echo "  status                    - Show unified backup status"
    echo "  cleanup-all [options]     - Clean up both backup systems"
    echo "  help                      - Show this help message"
    echo ""
    echo "PITR Restore Options:"
    echo "  --target-time TIME        - Target recovery time (ISO format)"
    echo "  --target-lsn LSN          - Target recovery LSN"
    echo "  --target-xid XID          - Target recovery transaction ID"
    echo "  --dry-run                 - Show what would be done without executing"
    echo ""
    echo "Cleanup Options:"
    echo "  --wal-days DAYS           - WAL retention days (default: 7)"
    echo "  --backup-days DAYS        - Backup retention days (default: 30)"
    echo "  --dry-run                 - Show what would be deleted without executing"
    echo ""
    echo "Examples:"
    echo "  $0 backup                                    # Create SQL backup"
    echo "  $0 restore                                   # Restore from SQL backup"
    echo "  $0 pitr-backup                              # Create PITR backup"
    echo "  $0 pitr-check                               # Check PITR status"
    echo "  $0 pitr-restore --target-time '2024-01-01 15:30:00'  # PITR restore to time"
    echo "  $0 full-backup                              # Create both backups"
    echo "  $0 status                                   # Show unified status"
    echo "  $0 cleanup-all --wal-days 14 --backup-days 60  # Clean up both systems"
    echo ""
    echo "Backup Strategy Recommendations:"
    echo "  - Daily: $0 backup"
    echo "  - Weekly: $0 full-backup"
    echo "  - Monthly: $0 cleanup-all"
    echo "  - Emergency restore: $0 pitr-restore --target-time 'YYYY-MM-DD HH:MM:SS'"
}

# Main script logic
main() {
    local command="${1:-help}"
    local container=$(get_postgres_container)
    
    case "$command" in
        # Traditional SQL backup commands
        "backup")
            check_container_running "$container"
            create_sql_backup "$container"
            ;;
        "restore")
            check_container_running "$container"
            restore_sql_database "$container"
            ;;
        "start-restore")
            start_with_sql_restore
            ;;
        "stats")
            show_sql_stats
            ;;
        "cleanup")
            cleanup_old_sql_backups
            ;;
        
        # PITR commands
        "pitr-backup")
            check_container_running "$container"
            create_pitr_backup "$container"
            ;;
        "pitr-check")
            check_container_running "$container"
            check_archiving "$container"
            ;;
        "pitr-test")
            check_container_running "$container"
            test_archiving "$container"
            ;;
        "pitr-restore")
            check_container_running "$container"
            # Parse restore options
            local target_time=""
            local target_lsn=""
            local target_xid=""
            local dry_run="false"
            
            shift
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --target-time)
                        target_time="$2"
                        shift 2
                        ;;
                    --target-lsn)
                        target_lsn="$2"
                        shift 2
                        ;;
                    --target-xid)
                        target_xid="$2"
                        shift 2
                        ;;
                    --dry-run)
                        dry_run="true"
                        shift
                        ;;
                    *)
                        log_error "Unknown restore option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done
            
            restore_pitr "$container" "$target_time" "$target_lsn" "$target_xid" "$dry_run"
            ;;
        "pitr-cleanup")
            check_container_running "$container"
            # Parse cleanup options
            local wal_days=""
            local backup_days=""
            local dry_run="false"
            
            shift
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --wal-days)
                        wal_days="$2"
                        shift 2
                        ;;
                    --backup-days)
                        backup_days="$2"
                        shift 2
                        ;;
                    --dry-run)
                        dry_run="true"
                        shift
                        ;;
                    *)
                        log_error "Unknown cleanup option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done
            
            cleanup_pitr_archives "$container" "$wal_days" "$backup_days" "$dry_run"
            ;;
        
        # Unified commands
        "full-backup")
            create_full_backup
            ;;
        "status")
            show_unified_status
            ;;
        "cleanup-all")
            # Parse cleanup options
            local wal_days=""
            local backup_days=""
            local dry_run="false"
            
            shift
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --wal-days)
                        wal_days="$2"
                        shift 2
                        ;;
                    --backup-days)
                        backup_days="$2"
                        shift 2
                        ;;
                    --dry-run)
                        dry_run="true"
                        shift
                        ;;
                    *)
                        log_error "Unknown cleanup option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done
            
            cleanup_all "$wal_days" "$backup_days" "$dry_run"
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
