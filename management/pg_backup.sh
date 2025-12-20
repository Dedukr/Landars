#!/bin/bash

#########################################################################
# Ultimate Database Backup Script for FoodPlatform
#
# This comprehensive script combines all backup functionality:
# - PostgreSQL dumps (current database)
# - Point-in-Time Recovery (PITR) support with WAL archiving
# - S3 cloud backup integration
# - Automatic cleanup and retention
# - Health monitoring and statistics
# - Docker container integration
# - Flexible restore options
#
# BACKUP TYPES:
# 1. Dump Backups (pg_dump):
#    - Command: ./pg_backup.sh backup
#    - Creates compressed SQL dump files (.dump format)
#    - Fast, portable, database-level backups
#    - Best for: Regular backups, migrations, database exports
#
# 2. PITR Base Backups (pg_basebackup):
#    - Command: ./pg_backup.sh pitr-backup
#    - Creates base backup of entire PostgreSQL cluster
#    - Requires WAL archiving to be enabled
#    - Best for: Point-in-time recovery, full cluster backups
#
# RESTORE OPTIONS:
# 1. Restore from Dump:
#    - Command: ./pg_backup.sh restore [backup_file] [--promote] [--force]
#    - Restores from pg_dump backup files
#    - Options:
#      * (default) - Restore to DB_restore (safe, doesn't modify live DB)
#      * --promote  - Restore + validate + swap into live (keeps old DB)
#      * --force    - Restore directly to live DB (drops existing)
#
# 2. Restore from PITR with WAL:
#    - Command: ./pg_backup.sh pitr-restore [backup_name] [OPTIONS]
#    - Restores from base backup and applies WAL files for point-in-time recovery
#    - Options:
#      * --target-time TIME  - Restore to specific timestamp (e.g., '2025-12-17 15:30:00')
#      * --target-lsn LSN    - Restore to specific LSN (e.g., '0/1234567')
#      * --target-xid XID    - Restore to specific transaction ID
#      * --promote            - Promote restored DB to live after recovery
#      * --keep/--no-keep     - Keep or drop old DB when promoting
#
# Features:
# - Multiple backup strategies (SQL dump, PITR base backup)
# - Automatic old backup cleanup
# - Cloud storage integration (S3)
# - Comprehensive logging and monitoring
# - Configuration via .env file
# - Clean database restore (drops and recreates database)
# - Health checks and verification
# - Cross-platform compatibility
# - WAL archiving support for continuous backup
#
# Usage:
#   chmod +x pg_backup.sh
#   ./pg_backup.sh [command] [options]
#
#########################################################################

# Script configuration
# Note: set -e is intentionally disabled to allow graceful error handling

# Color codes for enhanced output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global log file variable (initialized in init_config)
LOG_FILE=""

# Initialize daily log file
init_log_file() {
    # Use LOG_DIR set in init_config (from .env or default)
    local log_dir="${LOG_DIR}"
    
    # Try to create log directory, fallback to /tmp if it fails
    if ! mkdir -p "$log_dir" 2>/dev/null; then
        log_dir="/tmp"
    fi
    
    # Create daily log file name: backup_YYYY-MM-DD.log
    local date_str=$(date +"%Y-%m-%d")
    LOG_FILE="${log_dir}/backup_${date_str}.log"
    
    # Ensure log file exists and is writable
    if ! touch "$LOG_FILE" 2>/dev/null; then
        # Fallback to /tmp if log directory is not writable
        LOG_FILE="/tmp/backup_${date_str}.log"
        if ! touch "$LOG_FILE" 2>/dev/null; then
            LOG_FILE=""
        fi
    fi
}

# Log command separator to file (for visual separation between commands)
log_command_separator() {
    local command_name="$1"
    local command_args="$2"
    local separator_line="=================================================================================="
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [[ -n "$LOG_FILE" ]]; then
        {
            echo ""
            echo "$separator_line"
            echo "COMMAND: $command_name"
            if [[ -n "$command_args" ]]; then
                echo "ARGUMENTS: $command_args"
            fi
            echo "STARTED: $timestamp"
            echo "$separator_line"
            echo ""
        } >> "$LOG_FILE" 2>/dev/null || true
    fi
}

