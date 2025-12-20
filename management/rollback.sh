#!/bin/bash

#######################################
# Rollback Script for Food Platform
# Handles emergency rollback to previous version
#######################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/db_backups"
DEPLOYMENT_SHA_FILE="/tmp/previous_deployment_sha"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Get PostgreSQL container name from docker list of containers
get_postgres_container() {
    local container_name=""
    
    # First, try to get from docker ps list (most reliable)
    container_name=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    
    # If not found, try docker-compose
    if [ -z "$container_name" ] && command -v docker-compose &> /dev/null; then
        container_name=$(docker-compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
    fi
    
    # If still not found, try docker compose v2
    if [ -z "$container_name" ] && command -v docker &> /dev/null; then
        container_name=$(docker compose ps postgres --format "{{.Name}}" 2>/dev/null | head -1)
    fi
    
    # Fallback to environment variable
    if [ -z "$container_name" ] && [ -n "${POSTGRES_CONTAINER:-}" ]; then
        container_name="$POSTGRES_CONTAINER"
    fi
    
    # Verify container exists and is running
    if [ -n "$container_name" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
        echo "$container_name"
        return 0
    else
        return 1
    fi
}

# Get PostgreSQL service name for docker compose commands
get_postgres_service() {
    local container_name
    container_name=$(get_postgres_container 2>/dev/null)
    
    # Try to extract service name from container name (docker compose format: project_service_number)
    if echo "$container_name" | grep -qE '^[^_]+_(.+)_[0-9]+$'; then
        echo "$container_name" | sed -E 's/^[^_]+_(.+)_[0-9]+$/\1/'
        return 0
    fi
    
    # Fallback: try to find service name from docker compose
    local service_name=""
    if command -v docker-compose &> /dev/null; then
        service_name=$(docker-compose ps --services 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    fi
    
    if [ -z "$service_name" ] && command -v docker &> /dev/null; then
        service_name=$(docker compose ps --services 2>/dev/null | grep -iE '(postgres|pg)' | head -1)
    fi
    
    # Final fallback
    if [ -n "$service_name" ]; then
        echo "$service_name"
        return 0
    else
        echo "postgres"
        return 0
    fi
}

# Load environment variables
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
        log "Environment variables loaded"
    else
        error "No .env file found"
        exit 1
    fi
}

# Show usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Rollback Food Platform to previous deployment state

OPTIONS:
    -s, --sha <SHA>         Git SHA to rollback to (optional, defaults to previous)
    -b, --backup <NAME>     Backup name to restore (optional, defaults to latest)
    -d, --no-db-restore    Skip database restoration
    -h, --help              Show this help message

EXAMPLES:
    $0                                      # Rollback to previous deployment
    $0 --sha abc123def                      # Rollback to specific commit
    $0 --backup 20240112_143022             # Rollback with specific backup
    $0 --no-db-restore                      # Rollback without database restore

EOF
}

# Parse arguments
parse_args() {
    TARGET_SHA=""
    BACKUP_NAME=""
    RESTORE_DB=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--sha)
                TARGET_SHA="$2"
                shift 2
                ;;
            -b|--backup)
                BACKUP_NAME="$2"
                shift 2
                ;;
            -d|--no-db-restore)
                RESTORE_DB=false
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Create safety backup before rollback
create_safety_backup() {
    log "Creating safety backup before rollback..."
    
    if [ -x "$SCRIPT_DIR/pg_backup.sh" ]; then
        if "$SCRIPT_DIR/pg_backup.sh" backup; then
            SAFETY_BACKUP_TIME=$(date +%Y%m%d_%H%M%S)
            log "✅ Safety backup created: $SAFETY_BACKUP_TIME"
            echo "$SAFETY_BACKUP_TIME" > /tmp/rollback_safety_backup
            return 0
        else
            error "Failed to create safety backup"
            return 1
        fi
    else
        error "Backup script not found or not executable"
        return 1
    fi
}

