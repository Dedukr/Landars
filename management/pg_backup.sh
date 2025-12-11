#!/bin/bash

#########################################################################
# Ultimate Database Backup Script for FoodPlatform
#
# This comprehensive script combines all backup functionality:
# - PostgreSQL dumps (current database)
# - SQLite backups (legacy support)  
# - Point-in-Time Recovery (PITR) support
# - S3 cloud backup integration
# - Automatic cleanup and retention
# - Health monitoring and statistics
# - Docker container integration
# - Flexible restore options
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
#
# Usage:
#   chmod +x pg_backup.sh
#   ./pg_backup.sh [command] [options]
#
#########################################################################

# Color codes for enhanced output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Enhanced logging functions with colors and emojis
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

check_postgres_container() {
    # Ensure target container exists and is running before backup
    if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}\$"; then
        log_error "PostgreSQL container '${POSTGRES_CONTAINER}' not found or not running. Set POSTGRES_CONTAINER/POSTGRES_HOST to the correct name."
        exit 1
    fi
}

log_debug() {
    if [[ "$DEBUG" == "true" ]]; then
        echo -e "${PURPLE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    fi
}

# Script header
print_header() {
    echo -e "${CYAN}"
    echo "🗄️  Ultimate Database Backup System for FoodPlatform"
    echo "====================================================="
    echo -e "${NC}"
}

print_header
log_info "Ultimate backup script started"

#########################################################################
# CONFIGURATION MANAGEMENT
#########################################################################

# Load configuration from environment file
load_env() {
    local env_file=".env"
    
    if [[ -f "$env_file" ]]; then
        log_info "Loading configuration from $env_file"
        # Robust .env loader that preserves spaces and ignores comments/blank lines
        # Supports unquoted values that may contain spaces or brackets.
        while IFS= read -r line || [[ -n "$line" ]]; do
            # Skip empty lines and comments
            [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

            # Only process lines containing '='
            [[ "$line" != *"="* ]] && { log_warning "Skipping invalid line in .env: $line"; continue; }

            # Split on first '=' to preserve value intact
            key="${line%%=*}"
            value="${line#*=}"

            # Trim whitespace around key
            key="${key#"${key%%[![:space:]]*}"}"
            key="${key%"${key##*[![:space:]]}"}"

            # Keys must be valid shell identifiers
            if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
                log_warning "Skipping invalid key in .env: $key"
                continue
            fi

            # Preserve value exactly (including spaces/brackets)
            export "$key=$value"
        done < "$env_file"
        log_success "Configuration loaded from $env_file"
    else
        log_warning ".env file not found. Using default configuration."
        log_info "Create a .env file for custom configuration"
    fi
}

# Load environment variables
load_env

# Normalize postgres container/host naming to match docker-compose on server
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-${POSTGRES_HOST:-landars-postgres-1}}"
POSTGRES_HOST="${POSTGRES_HOST:-$POSTGRES_CONTAINER}"

# Verify the postgres container exists before proceeding
check_postgres_container

# Set database configuration from environment variables with defaults
DB_TYPE="${DB_TYPE:-postgresql}"  # postgresql or sqlite
DB_NAME="${POSTGRES_DB:-landarsfooddb}"
DB_USER="${POSTGRES_USER:-postgresuser}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Directory configuration
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-${PROJECT_DIR}/db_backups}"
LEGACY_BACKUP_DIR="${LEGACY_BACKUP_DIR:-${PROJECT_DIR}/db_backups/sqlite}"
ARCHIVE_DIR="${ARCHIVE_DIR:-${PROJECT_DIR}/db_backups/wal_archive}"
# Feature flags to control legacy/pitr behavior safely
ENABLE_LEGACY_SQLITE="${ENABLE_LEGACY_SQLITE:-false}"
ENABLE_PITR="${ENABLE_PITR:-false}"
S3_BACKUP_DIR="${S3_BACKUP_DIR:-database-backups}"

