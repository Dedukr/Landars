#!/bin/bash

#########################################################################
# PostgreSQL Backup and Restore Script for FoodPlatform
#
# This script handles backup and restore operations for PostgreSQL database.
# 
# Backup functionality:
# - Creates timestamped backup in db_backups/ folder
# - Saves current version as db_data/pg.sql (overwrites previous)
# - Simple console logging
#
# Restore functionality:
# - Restores database from db_data/pg.sql file
# - Starts PostgreSQL with the restored data
#
# Usage:
#   chmod +x script_pg_backup_restore.sh
#   ./script_pg_backup_restore.sh backup    # Create backup
#   ./script_pg_backup_restore.sh restore   # Restore from db_data/pg.sql
#   ./script_pg_backup_restore.sh stats     # Show backup statistics
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

log_info "PostgreSQL backup script started"

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

# Create backup
create_backup() {
    local container="$1"
    local timestamped_path="${DB_BACKUPS_DIR}/${TIMESTAMPED_BACKUP}"
    local current_path="${DB_DATA_DIR}/${CURRENT_BACKUP}"
    local container_tmp_dir="/tmp"
    local container_backup_path="${container_tmp_dir}/backup.sql"
    local start_time=$(date +%s)

    log_info "Starting backup of database '$DB_NAME' from container '$container'..."

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
    log_success "Backup process completed successfully in ${duration}s!"
    log_info "Timestamped backup: $timestamped_path"
    log_info "Current backup: $current_path"
}

# Restore from db_data/pg.sql
restore_database() {
    local container="$1"
    local backup_file="${DB_DATA_DIR}/${CURRENT_BACKUP}"
    local container_tmp_dir="/tmp"
    local container_backup_path="${container_tmp_dir}/restore_backup.sql"

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        log_error "Please place your pg.sql file in the db_data/ directory"
        exit 1
    fi

    log_info "Starting restore of database '$DB_NAME' from: $backup_file"

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
    
    log_success "Restore process completed successfully!"
}

# Start PostgreSQL with restored data
start_with_restore() {
    log_info "Starting PostgreSQL with restored data..."

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
    restore_database "$container"

    log_success "PostgreSQL started successfully with restored data!"
}

# Show backup statistics
show_stats() {
    log_info "Backup Statistics:"
    echo "Backup Directory: $DB_BACKUPS_DIR"
    echo "Data Directory: $DB_DATA_DIR"
    echo "Total Backups: $(find "$DB_BACKUPS_DIR" -name "pg_backup_*.sql" -type f 2>/dev/null | wc -l)"
    echo "Total Size: $(du -sh "$DB_BACKUPS_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
    echo "Current Backup: $(ls -t "$DB_DATA_DIR"/pg.sql 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'None')"
    echo "Current Backup Size: $(du -sh "$DB_DATA_DIR"/pg.sql 2>/dev/null | cut -f1 || echo 'N/A')"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [backup|restore|start-restore|stats|cleanup|help]"
    echo ""
    echo "Commands:"
    echo "  backup        - Create backup (saves to db_backups/ and db_data/pg.sql)"
    echo "  restore       - Restore from db_data/pg.sql (container must be running)"
    echo "  start-restore - Stop PostgreSQL, start fresh, and restore from db_data/pg.sql"
    echo "  stats         - Show backup statistics"
    echo "  cleanup       - Clean up old backup files"
    echo "  help          - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 backup        # Create new backup"
    echo "  $0 restore       # Restore from current pg.sql"
    echo "  $0 start-restore # Fresh start with pg.sql data"
    echo "  $0 stats         # Show backup statistics"
    echo "  $0 cleanup       # Clean up old backups"
    echo "  $0 help          # Show this help"
}

# Clean up old backups
cleanup_old_backups() {
    local retention_days=31
    log_info "Cleaning up backups older than $retention_days days..."
    local deleted_count=$(find "$DB_BACKUPS_DIR" -name "pg_backup_*.sql" -type f -mtime +$retention_days -delete -print 2>/dev/null | wc -l)
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old backup files"
    else
        log_info "No old backup files to delete"
    fi
}

# Main script logic
main() {
    local command="${1:-help}"
    
    case "$command" in
        "backup")
            local container=$(get_postgres_container)
            check_container_running "$container"
            create_backup "$container"
            ;;
        "restore")
            local container=$(get_postgres_container)
            check_container_running "$container"
            restore_database "$container"
            ;;
        "start-restore")
            start_with_restore
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