# Determine target SHA
determine_target_sha() {
    if [ -n "$TARGET_SHA" ]; then
        log "Using specified SHA: $TARGET_SHA"
        
        # Validate SHA exists
        if ! git rev-parse --verify "$TARGET_SHA" > /dev/null 2>&1; then
            error "Invalid SHA: $TARGET_SHA"
            exit 1
        fi
    elif [ -f "$DEPLOYMENT_SHA_FILE" ]; then
        TARGET_SHA=$(cat "$DEPLOYMENT_SHA_FILE")
        log "Using previous deployment SHA: $TARGET_SHA"
    else
        # Fallback to previous commit
        TARGET_SHA=$(git rev-parse HEAD~1)
        warn "No previous deployment SHA found, using HEAD~1: $TARGET_SHA"
    fi
}

# Stop containers
stop_containers() {
    log "Stopping containers..."
    
    cd "$PROJECT_DIR"
    
    if docker compose down --timeout 30; then
        log "✅ Containers stopped successfully"
        return 0
    else
        warn "Graceful stop failed, forcing stop..."
        if docker compose down --timeout 10; then
            log "✅ Containers stopped (forced)"
            return 0
        else
            error "Failed to stop containers"
            return 1
        fi
    fi
}

# Rollback code
rollback_code() {
    log "Rolling back code to SHA: $TARGET_SHA"
    
    cd "$PROJECT_DIR"
    
    # Fetch latest
    git fetch origin
    
    # Reset to target SHA
    if git reset --hard "$TARGET_SHA"; then
        log "✅ Code rolled back successfully"
        
        # Show what changed
        info "Rollback details:"
        git log --oneline -1
        
        return 0
    else
        error "Failed to rollback code"
        return 1
    fi
}