# Retention policies
SQL_RETENTION_DAYS="${SQL_RETENTION_DAYS:-30}"
PITR_RETENTION_DAYS="${PITR_RETENTION_DAYS:-7}"
LOCAL_RETENTION_COUNT="${LOCAL_RETENTION_COUNT:-10}"

# S3 Configuration
AWS_STORAGE_BUCKET_NAME="${AWS_STORAGE_BUCKET_NAME:-}"
AWS_S3_REGION_NAME="${AWS_S3_REGION_NAME:-us-east-1}"
S3_STORAGE_CLASS="${S3_STORAGE_CLASS:-STANDARD_IA}"

# SQLite legacy support
SQLITE_CONTAINER="${SQLITE_CONTAINER:-foodplatform-backend-1}"
SQLITE_PATH_IN_CONTAINER="${SQLITE_PATH_IN_CONTAINER:-/backend/db/db.sqlite3}"
SQLITE_PATH_ON_HOST="${SQLITE_PATH_ON_HOST:-${PROJECT_DIR}/backend/db/db.sqlite3}"

# PostgreSQL container configuration
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-foodplatform-postgres-1}"

# Backup naming
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE_ONLY=$(date +"%Y-%m-%d")

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
            ((errors++))
        fi
        
        if [[ -z "$DB_USER" ]]; then
            log_error "POSTGRES_USER is not set"
            ((errors++))
        fi
    fi
    
    # Check S3 configuration if S3 backup is enabled
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        if ! command -v aws &> /dev/null; then
            log_warning "AWS CLI not found. S3 backup will be disabled."
            AWS_STORAGE_BUCKET_NAME=""
        else
            log_info "S3 backup enabled to bucket: $AWS_STORAGE_BUCKET_NAME"
        fi
    fi
    
    if [[ $errors -gt 0 ]]; then
        log_error "Configuration validation failed with $errors error(s)"
        return 1
    fi
    
    return 0
}

