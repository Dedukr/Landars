#!/bin/bash

#######################################
# Health Check Script for Food Platform
# Performs comprehensive health checks on all services
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
MAX_RETRIES=10
RETRY_DELAY=5

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
        warn "No .env file found, using system environment"
    fi
}

# Check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        return 1
    fi
    
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not available"
        return 1
    fi
    
    log "Docker Compose is available"
    return 0
}

# Check PostgreSQL health
check_postgres() {
    info "Checking PostgreSQL..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-landarsfood}" -d "${POSTGRES_DB:-landarsfood}" > /dev/null 2>&1; then
            log "✅ PostgreSQL is healthy"
            
            # Check database connectivity
            if docker compose exec -T postgres psql -U "${POSTGRES_USER:-landarsfood}" -d "${POSTGRES_DB:-landarsfood}" -c "SELECT 1;" > /dev/null 2>&1; then
                log "✅ PostgreSQL database is accessible"
                return 0
            else
                warn "PostgreSQL is running but database is not accessible"
            fi
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            warn "PostgreSQL not ready, retrying in ${RETRY_DELAY}s... (attempt $retries/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
    done
    
    error "❌ PostgreSQL health check failed after $MAX_RETRIES attempts"
    return 1
}

# Check Backend health
check_backend() {
    info "Checking Backend API..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        # Check if container is running
        if ! docker compose ps backend | grep -q "Up"; then
            warn "Backend container is not running"
        else
            # Try health endpoint
            if curl -f -s http://localhost:8000/health/ > /dev/null 2>&1; then
                log "✅ Backend API is healthy"
                
                # Check admin endpoint
                if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:8000/admin/ | grep -q "200\|302"; then
                    log "✅ Backend admin is accessible"
                fi
                
                return 0
            fi
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            warn "Backend not ready, retrying in ${RETRY_DELAY}s... (attempt $retries/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
    done
    
    error "❌ Backend health check failed after $MAX_RETRIES attempts"
    
    # Show backend logs for debugging
    info "Last 20 lines of backend logs:"
    docker compose logs --tail=20 backend
    
    return 1
}

# Check Frontend health
check_frontend() {
    info "Checking Frontend..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        # Check if container is running
        if ! docker compose ps frontend-marketplace | grep -q "Up"; then
            warn "Frontend container is not running"
        else
            # Try to connect to frontend
            if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
                log "✅ Frontend is healthy"
                return 0
            fi
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            warn "Frontend not ready, retrying in ${RETRY_DELAY}s... (attempt $retries/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
    done
    
    error "❌ Frontend health check failed after $MAX_RETRIES attempts"
    
    # Show frontend logs for debugging
    info "Last 20 lines of frontend logs:"
    docker compose logs --tail=20 frontend-marketplace
    
    return 1
}

# Check Nginx health
check_nginx() {
    info "Checking Nginx..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        # Check if container is running
        if ! docker compose ps nginx | grep -q "Up"; then
            warn "Nginx container is not running"
        else
            # Try to connect to nginx
            if curl -f -s http://localhost:80 > /dev/null 2>&1; then
                log "✅ Nginx is healthy"
                
                # Check HTTPS if configured
                if curl -k -f -s https://localhost:443 > /dev/null 2>&1; then
                    log "✅ Nginx HTTPS is working"
                fi
                
                return 0
            fi
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            warn "Nginx not ready, retrying in ${RETRY_DELAY}s... (attempt $retries/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
    done
    
    error "❌ Nginx health check failed after $MAX_RETRIES attempts"
    
    # Show nginx logs for debugging
    info "Last 20 lines of nginx logs:"
    docker compose logs --tail=20 nginx
    
    return 1
}

# Check all containers are running
check_containers() {
    info "Checking container status..."
    
    local all_running=true
    local containers=("postgres" "backend" "frontend-marketplace" "nginx")
    
    for container in "${containers[@]}"; do
        if docker compose ps "$container" | grep -q "Up"; then
            log "✅ $container is running"
        else
            error "❌ $container is not running"
            all_running=false
        fi
    done
    
    if [ "$all_running" = true ]; then
        return 0
    else
        return 1
    fi
}

# Check disk space
check_disk_space() {
    info "Checking disk space..."
    
    local disk_usage=$(df -h "$PROJECT_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -gt 90 ]; then
        error "❌ Disk usage is critically high: ${disk_usage}%"
        return 1
    elif [ "$disk_usage" -gt 80 ]; then
        warn "⚠️ Disk usage is high: ${disk_usage}%"
    else
        log "✅ Disk usage is healthy: ${disk_usage}%"
    fi
    
    return 0
}

# Check Docker resources
check_docker_resources() {
    info "Checking Docker resource usage..."
    
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null || warn "Could not retrieve Docker stats"
    
    return 0
}

# Display summary
display_summary() {
    echo ""
    echo "============================================"
    echo "          Health Check Summary"
    echo "============================================"
    echo ""
    
    local failed_checks=0
    
    for check in "${HEALTH_CHECKS[@]}"; do
        if [ "${check}" == "0" ]; then
            echo "✅ Check passed"
        else
            echo "❌ Check failed"
            failed_checks=$((failed_checks + 1))
        fi
    done
    
    echo ""
    echo "Total checks: ${#HEALTH_CHECKS[@]}"
    echo "Failed checks: $failed_checks"
    echo ""
    
    if [ $failed_checks -eq 0 ]; then
        log "🎉 All health checks passed!"
        return 0
    else
        error "⚠️ $failed_checks health check(s) failed"
        return 1
    fi
}

# Main execution
main() {
    cd "$PROJECT_DIR"
    
    log "Starting health checks for Food Platform..."
    echo ""
    
    # Load environment
    load_env
    
    # Array to track check results
    HEALTH_CHECKS=()
    
    # Run checks
    check_docker_compose
    HEALTH_CHECKS+=($?)
    
    check_containers
    HEALTH_CHECKS+=($?)
    
    check_postgres
    HEALTH_CHECKS+=($?)
    
    check_backend
    HEALTH_CHECKS+=($?)
    
    check_frontend
    HEALTH_CHECKS+=($?)
    
    check_nginx
    HEALTH_CHECKS+=($?)
    
    check_disk_space
    HEALTH_CHECKS+=($?)
    
    check_docker_resources
    
    # Display summary
    display_summary
    exit $?
}

# Run main function
main "$@"