# Restore database
restore_database() {
    if [ "$RESTORE_DB" = false ]; then
        warn "Skipping database restoration (--no-db-restore flag)"
        return 0
    fi
    
    log "Restoring database..."
    
    cd "$PROJECT_DIR"
    
    # Determine backup to restore
    local backup_path
    if [ -n "$BACKUP_NAME" ]; then
        backup_path="$BACKUP_DIR/$BACKUP_NAME"
        if [ ! -d "$backup_path" ]; then
            error "Backup not found: $backup_path"
            return 1
        fi
    else
        # Use latest backup
        backup_path=$(ls -td "$BACKUP_DIR"/*/ 2>/dev/null | head -n1)
        if [ -z "$backup_path" ]; then
            error "No backups found in $BACKUP_DIR"
            return 1
        fi
    fi
    
    log "Restoring from: $backup_path"
    
    # Start postgres
    local pg_service
    pg_service=$(get_postgres_service)
    docker compose up -d "$pg_service"
    sleep 15
    
    # Wait for postgres to be ready
    local retries=0
    local max_retries=30
    while [ $retries -lt $max_retries ]; do
        if docker compose exec -T "$pg_service" pg_isready -U "${POSTGRES_USER}" > /dev/null 2>&1; then
            log "PostgreSQL is ready"
            break
        fi
        retries=$((retries + 1))
        if [ $retries -eq $max_retries ]; then
            error "PostgreSQL failed to start"
            return 1
        fi
        sleep 2
    done
    
    # Drop and recreate database
    log "Dropping and recreating database..."
    docker compose exec -T "$pg_service" psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};" || true
    docker compose exec -T "$pg_service" psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${POSTGRES_DB};"
    
    # Restore from backup
    log "Restoring database dump..."
    if [ -f "${backup_path}/postgres_backup.sql.gz" ]; then
        if zcat "${backup_path}/postgres_backup.sql.gz" | docker compose exec -T "$pg_service" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; then
            log "✅ Database restored successfully"
        else
            error "Failed to restore database"
            return 1
        fi
    elif [ -f "${backup_path}/postgres_backup.sql" ]; then
        if cat "${backup_path}/postgres_backup.sql" | docker compose exec -T "$pg_service" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; then
            log "✅ Database restored successfully"
        else
            error "Failed to restore database"
            return 1
        fi
    else
        error "No database dump found in backup"
        return 1
    fi
    
    # Stop postgres before full restart
    docker compose down
    
    return 0
}

# Start services
start_services() {
    log "Starting services..."
    
    cd "$PROJECT_DIR"
    
    # Pull images
    log "Pulling Docker images for target version..."
    docker compose pull
    
    # Start all services
    if docker compose up -d; then
        log "✅ Services started successfully"
        return 0
    else
        error "Failed to start services"
        return 1
    fi
}

# Run health checks
run_health_checks() {
    log "Running health checks..."
    
    # Wait for services to start
    sleep 20
    
    if [ -x "$SCRIPT_DIR/health_check.sh" ]; then
        if "$SCRIPT_DIR/health_check.sh"; then
            log "✅ All health checks passed"
            return 0
        else
            error "Health checks failed"
            return 1
        fi
    else
        warn "Health check script not found, performing basic checks..."
        
        # Basic checks
        local all_healthy=true
        
        # Check postgres
        local pg_service
        pg_service=$(get_postgres_service)
        if docker compose exec -T "$pg_service" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null 2>&1; then
            log "✅ PostgreSQL is healthy"
        else
            error "❌ PostgreSQL health check failed"
            all_healthy=false
        fi
        
        # Check backend
        if curl -f http://localhost:8000/health/ > /dev/null 2>&1; then
            log "✅ Backend is healthy"
        else
            error "❌ Backend health check failed"
            all_healthy=false
        fi
        
        # Check frontend
        if curl -f http://localhost:3000 > /dev/null 2>&1; then
            log "✅ Frontend is healthy"
        else
            error "❌ Frontend health check failed"
            all_healthy=false
        fi
        
        if [ "$all_healthy" = true ]; then
            return 0
        else
            return 1
        fi
    fi
}

# Display service status
display_status() {
    log "Current service status:"
    cd "$PROJECT_DIR"
    docker compose ps
    
    echo ""
    log "Resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
}

# Main rollback process
main() {
    log "=========================================="
    log "  Food Platform Rollback Process"
    log "=========================================="
    echo ""
    
    # Load environment
    cd "$PROJECT_DIR"
    load_env
    
    # Confirm rollback
    if [ -t 0 ]; then
        warn "This will rollback your production environment!"
        read -p "Are you sure you want to continue? (yes/no): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
            log "Rollback cancelled"
            exit 0
        fi
    fi
    
    # Determine target
    determine_target_sha
    
    info "Rollback Summary:"
    info "  Target SHA: $TARGET_SHA"
    info "  Restore Database: $RESTORE_DB"
    if [ -n "$BACKUP_NAME" ]; then
        info "  Backup: $BACKUP_NAME"
    else
        info "  Backup: Latest available"
    fi
    echo ""
    
    # Execute rollback steps
    if ! create_safety_backup; then
        error "Failed to create safety backup. Aborting rollback."
        exit 1
    fi
    
    if ! stop_containers; then
        error "Failed to stop containers. Aborting rollback."
        exit 1
    fi
    
    if ! rollback_code; then
        error "Failed to rollback code. Manual intervention required."
        exit 1
    fi
    
    if ! restore_database; then
        error "Failed to restore database. Manual intervention required."
        exit 1
    fi
    
    if ! start_services; then
        error "Failed to start services. Manual intervention required."
        exit 1
    fi
    
    if ! run_health_checks; then
        error "Health checks failed after rollback."
        warn "Services are running but may not be healthy."
        display_status
        exit 1
    fi
    
    # Success
    echo ""
    log "=========================================="
    log "  ✅ Rollback Completed Successfully!"
    log "=========================================="
    echo ""
    
    display_status
    
    log "Rollback to SHA $TARGET_SHA completed at $(date)"
}

# Parse arguments and run
parse_args "$@"
main