# Enhanced logging functions with colors and emojis
# Logs to both stdout/stderr (with colors) and daily log file (without colors)
log_info() {
    local message="[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${BLUE}${message}${NC}"
    if [[ -n "$LOG_FILE" ]]; then
        echo "$message" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

log_error() {
    local message="[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${RED}${message}${NC}" >&2
    if [[ -n "$LOG_FILE" ]]; then
        echo "$message" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

log_success() {
    local message="[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${GREEN}${message}${NC}"
    if [[ -n "$LOG_FILE" ]]; then
        echo "$message" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

log_warning() {
    local message="[WARNING] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${YELLOW}${message}${NC}"
    if [[ -n "$LOG_FILE" ]]; then
        echo "$message" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

check_postgres_container() {
    # Ensure target container exists and is running before backup
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}\$"; then
        log_error "PostgreSQL container '${POSTGRES_CONTAINER}' not found or not running."
        log_info "Available containers:"
        docker ps --format '{{.Names}}' 2>/dev/null | while read -r name; do
            log_info "  - $name"
        done || log_info "  (docker ps failed or no containers running)"
        
        log_info "Trying to detect container name..."
        # Try docker-compose detection again
        if command -v docker-compose &> /dev/null; then
            detected=$(docker-compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
            if [[ -n "$detected" ]]; then
                log_info "Found via docker-compose: $detected"
                POSTGRES_CONTAINER="$detected"
                return 0
            fi
        fi
        
        # Try docker compose v2
        if command -v docker &> /dev/null; then
            detected=$(docker compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
            if [[ -n "$detected" ]]; then
                log_info "Found via docker compose: $detected"
                POSTGRES_CONTAINER="$detected"
                return 0
            fi
        fi
        
        log_error "Set POSTGRES_CONTAINER or POSTGRES_HOST environment variable to the correct container name."
        exit 1
    fi
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        local message="[DEBUG] $(date '+%Y-%m-%d %H:%M:%S') - $1"
        echo -e "${PURPLE}${message}${NC}"
        if [[ -n "$LOG_FILE" ]]; then
            echo "$message" >> "$LOG_FILE" 2>/dev/null || true
        fi
    fi
}

# Script header
print_header() {
    echo -e "${CYAN}"
    echo "🗄️  Ultimate Database Backup System for FoodPlatform"
    echo "====================================================="
    echo -e "${NC}"
}

# Suppress header and startup messages - only show errors/warnings
# print_header
# log_info "Ultimate backup script started"
# log_info "Runtime: host $(hostname), pwd $(pwd)"
# log_info "Env (pre-load): DB_TYPE=${DB_TYPE:-unset}, POSTGRES_HOST=${POSTGRES_HOST:-unset}, POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-unset}"

#########################################################################
# CONFIGURATION MANAGEMENT
#########################################################################

# Load configuration from environment file
load_env() {
    # Use absolute path for .env file (required for cron jobs)
    # Use ENV_FILE if set, otherwise use PROJECT_DIR/.env
    local env_file="${ENV_FILE:-${PROJECT_DIR}/.env}"
    
    if [[ -f "$env_file" ]]; then
        log_debug "Loading configuration from $env_file"
        # Robust .env loader that preserves spaces and ignores comments/blank lines
        # Supports unquoted values that may contain spaces or brackets.
        local line_num=0
        local loaded_count=0
        while IFS= read -r line || [[ -n "$line" ]]; do
            ((++line_num))
            # Skip empty lines and comments
            [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

            # Only process lines containing '='
            if [[ "$line" != *"="* ]]; then
                log_warning "Skipping invalid line $line_num in .env (no '='): $line"
                continue
            fi

            # Split on first '=' to preserve value intact
            key="${line%%=*}"
            value="${line#*=}"

            # Trim whitespace around key
            key="${key#"${key%%[![:space:]]*}"}"
            key="${key%"${key##*[![:space:]]}"}"

            # Strip inline comments from value
            # Remove everything from # onwards (handles: VALUE=something  # comment)
            # This is safe for most .env files where comments appear after values
            if [[ "$value" == *"#"* ]]; then
                value="${value%%#*}"
            fi

            # Trim whitespace from value (leading and trailing)
            value="${value#"${value%%[![:space:]]*}"}"
            value="${value%"${value##*[![:space:]]}"}"

            # Keys must be valid shell identifiers
            if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
                log_warning "Skipping invalid key at line $line_num in .env: $key"
                continue
            fi

            # Export the variable, but don't fail the script if it fails
            if export "$key=$value" 2>/dev/null; then
                ((++loaded_count))
            else
                log_warning "Failed to export '$key' from .env line $line_num, skipping"
            fi
        done < "$env_file"
        log_debug "Configuration loaded from $env_file ($loaded_count variables loaded)"
    else
        log_warning ".env file not found at $env_file. Using default configuration."
        log_debug "Set ENV_FILE environment variable or create .env file at: $env_file"
    fi
}

# Remove surrounding double quotes from path-like variables to avoid
# accidental nested paths such as /foo/"/foo"/bar when .env values are quoted.
strip_wrapping_quotes() {
    local value="$1"
    value="${value%\"}"
    value="${value#\"}"
    echo "$value"
}

# Try to detect PostgreSQL container name from docker-compose first
# This handles cases where container name depends on project directory
# Even if POSTGRES_CONTAINER is set, we'll verify it exists and auto-detect if needed
detect_postgres_container() {
    # First, verify if the configured container exists and is running
    if [[ -n "${POSTGRES_CONTAINER:-}" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}\$"; then
        log_debug "Using PostgreSQL container: $POSTGRES_CONTAINER"
        return 0
    fi

    # If configured container doesn't exist or isn't running, try to detect it
    if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
        log_debug "Container '${POSTGRES_CONTAINER}' not found, attempting auto-detection..."
    fi

    # Try docker-compose first (most reliable)
    if command -v docker-compose &> /dev/null; then
        detected_container=$(docker-compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
        if [[ -n "$detected_container" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${detected_container}\$"; then
            POSTGRES_CONTAINER="$detected_container"
            log_debug "Detected PostgreSQL container: $POSTGRES_CONTAINER"
            return 0
        fi
    fi
    
    # Fallback: try docker compose (v2)
    if command -v docker &> /dev/null; then
        detected_container=$(docker compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
        if [[ -n "$detected_container" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${detected_container}\$"; then
            POSTGRES_CONTAINER="$detected_container"
            log_debug "Detected PostgreSQL container: $POSTGRES_CONTAINER"
            return 0
        fi
    fi
    
    # Last resort: try to find any postgres container
    detected_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i postgres | head -1)
    if [[ -n "$detected_container" ]]; then
        POSTGRES_CONTAINER="$detected_container"
        log_debug "Detected PostgreSQL container: $POSTGRES_CONTAINER"
        return 0
    fi
    
    return 1
}

# Initialise configuration (env, containers, paths, retention, timestamps)
init_config() {
    # Set PROJECT_DIR early (needed for .env path resolution)
    # Default to server path if not set, or try to detect from script location
    if [[ -z "$(strip_wrapping_quotes "${PROJECT_DIR:-}")" ]]; then
        # Try to determine from script location
        local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        local script_parent="$(cd "$script_dir/.." && pwd)"
        if [[ -f "$script_parent/.env" ]] || [[ -f "$script_parent/docker-compose.yml" ]]; then
            PROJECT_DIR="$script_parent"
        fi
    fi
    
    # Load environment variables (tolerant of missing values)
    set +u
    load_env
    set -u
    
    # After load_env, PROJECT_DIR might have been set from .env file
    # Strip quotes again in case it was quoted in .env
    PROJECT_DIR="$(strip_wrapping_quotes "${PROJECT_DIR}")"

    # Detect or verify PostgreSQL container (don't exit on failure, let main/backup handle it)
    detect_postgres_container
    local detect_result=$?
    if [[ $detect_result -ne 0 ]]; then
        log_warning "Could not detect PostgreSQL container automatically. Will try again during backup."
    fi

    # Normalize postgres container/host naming to match docker-compose on server
    POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"
    POSTGRES_HOST="${POSTGRES_HOST:-}"

    # Set database configuration from environment variables (loaded from .env via load_env)
    # Use ${VAR:-} syntax to allow unset variables (defaults to empty string)
    # This prevents "unbound variable" errors when .env doesn't exist or lacks these vars
    # Validation will catch empty values later
    DB_TYPE="${DB_TYPE:-postgresql}"
    DB_NAME="${POSTGRES_DB:-}"
    DB_USER="${POSTGRES_USER:-}"
    DB_PASSWORD="${POSTGRES_PASSWORD:-}"
    DB_HOST="${POSTGRES_HOST:-localhost}"
    DB_PORT="${POSTGRES_PORT:-5432}"

    # Directory configuration
    BACKUP_BASE_DIR="${PROJECT_DIR}/db_backups"
    ARCHIVE_DIR="${BACKUP_BASE_DIR}/postgres/wal_archive"
    LOG_DIR="${BACKUP_BASE_DIR}/logs"

    # Retention policies
    # Best practices:
    # - PostgreSQL backups (pg_dump custom format): 30 days (daily backups, quick restore)
    # - PITR backups (pg_basebackup): Keep 2 most recent (count-based, not time-based)
    #   When 3rd backup is created, oldest is deleted (always keep 2 latest)
    # - Logs: Double the longest backup retention (60 days = 2x SQL retention)
    # - WAL files: Keep for double the PITR base retention period (default: 14 days)
    SQL_RETENTION_DAYS="${SQL_RETENTION_DAYS:-30}"
    PITR_RETENTION_COUNT="${PITR_RETENTION_COUNT:-2}"  # Keep 2 most recent PITR backups
    # Log retention is calculated as double the longest backup retention
    LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-$((SQL_RETENTION_DAYS * 2))}"
    # WAL retention: default to 14 days (covers 2 weekly PITR backups, or can be set to 2x PITR period)
    WAL_RETENTION_DAYS="${WAL_RETENTION_DAYS:-14}"
    # S3 retention: default to SQL retention, but can be set separately
    S3_RETENTION_DAYS="${S3_RETENTION_DAYS:-$SQL_RETENTION_DAYS}"

    # S3 Configuration
    AWS_STORAGE_BUCKET_NAME="${AWS_STORAGE_BUCKET_NAME:-}"
    AWS_S3_REGION_NAME="${AWS_S3_REGION_NAME:-us-east-1}"
    S3_STORAGE_CLASS="${S3_STORAGE_CLASS:-STANDARD_IA}"

    # PostgreSQL container configuration
    POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-postgres-1}"

    # Backup naming (fresh timestamp per invocation)
    TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
    DATE_ONLY=$(date +"%Y-%m-%d")
    
    # Initialize daily log file (after directories are set)
    init_log_file
    if [[ -n "$LOG_FILE" ]]; then
        log_debug "Logging to: $LOG_FILE"
    fi
}

#########################################################################
# UTILITY FUNCTIONS
#########################################################################

# Validate configuration
validate_config() {
    local errors=0
    
    # Check required environment for PostgreSQL
    if [[ "$DB_TYPE" == "postgresql" ]]; then
        if [[ -z "$DB_NAME" ]]; then
            log_error "POSTGRES_DB is not set"
            ((++errors))
        fi
        
        if [[ -z "$DB_USER" ]]; then
            log_error "POSTGRES_USER is not set"
            ((++errors))
        fi
    fi
    
    # Check S3 configuration if S3 backup is enabled
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        if ! command -v aws &> /dev/null; then
            log_warning "AWS CLI not found. S3 backup will be disabled."
            AWS_STORAGE_BUCKET_NAME=""
        else
            log_debug "S3 backup enabled to bucket: $AWS_STORAGE_BUCKET_NAME"
        fi
    fi
    
    if [[ $errors -gt 0 ]]; then
        log_error "Configuration validation failed with $errors error(s)"
        return 1
    fi
    
    return 0
}

# Get PostgreSQL container name from docker list of containers
get_postgres_container() {
    local container_name=""
    
    # First, try to get from docker ps list (most reliable)
    # Check all running containers for postgres-related names
    container_name=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    
    # If not found, try docker-compose
    if [[ -z "$container_name" ]] && command -v docker-compose &> /dev/null; then
        container_name=$(docker-compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
    fi
    
    # If still not found, try docker compose v2
    if [[ -z "$container_name" ]] && command -v docker &> /dev/null; then
        container_name=$(docker compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
    fi
    
    # Fallback to environment variable
    if [[ -z "$container_name" ]] && [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
        container_name="$POSTGRES_CONTAINER"
    fi
    
    # Verify container exists and is running
    if [[ -n "$container_name" ]]; then
        # Check if container is actually running
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
            echo "$container_name"
            return 0
        else
            # Container name found but not running - check if it exists at all
            if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
                log_error "PostgreSQL container '$container_name' exists but is not running"
                return 1
            else
                log_error "PostgreSQL container '$container_name' not found"
                return 1
            fi
        fi
    else
        # No container found at all
        if [[ "${DEBUG:-false}" == "true" ]]; then
            log_debug "Available containers:"
            docker ps --format '  {{.Names}}' 2>/dev/null | while read -r name; do
                log_debug "    - $name"
            done || log_debug "    (docker ps failed)"
        fi
        return 1
    fi
}

# Get PostgreSQL service name for docker compose commands
# This tries to detect the service name from the container name or uses a fallback
get_postgres_service() {
    local container_name
    container_name=$(get_postgres_container 2>/dev/null)
    
    # Try to extract service name from container name (docker compose format: project_service_number)
    # If container name matches pattern, extract service part
    if [[ "$container_name" =~ ^[^_]+_(.+)_[0-9]+$ ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    
    # Fallback: try to find service name from docker compose
    local service_name=""
    if command -v docker-compose &> /dev/null; then
        service_name=$(docker-compose ps --services 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    fi
    
    if [[ -z "$service_name" ]] && command -v docker &> /dev/null; then
        service_name=$(docker compose ps --services 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    fi
    
    # Final fallback
    if [[ -n "$service_name" ]]; then
        echo "$service_name"
        return 0
    else
        echo "postgres"
        return 0
    fi
}

# Check if container is running
check_container_running() {
    local container="$1"
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "Container $container is not running"
        return 1
    fi
    return 0
}

# Create backup directories
ensure_backup_dirs() {
    mkdir -p "$BACKUP_BASE_DIR/postgresql"
    # Create archive directory for PITR backups on host
    mkdir -p "$BACKUP_BASE_DIR/archive"
    # Always create archive directory (PITR is always enabled)
    mkdir -p "$ARCHIVE_DIR"
    log_debug "Backup directories ensured"
}

# Calculate file size in human readable format
get_file_size() {
    local file="$1"
    if [[ -f "$file" ]]; then
        du -h "$file" | cut -f1
    else
        echo "N/A"
    fi
}

# Calculate directory size
get_dir_size() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        du -sh "$dir" 2>/dev/null | cut -f1 || echo "N/A"
    else
        echo "N/A"
    fi
}

#########################################################################
# POSTGRESQL BACKUP FUNCTIONS
#########################################################################

# Create PostgreSQL SQL dump backup
create_postgresql_backup() {
    log_info "🐘 Creating PostgreSQL backup..."
    
    # Quick connectivity check before dump
    log_info "🔌 Checking DB connectivity (user: $DB_USER, db: $DB_NAME)..."
    local pg_service
    pg_service=$(get_postgres_service)
    if ! docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "DB connectivity check failed (user: $DB_USER, db: $DB_NAME)"
        return 1
    fi
    
    # Pre-backup health check (always run, non-blocking)
    log_info "🏥 Running pre-backup health check..."
    if health_check; then
        log_success "✅ Pre-backup health check passed"
    else
        log_warning "⚠️  Pre-backup health check found issues, but proceeding with backup..."
    fi
    echo ""

    local backup_file="landarsfood_backup_${TIMESTAMP}.dump"
    local backup_path="$BACKUP_BASE_DIR/postgresql/$backup_file"
    local current_backup="$BACKUP_BASE_DIR/postgresql/latest.dump"
    local start_time=$(date +%s)
    
    ensure_backup_dirs
    
    log_info "📊 Starting PostgreSQL dump (custom compressed format)..."
    log_info "📁 Backup file: $backup_path"
    log_debug "Paths: PROJECT_DIR=$PROJECT_DIR BACKUP_BASE_DIR=$BACKUP_BASE_DIR"
    log_debug "Working dir: $(pwd)"
    log_debug "Ensuring backup dir exists and is writable..."
    ls -ld "$BACKUP_BASE_DIR" "$BACKUP_BASE_DIR/postgresql" 2>/dev/null || true
    if ! touch "$BACKUP_BASE_DIR/postgresql/.write_test" 2>/dev/null; then
        log_error "Backup directory not writable: $BACKUP_BASE_DIR/postgresql"
    else
        rm -f "$BACKUP_BASE_DIR/postgresql/.write_test"
    fi
    
    # Create the backup using pg_dump (via docker compose exec) with stderr captured
    local dump_log
    dump_log=$(mktemp)
    # Ensure pg_dump exists in the container
    local pg_service
    pg_service=$(get_postgres_service)
    if ! docker compose exec -T "$pg_service" sh -c "command -v pg_dump" >/dev/null 2>&1; then
        log_error "pg_dump not found in postgres container"
        rm -f "$dump_log"
        return 1
    fi

    # Atomic write: write to .tmp first, then move to final name
    local backup_path_tmp="${backup_path}.tmp"
    
    # Run pg_dump with custom compressed format (-F c = custom format, -Z 9 = max compression, -f = output file)
    # Save to organized backup directory inside container: /var/lib/postgresql/backups/
    local container_backup_dir="/var/lib/postgresql/backups"
    local container_backup_path="${container_backup_dir}/${backup_file}"
    local pg_service
    pg_service=$(get_postgres_service)
    
    # Ensure backup directory exists in container
    docker compose exec -T "$pg_service" sh -c "mkdir -p $container_backup_dir && chown postgres:postgres $container_backup_dir" 2>/dev/null || true
    
    if docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" "$pg_service" pg_dump \
        -U "$DB_USER" \
        -h localhost \
        -d "$DB_NAME" \
        -F c \
        -Z 9 \
        -f "$container_backup_path" \
        --verbose \
        --no-password \
        2> "$dump_log"; then
        
        # Copy backup file from container to host (for local access and S3 upload)
        local container_name
        container_name=$(get_postgres_container)
        if [[ -z "$container_name" ]]; then
            log_error "Could not determine postgres container name for file copy"
            rm -f "$dump_log"
            return 1
        fi
        
        if ! docker cp "${container_name}:${container_backup_path}" "$backup_path_tmp"; then
            log_error "Failed to copy backup file from container to host"
            rm -f "$dump_log"
            rm -f "$backup_path_tmp"
            return 1
        fi
        
        # Atomic move: only commit if dump succeeded
        if mv "$backup_path_tmp" "$backup_path"; then
            local duration=$(($(date +%s) - start_time))
            local file_size=$(get_file_size "$backup_path")
            
            log_success "✅ PostgreSQL backup completed in ${duration}s"
            log_info "📄 File: $backup_path"
            log_info "📊 Size: $file_size"
            log_debug "pg_dump log:\n$(cat "$dump_log")"
            
            # Create/update latest backup symlink
            ln -sf "$backup_file" "$current_backup"
            log_debug "Latest backup symlink updated"
            
            # Update pg.dump in db_data folder if it exists
            local db_data_dir="$PROJECT_DIR/db_data"
            if [[ -d "$db_data_dir" ]]; then
                cp "$backup_path" "$db_data_dir/pg.dump"
                log_info "📁 Updated db_data/pg.dump with latest backup"
            fi
            
            # Upload to S3 if configured
            if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
                upload_to_s3 "$backup_path" "postgresql"
            fi
            
            # Cleanup old backups
            cleanup_old_postgresql_backups
            
            rm -f "$dump_log"
            return 0
        else
            log_error "❌ Failed to commit backup file (atomic move failed)"
            rm -f "$backup_path_tmp"
            rm -f "$dump_log"
            return 1
        fi
    else
        log_error "❌ PostgreSQL backup failed"
        log_error "Context: backup_path=$backup_path DB_NAME=$DB_NAME DB_USER=$DB_USER PROJECT_DIR=$PROJECT_DIR"
        log_error "pg_dump stderr (see below)"
        cat "$dump_log" >&2
        log_debug "Directory listing of backup target:"
        ls -la "$BACKUP_BASE_DIR/postgresql" 2>/dev/null || true
        rm -f "$backup_path_tmp"
        rm -f "$dump_log"
        return 1
    fi
}

# Restore PostgreSQL from backup with clean database recreation
restore_postgresql_backup() {
    local backup_file=""
    local force_flag=false
    local promote_flag=false
    local keep_old_flag=true  # Default to true
    local start_time=$(date +%s)
    
    # Pre-restore health check (always run, non-blocking)
    log_info "🏥 Running pre-restore health check..."
    if health_check; then
        log_success "✅ Pre-restore health check passed"
    else
        log_warning "⚠️  Pre-restore health check found issues, but proceeding with restore..."
    fi
    echo ""
    
    # Parse arguments: separate backup file from flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                if [[ "$force_flag" == "true" ]]; then
                    log_warning "Duplicate --force flag ignored"
                else
                    force_flag=true
                fi
                shift
                ;;
            --promote)
                if [[ "$promote_flag" == "true" ]]; then
                    log_warning "Duplicate --promote flag ignored"
                else
                    promote_flag=true
                fi
                shift
                ;;
            --keep)
                if [[ "$keep_old_flag" == "true" ]]; then
                    log_warning "Duplicate --keep flag ignored"
                else
                    keep_old_flag=true
                fi
                shift
                ;;
            --no-keep)
                keep_old_flag=false
                shift
                ;;
            *)
                if [[ -z "$backup_file" ]]; then
                    backup_file="$1"
                else
                    log_warning "Multiple backup files specified, using first: $backup_file"
                fi
                shift
                ;;
        esac
    done
    
    # Validate flag combinations
    if [[ "$promote_flag" == "true" ]] && [[ "$force_flag" == "true" ]]; then
        log_warning "⚠️  --promote and --force are both set. --promote will take precedence (will keep old DB unless --no-keep is used)"
        force_flag=false  # Promote handles the swap, so we don't need force
    fi
    
    # Default to latest backup if no file specified
    if [[ -z "$backup_file" ]]; then
        backup_file="$BACKUP_BASE_DIR/postgresql/latest.dump"
        # If latest.dump is a symlink, resolve it to the actual file
        if [[ -L "$backup_file" ]]; then
            local symlink_target
            symlink_target=$(readlink -f "$backup_file" 2>/dev/null || readlink "$backup_file" 2>/dev/null || echo "")
            if [[ -n "$symlink_target" ]] && [[ -f "$symlink_target" ]]; then
                backup_file="$symlink_target"
                log_info "Resolved symlink to: $backup_file"
            elif [[ -n "$symlink_target" ]]; then
                log_warning "Symlink '$backup_file' points to non-existent file: $symlink_target"
            fi
        fi
    else
        # If just a filename is provided (not a full path), look in the backup directory
        if [[ "$backup_file" != /* ]] && [[ "$backup_file" != ./* ]]; then
            # It's just a filename, prepend the backup directory
            local backup_dir="$BACKUP_BASE_DIR/postgresql"
            backup_file="$backup_dir/$backup_file"
        fi
        # Resolve symlinks if present
        if [[ -L "$backup_file" ]]; then
            local symlink_target
            symlink_target=$(readlink -f "$backup_file" 2>/dev/null || readlink "$backup_file" 2>/dev/null || echo "")
            if [[ -n "$symlink_target" ]] && [[ -f "$symlink_target" ]]; then
                backup_file="$symlink_target"
                log_info "Resolved symlink to: $backup_file"
            fi
        fi
    fi
    
    # Check if backup file exists and is readable
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        log_info "Available backups in $BACKUP_BASE_DIR/postgresql:"
        ls -la "$BACKUP_BASE_DIR/postgresql"/landarsfood_backup_*.dump 2>/dev/null | awk '{print "  " $9}' || log_info "  No backup files found"
        log_info ""
        log_info "Usage examples:"
        log_info "  $0 restore                                    # Restore to ${DB_NAME}_restore (safe default)"
        log_info "  $0 restore --promote                         # Restore + validate + swap into live (keeps old DB)"
        log_info "  $0 restore --promote --no-keep              # Restore + validate + swap (drops old DB)"
        log_info "  $0 restore --force                           # Restore to $DB_NAME (drops existing DB, no validation)"
        log_info "  $0 restore backup.dump                       # Restore specific file to ${DB_NAME}_restore"
        log_info "  $0 restore backup.dump --promote            # Restore specific file + promote to live"
        return 1
    fi
    
    # Check if file is readable and has content
    if [[ ! -r "$backup_file" ]]; then
        log_error "Backup file is not readable: $backup_file"
        return 1
    fi
    
    local file_size_bytes
    file_size_bytes=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    if [[ "$file_size_bytes" == "0" ]] || [[ -z "$file_size_bytes" ]]; then
        log_error "Backup file is empty: $backup_file"
        return 1
    fi
    log_debug "Backup file size: $file_size_bytes bytes"
    
    # Determine target database name and mode
    local target_db_name
    if [[ "$promote_flag" == "true" ]]; then
        # Promote mode: restore to _restore first, then swap
        target_db_name="${DB_NAME}_restore"
        log_info "🔄 Starting PostgreSQL restore with promotion from: $backup_file"
        log_info "Target database: $target_db_name (will be promoted to '$DB_NAME' after validation)"
        if [[ "$keep_old_flag" == "true" ]]; then
            log_info "Old database will be kept as '${DB_NAME}_old_<timestamp>'"
        else
            log_info "Old database will be dropped"
        fi
    elif [[ "$force_flag" == "true" ]]; then
        target_db_name="$DB_NAME"
        log_warning "⚠️  FORCE MODE: This will DROP the existing database '$DB_NAME'!"
        log_info "🔄 Starting comprehensive PostgreSQL restore from: $backup_file"
        log_info "Target database: $target_db_name (will drop existing if present)"
        
        # Step 1: Drop existing database (only in force mode)
        log_info "🗑️ Dropping existing database (if it exists)..."
        local pg_service
        pg_service=$(get_postgres_service)
        docker compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $target_db_name;" >/dev/null 2>&1 || docker-compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $target_db_name;" >/dev/null 2>&1
        drop_result=$?
        if [[ $drop_result -eq 0 ]]; then
            log_success "Existing database dropped"
        else
            log_warning "No existing database to drop (this is normal for fresh installs)"
        fi
    else
        target_db_name="${DB_NAME}_restore"
        log_info "🔄 Starting safe PostgreSQL restore from: $backup_file"
        log_info "Target database: $target_db_name (original database '$DB_NAME' will NOT be modified)"
        log_info "💡 Use --promote to restore and swap into live, or --force to restore directly to '$DB_NAME'"
    fi
    
    # Step 2: Create target database
    log_info "🆕 Creating database: $target_db_name..."
    local pg_service
    pg_service=$(get_postgres_service)
    # Drop restore database if it exists (safe to recreate)
    docker compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $target_db_name;" >/dev/null 2>&1 || docker-compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $target_db_name;" >/dev/null 2>&1
    
    docker compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $target_db_name;" >/dev/null 2>&1 || docker-compose exec "$pg_service" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $target_db_name;" >/dev/null 2>&1
    create_result=$?
    if [[ $create_result -eq 0 ]]; then
        log_success "Database '$target_db_name' created"
    else
        log_error "Failed to create database '$target_db_name'"
        return 1
    fi
    
    # Step 3: Restore from backup using pg_restore (for custom format)
    log_info "📥 Restoring from backup: $backup_file"
    
    # Copy backup file into container for pg_restore
    local container_name
    container_name=$(get_postgres_container)
    
    if [[ -z "$container_name" ]]; then
        log_error "Could not determine postgres container name for restore"
        return 1
    fi
    
    local container_backup_path="/tmp/restore_$(basename "$backup_file")"
    if ! docker cp "$backup_file" "${container_name}:${container_backup_path}"; then
        log_error "Failed to copy backup file into container"
        return 1
    fi
    
    # Use pg_restore for custom format backups
    local pg_service
    pg_service=$(get_postgres_service)
    
    # Capture error output for debugging
    local restore_log
    restore_log=$(mktemp)
    
    # Check if backup file exists and is readable in container
    if ! docker compose exec -T "$pg_service" sh -c "test -f $container_backup_path && test -r $container_backup_path" 2>/dev/null; then
        log_error "Backup file not found or not readable in container: $container_backup_path"
        log_info "Checking if file was copied correctly..."
        docker compose exec -T "$pg_service" ls -lh "$container_backup_path" 2>&1 || true
        rm -f "$restore_log"
        docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
        return 1
    fi
    
    # Check file size (should be > 0)
    local file_size
    file_size=$(docker compose exec -T "$pg_service" sh -c "stat -f%z $container_backup_path 2>/dev/null || stat -c%s $container_backup_path 2>/dev/null" 2>/dev/null || echo "0")
    if [[ "$file_size" == "0" ]] || [[ -z "$file_size" ]]; then
        log_error "Backup file appears to be empty (size: $file_size bytes)"
        log_info "Original backup file: $backup_file"
        if [[ -L "$backup_file" ]]; then
            log_info "Backup file is a symlink pointing to: $(readlink "$backup_file")"
            local symlink_target
            symlink_target=$(readlink -f "$backup_file" 2>/dev/null || readlink "$backup_file")
            if [[ -f "$symlink_target" ]]; then
                log_info "Symlink target exists. Trying to use actual file..."
                backup_file="$symlink_target"
                # Re-copy the actual file
                if ! docker cp "$backup_file" "${container_name}:${container_backup_path}"; then
                    log_error "Failed to copy actual backup file into container"
                    rm -f "$restore_log"
                    return 1
                fi
                # Re-check file size after re-copy
                file_size=$(docker compose exec -T "$pg_service" sh -c "stat -f%z $container_backup_path 2>/dev/null || stat -c%s $container_backup_path 2>/dev/null" 2>/dev/null || echo "0")
                if [[ "$file_size" == "0" ]] || [[ -z "$file_size" ]]; then
                    log_error "Backup file is still empty after re-copy. File may be corrupted or invalid."
                    rm -f "$restore_log"
                    docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
                    return 1
                fi
            else
                log_error "Symlink target does not exist: $symlink_target"
                rm -f "$restore_log"
                docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
                return 1
            fi
        else
            log_error "Backup file exists but is empty. File may be corrupted."
            rm -f "$restore_log"
            docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
            return 1
        fi
    fi
    
    # Verify backup file format (pg_dump custom format should start with "PGDMP")
    log_debug "Verifying backup file format..."
    local file_header
    file_header=$(docker compose exec -T "$pg_service" sh -c "head -c 5 $container_backup_path 2>/dev/null" 2>/dev/null || echo "")
    if [[ "$file_header" != "PGDMP" ]]; then
        log_warning "Backup file may not be in pg_dump custom format (header: $file_header)"
        log_info "Expected 'PGDMP' header for custom format dumps"
        log_info "File might be in SQL format or corrupted. Attempting restore anyway..."
    else
        log_debug "Backup file format verified (custom format)"
    fi
    
    if docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" "$pg_service" pg_restore \
        -U "$DB_USER" \
        -d "$target_db_name" \
        --verbose \
        --no-password \
        --clean \
        --if-exists \
        "$container_backup_path" >"$restore_log" 2>&1; then
        log_success "Database restored from backup to '$target_db_name'"
        # Clean up backup file in container
        docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
        rm -f "$restore_log"
    else
        log_error "Failed to restore database from backup"
        log_error "pg_restore error output:"
        cat "$restore_log" >&2 || true
        log_info "Troubleshooting:"
        log_info "  - Backup file: $backup_file"
        log_info "  - Container path: $container_backup_path"
        log_info "  - Target database: $target_db_name"
        log_info "  - File size in container: $file_size bytes"
        # Clean up backup file in container
        docker compose exec -T "$pg_service" rm -f "$container_backup_path" 2>/dev/null || true
        rm -f "$restore_log"
        return 1
    fi
    
    # Step 4: Verify the restore
    log_info "✅ Verifying restore..."
    local table_count=0
    local pg_service
    pg_service=$(get_postgres_service)
    table_count=$(docker compose exec "$pg_service" psql -U "$DB_USER" -d "$target_db_name" -t -c "
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " 2>/dev/null | tr -d ' ' || echo "0") || docker-compose exec "$pg_service" psql -U "$DB_USER" -d "$target_db_name" -t -c "
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " 2>/dev/null | tr -d ' ' || echo "0"
    
    # Ensure table_count is numeric
    if ! [[ "$table_count" =~ ^[0-9]+$ ]]; then
        table_count=0
    fi
    
    if [[ "$table_count" -gt 0 ]]; then
        log_success "Restore verification successful - Found $table_count tables"
    else
        log_warning "No tables found in restored database"
        if [[ "$promote_flag" == "true" ]]; then
            log_error "Cannot promote database with no tables. Aborting promotion."
            return 1
        fi
    fi
    
    # Step 5: Promote to live if requested
    # Promote if requested (use the dedicated promote function)
    if [[ "$promote_flag" == "true" ]]; then
        log_info ""
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "Promoting restored database to live..."
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        # Build arguments for promote function
        local promote_args=()
        if [[ "$keep_old_flag" == "false" ]]; then
            promote_args+=("--no-keep")
        fi
        # Skip validation since we just restored and verified
        promote_args+=("--no-validate")
        
        # Call the promote function
        if promote_database "${promote_args[@]}"; then
            target_db_name="$DB_NAME"  # Update for summary
        else
            log_error "Promotion failed. Restored database remains as '$target_db_name'"
            return 1
        fi
    fi
    
    # Post-restore health check (always run after restore, non-blocking)
    log_info ""
    log_info "🏥 Running post-restore health check..."
    if health_check; then
        log_success "✅ Post-restore health check passed - System is healthy"
    else
        log_warning "⚠️  Post-restore health check found issues - Please verify manually"
    fi
    echo ""
    
    # Step 6: Final summary
    local duration=$(($(date +%s) - start_time))
    
    log_success "🎉 PostgreSQL restore completed successfully in ${duration}s"
    log_info "📊 Restore Summary:"
    log_info "  - Target database: $target_db_name"
    log_info "  - Tables restored: $table_count"
    log_info "  - Backup file: $backup_file"
    log_info "  - Duration: ${duration}s"
    
    if [[ "$promote_flag" == "true" ]]; then
        log_info ""
        log_info "✅ Database has been promoted to live: '$DB_NAME'"
        if [[ -n "$old_db_name" ]]; then
            log_info "   Old database preserved as: '$old_db_name'"
        fi
    elif [[ "$force_flag" != "true" ]]; then
        log_info ""
        log_info "💡 The database has been restored to '$target_db_name' (safe mode)"
        log_info "   The original database '$DB_NAME' was NOT modified."
        log_info "   To promote to live, use: $0 restore --promote"
        log_info "   To restore directly to '$DB_NAME', use: $0 restore --force"
    else
        log_info ""
        log_info "⚠️  Database '$DB_NAME' has been replaced with the backup."
        log_info "   Backend service may need to be restarted to use the restored database."
        
        # Only start backend and run migrations if restoring to the main database
    log_info "🚀 Starting backend service..."
        if docker compose up -d backend >/dev/null 2>&1 || docker-compose up -d backend >/dev/null 2>&1; then
        log_success "Backend service started"
    else
        log_warning "Failed to start backend service (may already be running)"
    fi
    
        # Wait for backend to be ready
    log_info "⏳ Waiting for backend to be ready..."
    sleep 10
    
        # Run migrations to ensure everything is in sync
    log_info "🔄 Running Django migrations..."
        if docker compose exec backend python manage.py migrate >/dev/null 2>&1 || docker-compose exec backend python manage.py migrate >/dev/null 2>&1; then
        log_success "Django migrations completed"
    else
        log_warning "Django migrations failed - this might be normal if database is already up to date"
    fi
    
        # Final verification with user count
    log_info "🔍 Final verification..."
    local user_count=0
        user_count=$(docker compose exec backend python manage.py shell -c "
    from django.contrib.auth import get_user_model
    User = get_user_model()
    print(User.objects.count())
        " 2>/dev/null | tail -1 | tr -d ' ' || echo "0") || docker-compose exec backend python manage.py shell -c "
        from django.contrib.auth import get_user_model
        User = get_user_model()
        print(User.objects.count())
        " 2>/dev/null | tail -1 | tr -d ' ' || echo "0"
    
    # Ensure user_count is numeric
    if ! [[ "$user_count" =~ ^[0-9]+$ ]]; then
        user_count=0
    fi
    
    if [[ "$user_count" -ge 0 ]]; then
        log_success "Final verification successful - Found $user_count users"
            log_info "  - Users restored: $user_count"
    else
        log_warning "Could not verify user count"
        fi
    fi
    
    return 0
}

# Promote restore database to active database
promote_database() {
    local keep_old_flag=true
    local validate_flag=true
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-keep)
                keep_old_flag=false
                shift
                ;;
            --no-validate)
                validate_flag=false
                shift
                ;;
            --help|-h)
                echo "Usage: $0 promote [OPTIONS]"
                echo ""
                echo "Promotes the restore database (${DB_NAME}_restore) to active database (${DB_NAME})"
                echo ""
                echo "Options:"
                echo "  --no-keep        Drop old database instead of renaming it"
                echo "  --no-validate    Skip validation before promoting"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0 promote                  # Promote and keep old database"
                echo "  $0 promote --no-keep         # Promote and drop old database"
                echo "  $0 promote --no-validate    # Promote without validation"
                return 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                return 1
                ;;
        esac
    done
    
    local start_time=$(date +%s)
    local pg_service
    pg_service=$(get_postgres_service)
    
    local restore_db_name="${DB_NAME}_restore"
    
    log_info "🔄 Promoting restore database to active database..."
    log_info "  Restore DB: $restore_db_name"
    log_info "  Active DB:  $DB_NAME"
    
    # Step 1: Check if restore database exists
    log_info "🔍 Checking if restore database exists..."
    local restore_db_exists
    restore_db_exists=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$restore_db_name';" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [[ "$restore_db_exists" != "1" ]]; then
        log_error "Restore database '$restore_db_name' does not exist"
        log_info "  Create a restore first using: $0 restore [backup_file]"
        return 1
    fi
    log_success "✓ Restore database found"
    
    # Step 2: Validate restore database (optional)
    if [[ "$validate_flag" == "true" ]]; then
        log_info "✅ Validating restore database..."
        local table_count
        table_count=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$restore_db_name" -t -c "
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        " 2>/dev/null | tr -d ' ' || echo "0")
        
        if [[ "$table_count" -eq 0 ]]; then
            log_warning "⚠️  Restore database has no tables. Continue anyway? (use --no-validate to skip)"
            if [[ "$validate_flag" == "true" ]]; then
                log_error "Validation failed. Use --no-validate to skip validation."
                return 1
            fi
        else
            log_success "✓ Restore database validated ($table_count tables found)"
        fi
    fi
    
    # Step 2.5: Backup active database before promotion
    local active_db_exists
    active_db_exists=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [[ "$active_db_exists" == "1" ]]; then
        log_info "💾 Creating backup of active database before promotion..."
        ensure_backup_dirs
        
        local backup_timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
        local backup_file="before_restoring_${backup_timestamp}.dump"
        local backup_path="$BACKUP_BASE_DIR/postgresql/$backup_file"
        local container_backup_dir="/var/lib/postgresql/backups"
        local container_backup_path="${container_backup_dir}/${backup_file}"
        local backup_path_tmp="${backup_path}.tmp"
        local dump_log
        dump_log=$(mktemp)
        
        # Ensure backup directory exists in container
        docker compose exec -T "$pg_service" sh -c "mkdir -p $container_backup_dir && chown postgres:postgres $container_backup_dir" 2>/dev/null || true
        
        if docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" "$pg_service" pg_dump \
            -U "$DB_USER" \
            -h localhost \
            -d "$DB_NAME" \
            -F c \
            -Z 9 \
            -f "$container_backup_path" \
            --verbose \
            --no-password \
            2> "$dump_log"; then
            
            # Copy backup file from container to host
            local container_name
            container_name=$(get_postgres_container)
            if [[ -n "$container_name" ]] && docker cp "${container_name}:${container_backup_path}" "$backup_path_tmp"; then
                if mv "$backup_path_tmp" "$backup_path"; then
                    local file_size=$(get_file_size "$backup_path")
                    log_success "✅ Backup created: $backup_file ($file_size)"
                else
                    log_warning "⚠️  Failed to commit backup file, but continuing with promotion..."
                    rm -f "$backup_path_tmp"
                fi
            else
                log_warning "⚠️  Failed to copy backup from container, but continuing with promotion..."
                rm -f "$backup_path_tmp"
            fi
            rm -f "$dump_log"
        else
            log_warning "⚠️  Failed to create backup before promotion (see log below), but continuing..."
            if [[ -s "$dump_log" ]]; then
                log_debug "pg_dump error:\n$(cat "$dump_log")"
            fi
            rm -f "$dump_log" "$backup_path_tmp"
        fi
    else
        log_info "No active database to backup (fresh install)"
    fi
    
    # Step 3: Handle active database
    local old_db_name=""
    
    if [[ "$active_db_exists" == "1" ]]; then
        if [[ "$keep_old_flag" == "true" ]]; then
            old_db_name="${DB_NAME}_old_$(date +%Y%m%d_%H%M%S)"
            log_info "📦 Renaming current active database to '$old_db_name'..."
            
            # Disconnect all connections to the active database
            docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
            sleep 2
            
            if docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "ALTER DATABASE \"$DB_NAME\" RENAME TO \"$old_db_name\";" >/dev/null 2>&1; then
                log_success "✓ Active database renamed to '$old_db_name'"
            else
                log_error "Failed to rename active database"
                return 1
            fi
        else
            log_info "🗑️  Dropping current active database..."
            
            # Disconnect all connections first
            docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
            sleep 2
            
            if docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null 2>&1; then
                log_success "✓ Active database dropped"
            else
                log_error "Failed to drop active database"
                return 1
            fi
        fi
    else
        log_info "No existing active database found (fresh install)"
    fi
    
    # Step 4: Rename restore database to active
    log_info "🚀 Promoting '$restore_db_name' to '$DB_NAME'..."
    
    # Disconnect all connections to the restore database
    docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$restore_db_name' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    sleep 2
    
    if docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "ALTER DATABASE \"$restore_db_name\" RENAME TO \"$DB_NAME\";" >/dev/null 2>&1; then
        log_success "✅ Database promoted successfully!"
    else
        log_error "Failed to rename restore database. Restore database remains as '$restore_db_name'"
        return 1
    fi
    
    # Step 5: Restart backend service
    log_info "🚀 Restarting backend service..."
    if docker compose restart backend >/dev/null 2>&1 || docker-compose restart backend >/dev/null 2>&1; then
        log_success "✓ Backend service restarted"
    else
        log_warning "⚠️  Failed to restart backend service (may need manual restart)"
    fi
    
    # Step 6: Wait and run migrations
    log_info "⏳ Waiting for backend to be ready..."
    sleep 10
    
    log_info "🔄 Running Django migrations..."
    if docker compose exec backend python manage.py migrate >/dev/null 2>&1 || docker-compose exec backend python manage.py migrate >/dev/null 2>&1; then
        log_success "✓ Django migrations completed"
    else
        log_warning "⚠️  Django migrations failed (may be normal if database is up to date)"
    fi
    
    # Summary
    local duration=$(($(date +%s) - start_time))
    log_success "🎉 Database promotion completed successfully in ${duration}s"
    log_info "📊 Promotion Summary:"
    log_info "  - Active database: $DB_NAME"
    if [[ -n "$old_db_name" ]]; then
        log_info "  - Old database preserved as: $old_db_name"
    fi
    log_info "  - Duration: ${duration}s"
    
    return 0
}

# Cleanup old PostgreSQL backups
cleanup_old_postgresql_backups() {
    log_info "🧹 Cleaning up old PostgreSQL backups (retention: $SQL_RETENTION_DAYS days)..."
    
    local deleted_count=0
    local pg_service
    pg_service=$(get_postgres_service)
    local container_backup_dir="/var/lib/postgresql/backups"
    
    # Cleanup dump files by date from container
    if [[ $SQL_RETENTION_DAYS -gt 0 ]]; then
        # Delete old backups from container
        local container_deleted
        container_deleted=$(docker compose exec -T "$pg_service" sh -c "find $container_backup_dir -name 'landarsfood_backup_*.dump' -type f -mtime +$SQL_RETENTION_DAYS -delete -print 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ' || echo "0")
        deleted_count=$((deleted_count + container_deleted))
        
        # Also cleanup host copies if they exist
        local host_deleted
        host_deleted=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.dump" -type f -mtime +$SQL_RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
        deleted_count=$((deleted_count + host_deleted))
    fi
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old PostgreSQL backup files (older than $SQL_RETENTION_DAYS days)"
    else
        log_info "No old PostgreSQL backup files to delete"
    fi
}

#########################################################################
#########################################################################
# PITR BACKUP FUNCTIONS
#########################################################################

# Create PITR base backup
create_pitr_backup() {
    log_info "⚡ Creating PITR base backup..."
    
    local backup_name="pitr_basebackup_${TIMESTAMP}"
    local container_backup_base_dir="/var/lib/postgresql/archive/basebackups"
    local container_backup_dir="${container_backup_base_dir}/${backup_name}"
    local start_time=$(date +%s)
    
    local pg_service
    pg_service=$(get_postgres_service)
    
    # Ensure base backup directory exists in container
    docker compose exec -T "$pg_service" sh -c "mkdir -p $container_backup_base_dir && chown postgres:postgres $container_backup_base_dir" 2>/dev/null || true
    
    # Also ensure archive directory exists for WAL files
    docker compose exec -T "$pg_service" sh -c "mkdir -p /var/lib/postgresql/archive && chown postgres:postgres /var/lib/postgresql/archive" 2>/dev/null || true
    
    log_info "📊 Creating PostgreSQL base backup using pg_basebackup..."
    log_info "📁 Backup will be saved to: $container_backup_dir (inside container)"
    
    # Create base backup using pg_basebackup directly
    # Use PGPASSWORD environment variable for authentication
    if docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" "$pg_service" pg_basebackup \
        -U "$DB_USER" \
        -h localhost \
        -D "$container_backup_dir" \
        -Ft \
        -z \
        -P \
        -v \
        --no-password; then
        
        local duration=$(($(date +%s) - start_time))
        
        log_success "✅ PITR base backup completed in ${duration}s"
        log_info "📄 Backup saved to: $container_backup_dir (inside container)"
        
        # Get backup size before compression (from container)
        local backup_size
        backup_size=$(docker compose exec -T "$pg_service" sh -c "du -sh $container_backup_dir 2>/dev/null | cut -f1" 2>/dev/null || echo "N/A")
        log_info "📊 Size before compression: $backup_size"
        
        # Compress the entire backup directory
        log_info "🗜️  Compressing base backup directory..."
        local compressed_backup="${container_backup_dir}.tar.gz"
        if docker compose exec -T "$pg_service" sh -c "cd $container_backup_base_dir && tar -czf ${backup_name}.tar.gz ${backup_name} && rm -rf ${backup_name}" 2>/dev/null; then
            log_success "✅ Base backup compressed successfully"
            # Get compressed size
            local compressed_size
            compressed_size=$(docker compose exec -T "$pg_service" sh -c "du -sh $compressed_backup 2>/dev/null | cut -f1" 2>/dev/null || echo "N/A")
            log_info "📊 Compressed size: $compressed_size"
        else
            log_warning "⚠️  Failed to compress backup directory, keeping uncompressed version"
        fi
                
        # Cleanup old PITR backups (keep only the most recent N backups)
        cleanup_old_pitr_backups
        
        # Copy PITR backup to host at db_backups/archive/
        ensure_backup_dirs
        local host_archive_dir="$BACKUP_BASE_DIR/archive"
        local container_name
        container_name=$(get_postgres_container)
        if [[ -n "$container_name" ]]; then
            # Check if backup is compressed
            if docker compose exec -T "$pg_service" sh -c "test -f $compressed_backup" 2>/dev/null; then
                # Copy compressed backup to host
                local host_backup_path="${host_archive_dir}/${backup_name}.tar.gz"
                if docker cp "${container_name}:${compressed_backup}" "$host_backup_path" >/dev/null 2>&1; then
                    log_success "✅ PITR backup copied to host: $host_backup_path"
                else
                    log_warning "⚠️  Failed to copy PITR backup to host, but backup succeeded in container"
                fi
            else
                # Backup is uncompressed, create tar.gz and copy to host
                local temp_host_dir
                temp_host_dir=$(mktemp -d)
                local tar_file="${temp_host_dir}/${backup_name}.tar.gz"
                
                # Copy backup from container to temp host directory
                if docker cp "${container_name}:${container_backup_dir}" "${temp_host_dir}/${backup_name}" >/dev/null 2>&1; then
                    # Create tar.gz
                    if tar -czf "$tar_file" -C "$temp_host_dir" "$backup_name" 2>/dev/null; then
                        local host_backup_path="${host_archive_dir}/${backup_name}.tar.gz"
                        if cp "$tar_file" "$host_backup_path" 2>/dev/null; then
                            log_success "✅ PITR backup copied to host: $host_backup_path"
                        else
                            log_warning "⚠️  Failed to copy PITR backup to host, but backup succeeded in container"
                        fi
                    fi
                    rm -rf "${temp_host_dir}/${backup_name}" 2>/dev/null || true
                fi
                rm -rf "$temp_host_dir" 2>/dev/null || true
            fi
        fi
        
        # Upload to S3 if configured
        if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
            log_info "📦 Preparing backup for S3 upload..."
            local container_name
            container_name=$(get_postgres_container)
            if [[ -n "$container_name" ]]; then
                # Check if backup is compressed
                if docker compose exec -T "$pg_service" sh -c "test -f $compressed_backup" 2>/dev/null; then
                    # Backup is already compressed, copy and upload directly
                    local temp_host_dir
                    temp_host_dir=$(mktemp -d)
                    local tar_file="${temp_host_dir}/${backup_name}.tar.gz"
                    
                    if docker cp "${container_name}:${compressed_backup}" "$tar_file" >/dev/null 2>&1; then
                        upload_to_s3 "$tar_file" "pitr"
                        rm -f "$tar_file"
                    else
                        log_warning "Failed to copy compressed backup for S3 upload, but backup succeeded"
                    fi
                    rm -rf "$temp_host_dir" 2>/dev/null || true
                else
                    # Backup is uncompressed (backward compatibility), create tar.gz and upload
                    local temp_host_dir
                    temp_host_dir=$(mktemp -d)
                    local tar_file="${temp_host_dir}/${backup_name}.tar.gz"
                    
                    # Copy backup from container to temp host directory
                    if docker cp "${container_name}:${container_backup_dir}" "${temp_host_dir}/${backup_name}" >/dev/null 2>&1; then
                        # Create tar.gz
                        if tar -czf "$tar_file" -C "$temp_host_dir" "$backup_name" 2>/dev/null; then
                            upload_to_s3 "$tar_file" "pitr"
                            rm -f "$tar_file"
                        else
                            log_warning "Failed to create tar.gz for S3 upload, but backup succeeded"
                        fi
                        # Clean up temp directory
                        rm -rf "${temp_host_dir}/${backup_name}" 2>/dev/null || true
                    else
                        log_warning "Failed to copy backup for S3 upload, but backup succeeded"
                    fi
                    rm -rf "$temp_host_dir" 2>/dev/null || true
                fi
            fi
        fi
        
        return 0
    else
        log_error "❌ PITR base backup failed"
        docker compose exec -T "$pg_service" rm -rf "$container_backup_dir" 2>/dev/null || true
        return 1
    fi
}

# Restore PostgreSQL from PITR base backup with optional point-in-time recovery
restore_pitr_backup() {
    local backup_name=""
    local target_time=""
    local target_lsn=""
    local target_xid=""
    local promote_flag=false
    local keep_old_flag=true
    
    # Pre-restore health check (always run, non-blocking)
    log_info "🏥 Running pre-restore health check..."
    if health_check; then
        log_success "✅ Pre-restore health check passed"
    else
        log_warning "⚠️  Pre-restore health check found issues, but proceeding with restore..."
    fi
    echo ""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --target-time|--time|-t)
                target_time="$2"
                shift 2
                ;;
            --target-lsn|--lsn|-l)
                target_lsn="$2"
                shift 2
                ;;
            --target-xid|--xid|-x)
                target_xid="$2"
                shift 2
                ;;
            --promote)
                promote_flag=true
                shift
                ;;
            --keep)
                keep_old_flag=true
                shift
                ;;
            --no-keep)
                keep_old_flag=false
                shift
                ;;
            --help|-h)
                echo "Usage: $0 pitr-restore [backup_name] [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --target-time TIME    Restore to specific timestamp (ISO format: 'YYYY-MM-DD HH:MM:SS')"
                echo "  --target-lsn LSN      Restore to specific LSN (e.g., '0/1234567')"
                echo "  --target-xid XID      Restore to specific transaction ID"
                echo "  --promote             Promote restored database to live (with validation)"
                echo "  --keep                Keep old database when promoting (default: true)"
                echo "  --no-keep             Drop old database when promoting"
                echo ""
                echo "Examples:"
                echo "  $0 pitr-restore                                    # Restore from latest base backup"
                echo "  $0 pitr-restore pitr_basebackup_2025-12-17_21-13-17  # Restore from specific backup"
                echo "  $0 pitr-restore --target-time '2025-12-17 15:30:00' # Restore to specific time"
                echo "  $0 pitr-restore --target-lsn '0/1234567'            # Restore to specific LSN"
                echo "  $0 pitr-restore --promote --target-time '2025-12-17 15:30:00'  # Restore and promote"
                return 0
                ;;
            -*)
                log_error "Unknown option: $1"
                return 1
                ;;
            *)
                if [[ -z "$backup_name" ]]; then
                    backup_name="$1"
                else
                    log_error "Unexpected argument: $1"
                    return 1
                fi
                shift
                ;;
        esac
    done
    
    local container
    local start_time=$(date +%s)
    local pg_service
    pg_service=$(get_postgres_service)
    local container_backup_base_dir="/var/lib/postgresql/archive/basebackups"
    local container_wal_archive_dir="/var/lib/postgresql/archive"
    
    # Helper function to list backups from volume (works even if container is stopped)
    list_backups_from_volume() {
        local volume_name="landars_postgres_archive"
        docker run --rm -v "${volume_name}:/archive" alpine sh -c "
            cd /archive/basebackups 2>/dev/null || exit 0
            for item in pitr_basebackup_*; do
                if [ -e \"\$item\" ]; then
                    basename \"\$item\" .tar.gz
                fi
            done | sort -u
        " 2>/dev/null || echo ""
    }
    
    # Default to latest PITR backup if no name specified
    if [[ -z "$backup_name" ]]; then
        # Try to list backups from container first (if running)
        backup_name=$(docker compose exec -T "$pg_service" sh -c "
            cd $container_backup_base_dir 2>/dev/null || exit 0
            for item in pitr_basebackup_*; do
                if [ -e \"\$item\" ]; then
                    basename \"\$item\" .tar.gz
                fi
            done | sort -u | head -1
        " 2>/dev/null || echo "")
        
        # If container is not running or no backups found, try accessing volume directly
        if [[ -z "$backup_name" ]]; then
            backup_name=$(list_backups_from_volume | head -1)
        fi
        
        if [[ -z "$backup_name" ]]; then
            log_error "No PITR backup specified and no backups found in $container_backup_base_dir"
            log_info "Available PITR backups:"
            local available_backups
            available_backups=$(list_backups_from_volume)
            if [[ -n "$available_backups" ]]; then
                echo "$available_backups" | while read -r backup; do
                    [[ -n "$backup" ]] && log_info "  - $backup"
                done
            else
                log_info "  No PITR backups found"
            fi
            return 1
        fi
    fi
    
    # Determine if backup_name is a full path or just a name
    local container_backup_dir
    if [[ "$backup_name" == /* ]]; then
        # Full path provided (could be container path or host path)
        if [[ "$backup_name" == /var/lib/postgresql/* ]]; then
            container_backup_dir="$backup_name"
        else
            # Assume it's a host path, but we need container path
            log_error "Host path provided but backups are stored in container. Use backup name only or container path: /var/lib/postgresql/archive/basebackups/..."
            return 1
        fi
    else
        # Just a backup name, use container path
        container_backup_dir="${container_backup_base_dir}/${backup_name}"
    fi
    
    # Check if backup exists (either as compressed .tar.gz or as directory)
    local compressed_backup="${container_backup_dir}.tar.gz"
    local is_compressed=false
    local volume_name="landars_postgres_archive"
    
    # Helper to check backup in volume
    check_backup_in_volume() {
        local backup_path="$1"
        docker run --rm -v "${volume_name}:/archive" alpine sh -c "test -e \"/archive${backup_path}\"" 2>/dev/null
    }
    
    # Try container first, then volume
    if docker compose exec -T "$pg_service" sh -c "test -f $compressed_backup" 2>/dev/null || \
       check_backup_in_volume "${compressed_backup}"; then
        is_compressed=true
        log_info "📦 Found compressed backup: $compressed_backup"
    elif docker compose exec -T "$pg_service" sh -c "test -d $container_backup_dir" 2>/dev/null || \
         check_backup_in_volume "${container_backup_dir}"; then
        is_compressed=false
        log_info "📁 Found uncompressed backup directory: $container_backup_dir"
    else
        log_error "PITR backup not found: $container_backup_dir (or $compressed_backup)"
        log_info "Available PITR backups in $container_backup_base_dir:"
        local available_backups
        available_backups=$(list_backups_from_volume)
        if [[ -n "$available_backups" ]]; then
            echo "$available_backups" | while read -r backup; do
                [[ -n "$backup" ]] && log_info "  - $backup"
            done
        else
            log_info "  No PITR backups found"
        fi
        return 1
    fi
    
    # If compressed, we'll decompress it during the copy step
    # For now, we'll handle the check after decompression
    
    # Validate recovery target (only one can be specified)
    local recovery_target_count=0
    [[ -n "$target_time" ]] && ((++recovery_target_count))
    [[ -n "$target_lsn" ]] && ((++recovery_target_count))
    [[ -n "$target_xid" ]] && ((++recovery_target_count))
    
    if [[ $recovery_target_count -gt 1 ]]; then
        log_error "Only one recovery target can be specified (--target-time, --target-lsn, or --target-xid)"
        return 1
    fi
    
    # Determine if this is a point-in-time recovery
    local is_pitr=false
    if [[ -n "$target_time" ]] || [[ -n "$target_lsn" ]] || [[ -n "$target_xid" ]]; then
        is_pitr=true
        log_info "🕐 Point-in-Time Recovery (PITR) mode enabled"
        if [[ -n "$target_time" ]]; then
            log_info "  Target time: $target_time"
        elif [[ -n "$target_lsn" ]]; then
            log_info "  Target LSN: $target_lsn"
        elif [[ -n "$target_xid" ]]; then
            log_info "  Target XID: $target_xid"
        fi
    fi
    
    log_info "🔄 Starting PITR restore from: $container_backup_dir"
    if [[ "$is_pitr" == "true" ]]; then
        log_info "📋 WAL files will be applied from: $container_wal_archive_dir"
    fi
    
    if [[ "$promote_flag" == "true" ]]; then
        log_warning "⚠️  This will restore and promote to live database!"
        log_warning "⚠️  Current live database will be renamed to ${DB_NAME}_old_<timestamp>"
    else
        log_warning "⚠️  This will replace the entire PostgreSQL data directory!"
        log_warning "⚠️  All current data will be lost!"
    fi
    
    # Get container name for docker cp (needed for file operations)
    local container_name
    container_name=$(get_postgres_container)
    if [[ -z "$container_name" ]]; then
        log_error "Could not determine postgres container name"
        return 1
    fi
    
    # Step 1: Stop PostgreSQL container
    log_info "🛑 Stopping PostgreSQL container..."
    if docker compose stop "$pg_service" >/dev/null 2>&1 || docker-compose stop "$pg_service" >/dev/null 2>&1; then
        log_success "PostgreSQL container stopped"
    else
        log_warning "Container may already be stopped"
    fi
    
    # Wait a moment for container to fully stop
    sleep 2
    
    # Step 2: Copy backup from container to host for extraction
    log_info "📦 Copying backup from container for extraction..."
    local temp_host_dir=$(mktemp -d)
    
    # Handle compressed vs uncompressed backups
    if [[ "$is_compressed" == "true" ]]; then
        # Copy compressed backup to host
        local compressed_backup_file="${temp_host_dir}/backup.tar.gz"
        if ! docker cp "${container_name}:${compressed_backup}" "$compressed_backup_file" >/dev/null 2>&1; then
            log_error "Failed to copy compressed backup from container"
            rm -rf "$temp_host_dir"
            return 1
        fi
        
        # Decompress the backup directory
        log_info "🗜️  Decompressing backup..."
        if ! tar -xzf "$compressed_backup_file" -C "$temp_host_dir" >/dev/null 2>&1; then
            log_error "Failed to decompress backup archive"
            rm -rf "$temp_host_dir"
            return 1
        fi
        log_success "✅ Backup decompressed"
        
        # The decompressed directory should now be at $temp_host_dir/$backup_name
        local backup_dir="$temp_host_dir/$backup_name"
        if [[ ! -d "$backup_dir" ]]; then
            log_error "Decompressed backup directory not found: $backup_dir"
            rm -rf "$temp_host_dir"
            return 1
        fi
    else
        # Copy uncompressed backup directory
        if ! docker cp "${container_name}:${container_backup_dir}" "$temp_host_dir/backup" >/dev/null 2>&1; then
            log_error "Failed to copy backup from container"
            rm -rf "$temp_host_dir"
            return 1
        fi
        local backup_dir="$temp_host_dir/backup"
    fi
    
    # Step 3: Extract base backup to temporary location
    log_info "📦 Extracting base backup..."
    local temp_restore_dir=$(mktemp -d)
    local base_tar="$backup_dir/base.tar.gz"
    local wal_tar="$backup_dir/pg_wal.tar.gz"
    
    # Check if base.tar.gz exists
    if [[ ! -f "$base_tar" ]]; then
        log_error "PITR backup incomplete: base.tar.gz not found in backup"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        return 1
    fi
    
    if ! tar -xzf "$base_tar" -C "$temp_restore_dir"; then
        log_error "Failed to extract base.tar.gz"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        return 1
    fi
    
    # Verify extracted base backup structure
    # pg_basebackup -Ft creates base.tar.gz with full data directory structure
    # PG_VERSION should be at root of extracted directory, not in base/
    if [[ ! -f "$temp_restore_dir/PG_VERSION" ]]; then
        log_error "Extracted base backup is missing PG_VERSION file"
        log_error "Base backup may be corrupted or in wrong format"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        return 1
    fi
    if [[ ! -d "$temp_restore_dir/base" ]]; then
        log_error "Extracted base backup is missing base directory"
        log_error "Base backup may be corrupted or in wrong format"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        return 1
    fi
    log_info "✓ Base backup structure verified (PG_VERSION and base directory found)"
    
    if [[ -f "$wal_tar" ]]; then
        if ! tar -xzf "$wal_tar" -C "$temp_restore_dir"; then
            log_warning "Failed to extract pg_wal.tar.gz (continuing anyway)"
        fi
    fi
    
    log_success "Base backup extracted"
    
    # Step 3: Start container temporarily (needed for docker cp to work)
    log_info "🚀 Starting PostgreSQL container temporarily for restore..."
    if ! docker compose up -d "$pg_service" >/dev/null 2>&1 && ! docker-compose up -d "$pg_service" >/dev/null 2>&1; then
        log_error "Failed to start PostgreSQL container"
        rm -rf "$temp_restore_dir"
        return 1
    fi
    
    # Wait a moment for container to be ready
    sleep 2
    
    # Refresh container name after restart
    container_name=$(get_postgres_container)
    
    # Step 4: Backup current data directory (safety measure)
    log_info "💾 Creating safety backup of current data..."
    local safety_backup_dir="/tmp/pitr_restore_safety_$(date +%Y%m%d_%H%M%S)"
    if docker compose exec -T "$pg_service" sh -c "test -d /var/lib/postgresql/data && cp -r /var/lib/postgresql/data $safety_backup_dir" 2>/dev/null; then
        log_info "Safety backup created at: $safety_backup_dir (in container)"
    else
        log_warning "Could not create safety backup (data directory may be empty)"
    fi
    
    # Step 5: Stop PostgreSQL process inside container (but keep container running for docker cp)
    log_info "🛑 Stopping PostgreSQL process in container..."
    docker compose exec -T "$pg_service" su - postgres -c "pg_ctl stop -D /var/lib/postgresql/data -m fast" 2>/dev/null || true
    sleep 2
    
    # Step 6: Copy extracted data into container
    log_info "📥 Copying restored data into container..."
    local container_restore_dir="/var/lib/postgresql/data_restore"
    
    # Copy extracted data to container (docker cp requires container name/ID)
    # pg_basebackup -Ft creates full data directory structure, so copy everything
    # This includes PG_VERSION, base/, postgresql.conf, etc. at the root level
    if docker cp "$temp_restore_dir" "${container_name}:${container_restore_dir}"; then
        log_success "Data copied to container"
    else
        log_error "Failed to copy data to container"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        docker compose restart "$pg_service" >/dev/null 2>&1 || docker-compose restart "$pg_service" >/dev/null 2>&1
        return 1
    fi
    
    # Step 7: Replace data directory inside container
    log_info "🔄 Replacing PostgreSQL data directory..."
    # More robust replacement: ensure all files are moved and permissions are correct
    local replace_result
    replace_result=$(docker compose exec -T "$pg_service" sh -c "
        # Remove existing data directory contents (but keep the directory itself)
        rm -rf /var/lib/postgresql/data/* /var/lib/postgresql/data/.[!.]* 2>/dev/null || true
        
        # Copy all files from restore directory (including hidden files)
        # Use cp -a to preserve permissions and attributes
        # The restore directory contains the full data directory structure
        if [ -d $container_restore_dir ]; then
            # First, try to copy everything at once (recursively)
            if ! cp -a $container_restore_dir/. /var/lib/postgresql/data/ 2>&1; then
                # Fallback: copy files individually
                find $container_restore_dir -mindepth 1 -exec cp -a {} /var/lib/postgresql/data/ \; 2>&1
            fi
        else
            echo 'ERROR: Restore directory not found: $container_restore_dir' >&2
            exit 1
        fi
        
        # Ensure proper ownership and permissions
        chown -R postgres:postgres /var/lib/postgresql/data 2>&1
        chmod 700 /var/lib/postgresql/data 2>&1
        
        # Verify critical files exist
        if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
            echo 'ERROR: PG_VERSION not found after restore' >&2
            exit 1
        fi
        if [ ! -d /var/lib/postgresql/data/base ]; then
            echo 'ERROR: base directory not found after restore' >&2
            exit 1
        fi
        
        # Create a marker file to prevent initdb from running
        # The official postgres image checks for this
        touch /var/lib/postgresql/data/.docker_init_complete 2>&1
        
        # Clean up restore directory
        rm -rf $container_restore_dir 2>&1
        
        echo 'SUCCESS'
    " 2>&1)
    
    if echo "$replace_result" | grep -q "SUCCESS" && ! echo "$replace_result" | grep -qi "ERROR"; then
        log_success "Data directory replaced"
        # Verify PG_VERSION exists
        if docker compose exec -T "$pg_service" sh -c "test -f /var/lib/postgresql/data/PG_VERSION" 2>/dev/null; then
            local pg_version
            pg_version=$(docker compose exec -T "$pg_service" sh -c "cat /var/lib/postgresql/data/PG_VERSION" 2>/dev/null | tr -d '[:space:]' || echo "")
            log_info "✓ PostgreSQL data directory verified (version: ${pg_version})"
        else
            log_error "PG_VERSION file not found after restore - data directory may be invalid"
            rm -rf "$temp_restore_dir" "$temp_host_dir"
            docker compose restart "$pg_service" >/dev/null 2>&1 || docker-compose restart "$pg_service" >/dev/null 2>&1
            return 1
        fi
    else
        log_error "Failed to replace data directory"
        log_error "Error details: $replace_result"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        docker compose restart "$pg_service" >/dev/null 2>&1 || docker-compose restart "$pg_service" >/dev/null 2>&1
        return 1
    fi
    
    # Step 7.5: Create recovery configuration if PITR is requested
    if [[ "$is_pitr" == "true" ]]; then
        log_info "📝 Creating recovery configuration for point-in-time recovery..."
        
        # Check if WAL files are available BEFORE setting recovery target
        # Note: wal-g uploads directly to S3, so we check both local archive and S3
        log_info "🔍 Checking WAL archive for available WAL files..."
        local wal_count=0
        local wal_count_local=0
        local wal_count_s3=0
        
        # Check local archive directory (if wal-g also copies locally)
        wal_count_local=$(docker compose exec -T "$pg_service" sh -c "ls -1 ${container_wal_archive_dir}/[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F] 2>/dev/null | grep -v '\.backup$' | grep -v '\.partial$' | wc -l" || echo "0")
        
        # Check S3 via wal-g (if AWS credentials are configured)
        if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]] && [[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] && [[ -n "${AWS_STORAGE_BUCKET_NAME:-}" ]]; then
            log_info "  Checking S3 for WAL files via wal-g..."
            # Use wal-g to list WAL files in S3
            # wal-g wal-show outputs WAL filenames (24 hex chars) - count lines that match WAL filename pattern
            wal_count_s3=$(docker compose exec -T -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" -e AWS_STORAGE_BUCKET_NAME="${AWS_STORAGE_BUCKET_NAME}" -e WALG_S3_PREFIX="s3://${AWS_STORAGE_BUCKET_NAME}/db_backups/wal-g/" -e WALG_S3_REGION="${AWS_S3_REGION_NAME:-us-east-1}" "$pg_service" sh -c "wal-g wal-show 2>/dev/null | grep -oE '[0-9A-F]{24}' | sort -u | wc -l" || echo "0")
        fi
        
        # Total WAL files available (local + S3)
        wal_count=$((wal_count_local + wal_count_s3))
        
        local has_wal_files=false
        if [[ "$wal_count" -gt 0 ]]; then
            has_wal_files=true
            if [[ "$wal_count_local" -gt 0 ]] && [[ "$wal_count_s3" -gt 0 ]]; then
                log_success "Found $wal_count WAL segment files (${wal_count_local} local, ${wal_count_s3} in S3) for recovery"
            elif [[ "$wal_count_s3" -gt 0 ]]; then
                log_success "Found $wal_count_s3 WAL segment files in S3 for recovery"
            else
                log_success "Found $wal_count_local WAL segment files in local archive for recovery"
            fi
        else
            log_warning "⚠️  No WAL segment files found in archive (checked local: ${container_wal_archive_dir} and S3)."
            if [[ -n "$target_time" ]] || [[ -n "$target_lsn" ]] || [[ -n "$target_xid" ]]; then
                log_warning "⚠️  Cannot recover to target point without WAL files. Restoring to base backup point only."
                log_info "💡 Tip: Ensure WAL archiving is enabled and WAL files are being archived for PITR"
            fi
        fi
        
        # Create recovery configuration in postgresql.auto.conf (PostgreSQL 12+)
        local recovery_conf_content=""
        recovery_conf_content+="# Recovery configuration for Point-in-Time Recovery\n"
        recovery_conf_content+="# Generated on $(date)\n\n"
        recovery_conf_content+="# Restore command to get WAL files during recovery\n"
        recovery_conf_content+="# This command will be executed for each WAL file needed during recovery\n"
        recovery_conf_content+="# %f is the WAL file name, %p is the destination path\n"
        recovery_conf_content+="# Returns 0 on success, non-zero on failure (PostgreSQL will try next file or stop)\n"
        recovery_conf_content+="# Priority: 1) Local archive (fastest), 2) wal-g from S3, 3) fail\n"
        recovery_conf_content+="# Note: wal-g errors are silenced (2>/dev/null) to allow clean fallback\n"
        recovery_conf_content+="restore_command = 'if [ -f ${container_wal_archive_dir}/%f ]; then cp ${container_wal_archive_dir}/%f %p && exit 0; fi; if [ -f /usr/local/bin/wal-g-restore.sh ]; then /usr/local/bin/wal-g-restore.sh %f %p 2>/dev/null && exit 0; fi; exit 1'\n\n"
        
        # Only set recovery target if WAL files are available
        # If no WAL files, PostgreSQL will just restore to the base backup point
        if [[ "$has_wal_files" == "true" ]]; then
            # Add recovery target only if WAL files exist
            if [[ -n "$target_time" ]]; then
                recovery_conf_content+="recovery_target_time = '$target_time'\n"
                recovery_conf_content+="recovery_target_action = 'promote'\n"
            elif [[ -n "$target_lsn" ]]; then
                recovery_conf_content+="recovery_target_lsn = '$target_lsn'\n"
                recovery_conf_content+="recovery_target_action = 'promote'\n"
            elif [[ -n "$target_xid" ]]; then
                recovery_conf_content+="recovery_target_xid = '$target_xid'\n"
                recovery_conf_content+="recovery_target_action = 'promote'\n"
            else
                # No target specified, but WAL files exist - promote immediately after base backup
                recovery_conf_content+="recovery_target_action = 'promote'\n"
            fi
        else
            # No WAL files available - restore to base backup only, then promote
            log_info "📝 No WAL files available - will restore to base backup point only"
            recovery_conf_content+="# No recovery target set - restoring to base backup point only\n"
            recovery_conf_content+="recovery_target_action = 'promote'\n"
        fi
        
        recovery_conf_content+="\n# Archive cleanup (optional, helps manage WAL archive size)\n"
        recovery_conf_content+="archive_cleanup_command = 'pg_archivecleanup ${container_wal_archive_dir} %r'\n"
        
        # Write recovery configuration to container
        echo -e "$recovery_conf_content" | docker compose exec -T -i "$pg_service" sh -c "cat > /var/lib/postgresql/data/postgresql.auto.conf" 2>/dev/null
        
        if [[ $? -eq 0 ]]; then
            log_success "Recovery configuration created in postgresql.auto.conf"
        else
            log_warning "Failed to create recovery configuration (may need manual setup)"
        fi
        
        # Create recovery.signal file (required in PostgreSQL 12+ to trigger recovery mode)
        log_info "📝 Creating recovery.signal file to trigger recovery mode..."
        if docker compose exec -T "$pg_service" sh -c "touch /var/lib/postgresql/data/recovery.signal && chown postgres:postgres /var/lib/postgresql/data/recovery.signal" 2>/dev/null; then
            log_success "recovery.signal file created"
        else
            log_warning "Failed to create recovery.signal file (recovery may not start automatically)"
        fi
        
        # Show sample WAL files if available
        if [[ "$has_wal_files" == "true" ]]; then
            local sample_wals
            sample_wals=$(docker compose exec -T "$pg_service" sh -c "ls -1t ${container_wal_archive_dir}/[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F] 2>/dev/null | grep -v '\.backup$' | grep -v '\.partial$' | head -5" || echo "")
            if [[ -n "$sample_wals" ]]; then
                log_info "Sample WAL files available:"
                echo "$sample_wals" | while read -r wal_file; do
                    if [[ -n "$wal_file" ]]; then
                        log_info "  - $(basename "$wal_file")"
                    fi
                done
            fi
        fi
    else
        # Even without PITR, if we're restoring from a base backup, we may need recovery.signal
        # Check if backup_label exists (created by pg_basebackup)
        log_info "📝 Checking if recovery signal is needed..."
        if docker compose exec -T "$pg_service" sh -c "test -f /var/lib/postgresql/data/backup_label" 2>/dev/null; then
            log_info "backup_label found - PostgreSQL will automatically recover from base backup"
        else
            log_info "No backup_label found - this is a standard restore"
        fi
    fi
    
    # Cleanup temp directories
    rm -rf "$temp_restore_dir" "$temp_host_dir"
    
    # Step 8: Verify data directory before restart
    log_info "🔍 Verifying restored data directory..."
    if ! docker compose exec -T "$pg_service" sh -c "
        test -f /var/lib/postgresql/data/PG_VERSION && \
        test -d /var/lib/postgresql/data/base && \
        test -f /var/lib/postgresql/data/postgresql.conf || test -f /var/lib/postgresql/data/postgresql.auto.conf
    " 2>/dev/null; then
        log_error "Restored data directory is missing critical files"
        log_error "This may indicate the base backup extraction failed"
        rm -rf "$temp_restore_dir" "$temp_host_dir"
        docker compose restart "$pg_service" >/dev/null 2>&1 || docker-compose restart "$pg_service" >/dev/null 2>&1
        return 1
    fi
    log_success "✓ Data directory structure verified"
    
    # Step 9: Restart container to start PostgreSQL with restored data
    log_info "🚀 Restarting PostgreSQL container with restored data..."
    # Stop the container first to ensure clean restart
    docker compose stop "$pg_service" >/dev/null 2>&1 || docker-compose stop "$pg_service" >/dev/null 2>&1
    sleep 2
    
    if docker compose up -d "$pg_service" >/dev/null 2>&1 || docker-compose up -d "$pg_service" >/dev/null 2>&1; then
        log_success "PostgreSQL container started"
    else
        log_error "Failed to start PostgreSQL container"
        return 1
    fi
    
    # Wait for PostgreSQL to be ready
    log_info "⏳ Waiting for PostgreSQL to be ready..."
    local retries=0
    local max_retries=30
    while [[ $retries -lt $max_retries ]]; do
        if docker compose exec -T "$pg_service" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        ((++retries))
        if [[ $retries -eq $max_retries ]]; then
            log_error "PostgreSQL failed to start after restore"
            return 1
        fi
        sleep 2
    done
    
    # Step 9: Verify restore
    log_info "✅ Verifying restore..."
    local table_count=0
    table_count=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " 2>/dev/null | tr -d ' ' || echo "0")
    
    if ! [[ "$table_count" =~ ^[0-9]+$ ]]; then
        table_count=0
    fi
    
    local duration=$(($(date +%s) - start_time))
    
    if [[ "$table_count" -gt 0 ]]; then
        log_success "✅ Restore verification successful - Found $table_count tables"
    else
        log_warning "⚠️  Restore completed but no tables found (database may be empty)"
    fi
    
    # Step 10: Promote if requested
    if [[ "$promote_flag" == "true" ]]; then
        log_info "🔄 Promoting restored database to live..."
        
        # Check if live database exists
        local db_exists
        db_exists=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -t -c "
            SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';
        " 2>/dev/null | tr -d ' ' || echo "0")
        
        if [[ "$db_exists" == "1" ]]; then
            # Rename current live database
            local old_db_name="${DB_NAME}_old_$(date +%Y%m%d_%H%M%S)"
            log_info "📦 Renaming current live database to '$old_db_name'..."
            
            # Disconnect all connections to the database
            docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
            " >/dev/null 2>&1 || true
            
            sleep 1
            
            if docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "ALTER DATABASE \"$DB_NAME\" RENAME TO \"$old_db_name\";" >/dev/null 2>&1; then
                log_success "Old database renamed to '$old_db_name'"
                
                # Drop old database if --no-keep is specified
                if [[ "$keep_old_flag" == "false" ]]; then
                    log_info "🗑️  Dropping old database '$old_db_name'..."
                    docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -c "DROP DATABASE \"$old_db_name\";" >/dev/null 2>&1
                    log_success "Old database dropped"
                fi
            else
                log_error "Failed to rename old database"
                return 1
            fi
        fi
        
        # The restored database should already be using the live database name
        # (since we restored directly to the data directory)
        log_success "✅ Database promoted to live successfully!"
        
        # Restart backend service
        log_info "🚀 Restarting backend service..."
        if docker compose restart backend >/dev/null 2>&1 || docker-compose restart backend >/dev/null 2>&1; then
            log_success "Backend service restarted"
        else
            log_warning "Backend service restart may have failed (check manually)"
        fi
        
        # Wait for backend to be ready
        log_info "⏳ Waiting for backend to be ready..."
        sleep 5
        
        # Run migrations
        log_info "🔄 Running Django migrations..."
        if docker compose exec -T backend python manage.py migrate --noinput >/dev/null 2>&1 || docker-compose exec -T backend python manage.py migrate --noinput >/dev/null 2>&1; then
            log_success "Django migrations completed"
        else
            log_warning "Migrations may have failed (check manually)"
        fi
        
        # Final verification
        log_info "🔍 Final verification..."
        local final_table_count=0
        final_table_count=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        " 2>/dev/null | tr -d ' ' || echo "0")
        
        if [[ "$final_table_count" -gt 0 ]]; then
            log_success "Final verification successful - Found $final_table_count tables"
        else
            log_warning "Final verification: No tables found"
        fi
        
    fi
    
    # Post-restore health check (always run after PITR restore, non-blocking)
    log_info ""
    log_info "🏥 Running post-restore health check..."
    if health_check; then
        log_success "✅ Post-restore health check passed - System is healthy"
    else
        log_warning "⚠️  Post-restore health check found issues - Please verify manually"
    fi
    echo ""
    
    # Summary
    log_success "🎉 PITR restore completed successfully in ${duration}s"
    log_info "📊 Restore Summary:"
    log_info "  - Tables found: $table_count"
    log_info "  - Backup: $container_backup_dir"
    if [[ "$is_pitr" == "true" ]]; then
        if [[ -n "$target_time" ]]; then
            log_info "  - Recovery target: $target_time"
        elif [[ -n "$target_lsn" ]]; then
            log_info "  - Recovery target: LSN $target_lsn"
        elif [[ -n "$target_xid" ]]; then
            log_info "  - Recovery target: XID $target_xid"
        fi
    fi
    log_info "  - Duration: ${duration}s"
    
    if [[ "$promote_flag" == "true" ]]; then
        log_info ""
        log_info "✅ Database has been promoted to live: '$DB_NAME'"
        if [[ "$keep_old_flag" == "true" ]] && [[ -n "${old_db_name:-}" ]]; then
            log_info "   Old database preserved as: '$old_db_name'"
        fi
    fi
    
    return 0
}

# Check PITR/WAL archiving status
check_pitr_status() {
    local force_wal_switch=false
    
    # Parse arguments for --force flag
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                force_wal_switch=true
                shift
                ;;
            *)
                log_warning "Unknown argument: $1 (ignored)"
                shift
                ;;
        esac
    done
    
    log_info "🔍 Checking PITR/WAL archiving status..."
    echo ""
    
    local pg_service
    pg_service=$(get_postgres_service)
    
    # Check archive_mode
    echo -e "${CYAN}Archive Mode:${NC}"
    local archive_mode
    archive_mode=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW archive_mode;" 2>/dev/null | tr -d ' ' || echo "unknown")
    if [[ -z "$archive_mode" ]]; then
        archive_mode=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW archive_mode;" 2>/dev/null | tr -d ' ' || echo "unknown")
    fi
    
    if [[ "$archive_mode" == "on" ]]; then
        echo -e "  ${GREEN}✓ archive_mode = on${NC}"
    elif [[ "$archive_mode" == "always" ]]; then
        echo -e "  ${GREEN}✓ archive_mode = always${NC}"
    else
        echo -e "  ${RED}✗ archive_mode = $archive_mode${NC}"
        echo -e "  ${YELLOW}  Warning: Archive mode is not enabled!${NC}"
    fi
    echo ""
    
    # Check archive_command
    echo -e "${CYAN}Archive Command:${NC}"
    local archive_command
    archive_command=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW archive_command;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "unknown")
    if [[ -z "$archive_command" || "$archive_command" == "unknown" ]]; then
        archive_command=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW archive_command;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "unknown")
    fi
    
    if [[ "$archive_command" != "unknown" && "$archive_command" != "(disabled)" && -n "$archive_command" ]]; then
        echo -e "  ${GREEN}✓ archive_command configured${NC}"
        echo "  Command: $archive_command"
    else
        echo -e "  ${RED}✗ archive_command = $archive_command${NC}"
        echo -e "  ${YELLOW}  Warning: Archive command is not configured!${NC}"
    fi
    echo ""
    
    # Get initial archive statistics
    echo -e "${CYAN}Archive Statistics (Before):${NC}"
    local archived_count_before
    local last_archived_time_before
    local failed_count_before
    local last_failed_time_before
    
    archived_count_before=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT archived_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
    if [[ -z "$archived_count_before" ]]; then
        archived_count_before=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT archived_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
    fi
    
    last_archived_time_before=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_archived_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
    if [[ -z "$last_archived_time_before" || "$last_archived_time_before" == "NULL" ]]; then
        last_archived_time_before=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_archived_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
    fi
    
    failed_count_before=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT failed_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
    if [[ -z "$failed_count_before" ]]; then
        failed_count_before=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT failed_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
    fi
    
    last_failed_time_before=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_failed_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
    if [[ -z "$last_failed_time_before" || "$last_failed_time_before" == "NULL" ]]; then
        last_failed_time_before=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_failed_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
    fi
    
    echo "  Archived Count: $archived_count_before"
    echo "  Last Archived Time: ${last_archived_time_before:-NULL}"
    echo "  Failed Count: $failed_count_before"
    echo "  Last Failed Time: ${last_failed_time_before:-NULL}"
    echo ""
    
    # Force WAL switch if requested
    if [[ "$force_wal_switch" == "true" ]]; then
        echo -e "${CYAN}Forcing WAL Switch:${NC}"
        
        # Get current WAL LSN before switch
        local wal_lsn_before
        wal_lsn_before=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_current_wal_lsn();" 2>/dev/null | tr -d ' ' || echo "")
        if [[ -z "$wal_lsn_before" ]]; then
            wal_lsn_before=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_current_wal_lsn();" 2>/dev/null | tr -d ' ' || echo "")
        fi
        
        log_info "Switching WAL segment..."
        log_info "Current WAL LSN before switch: ${wal_lsn_before:-unknown}"
        
        local switch_result
        switch_result=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_switch_wal();" 2>/dev/null | tr -d ' ' || echo "failed")
        if [[ -z "$switch_result" || "$switch_result" == "failed" ]]; then
            switch_result=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_switch_wal();" 2>/dev/null | tr -d ' ' || echo "failed")
        fi
        
        if [[ "$switch_result" != "failed" && -n "$switch_result" ]]; then
            echo -e "  ${GREEN}✓ WAL switch successful${NC}"
            echo "  New WAL LSN: $switch_result"
            
            # Check if WAL actually changed
            if [[ "$switch_result" == "$wal_lsn_before" ]]; then
                echo -e "  ${YELLOW}⚠ WAL LSN unchanged - current segment may not be full yet${NC}"
                echo -e "  ${YELLOW}  This is normal if the WAL segment hasn't filled up${NC}"
            fi
            echo ""
            
            # Get failed count before to detect new failures
            local failed_count_after="$failed_count_before"
            
            # Wait a moment for archiving to process
            log_info "Waiting for archiving to process..."
            sleep 3
            
            # Re-check archive statistics
            echo -e "${CYAN}Archive Statistics (After WAL Switch):${NC}"
            local archived_count_after
            local last_archived_time_after
            local failed_count_after
            
            archived_count_after=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT archived_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
            if [[ -z "$archived_count_after" ]]; then
                archived_count_after=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT archived_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
            fi
            
            last_archived_time_after=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_archived_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
            if [[ -z "$last_archived_time_after" || "$last_archived_time_after" == "NULL" ]]; then
                last_archived_time_after=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_archived_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
            fi
            
            failed_count_after=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT failed_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
            if [[ -z "$failed_count_after" ]]; then
                failed_count_after=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT failed_count FROM pg_stat_archiver;" 2>/dev/null | tr -d ' ' || echo "0")
            fi
            
            echo "  Archived Count: $archived_count_after"
            echo "  Last Archived Time: ${last_archived_time_after:-NULL}"
            echo "  Failed Count: $failed_count_after"
            echo ""
            
            # Compare counts and times
            if [[ "$failed_count_after" -gt "$failed_count_before" ]]; then
                echo -e "  ${RED}✗ Archive failures detected ($failed_count_before → $failed_count_after)${NC}"
                local last_failed_time_after
                last_failed_time_after=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_failed_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
                if [[ -z "$last_failed_time_after" || "$last_failed_time_after" == "NULL" ]]; then
                    last_failed_time_after=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT last_failed_time FROM pg_stat_archiver;" 2>/dev/null | sed 's/^[[:space:]]*//' || echo "NULL")
                fi
                if [[ "$last_failed_time_after" != "NULL" ]]; then
                    echo "  Last Failed Time: $last_failed_time_after"
                fi
                echo -e "  ${YELLOW}  Check PostgreSQL logs and archive command configuration${NC}"
            elif [[ "$archived_count_after" -gt "$archived_count_before" ]]; then
                echo -e "  ${GREEN}✓ Archive count increased ($archived_count_before → $archived_count_after) - archiving is working!${NC}"
            elif [[ "$last_archived_time_after" != "NULL" && "$last_archived_time_after" != "$last_archived_time_before" ]]; then
                echo -e "  ${GREEN}✓ Last archived time updated - archiving is working!${NC}"
            elif [[ "$switch_result" == "$wal_lsn_before" ]]; then
                echo -e "  ${YELLOW}⚠ WAL segment did not change (may not have been full)${NC}"
                echo -e "  ${YELLOW}  Archive count won't increase until a new segment is archived${NC}"
                echo -e "  ${YELLOW}  This is normal behavior - archiving is likely working correctly${NC}"
            else
                echo -e "  ${YELLOW}⚠ Archive count unchanged - archiving may not be processing${NC}"
            fi
        else
            echo -e "  ${RED}✗ WAL switch failed${NC}"
        fi
        echo ""
    fi
    
    # Overall status summary
    echo -e "${CYAN}Status Summary:${NC}"
    local status_ok=true
    
    if [[ "$archive_mode" != "on" && "$archive_mode" != "always" ]]; then
        echo -e "  ${RED}✗ Archive mode is not enabled${NC}"
        status_ok=false
    else
        echo -e "  ${GREEN}✓ Archive mode is enabled${NC}"
    fi
    
    if [[ "$archive_command" == "unknown" || "$archive_command" == "(disabled)" || -z "$archive_command" ]]; then
        echo -e "  ${RED}✗ Archive command is not configured${NC}"
        status_ok=false
    else
        echo -e "  ${GREEN}✓ Archive command is configured${NC}"
    fi
    
    if [[ "$failed_count_before" -gt 0 ]]; then
        echo -e "  ${YELLOW}⚠ Failed archive count: $failed_count_before${NC}"
        if [[ "$last_failed_time_before" != "NULL" ]]; then
            echo "    Last failure: $last_failed_time_before"
        fi
    else
        echo -e "  ${GREEN}✓ No archive failures${NC}"
    fi
    
    echo ""
    
    if [[ "$status_ok" == "true" && "$failed_count_before" -eq 0 ]]; then
        log_success "✅ PITR is properly configured and working"
        return 0
    elif [[ "$status_ok" == "true" && "$failed_count_before" -gt 0 ]]; then
        log_warning "⚠️  PITR is configured but has some failures"
        return 1
    else
        log_error "❌ PITR is not properly configured"
        return 1
    fi
}

# List WAL files with metadata to help determine restore targets
list_wal_files() {
    local pg_service
    pg_service=$(get_postgres_service)
    local container_wal_archive_dir="/var/lib/postgresql/archive"
    
    log_info "📋 Listing WAL files in archive..."
    echo ""
    
    # Get current WAL position
    local current_lsn
    local current_wal_file
    current_lsn=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_current_wal_lsn();" 2>/dev/null | tr -d ' ' || echo "")
    if [[ -z "$current_lsn" ]]; then
        current_lsn=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_current_wal_lsn();" 2>/dev/null | tr -d ' ' || echo "")
    fi
    
    current_wal_file=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_walfile_name(pg_current_wal_lsn());" 2>/dev/null | tr -d ' ' || echo "")
    if [[ -z "$current_wal_file" ]]; then
        current_wal_file=$(docker-compose exec -T "$pg_service" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_walfile_name(pg_current_wal_lsn());" 2>/dev/null | tr -d ' ' || echo "")
    fi
    
    echo -e "${CYAN}Current WAL Status:${NC}"
    echo -e "  Current LSN: ${GREEN}$current_lsn${NC}"
    echo -e "  Current WAL File: ${GREEN}$current_wal_file${NC}"
    echo ""
    
    # List WAL files in archive
    echo -e "${CYAN}WAL Files in Archive:${NC}"
    echo ""
    
    # Get list of WAL files from container
    # WAL files are 24-character hex strings (timeline + log + segment)
    local wal_list
    wal_list=$(docker compose exec -T "$pg_service" sh -c "
        find $container_wal_archive_dir -type f -name '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]' 2>/dev/null | \
        while read file; do
            filename=\$(basename \"\$file\")
            # Try to get file info using stat
            if command -v stat >/dev/null 2>&1; then
                size=\$(stat -c%s \"\$file\" 2>/dev/null || echo '0')
                mtime=\$(stat -c%y \"\$file\" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo 'unknown')
            else
                # Fallback to ls
                size=\$(ls -lh \"\$file\" 2>/dev/null | awk '{print \$5}' || echo '0')
                mtime=\$(ls -l --time-style='+%Y-%m-%d %H:%M:%S' \"\$file\" 2>/dev/null | awk '{print \$6, \$7}' || echo 'unknown')
            fi
            echo \"\$filename|\$size|\$mtime\"
        done | sort
    " 2>/dev/null || echo "")
    
    if [[ -z "$wal_list" ]]; then
        # Try alternative method with ls
        wal_list=$(docker compose exec -T "$pg_service" sh -c "
            ls -lh $container_wal_archive_dir/ 2>/dev/null | \
            awk '\$9 ~ /^[0-9A-Fa-f]{24}\$/ {print \$9, \$5, \$6, \$7, \$8}' | \
            while read filename size month day time; do
                echo \"\$filename|\$size|\$month \$day \$time\"
            done | sort
        " 2>/dev/null || echo "")
    fi
    
    if [[ -z "$wal_list" ]]; then
        log_warning "No WAL files found in archive directory: $container_wal_archive_dir"
        log_info "This could mean:"
        log_info "  1. WAL archiving just started and no files have been archived yet"
        log_info "  2. WAL files have been cleaned up"
        log_info "  3. Archive directory path is incorrect"
        return 0
    fi
    
    # Count WAL files
    local wal_count=$(echo "$wal_list" | wc -l | tr -d ' ')
    echo -e "  Found ${GREEN}$wal_count${NC} WAL file(s) in archive"
    echo ""
    
    # Display header
    printf "%-30s %12s %20s %15s %s\n" "WAL File" "Size" "Modified" "Timeline" "LSN Range"
    echo "─────────────────────────────────────────────────────────────────────────────────────────────────────"
    
    # Parse and display each WAL file
    echo "$wal_list" | while IFS='|' read -r filename size mtime; do
        if [[ -z "$filename" ]]; then
            continue
        fi
        
        # Extract timeline from WAL filename (format: TTTTTTTTXXXXXXXXYYYYYYYY)
        # Timeline is first 8 hex digits, then segment number
        local timeline=""
        local segment_info=""
        local lsn_info=""
        
        # WAL filename format: TTTTTTTTXXXXXXXXYYYYYYYY (24 hex characters)
        # Where T = timeline (8 hex), X = log file (8 hex), Y = segment (8 hex)
        if [[ "$filename" =~ ^([0-9A-Fa-f]{8})([0-9A-Fa-f]{8})([0-9A-Fa-f]{8})$ ]]; then
            timeline="${BASH_REMATCH[1]}"
            segment_info="${BASH_REMATCH[2]}${BASH_REMATCH[3]}"
            
            # Convert timeline from hex to decimal for display
            local timeline_dec=$((16#${timeline}))
            timeline="TL:$timeline_dec"
            
            # Show segment info (can be used to determine approximate LSN range)
            # The segment number helps identify the position in the WAL sequence
            lsn_info="Seg:${segment_info:0:8}"
        else
            timeline="N/A"
            lsn_info="N/A"
        fi
        
        # Format size nicely
        local size_display="$size"
        if [[ "$size" =~ ^[0-9]+$ ]]; then
            # Convert bytes to human readable
            if [[ "$size" -lt 1024 ]]; then
                size_display="${size}B"
            elif [[ "$size" -lt 1048576 ]]; then
                size_display="$((size / 1024))KB"
            else
                size_display="$((size / 1048576))MB"
            fi
        fi
        
        # Format mtime
        local mtime_display="$mtime"
        if [[ "$mtime" == "unknown" ]]; then
            mtime_display="unknown"
        fi
        
        # Display the file info
        printf "%-30s %12s %20s %15s %s\n" \
            "$filename" \
            "$size_display" \
            "$mtime_display" \
            "${timeline:-N/A}" \
            "${lsn_info:-N/A}"
    done
    
    echo ""
    echo -e "${CYAN}How to Use This Information:${NC}"
    echo ""
    echo -e "1. ${YELLOW}Find the time range:${NC}"
    echo "   - Check the 'Modified' column to see when each WAL file was created"
    echo "   - WAL files are created sequentially, so later files contain more recent data"
    echo ""
    echo -e "2. ${YELLOW}Determine restore target:${NC}"
    echo "   - Use --target-time with a timestamp between WAL file modification times"
    echo "   - Example: If you want to restore to '2025-12-18 14:30:00', find WAL files"
    echo "     created around that time"
    echo "   - WAL files are sequential - later files contain more recent data"
    echo ""
    echo -e "3. ${YELLOW}Check base backup compatibility:${NC}"
    echo "   - Your base backup must be older than your target restore time"
    echo "   - List base backups: docker compose exec postgres ls -lth /var/lib/postgresql/archive/basebackups/"
    echo ""
    echo -e "4. ${YELLOW}Get current position:${NC}"
    echo "   - Current LSN shows where the database is now"
    echo "   - You can restore to any point before the current LSN"
    echo "   - Use pg_walfile_name() in PostgreSQL to convert LSN to WAL filename"
    echo ""
    echo -e "5. ${YELLOW}Convert between WAL files and LSN:${NC}"
    echo "   - WAL filename to LSN: SELECT pg_lsn_from_walfile_name('WALFILENAME');"
    echo "   - LSN to WAL filename: SELECT pg_walfile_name('LSN');"
    echo ""
    echo -e "${CYAN}Example Restore Commands:${NC}"
    echo "  $0 pitr-restore --target-time '2025-12-18 14:30:00'"
    echo "  $0 pitr-restore --target-lsn '$current_lsn'"
    echo ""
}

#########################################################################
# S3 BACKUP FUNCTIONS
#########################################################################

# Upload backup to S3
# Comprehensive S3 upload function
# Usage: upload_to_s3 <file_path> <backup_type>
#   file_path: Path to file to upload
#   backup_type: Type of backup (e.g., "postgresql", "pitr")
#   - SQL dumps go to: db_backups/postgresql/YYYY-MM-DD/backup_file
#   - PITR backups go to: db_backups/archive/pitr_basebackup_YYYY-MM-DD-HH-MM-SS.tar.gz
upload_to_s3() {
    local file_path="$1"
    local backup_type="$2"
    
    # Check if bucket is configured
    if [[ -z "$AWS_STORAGE_BUCKET_NAME" ]]; then
        log_debug "S3 backup not configured, skipping upload"
        return 0
    fi
    
    # Set upload label based on backup type
    local upload_label
    if [[ "$backup_type" == "pitr" ]]; then
        upload_label="PITR backup"
    else
        upload_label="PostgreSQL backup"
    fi
    
    log_info "☁️  Uploading backup to S3..."
    
    local file_name=$(basename "$file_path")
    local s3_key
    
    if [[ "$backup_type" == "pitr" ]]; then
        # PITR backups: db_backups/archive/pitr_basebackup_YYYY-MM-DD-HH-MM-SS.tar.gz
        s3_key="db_backups/archive/${file_name}"
    else
        # Regular backups: db_backups/postgresql/YYYY-MM-DD/backup_file
        s3_key="db_backups/postgresql/${DATE_ONLY}/${file_name}"
    fi
    
    # Clean storage class value (remove any trailing comments/whitespace)
    local storage_class="${S3_STORAGE_CLASS%%#*}"
    storage_class="${storage_class%"${storage_class##*[![:space:]]}"}"
    storage_class="${storage_class#"${storage_class%%[![:space:]]*}"}"
    
    # Clean region value
    local region="${AWS_S3_REGION_NAME%%#*}"
    region="${region%"${region##*[![:space:]]}"}"
    region="${region#"${region%%[![:space:]]*}"}"
    
    # Retry logic with exponential backoff (3 retries)
    local max_retries=3
    local retry_count=0
    local wait_time=1  # Start with 1 second
    
    while [[ $retry_count -le $max_retries ]]; do
        if aws s3 cp "$file_path" "s3://${AWS_STORAGE_BUCKET_NAME}/${s3_key}" \
            --storage-class "$storage_class" \
            --region "$region" \
            --sse AES256 \
            --only-show-errors; then
            
            if [[ $retry_count -gt 0 ]]; then
                log_success "✅ Backup uploaded to ${upload_label} after $retry_count retry(ies): s3://${AWS_STORAGE_BUCKET_NAME}/${s3_key}"
            else
                log_success "✅ Backup uploaded to ${upload_label}: s3://${AWS_STORAGE_BUCKET_NAME}/${s3_key}"
            fi
            return 0
        else
            if [[ $retry_count -lt $max_retries ]]; then
                log_warning "⚠️  ${upload_label} upload attempt $((retry_count + 1)) failed, retrying in ${wait_time}s..."
                sleep "$wait_time"
                wait_time=$((wait_time * 2))  # Exponential backoff: 1s, 2s, 4s
                ((++retry_count))
            else
                log_error "❌ ${upload_label} upload failed after $max_retries retries"
                return 1
            fi
        fi
    done
    
    log_error "❌ ${upload_label} upload failed"
    return 1
}

# Cleanup old S3 backups
cleanup_s3_backups() {
    if [[ -z "$AWS_STORAGE_BUCKET_NAME" ]]; then
        log_info "☁️  S3 backup not configured, skipping S3 cleanup"
        return 0
    fi
    
    log_info "☁️  Cleaning up old S3 backups (retention: $S3_RETENTION_DAYS days)..."
    
    if [[ $S3_RETENTION_DAYS -le 0 ]]; then
        log_info "S3 retention is set to 0 or negative, skipping S3 cleanup"
        return 0
    fi
    
    # Calculate cutoff date
    local cutoff_date
    if command -v gdate &> /dev/null; then
        # macOS with GNU date
        cutoff_date=$(gdate -d "${S3_RETENTION_DAYS} days ago" +%Y-%m-%d)
    else
        # Linux date
        cutoff_date=$(date -d "${S3_RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${S3_RETENTION_DAYS}d +%Y-%m-%d)
    fi
    
    local deleted_count=0
    
    # List and delete old backups
    if ! command -v aws &> /dev/null; then
        log_warning "AWS CLI not found, skipping S3 cleanup"
        return 0
    fi
    
    # Clean up SQL dumps: db_backups/postgresql/YYYY-MM-DD/
    log_info "Cleaning up old SQL dumps from db_backups/postgresql/..."
    aws s3 ls "s3://${AWS_STORAGE_BUCKET_NAME}/db_backups/postgresql/" --recursive --region "$AWS_S3_REGION_NAME" 2>/dev/null | \
    while read -r line; do
        local date_str=$(echo "$line" | awk '{print $1}')
        if [[ -n "$date_str" ]] && [[ "$date_str" < "$cutoff_date" ]]; then
            local key=$(echo "$line" | awk '{for(i=4;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
            if aws s3 rm "s3://${AWS_STORAGE_BUCKET_NAME}/${key}" --region "$AWS_S3_REGION_NAME" --quiet 2>/dev/null; then
                ((++deleted_count))
                log_debug "Deleted old S3 backup: $key (date: $date_str)"
            fi
        fi
    done
    
    # Clean up PITR backups: db_backups/archive/
    log_info "Cleaning up old PITR backups from db_backups/archive/..."
    local pitr_cutoff_timestamp
    if command -v gdate &> /dev/null; then
        pitr_cutoff_timestamp=$(gdate -d "${S3_RETENTION_DAYS} days ago" +%s)
    else
        pitr_cutoff_timestamp=$(date -d "${S3_RETENTION_DAYS} days ago" +%s 2>/dev/null || date -v-${S3_RETENTION_DAYS}d +%s)
    fi
    
    aws s3 ls "s3://${AWS_STORAGE_BUCKET_NAME}/db_backups/archive/" --recursive --region "$AWS_S3_REGION_NAME" 2>/dev/null | \
    while read -r line; do
        local s3_path=$(echo "$line" | awk '{for(i=4;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
        if [[ -n "$s3_path" ]] && [[ "$s3_path" =~ pitr_basebackup_([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{2})-([0-9]{2})-([0-9]{2}) ]]; then
            local backup_year="${BASH_REMATCH[1]}"
            local backup_month="${BASH_REMATCH[2]}"
            local backup_day="${BASH_REMATCH[3]}"
            local backup_hour="${BASH_REMATCH[4]}"
            local backup_min="${BASH_REMATCH[5]}"
            local backup_sec="${BASH_REMATCH[6]}"
            
            local backup_timestamp
            if command -v gdate &> /dev/null; then
                backup_timestamp=$(gdate -d "${backup_year}-${backup_month}-${backup_day} ${backup_hour}:${backup_min}:${backup_sec}" +%s)
            else
                backup_timestamp=$(date -d "${backup_year}-${backup_month}-${backup_day} ${backup_hour}:${backup_min}:${backup_sec}" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "${backup_year}-${backup_month}-${backup_day} ${backup_hour}:${backup_min}:${backup_sec}" +%s)
            fi
            
            if [[ -n "$backup_timestamp" ]] && [[ "$backup_timestamp" -lt "$pitr_cutoff_timestamp" ]]; then
                if aws s3 rm "s3://${AWS_STORAGE_BUCKET_NAME}/${s3_path}" --region "$AWS_S3_REGION_NAME" --quiet 2>/dev/null; then
                    ((++deleted_count))
                    log_debug "Deleted old PITR backup: $s3_path"
                fi
            fi
        fi
    done
    
    # Note: WAL files in db_backups/wal-g/ are managed by wal-g retention policies, not cleaned here
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old S3 backup file(s) (older than $S3_RETENTION_DAYS days)"
    else
        log_info "No old S3 backup files to delete"
    fi
    
    log_success "S3 cleanup completed"
}

#########################################################################
# MONITORING AND STATISTICS
#########################################################################

# Show comprehensive backup statistics
show_statistics() {
    log_info "📊 Database Backup Statistics"
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Database Type: $DB_TYPE"
    echo "  Database Name: $DB_NAME"
    echo "  Database User: $DB_USER"
    echo "  Project Directory: $PROJECT_DIR"
    echo "  Backup Directory: $BACKUP_BASE_DIR"
    echo ""
    
    echo -e "${CYAN}PostgreSQL Backups:${NC}"
    local pg_service
    pg_service=$(get_postgres_service)
    local container_backup_dir="/var/lib/postgresql/backups"
    # Count from container
    local pg_count
    pg_count=$(docker compose exec -T "$pg_service" sh -c "find $container_backup_dir -name 'landarsfood_backup_*.dump' -type f 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ' || echo "0")
    # Size from container
    local pg_size
    pg_size=$(docker compose exec -T "$pg_service" sh -c "du -sh $container_backup_dir 2>/dev/null | cut -f1" 2>/dev/null || echo "N/A")
    # Latest from container
    local latest_pg
    latest_pg=$(docker compose exec -T "$pg_service" sh -c "ls -t $container_backup_dir/landarsfood_backup_*.dump 2>/dev/null | head -1 | xargs basename 2>/dev/null" 2>/dev/null || echo "None")
    echo "  Total Backups: $pg_count"
    echo "  Total Size: $pg_size"
    echo "  Latest Backup: $latest_pg"
    echo "  Container Location: $container_backup_dir"
    # Also show host copy if exists
    local host_pg_count=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.dump" -type f 2>/dev/null | wc -l)
    if [[ $host_pg_count -gt 0 ]]; then
        echo "  Host Copy: $BACKUP_BASE_DIR/postgresql ($host_pg_count files)"
    fi
    
    # Show db_data/pg.dump info
    local db_data_file="$PROJECT_DIR/db_data/pg.dump"
    if [[ -f "$db_data_file" ]]; then
        local pg_dump_size=$(get_file_size "$db_data_file")
        # Get file modification date (compatible with both macOS and Linux)
        local pg_dump_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$db_data_file" 2>/dev/null || \
                            stat -c "%y" "$db_data_file" 2>/dev/null | cut -d'.' -f1 | sed 's/ / /' || \
                            echo "Unknown")
        echo "  db_data/pg.dump: $pg_dump_size (updated: $pg_dump_date)"
    fi
    echo ""
    
    echo -e "${CYAN}PITR Backups:${NC}"
    local pg_service
    pg_service=$(get_postgres_service)
    local container_backup_base_dir="/var/lib/postgresql/archive/basebackups"
    local pitr_count
    # Count both compressed .tar.gz files and directories, but count each backup only once
    pitr_count=$(docker compose exec -T "$pg_service" sh -c "
        cd $container_backup_base_dir 2>/dev/null || exit 0
        for item in pitr_basebackup_*; do
            if [ -e \"\$item\" ]; then
                basename \"\$item\" .tar.gz
            fi
        done | sort -u | wc -l
    " 2>/dev/null | tr -d ' ' || echo "0")
    local pitr_size
    pitr_size=$(docker compose exec -T "$pg_service" sh -c "du -sh $container_backup_base_dir 2>/dev/null | cut -f1" 2>/dev/null || echo "N/A")
    local latest_pitr
    # Get the most recent backup (compressed or directory)
    latest_pitr=$(docker compose exec -T "$pg_service" sh -c "
        cd $container_backup_base_dir 2>/dev/null || exit 0
        for item in pitr_basebackup_*; do
            if [ -e \"\$item\" ]; then
                basename \"\$item\" .tar.gz
            fi
        done | sort -u | head -1
    " 2>/dev/null || echo "None")
    echo "  Total PITR Backups: $pitr_count"
    echo "  Total Size: $pitr_size"
    echo "  Latest PITR Backup: $latest_pitr"
    echo "  Location: $container_backup_base_dir (inside container)"
    echo ""
    
    echo -e "${CYAN}Container Status:${NC}"
    local pg_container
    pg_container=$(get_postgres_container 2>/dev/null)
    if [[ -n "$pg_container" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${pg_container}$"; then
        echo "  PostgreSQL Container: $pg_container ✅"
        # Show container status details
        local container_status
        container_status=$(docker ps --format '{{.Status}}' --filter "name=^${pg_container}$" 2>/dev/null | head -1)
        if [[ -n "$container_status" ]]; then
            echo "    Status: $container_status"
        fi
    else
        echo "  PostgreSQL Container: Not running ❌"
        if [[ -z "$pg_container" ]]; then
            echo "    (Could not detect container name)"
            echo ""
            echo "    Available running containers:"
            docker ps --format '  - {{.Names}} ({{.Status}})' 2>/dev/null | head -10 || echo "    (Could not list containers)"
            echo ""
            echo "    Tip: Set POSTGRES_CONTAINER environment variable or ensure container name contains 'postgres' or 'pg'"
        else
            echo "    (Container '$pg_container' not found in running containers)"
        fi
    fi
    
    echo -e "${CYAN}Retention Policies:${NC}"
    echo "  SQL Backup Retention: $SQL_RETENTION_DAYS days"
    echo "  PITR Backup Retention: $PITR_RETENTION_COUNT most recent backups"
    echo "  Log Retention: $LOG_RETENTION_DAYS days (2x SQL retention)"
    echo "  WAL Retention: $WAL_RETENTION_DAYS days"
    echo "  S3 Backup Retention: $S3_RETENTION_DAYS days"
    echo ""
    
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        echo -e "${CYAN}S3 Configuration:${NC}"
        echo "  S3 Bucket: $AWS_STORAGE_BUCKET_NAME"
        echo "  S3 Region: $AWS_S3_REGION_NAME"
        echo "  Backup Directory: db_backups/YYYY-MM-DD/ (for regular backups)"
        echo "  Archive Directory: archive/ (for PITR base backups)"
        echo "  Storage Class: $S3_STORAGE_CLASS"
        echo ""
    fi
}

# Health check function
health_check() {
    log_info "🏥 Running backup system health check..."
    local issues=0
    
    echo ""
    echo -e "${CYAN}Health Check Results:${NC}"
    
    # Check PostgreSQL container
    local pg_service
    pg_service=$(get_postgres_service)
    local container_name
    container_name=$(get_postgres_container)
    
    if check_container_running "$container_name" 2>/dev/null; then
        echo "  ✅ PostgreSQL container is running ($container_name)"
    else
        echo "  ❌ PostgreSQL container is not running ($container_name)"
        ((++issues))
    fi
    
    # Check backup directories
    if [[ -d "$BACKUP_BASE_DIR" ]]; then
        echo "  ✅ Backup directory exists"
    else
        echo "  ❌ Backup directory missing"
        ((++issues))
    fi
    
    # Check recent backups
    local recent_backup=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.dump" -type f -mtime -1 2>/dev/null | head -1)
    if [[ -n "$recent_backup" ]]; then
        echo "  ✅ Recent backup found (within 24 hours)"
    else
        echo "  ⚠️  No recent backup found"
        ((++issues))
    fi
    
    # Check S3 configuration
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        if command -v aws &> /dev/null; then
            echo "  ✅ AWS CLI available for S3 backups"
        else
            echo "  ❌ AWS CLI not found but S3 configured"
            ((++issues))
        fi
    fi
    
    # Check disk space (works on both Linux and macOS)
    local available_space=""
    local available_bytes=0
    
    # Try Linux-style df first (with -BG for GB)
    if available_space=$(df -BG "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//' | tr -d ' '); then
        if [[ -n "$available_space" ]] && [[ "$available_space" =~ ^[0-9]+$ ]]; then
            available_bytes=$available_space
        fi
    fi
    
    # If that didn't work, try macOS-style df (with -g for GB)
    if [[ -z "$available_space" ]] || [[ ! "$available_space" =~ ^[0-9]+$ ]]; then
        if available_space=$(df -g "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d ' '); then
            if [[ -n "$available_space" ]] && [[ "$available_space" =~ ^[0-9]+$ ]]; then
                available_bytes=$available_space
            fi
        fi
    fi
    
    # If still no value, try getting bytes and converting
    if [[ -z "$available_space" ]] || [[ ! "$available_space" =~ ^[0-9]+$ ]]; then
        local available_kb=$(df -k "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d ' ')
        if [[ -n "$available_kb" ]] && [[ "$available_kb" =~ ^[0-9]+$ ]]; then
            available_bytes=$((available_kb / 1024 / 1024))  # Convert KB to GB
        fi
    fi
    
    if [[ -n "$available_bytes" ]] && [[ "$available_bytes" =~ ^[0-9]+$ ]] && [[ "$available_bytes" -gt 5 ]]; then
        echo "  ✅ Sufficient disk space (${available_bytes}GB available)"
    elif [[ -n "$available_bytes" ]] && [[ "$available_bytes" =~ ^[0-9]+$ ]]; then
        echo "  ⚠️  Low disk space (${available_bytes}GB available)"
        ((++issues))
    else
        echo "  ⚠️  Could not determine disk space"
        ((++issues))
    fi
    
    echo ""
    if [[ $issues -eq 0 ]]; then
        log_success "✅ All health checks passed!"
        return 0
    else
        log_warning "⚠️  Found $issues potential issues"
        return 1
    fi
}

#########################################################################
# MAIN BACKUP FUNCTIONS
#########################################################################

# Create comprehensive backup (all types)
create_full_backup() {
    log_info "🚀 Creating comprehensive backup (all types)..."
    local start_time=$(date +%s)
    local success_count=0
    local total_count=0
    
    echo ""
    
    # PostgreSQL backup
    ((++total_count))
    if create_postgresql_backup; then
        ((++success_count))
    fi
    
    echo ""
    
    # PITR backup (always attempt if PostgreSQL is running)
    local pg_service
    pg_service=$(get_postgres_service)
    if [[ -n "$pg_service" ]] && docker compose ps "$pg_service" 2>/dev/null | grep -q "Up"; then
        ((++total_count))
        if create_pitr_backup; then
            ((++success_count))
        fi
        echo ""
    else
        log_warning "⚠️  PostgreSQL service not running, skipping PITR backup"
    fi
    
    local duration=$(($(date +%s) - start_time))
    
    if [[ $success_count -eq $total_count ]]; then
        log_success "🎉 Comprehensive backup completed successfully in ${duration}s"
        log_info "   Completed: $success_count/$total_count backup types"
        return 0
    else
        log_warning "⚠️  Partial backup completed in ${duration}s"
        log_warning "   Completed: $success_count/$total_count backup types"
        return 1
    fi
}

# Cleanup all backup types
# Cleanup old PITR backups (count-based: keep only the N most recent)
cleanup_old_pitr_backups() {
    log_info "🧹 Cleaning up old PITR backups (keeping $PITR_RETENTION_COUNT most recent)..."
    local deleted_count=0
    local pg_service
    pg_service=$(get_postgres_service)
    local container_backup_base_dir="/var/lib/postgresql/archive/basebackups"
    
    if [[ $PITR_RETENTION_COUNT -gt 0 ]]; then
        # Get list of PITR backups (both compressed .tar.gz and directories) sorted by modification time (newest first)
        # We need to handle both formats: pitr_basebackup_*.tar.gz and pitr_basebackup_* (directories)
        # Sort by modification time and keep only the first PITR_RETENTION_COUNT backups
        local files_to_delete
        # List all backups (compressed and directories), sort by time, get the ones to delete
        files_to_delete=$(docker compose exec -T "$pg_service" sh -c "
            cd $container_backup_base_dir 2>/dev/null || exit 0
            # List all backups (both .tar.gz and directories) with their modification times
            for item in pitr_basebackup_*; do
                if [ -e \"\$item\" ]; then
                    stat -c '%Y %n' \"\$item\" 2>/dev/null || stat -f '%m %N' \"\$item\" 2>/dev/null || echo \"0 \$item\"
                fi
            done | sort -rn | tail -n +$((PITR_RETENTION_COUNT + 1)) | awk '{print \$2}'
        " 2>/dev/null)
        
        if [[ -n "$files_to_delete" ]]; then
            while IFS= read -r backup_item; do
                if [[ -n "$backup_item" ]]; then
                    # Remove both the item and its .tar.gz version if it exists (for safety)
                    docker compose exec -T "$pg_service" sh -c "rm -rf \"$container_backup_base_dir/$backup_item\" \"$container_backup_base_dir/${backup_item}.tar.gz\" 2>/dev/null" && ((++deleted_count)) || true
                fi
            done <<< "$files_to_delete"
        fi
    fi
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old PITR backup(s) (keeping $PITR_RETENTION_COUNT most recent)"
    else
        log_info "No old PITR backups to delete"
    fi
}

# Cleanup old log files (retention is double the longest backup retention)
cleanup_old_logs() {
    log_info "🧹 Cleaning up old log files (retention: $LOG_RETENTION_DAYS days)..."
    local deleted_count=0
    local log_dir="${LOG_DIR}"
    
    # Delete log files older than LOG_RETENTION_DAYS (default: double SQL retention)
    if [[ -d "$log_dir" ]]; then
        deleted_count=$(find "$log_dir" -name "backup_*.log" -type f -mtime +$LOG_RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
    fi
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old log files (older than $LOG_RETENTION_DAYS days)"
    else
        log_info "No old log files to delete"
    fi
}

# Cleanup old WAL files from archive directory
cleanup_wal_files() {
    log_info "🧹 Cleaning up old WAL files (retention: $WAL_RETENTION_DAYS days)..."
    
    local deleted_count=0
    local archive_dir="/var/lib/postgresql/archive"
    
    if [[ $WAL_RETENTION_DAYS -gt 0 ]]; then
        # Delete WAL files older than retention period from archive directory inside container
        # WAL files are typically 24-character hex strings (e.g., 000000010000000000000001)
        # Use find to match all files in archive directory and filter by modification time
        local pg_service
        pg_service=$(get_postgres_service)
        local find_output
        find_output=$(docker compose exec -T "$pg_service" find "$archive_dir" \
            -type f \
            -mtime +$WAL_RETENTION_DAYS \
            -print 2>/dev/null)
        
        # Fallback to docker-compose if docker compose fails
        if [[ -z "$find_output" ]]; then
            find_output=$(docker-compose exec -T "$pg_service" find "$archive_dir" \
                -type f \
                -mtime +$WAL_RETENTION_DAYS \
                -print 2>/dev/null)
        fi
        
        if [[ -n "$find_output" ]]; then
            # Count files and delete them
            deleted_count=$(echo "$find_output" | wc -l | tr -d ' ')
            
            # Delete the files
            echo "$find_output" | while IFS= read -r wal_file; do
                if [[ -n "$wal_file" ]]; then
                    docker compose exec -T "$pg_service" rm -f "$wal_file" 2>/dev/null || \
                    docker-compose exec -T "$pg_service" rm -f "$wal_file" 2>/dev/null || true
                fi
            done
        fi
    fi
    
    if [[ "$deleted_count" -gt 0 ]]; then
        log_info "Deleted $deleted_count old WAL files (older than $WAL_RETENTION_DAYS days)"
    else
        log_info "No old WAL files to delete"
    fi
    
    return 0
}

# Cleanup all backup types
cleanup_all() {
    log_info "🧹 Running comprehensive cleanup..."
    echo ""
    
    local total_deleted=0
    local cleanup_summary=()
    
    # Determine total number of cleanup steps
    local total_steps=5
    local current_step=1
    
    # 1. Cleanup old dump backups (PostgreSQL dumps)
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📦 Step $current_step/$total_steps: Cleaning up old dump backups (retention: $SQL_RETENTION_DAYS days)..."
    cleanup_old_postgresql_backups
    echo ""
    ((++current_step))
    
    # 2. Cleanup old PITR base backups
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📦 Step $current_step/$total_steps: Cleaning up old PITR base backups (keeping $PITR_RETENTION_COUNT most recent)..."
    cleanup_old_pitr_backups
    echo ""
    ((++current_step))
    
    # 3. Cleanup old WAL files
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📦 Step $current_step/$total_steps: Cleaning up old WAL files (retention: $WAL_RETENTION_DAYS days)..."
    cleanup_wal_files
    echo ""
    ((++current_step))
    
    # 4. Cleanup old log files
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📦 Step $current_step/$total_steps: Cleaning up old log files (retention: $LOG_RETENTION_DAYS days)..."
    cleanup_old_logs
    echo ""
    ((++current_step))
    
    # 5. Cleanup old S3 backups
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📦 Step $current_step/$total_steps: Cleaning up old S3 backups (retention: $S3_RETENTION_DAYS days)..."
    cleanup_s3_backups
    echo ""
    
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "✅ Comprehensive cleanup completed"
    log_info ""
    log_info "📊 Cleanup Summary:"
    log_info "  ✓ Dump backups: Retention $SQL_RETENTION_DAYS days"
    log_info "  ✓ PITR base backups: Keeping $PITR_RETENTION_COUNT most recent"
    log_info "  ✓ WAL files: Retention $WAL_RETENTION_DAYS days"
    log_info "  ✓ Log files: Retention $LOG_RETENTION_DAYS days"
    log_info "  ✓ S3 backups: Retention $S3_RETENTION_DAYS days"
}

#########################################################################
# COMMAND LINE INTERFACE
#########################################################################

# Show usage information
show_usage() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Ultimate Database Backup Script for FoodPlatform${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}BACKUP TYPES:${NC}"
    echo "  • SQL Dump (pg_dump)      - Fast, portable database backups"
    echo "  • PITR Base Backup        - Full cluster backup for point-in-time recovery"
    echo "  • WAL Archiving           - Continuous transaction log archiving (automatic)"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}BACKUP COMMANDS:${NC}"
    echo ""
    echo "  backup                    Create SQL dump backup"
    echo "  full-backup               Create all backup types (SQL + PITR)"
    echo "  pitr-backup               Create PITR base backup"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}RESTORE COMMANDS:${NC}"
    echo ""
    echo "  restore [file] [options]  Restore from SQL dump backup"
    echo ""
    echo "    Options:"
    echo "      (no flags)            Restore to ${DB_NAME}_restore (safe, doesn't modify live DB)"
    echo "      --promote             Restore + validate + swap into live (keeps old DB)"
    echo "      --promote --no-keep   Restore + validate + swap (drops old DB)"
    echo "      --force               Restore directly to ${DB_NAME} (drops existing, no validation)"
    echo ""
    echo "    Examples:"
    echo "      $0 restore                           # Restore latest to ${DB_NAME}_restore"
    echo "      $0 restore backup.dump              # Restore specific file"
    echo "      $0 restore backup.dump --promote    # Restore and promote to live"
    echo ""
    echo "  promote [options]         Promote restore database to active database"
    echo ""
    echo "    Options:"
    echo "      (no flags)            Promote and keep old database as ${DB_NAME}_old_<timestamp>"
    echo "      --no-keep             Promote and drop old database"
    echo "      --no-validate         Skip validation before promoting"
    echo ""
    echo "    Examples:"
    echo "      $0 promote                           # Promote and keep old database"
    echo "      $0 promote --no-keep                 # Promote and drop old database"
    echo ""
    echo "  pitr-restore [name] [options]  Restore from PITR base backup with WAL"
    echo ""
    echo "    Options:"
    echo "      --target-time TIME    Restore to specific timestamp (e.g., '2025-12-17 15:30:00')"
    echo "      --target-lsn LSN      Restore to specific LSN (e.g., '0/1234567')"
    echo "      --target-xid XID      Restore to specific transaction ID"
    echo "      --promote             Promote restored DB to live after recovery"
    echo "      --keep                Keep old DB when promoting (default)"
    echo "      --no-keep             Drop old DB when promoting"
    echo ""
    echo "    Examples:"
    echo "      $0 pitr-restore                                    # Restore from latest base backup"
    echo "      $0 pitr-restore pitr_basebackup_2025-12-17_21-13-17"
    echo "      $0 pitr-restore --target-time '2025-12-17 15:30:00'"
    echo "      $0 pitr-restore --target-time '2025-12-17 15:30:00' --promote"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}MANAGEMENT COMMANDS:${NC}"
    echo ""
    echo "  promote [options]         Promote restore database to active database"
    echo "                            Options: --no-keep (drop old DB), --no-validate (skip validation)"
    echo "  stats                     Show comprehensive backup statistics"
    echo "  health                    Run system health check"
    echo "  cleanup                   Clean up old backups (local + S3)"
    echo "  wal-cleanup               Clean up old WAL files from archive"
    echo "  s3-cleanup                Clean up old S3 backups only"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}PITR & WAL COMMANDS:${NC}"
    echo ""
    echo "  pitr-status [--force]    Check PITR/WAL archiving status"
    echo "                           --force: Test with WAL switch"
    echo "  wal-list                 List WAL files with metadata (find restore targets)"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}INFORMATION COMMANDS:${NC}"
    echo ""
    echo "  help                     Show this help message"
    echo "  version                   Show script version"
    echo "  config                    Show current configuration"
    echo "  databases                 List all PostgreSQL databases"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}QUICK REFERENCE:${NC}"
    echo ""
    echo "  Daily backup:             $0 backup"
    echo "  Weekly full backup:       $0 full-backup"
    echo "  Monthly cleanup:          $0 cleanup"
    echo "  Check status:             $0 stats"
    echo "  Verify PITR:              $0 pitr-status"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Show script version
show_version() {
    echo "Ultimate Database Backup Script v2.0"
    echo "Compatible with PostgreSQL and cloud storage"
    echo "Designed for FoodPlatform project"
}

# Show current configuration
show_config() {
    echo -e "${CYAN}Current Configuration:${NC}"
    echo ""
    echo "Database Settings:"
    echo "  Type: $DB_TYPE"
    echo "  Name: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo ""
    echo "Directory Settings:"
    echo "  Project: $PROJECT_DIR"
    echo "  Backup Base: $BACKUP_BASE_DIR"
    echo "  Archive: $ARCHIVE_DIR"
    echo ""
    echo "Container Backup Locations:"
    echo "  Dumps: /var/lib/postgresql/backups"
    echo "  WAL Archive: /var/lib/postgresql/archive"
    echo "  Base Backups: /var/lib/postgresql/archive/basebackups"
    echo ""
    echo "Retention Settings:"
    echo "  SQL Retention: $SQL_RETENTION_DAYS days"
    echo "  PITR Retention: $PITR_RETENTION_COUNT most recent backups"
    echo "  Log Retention: $LOG_RETENTION_DAYS days"
    echo "  WAL Retention: $WAL_RETENTION_DAYS days"
    echo "  S3 Retention: $S3_RETENTION_DAYS days"
    echo ""
    echo "Cloud Settings:"
    echo "  S3 Bucket: ${AWS_STORAGE_BUCKET_NAME:-'Not configured'}"
    echo "  S3 Region: $AWS_S3_REGION_NAME"
    echo "  Storage Class: $S3_STORAGE_CLASS"
    echo ""
    echo "Container Settings:"
    echo "  PostgreSQL: $POSTGRES_CONTAINER"
}

# List all PostgreSQL databases and show which one the app uses
list_databases() {
    log_info "📊 Listing all PostgreSQL databases..."
    echo ""
    
    local pg_service
    pg_service=$(get_postgres_service)
    
    echo -e "${CYAN}Application Configuration:${NC}"
    echo -e "  Active Database (from .env): ${GREEN}$DB_NAME${NC} ✅"
    echo "  Database User: $DB_USER"
    echo ""
    
    echo -e "${CYAN}All Databases in PostgreSQL:${NC}"
    echo ""
    
    # Get list of all databases with their sizes and connection counts
    local db_list
    db_list=$(docker compose exec -T "$pg_service" psql -U "$DB_USER" -d postgres -t -c "
        SELECT 
            datname as database,
            pg_size_pretty(pg_database_size(datname)) as size,
            (SELECT count(*) FROM pg_stat_activity WHERE datname = d.datname) as connections
        FROM pg_database d
        WHERE datistemplate = false
        ORDER BY 
            CASE 
                WHEN datname = '$DB_NAME' THEN 1
                WHEN datname LIKE '${DB_NAME}_old_%' THEN 2
                WHEN datname LIKE '${DB_NAME}_restore' THEN 3
                ELSE 4
            END,
            datname;
    " 2>/dev/null)
    
    if [[ -z "$db_list" ]]; then
        log_error "Failed to retrieve database list"
        return 1
    fi
    
    # Parse and display databases
    echo -e "${CYAN}Database Name${NC}                    ${CYAN}Size${NC}      ${CYAN}Connections${NC}  ${CYAN}Status${NC}"
    echo "────────────────────────────────────────────────────────────────────────"
    
    echo "$db_list" | while IFS='|' read -r db_name db_size connections; do
        # Trim whitespace
        db_name=$(echo "$db_name" | xargs)
        db_size=$(echo "$db_size" | xargs)
        connections=$(echo "$connections" | xargs)
        
        if [[ -z "$db_name" ]]; then
            continue
        fi
        
        local status_indicator=""
        local status_color=""
        
        if [[ "$db_name" == "$DB_NAME" ]]; then
            status_indicator="🟢 ACTIVE (App uses this)"
            status_color="${GREEN}"
        elif [[ "$db_name" =~ ^${DB_NAME}_old_ ]]; then
            status_indicator="🟡 OLD (from restore --promote)"
            status_color="${YELLOW}"
        elif [[ "$db_name" == "${DB_NAME}_restore" ]]; then
            status_indicator="🔵 RESTORE (temporary)"
            status_color="${BLUE}"
        else
            status_indicator="⚪ Other"
            status_color="${NC}"
        fi
        
        # Use printf with %b to interpret escape sequences
        printf "%-30s %10s %10s   %b%s%b\n" "$db_name" "$db_size" "$connections" "$status_color" "$status_indicator" "${NC}"
    done
    
    echo ""
    echo -e "${CYAN}Database Storage Location:${NC}"
    echo -e "  All databases are stored in: ${YELLOW}/var/lib/postgresql/data${NC} (inside container)"
    echo -e "  Docker volume: ${YELLOW}postgres_data${NC} (mapped to container's /var/lib/postgresql/data)"
    echo ""
    echo -e "${CYAN}To check which database your app uses:${NC}"
    echo -e "  1. Check .env file: ${YELLOW}POSTGRES_DB=${DB_NAME}${NC}"
    echo -e "  2. Check docker-compose.yml: ${YELLOW}POSTGRES_DB=\${POSTGRES_DB}${NC}"
    echo -e "  3. Current active database: ${GREEN}$DB_NAME${NC}"
    echo ""
    echo -e "${CYAN}To clean up old databases:${NC}"
    echo -e "  Connect to PostgreSQL and run: ${YELLOW}DROP DATABASE database_name;${NC}"
    echo -e "  Or use: ${YELLOW}docker compose exec postgres psql -U $DB_USER -d postgres -c \"DROP DATABASE database_name;\"${NC}"
}

#########################################################################
# MAIN SCRIPT LOGIC
#########################################################################

# Main function
main() {
    # Initialise configuration (env vars, containers, paths, timestamps)
    init_config

    local command="${1:-backup}"
    
    # Build command arguments string for logging (save all args except command)
    local command_args=""
    local all_args=("$@")
    if [[ ${#all_args[@]} -gt 1 ]]; then
        # Get all arguments except the first one (command)
        command_args="${all_args[@]:1}"
    fi
    
    # Log command separator to file
    log_command_separator "$command" "$command_args"
    
    # Validate configuration
    if ! validate_config; then
        log_error "Configuration validation failed"
        exit 1
    fi
    
    # Execute command
    case "$command" in
        "backup"|"pg-backup"|"postgresql")
            create_postgresql_backup
            ;;
        "full-backup"|"full"|"all")
            create_full_backup
            ;;
        "restore"|"pg-restore")
            # Pass all remaining arguments to restore function (handles --force flag)
            shift
            restore_postgresql_backup "$@"
            ;;
        "promote")
            # Pass all remaining arguments to promote function
            shift
            promote_database "$@"
            ;;
        "pitr-restore"|"restore-pitr")
            # Pass all remaining arguments to restore function (handles --target-time, --target-lsn, etc.)
            shift
            restore_pitr_backup "$@"
            ;;
        "pitr-backup"|"pitr")
            create_pitr_backup
            ;;
        "pitr-check"|"pitr-status")
            # Pass remaining arguments (handles --force flag)
            shift
            check_pitr_status "$@"
            ;;
        "stats"|"stat"|"stats"|"statistics"|"status")
            show_statistics
            ;;
        "health"|"health-check"|"check")
            health_check
            ;;
        "cleanup"|"clean")
            cleanup_all
            ;;
        "wal-cleanup")
            cleanup_wal_files
            ;;
        "s3-cleanup")
            cleanup_s3_backups
            ;;
        "config"|"configuration")
            show_config
            ;;
        "databases"|"list-databases"|"list-db"|"db-list")
            list_databases
            ;;
        "wal-list"|"list-wal"|"wal-files"|"list-wal-files")
            list_wal_files
            ;;
        "version"|"-v"|"--version")
            show_version
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