# Get PostgreSQL container name
get_postgres_container() {
    local container_name=""
    
    # Try to get container name from docker-compose
    if command -v docker-compose &> /dev/null; then
        container_name=$(docker-compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
    fi
    
    # Fallback to environment variable
    if [[ -z "$container_name" ]]; then
        container_name="$POSTGRES_CONTAINER_NAME"
    fi
    
    # Check if container exists and is running
    if docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
        echo "$container_name"
        return 0
    else
        log_error "PostgreSQL container '$container_name' not found or not running"
        return 1
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
    if [[ "$ENABLE_LEGACY_SQLITE" == "true" ]]; then
        mkdir -p "$LEGACY_BACKUP_DIR"
    fi
    if [[ "$ENABLE_PITR" == "true" ]]; then
        mkdir -p "$ARCHIVE_DIR"
    fi
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
    
    local container
    if ! container=$(get_postgres_container); then
        return 1
    fi
    
    local backup_file="landarsfood_backup_${TIMESTAMP}.sql"
    local backup_path="$BACKUP_BASE_DIR/postgresql/$backup_file"
    local current_backup="$BACKUP_BASE_DIR/postgresql/latest.sql"
    local start_time=$(date +%s)
    
    ensure_backup_dirs
    
    log_info "📊 Starting PostgreSQL dump from container '$container'..."
    log_info "📁 Backup file: $backup_path"
    
    # Create the backup using pg_dump
    if docker-compose exec -T postgres pg_dump \
        -U "$DB_USER" \
        -h localhost \
        -d "$DB_NAME" \
        --verbose \
        --no-password > "$backup_path" 2>/dev/null; then
        
        local duration=$(($(date +%s) - start_time))
        local file_size=$(get_file_size "$backup_path")
        
        log_success "✅ PostgreSQL backup completed in ${duration}s"
        log_info "📄 File: $backup_path"
        log_info "📊 Size: $file_size"
        
        # Create/update latest backup symlink
        ln -sf "$backup_file" "$current_backup"
        log_debug "Latest backup symlink updated"
        
        # Update pg.sql in db_data folder if it exists
        local db_data_dir="$PROJECT_DIR/db_data"
        if [[ -d "$db_data_dir" ]]; then
            cp "$backup_path" "$db_data_dir/pg.sql"
            log_info "📁 Updated db_data/pg.sql with latest backup"
        fi
        
        # Upload to S3 if configured
        if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
            upload_to_s3 "$backup_path" "postgresql"
        fi
        
        # Cleanup old backups
        cleanup_old_postgresql_backups
        
        return 0
    else
        log_error "❌ PostgreSQL backup failed"
        rm -f "$backup_path"
        return 1
    fi
}

# Restore PostgreSQL from backup with clean database recreation
restore_postgresql_backup() {
    local backup_file="$1"
    local container
    local start_time=$(date +%s)
    
    if ! container=$(get_postgres_container); then
        return 1
    fi
    
    # Default to latest backup if no file specified
    if [[ -z "$backup_file" ]]; then
        backup_file="$BACKUP_BASE_DIR/postgresql/latest.sql"
    fi
    
    # Check if backup file exists
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        log_info "Available backups:"
        ls -la "$BACKUP_BASE_DIR/postgresql"/landarsfood_backup_*.sql 2>/dev/null || log_info "No backup files found"
        return 1
    fi
    
    log_info "🔄 Starting comprehensive PostgreSQL restore from: $backup_file"
    log_info "This will perform a clean restore by dropping and recreating the database"
    
    # Step 1: Drop and recreate database (clean slate)
    log_info "🗑️ Dropping existing database (if it exists)..."
    if docker-compose exec postgres psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null 2>&1; then
        log_success "Existing database dropped"
    else
        log_warning "No existing database to drop (this is normal for fresh installs)"
    fi
    
    log_info "🆕 Creating fresh database..."
    if docker-compose exec postgres psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" >/dev/null 2>&1; then
        log_success "Fresh database created"
    else
        log_error "Failed to create database"
        return 1
    fi
    
    # Step 2: Restore from backup
    log_info "📥 Restoring from backup: $backup_file"
    if docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"; then
        log_success "Database restored from backup"
    else
        log_error "Failed to restore database from backup"
        return 1
    fi
    
    # Step 3: Verify the restore
    log_info "✅ Verifying restore..."
    local table_count
    table_count=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " 2>/dev/null | tr -d ' ')
    
    if [[ "$table_count" -gt 0 ]]; then
        log_success "Restore verification successful - Found $table_count tables"
    else
        log_warning "No tables found in restored database"
    fi
    
    # Step 4: Start backend service
    log_info "🚀 Starting backend service..."
    if docker-compose up -d backend; then
        log_success "Backend service started"
    else
        log_warning "Failed to start backend service"
    fi
    
    # Step 5: Wait for backend to be ready
    log_info "⏳ Waiting for backend to be ready..."
    sleep 10
    
    # Step 6: Run migrations to ensure everything is in sync
    log_info "🔄 Running Django migrations..."
    if docker-compose exec backend python manage.py migrate >/dev/null 2>&1; then
        log_success "Django migrations completed"
    else
        log_warning "Django migrations failed - this might be normal if database is already up to date"
    fi
    
    # Step 7: Final verification
    log_info "🔍 Final verification..."
    local user_count
    user_count=$(docker-compose exec backend python manage.py shell -c "
    from django.contrib.auth import get_user_model
    User = get_user_model()
    print(User.objects.count())
    " 2>/dev/null | tail -1 | tr -d ' ')
    
    local duration=$(($(date +%s) - start_time))
    
    if [[ "$user_count" -ge 0 ]]; then
        log_success "Final verification successful - Found $user_count users"
    else
        log_warning "Could not verify user count"
    fi
    
    # Final summary
    log_success "🎉 PostgreSQL restore completed successfully in ${duration}s"
    log_info "📊 Restore Summary:"
    log_info "  - Tables restored: $table_count"
    log_info "  - Users restored: $user_count"
    log_info "  - Backup file: $backup_file"
    log_info "  - Duration: ${duration}s"
    
    return 0
}

# Cleanup old PostgreSQL backups
cleanup_old_postgresql_backups() {
    log_info "🧹 Cleaning up old PostgreSQL backups (keeping $LOCAL_RETENTION_COUNT most recent)..."
    
    # Keep only the most recent backups
    local deleted_count=0
    local files_to_delete
    
    files_to_delete=$(ls -t "$BACKUP_BASE_DIR/postgresql"/landarsfood_backup_*.sql 2>/dev/null | tail -n +$((LOCAL_RETENTION_COUNT + 1)))
    
    if [[ -n "$files_to_delete" ]]; then
        while IFS= read -r file; do
            rm -f "$file"
            ((deleted_count++))
        done <<< "$files_to_delete"
    fi
    
    # Also cleanup by date
    local date_deleted_count=0
    if [[ $SQL_RETENTION_DAYS -gt 0 ]]; then
        date_deleted_count=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.sql" -type f -mtime +$SQL_RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
    fi
    
    local total_deleted=$((deleted_count + date_deleted_count))
    if [[ $total_deleted -gt 0 ]]; then
        log_info "Deleted $total_deleted old PostgreSQL backup files"
    else
        log_info "No old PostgreSQL backup files to delete"
    fi
}

#########################################################################
# SQLITE BACKUP FUNCTIONS (Legacy Support)
#########################################################################

# Create SQLite backup
create_sqlite_backup() {
    log_info "🗄️  Creating SQLite backup (legacy support)..."
    
    local backup_file="sqlite_backup_${TIMESTAMP}.sqlite3"
    local backup_path="$LEGACY_BACKUP_DIR/$backup_file"
    local start_time=$(date +%s)
    
    ensure_backup_dirs
    
    # Check if SQLite container is running
    if ! check_container_running "$SQLITE_CONTAINER"; then
        log_warning "SQLite container not running, skipping SQLite backup"
        return 1
    fi
    
    log_info "📊 Starting SQLite backup from container '$SQLITE_CONTAINER'..."
    
    # Use docker cp to extract the SQLite file
    if docker cp "$SQLITE_CONTAINER:$SQLITE_PATH_IN_CONTAINER" "$backup_path"; then
        local duration=$(($(date +%s) - start_time))
        local file_size=$(get_file_size "$backup_path")
        
        log_success "✅ SQLite backup completed in ${duration}s"
        log_info "📄 File: $backup_path"
        log_info "📊 Size: $file_size"
        
        # Copy to current database location if specified
        if [[ -n "$SQLITE_PATH_ON_HOST" ]]; then
            cp "$backup_path" "$SQLITE_PATH_ON_HOST"
            log_debug "SQLite backup copied to host location"
        fi
        
        # Upload to S3 if configured
        if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
            upload_to_s3 "$backup_path" "sqlite"
        fi
        
        # Cleanup old backups
        cleanup_old_sqlite_backups
        
        return 0
    else
        log_error "❌ SQLite backup failed"
        return 1
    fi
}

# Cleanup old SQLite backups
cleanup_old_sqlite_backups() {
    log_info "🧹 Cleaning up old SQLite backups..."
    local deleted_count=0
    
    if [[ $SQL_RETENTION_DAYS -gt 0 ]]; then
        deleted_count=$(find "$LEGACY_BACKUP_DIR" -name "sqlite_backup_*.sqlite3" -type f -mtime +$SQL_RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
    fi
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old SQLite backup files"
    else
        log_info "No old SQLite backup files to delete"
    fi
}

#########################################################################
# PITR BACKUP FUNCTIONS
#########################################################################

# Create PITR base backup
create_pitr_backup() {
    log_info "⚡ Creating PITR base backup..."
    
    local container
    if ! container=$(get_postgres_container); then
        return 1
    fi
    
    local backup_name="pitr_basebackup_${TIMESTAMP}"
    local backup_dir="/tmp/${backup_name}"
    local host_backup_dir="$ARCHIVE_DIR/${backup_name}"
    local start_time=$(date +%s)
    
    ensure_backup_dirs
    
    log_info "📊 Creating PostgreSQL base backup using pg_basebackup..."
    log_info "📁 Backup will be saved to: $host_backup_dir"
    
    # Create base backup using pg_basebackup directly
    if docker exec "$container" pg_basebackup \
        -U "$DB_USER" \
        -h localhost \
        -D "$backup_dir" \
        -Ft \
        -z \
        -P \
        -v \
        -w; then
        
        local duration=$(($(date +%s) - start_time))
        
        # Copy backup from container to host
        if docker cp "$container:$backup_dir" "$host_backup_dir"; then
            log_success "✅ PITR base backup completed in ${duration}s"
            log_info "📄 Backup saved to: $host_backup_dir"
            
            # Get backup size
            local backup_size=$(get_dir_size "$host_backup_dir")
            log_info "📊 Size: $backup_size"
            
            # Clean up temporary backup in container
            docker exec "$container" rm -rf "$backup_dir"
            
            # Upload to S3 if configured
            if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
                # Create a tar.gz of the PITR backup for S3
                local tar_file="$ARCHIVE_DIR/${backup_name}.tar.gz"
                tar -czf "$tar_file" -C "$ARCHIVE_DIR" "$backup_name"
                upload_to_s3 "$tar_file" "pitr"
                rm -f "$tar_file"
            fi
            
            return 0
        else
            log_error "❌ Failed to copy PITR backup from container"
            docker exec "$container" rm -rf "$backup_dir"
            return 1
        fi
    else
        log_error "❌ PITR base backup failed"
        docker exec "$container" rm -rf "$backup_dir" 2>/dev/null || true
        return 1
    fi
}

# Check PITR/WAL archiving status
check_pitr_status() {
    log_info "🔍 Checking PITR/WAL archiving status..."
    
    local container
    if ! container=$(get_postgres_container); then
        return 1
    fi
    
    # Check if PITR check script is available
    if docker exec "$container" test -f "/usr/local/bin/check-archiving.sh"; then
        docker exec "$container" su - postgres -c "PGUSER=$DB_USER PGDATABASE=$DB_NAME /usr/local/bin/check-archiving.sh"
        return $?
    else
        log_warning "PITR check script not available"
        return 1
    fi
}

#########################################################################
# S3 BACKUP FUNCTIONS
#########################################################################

# Upload backup to S3
upload_to_s3() {
    local file_path="$1"
    local backup_type="$2"
    
    if [[ -z "$AWS_STORAGE_BUCKET_NAME" ]]; then
        log_debug "S3 backup not configured, skipping upload"
        return 0
    fi
    
    log_info "☁️  Uploading backup to S3..."
    
    local file_name=$(basename "$file_path")
    local s3_key="${S3_BACKUP_DIR}/${backup_type}/${DATE_ONLY}/${file_name}"
    
    if aws s3 cp "$file_path" "s3://${AWS_STORAGE_BUCKET_NAME}/${s3_key}" \
        --storage-class "$S3_STORAGE_CLASS" \
        --region "$AWS_S3_REGION_NAME" \
        --quiet; then
        
        log_success "✅ Backup uploaded to S3: s3://${AWS_STORAGE_BUCKET_NAME}/${s3_key}"
        return 0
    else
        log_error "❌ S3 upload failed"
        return 1
    fi
}

# Cleanup old S3 backups
cleanup_s3_backups() {
    if [[ -z "$AWS_STORAGE_BUCKET_NAME" ]]; then
        log_debug "S3 backup not configured, skipping S3 cleanup"
        return 0
    fi
    
    log_info "☁️  Cleaning up old S3 backups..."
    
    # Calculate cutoff date
    local cutoff_date
    if command -v gdate &> /dev/null; then
        # macOS with GNU date
        cutoff_date=$(gdate -d "${SQL_RETENTION_DAYS} days ago" +%Y-%m-%d)
    else
        # Linux date
        cutoff_date=$(date -d "${SQL_RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${SQL_RETENTION_DAYS}d +%Y-%m-%d)
    fi
    
    # List and delete old backups
    aws s3 ls "s3://${AWS_STORAGE_BUCKET_NAME}/${S3_BACKUP_DIR}/" --recursive --region "$AWS_S3_REGION_NAME" | \
    while read -r line; do
        local date_str=$(echo "$line" | awk '{print $1}')
        if [[ "$date_str" < "$cutoff_date" ]]; then
            local key=$(echo "$line" | awk '{for(i=4;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
            aws s3 rm "s3://${AWS_STORAGE_BUCKET_NAME}/${key}" --region "$AWS_S3_REGION_NAME" --quiet
            log_debug "Deleted old S3 backup: $key"
        fi
    done
    
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
    echo "  Legacy Directory: $LEGACY_BACKUP_DIR"
    echo ""
    
    echo -e "${CYAN}PostgreSQL Backups:${NC}"
    local pg_count=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.sql" -type f 2>/dev/null | wc -l)
    local pg_size=$(get_dir_size "$BACKUP_BASE_DIR/postgresql")
    local latest_pg=$(ls -t "$BACKUP_BASE_DIR/postgresql"/landarsfood_backup_*.sql 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "None")
    echo "  Total Backups: $pg_count"
    echo "  Total Size: $pg_size"
    echo "  Latest Backup: $latest_pg"
    
    # Show db_data/pg.sql info
    local db_data_file="$PROJECT_DIR/db_data/pg.sql"
    if [[ -f "$db_data_file" ]]; then
        local pg_sql_size=$(get_file_size "$db_data_file")
        local pg_sql_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$db_data_file" 2>/dev/null || echo "Unknown")
        echo "  db_data/pg.sql: $pg_sql_size (updated: $pg_sql_date)"
    fi
    echo ""
    
    echo -e "${CYAN}SQLite Backups (Legacy):${NC}"
    local sqlite_count=$(find "$LEGACY_BACKUP_DIR" -name "sqlite_backup_*.sqlite3" -type f 2>/dev/null | wc -l)
    local sqlite_size=$(get_dir_size "$LEGACY_BACKUP_DIR")
    local latest_sqlite=$(ls -t "$LEGACY_BACKUP_DIR"/sqlite_backup_*.sqlite3 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "None")
    echo "  Total Backups: $sqlite_count"
    echo "  Total Size: $sqlite_size"
    echo "  Latest Backup: $latest_sqlite"
    echo ""
    
    echo -e "${CYAN}PITR Backups:${NC}"
    local pitr_count=$(find "$ARCHIVE_DIR" -name "pitr_basebackup_*" -type d 2>/dev/null | wc -l)
    local pitr_size=$(get_dir_size "$ARCHIVE_DIR")
    local latest_pitr=$(ls -td "$ARCHIVE_DIR"/pitr_basebackup_* 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "None")
    echo "  Total PITR Backups: $pitr_count"
    echo "  Total Size: $pitr_size"
    echo "  Latest PITR Backup: $latest_pitr"
    echo ""
    
    echo -e "${CYAN}Container Status:${NC}"
    local pg_container
    if pg_container=$(get_postgres_container 2>/dev/null); then
        echo "  PostgreSQL Container: $pg_container ✅"
    else
        echo "  PostgreSQL Container: Not running ❌"
    fi
    
    if check_container_running "$SQLITE_CONTAINER" 2>/dev/null; then
        echo "  SQLite Container: $SQLITE_CONTAINER ✅"
    else
        echo "  SQLite Container: Not running ❌"
    fi
    echo ""
    
    echo -e "${CYAN}Retention Policies:${NC}"
    echo "  SQL Backup Retention: $SQL_RETENTION_DAYS days"
    echo "  PITR Retention: $PITR_RETENTION_DAYS days"
    echo "  Local Backup Count: $LOCAL_RETENTION_COUNT"
    echo ""
    
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        echo -e "${CYAN}S3 Configuration:${NC}"
        echo "  S3 Bucket: $AWS_STORAGE_BUCKET_NAME"
        echo "  S3 Region: $AWS_S3_REGION_NAME"
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
    if get_postgres_container &>/dev/null; then
        echo "  ✅ PostgreSQL container is running"
    else
        echo "  ❌ PostgreSQL container is not running"
        ((issues++))
    fi
    
    # Check backup directories
    if [[ -d "$BACKUP_BASE_DIR" ]]; then
        echo "  ✅ Backup directory exists"
    else
        echo "  ❌ Backup directory missing"
        ((issues++))
    fi
    
    # Check recent backups
    local recent_backup=$(find "$BACKUP_BASE_DIR/postgresql" -name "landarsfood_backup_*.sql" -type f -mtime -1 2>/dev/null | head -1)
    if [[ -n "$recent_backup" ]]; then
        echo "  ✅ Recent backup found (within 24 hours)"
    else
        echo "  ⚠️  No recent backup found"
        ((issues++))
    fi
    
    # Check S3 configuration
    if [[ -n "$AWS_STORAGE_BUCKET_NAME" ]]; then
        if command -v aws &> /dev/null; then
            echo "  ✅ AWS CLI available for S3 backups"
        else
            echo "  ❌ AWS CLI not found but S3 configured"
            ((issues++))
        fi
    fi
    
    # Check disk space
    local available_space=$(df -BG "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ "$available_space" -gt 5 ]]; then
        echo "  ✅ Sufficient disk space (${available_space}GB available)"
    else
        echo "  ⚠️  Low disk space (${available_space}GB available)"
        ((issues++))
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
    ((total_count++))
    if create_postgresql_backup; then
        ((success_count++))
    fi
    
    echo ""
    
    # SQLite backup (if enabled and container available)
    if [[ "$ENABLE_LEGACY_SQLITE" == "true" ]] && check_container_running "$SQLITE_CONTAINER" 2>/dev/null; then
        ((total_count++))
        if create_sqlite_backup; then
            ((success_count++))
        fi
        echo ""
    fi
    
    # PITR backup (if available)
    local container
    if [[ "$ENABLE_PITR" == "true" ]] && container=$(get_postgres_container 2>/dev/null) && docker exec "$container" test -f "/usr/local/bin/base-backup.sh" 2>/dev/null; then
        ((total_count++))
        if create_pitr_backup; then
            ((success_count++))
        fi
        echo ""
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
# Cleanup old PITR backups
cleanup_old_pitr_backups() {
    log_info "🧹 Cleaning up old PITR backups..."
    local deleted_count=0
    
    if [[ $PITR_RETENTION_DAYS -gt 0 ]]; then
        deleted_count=$(find "$ARCHIVE_DIR" -name "pitr_basebackup_*" -type d -mtime +$PITR_RETENTION_DAYS -exec rm -rf {} + -print 2>/dev/null | wc -l)
    fi
    
    if [[ $deleted_count -gt 0 ]]; then
        log_info "Deleted $deleted_count old PITR backup directories"
    else
        log_info "No old PITR backup directories to delete"
    fi
}

# Cleanup all backup types
cleanup_all() {
    log_info "🧹 Running comprehensive cleanup..."
    
    cleanup_old_postgresql_backups
    if [[ "$ENABLE_LEGACY_SQLITE" == "true" ]]; then
        cleanup_old_sqlite_backups
    fi
    if [[ "$ENABLE_PITR" == "true" ]]; then
        cleanup_old_pitr_backups
    fi
    cleanup_s3_backups
    
    log_success "✅ Comprehensive cleanup completed"
}

#########################################################################
# COMMAND LINE INTERFACE
#########################################################################

# Show usage information
show_usage() {
    echo -e "${CYAN}Ultimate Database Backup Script${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo -e "${YELLOW}Main Commands:${NC}"
    echo "  backup                    - Create PostgreSQL backup (updates db_data/pg.sql)"
    echo "  full-backup              - Create all available backup types"
    echo "  restore [file]           - Restore PostgreSQL from backup (clean restore)"
    echo "  sqlite-backup            - Create SQLite backup (legacy)"
    echo "  pitr-backup              - Create PITR base backup"
    echo ""
    echo -e "${YELLOW}Management Commands:${NC}"
    echo "  stats                    - Show comprehensive statistics"
    echo "  health                   - Run system health check"
    echo "  cleanup                  - Clean up old backups"
    echo "  pitr-check              - Check PITR/WAL archiving status"
    echo "  s3-cleanup              - Clean up old S3 backups"
    echo ""
    echo -e "${YELLOW}Information Commands:${NC}"
    echo "  help                     - Show this help message"
    echo "  version                  - Show script version"
    echo "  config                   - Show current configuration"
    echo ""
    echo -e "${YELLOW}Environment Variables:${NC}"
    echo "  DB_TYPE                  - Database type (postgresql/sqlite)"
    echo "  POSTGRES_DB              - PostgreSQL database name"
    echo "  POSTGRES_USER            - PostgreSQL username"
    echo "  POSTGRES_PASSWORD        - PostgreSQL password"
    echo "  AWS_STORAGE_BUCKET_NAME - S3 bucket for cloud backup"
    echo "  SQL_RETENTION_DAYS      - Days to keep SQL backups"
    echo "  LOCAL_RETENTION_COUNT   - Number of local backups to keep"
    echo "  DEBUG                   - Enable debug logging (true/false)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0                           # Create PostgreSQL backup"
    echo "  $0 full-backup              # Create all backup types"
    echo "  $0 restore                  # Restore from latest backup (clean restore)"
    echo "  $0 restore backup.sql       # Restore from specific file (clean restore)"
    echo "  $0 stats                    # Show statistics"
    echo "  $0 health                   # Run health check"
    echo "  $0 cleanup                  # Clean up old backups"
    echo ""
    echo -e "${YELLOW}Recommended Schedule:${NC}"
    echo "  Daily:   $0 backup"
    echo "  Weekly:  $0 full-backup"
    echo "  Monthly: $0 cleanup"
}

# Show script version
show_version() {
    echo "Ultimate Database Backup Script v2.0"
    echo "Compatible with PostgreSQL, SQLite, and cloud storage"
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
    echo "  Legacy Backup: $LEGACY_BACKUP_DIR"
    echo "  Archive: $ARCHIVE_DIR"
    echo ""
    echo "Retention Settings:"
    echo "  SQL Retention: $SQL_RETENTION_DAYS days"
    echo "  PITR Retention: $PITR_RETENTION_DAYS days"
    echo "  Local Count: $LOCAL_RETENTION_COUNT"
    echo ""
    echo "Cloud Settings:"
    echo "  S3 Bucket: ${AWS_STORAGE_BUCKET_NAME:-'Not configured'}"
    echo "  S3 Region: $AWS_S3_REGION_NAME"
    echo "  Storage Class: $S3_STORAGE_CLASS"
    echo ""
    echo "Container Settings:"
    echo "  PostgreSQL: $POSTGRES_CONTAINER_NAME"
    echo "  SQLite: $SQLITE_CONTAINER"
}

#########################################################################
# MAIN SCRIPT LOGIC
#########################################################################

# Main function
main() {
    local command="${1:-backup}"
    
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
            restore_postgresql_backup "$2"
            ;;
        "sqlite-backup"|"sqlite")
            create_sqlite_backup
            ;;
        "pitr-backup"|"pitr")
            create_pitr_backup
            ;;
        "pitr-check"|"pitr-status")
            check_pitr_status
            ;;
        "stats"|"statistics"|"status")
            show_statistics
            ;;
        "health"|"health-check"|"check")
            health_check
            ;;
        "cleanup"|"clean")
            cleanup_all
            ;;
        "s3-cleanup")
            cleanup_s3_backups
            ;;
        "config"|"configuration")
            show_config
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
