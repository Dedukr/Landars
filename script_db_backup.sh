#!/bin/bash

#########################################################################
# SQLite Database Backup Script for FoodPlatform
#
# This script creates a backup of the SQLite database from a Docker container
# and saves it to a specified directory on the host machine.
# 
# Features:
# - Simple logging to console
# - Backup size tracking
# - Duration tracking
# - Automatic cleanup of old backups
#
# Usage: ./script_db_backup.sh [stats|cleanup]
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

log_info "SQLite backup script started"

# Configuration - Update these paths as needed
# For development purposes only. This script is intended to be run in a development environment and should not be used in production.
# CONTAINER=foodplatform-backend-1 
# DB_PATH_IN_CONTAINER=/backend/db/db.sqlite3
# DB_PATH_ON_HOST=./backend/db/db.sqlite3
# BACKUP_DIR_ON_HOST=./db_backups

# For production.
# This script is intended to be run in a production environment and should not be used in development.
CONTAINER=landars-backend-1
DB_PATH_IN_CONTAINER=/backend/db/db.sqlite3
DB_PATH_ON_HOST=/home/dedmac/web/Landars/backend/db/db.sqlite3
BACKUP_DIR_ON_HOST=/home/dedmac/web/Landars/db_backups

# Backup configuration
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="db_backup_$DATE.sqlite3"
BACKUP_RETENTION_DAYS=31

# Create backup function
create_sqlite_backup() {
    local start_time=$(date +%s)
    
    log_info "Starting SQLite backup from container '$CONTAINER'..."

    # Create local backup folder if needed
    mkdir -p "$BACKUP_DIR_ON_HOST"

    # Use docker cp to extract the file
    if docker cp "$CONTAINER:$DB_PATH_IN_CONTAINER" "$BACKUP_DIR_ON_HOST/$FILENAME"; then
        log_success "Backup saved as $BACKUP_DIR_ON_HOST/$FILENAME"
    else
        log_error "Failed to create backup of $CONTAINER:$DB_PATH_IN_CONTAINER"
        exit 1
    fi

    # Copy to current database location
    if cp "$BACKUP_DIR_ON_HOST/$FILENAME" "$DB_PATH_ON_HOST"; then
        log_success "Latest db saved as $DB_PATH_ON_HOST"
    else
        log_error "Failed to copy latest backup $BACKUP_DIR_ON_HOST/$FILENAME to $DB_PATH_ON_HOST"
        exit 1
    fi

    # Clean up old backups
    cleanup_old_backups

    local duration=$(($(date +%s) - start_time))
    log_success "SQLite backup process completed successfully in ${duration}s!"
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."
    local deleted_count=$(find "$BACKUP_DIR_ON_HOST" -name "*.sqlite3" -type f -mtime +$BACKUP_RETENTION_DAYS -delete -print | wc -l)
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old backup files"
    else
        log_info "No old backup files to delete"
    fi
}

# Show backup statistics
show_stats() {
    log_info "Backup Statistics:"
    echo "Backup Directory: $BACKUP_DIR_ON_HOST"
    echo "Total Backups: $(find "$BACKUP_DIR_ON_HOST" -name "*.sqlite3" -type f | wc -l)"
    echo "Total Size: $(du -sh "$BACKUP_DIR_ON_HOST" 2>/dev/null | cut -f1 || echo 'N/A')"
    echo "Latest Backup: $(ls -t "$BACKUP_DIR_ON_HOST"/*.sqlite3 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'None')"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [stats|cleanup|help]"
    echo ""
    echo "Commands:"
    echo "  (no args)     - Create SQLite backup"
    echo "  stats         - Show backup statistics"
    echo "  cleanup       - Clean up old backup files"
    echo "  help          - Show this help message"
    echo ""
    echo "Configuration:"
    echo "  Container: $CONTAINER"
    echo "  Source: $DB_PATH_IN_CONTAINER"
    echo "  Backup Dir: $BACKUP_DIR_ON_HOST"
    echo "  Current DB: $DB_PATH_ON_HOST"
    echo "  Retention: $BACKUP_RETENTION_DAYS days"
}

# Main script logic
main() {
    local command="${1:-backup}"
    
    case "$command" in
        "backup")
            create_sqlite_backup
            ;;
        "stats")
            show_stats
            ;;
        "cleanup")
            log_info "Cleaning up old backups..."
            cleanup_old_backups
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