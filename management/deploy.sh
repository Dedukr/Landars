#!/bin/bash

#######################################
# Simplified Deployment Script for Food Platform
# Designed to work with GitHub Actions CI/CD
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

# Load environment variables
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
        log "Environment variables loaded"
    else
        warn "No .env file found"
    fi
}

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    cd "$PROJECT_DIR"
    
    # Check if docker-compose.yml exists
    if [ ! -f "docker-compose.yml" ]; then
        error "docker-compose.yml not found in $PROJECT_DIR"
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running"
        exit 1
    fi
    
    log "✅ Pre-deployment checks passed"
}

# Create pre-deployment backup
create_backup() {
    log "Creating pre-deployment backup..."
    
    if [ -x "$SCRIPT_DIR/pg_backup.sh" ]; then
        if "$SCRIPT_DIR/pg_backup.sh" backup; then
            log "✅ Backup created successfully"
            return 0
        else
            error "Backup failed"
            return 1
        fi
    else
        warn "Backup script not found or not executable, skipping backup"
        return 0
    fi
}

# Pull latest code
pull_code() {
    log "Pulling latest code..."
    
    cd "$PROJECT_DIR"
    
    # Store current commit for rollback
    CURRENT_SHA=$(git rev-parse HEAD)
    echo "$CURRENT_SHA" > /tmp/previous_deployment_sha
    
    if git pull origin main || git pull origin master; then
        log "✅ Code updated successfully"
        NEW_SHA=$(git rev-parse HEAD)
        info "Updated from $CURRENT_SHA to $NEW_SHA"
        return 0
    else
        error "Failed to pull latest code"
        return 1
    fi
}

# Pull latest Docker images
pull_images() {
    log "Pulling latest Docker images..."
    
    cd "$PROJECT_DIR"
    
    if docker compose pull; then
        log "✅ Docker images pulled successfully"
        return 0
    else
        error "Failed to pull Docker images"
        return 1
    fi
}

# Stop containers
stop_containers() {
    log "Stopping existing containers..."
    
    cd "$PROJECT_DIR"
    
    # Graceful stop with 30s timeout
    if docker compose down --timeout 30; then
        log "✅ Containers stopped gracefully"
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

# Start containers
start_containers() {
    log "Starting containers with latest images..."
    
    cd "$PROJECT_DIR"
    
    if docker compose up -d; then
        log "✅ Containers started successfully"
        return 0
    else
        error "Failed to start containers"
        return 1
    fi
}

# Wait for services
wait_for_services() {
    log "Waiting for services to initialize..."
    sleep 15
    
    info "Services are starting up..."
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Make migrations
    if docker compose exec -T backend python manage.py makemigrations; then
        log "✅ Migrations generated"
    else
        warn "No new migrations to generate"
    fi
    
    # Apply migrations
    if docker compose exec -T backend python manage.py migrate --noinput; then
        log "✅ Migrations applied successfully"
        return 0
    else
        error "Migrations failed"
        return 1
    fi
}

# Fix database sequences
fix_sequences() {
    log "Fixing PostgreSQL sequences..."
    
    cd "$PROJECT_DIR"
    
    if [ -f "management/fix_identity_columns.py" ]; then
        # Copy script to container
        BACKEND_CONTAINER=$(docker compose ps -q backend)
        if [ -n "$BACKEND_CONTAINER" ]; then
            docker cp management/fix_identity_columns.py "${BACKEND_CONTAINER}:/tmp/fix_identity_columns.py"
            
            if docker compose exec -T backend python /tmp/fix_identity_columns.py; then
                log "✅ Sequences fixed successfully"
            else
                warn "Sequence fix failed (non-critical)"
            fi
        fi
    else
        info "Sequence fix script not found, skipping"
    fi
}

# Collect static files
collect_static() {
    log "Collecting static files..."
    
    cd "$PROJECT_DIR"
    
    if docker compose exec -T backend python manage.py collectstatic --noinput; then
        log "✅ Static files collected"
        return 0
    else
        warn "Static file collection failed (non-critical)"
        return 0
    fi
}

# Run health checks
run_health_checks() {
    log "Running health checks..."
    
    if [ -x "$SCRIPT_DIR/health_check.sh" ]; then
        if "$SCRIPT_DIR/health_check.sh"; then
            log "✅ All health checks passed"
            return 0
        else
            error "Health checks failed"
            return 1
        fi
    else
        warn "Health check script not found, running basic checks..."
        
        cd "$PROJECT_DIR"
        
        # Basic health checks
        local all_healthy=true
        
        # Check containers are running
        if docker compose ps | grep -q "Up"; then
            log "✅ Containers are running"
        else
            error "❌ Some containers are not running"
            all_healthy=false
        fi
        
        # Check backend
        sleep 5
        if curl -f http://localhost:8000/health/ > /dev/null 2>&1; then
            log "✅ Backend is responding"
        else
            warn "⚠️ Backend health check failed"
            all_healthy=false
        fi
        
        # Check frontend
        if curl -f http://localhost:3000 > /dev/null 2>&1; then
            log "✅ Frontend is responding"
        else
            warn "⚠️ Frontend health check failed"
            all_healthy=false
        fi
        
        if [ "$all_healthy" = true ]; then
            return 0
        else
            return 1
        fi
    fi
}

# Cleanup old images
cleanup() {
    log "Cleaning up old Docker resources..."
    
    docker image prune -f --filter "until=168h" || warn "Image cleanup failed"
    docker volume prune -f || warn "Volume cleanup failed"
    
    log "✅ Cleanup completed"
}

# Display status
display_status() {
    log "Deployment Status:"
    cd "$PROJECT_DIR"
    docker compose ps
    
    echo ""
    log "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" || true
}

# Main deployment process
main() {
    log "=========================================="
    log "  Food Platform Deployment"
    log "=========================================="
    echo ""
    
    cd "$PROJECT_DIR"
    
    # Load environment
    load_env
    
    # Execute deployment steps
    if ! pre_deployment_checks; then
        error "Pre-deployment checks failed. Aborting."
        exit 1
    fi
    
    if ! create_backup; then
        error "Backup failed. Aborting deployment."
        exit 1
    fi
    
    if ! pull_code; then
        error "Failed to pull code. Aborting."
        exit 1
    fi
    
    if ! pull_images; then
        error "Failed to pull images. Aborting."
        exit 1
    fi
    
    if ! stop_containers; then
        error "Failed to stop containers. Aborting."
        exit 1
    fi
    
    if ! start_containers; then
        error "Failed to start containers. Manual intervention required."
        exit 1
    fi
    
    wait_for_services
    
    if ! run_migrations; then
        error "Migrations failed. Rolling back..."
        # Attempt automatic rollback
        if [ -x "$SCRIPT_DIR/rollback.sh" ]; then
            "$SCRIPT_DIR/rollback.sh" --no-db-restore
        fi
        exit 1
    fi
    
    fix_sequences
    collect_static
    
    if ! run_health_checks; then
        error "Health checks failed. Rolling back..."
        # Attempt automatic rollback
        if [ -x "$SCRIPT_DIR/rollback.sh" ]; then
            "$SCRIPT_DIR/rollback.sh"
        fi
        exit 1
    fi
    
    cleanup
    
    # Success
    echo ""
    log "=========================================="
    log "  ✅ Deployment Completed Successfully!"
    log "=========================================="
    echo ""
    
    display_status
    
    log "Deployment completed at $(date)"
}

# Run main function
main "$@"
