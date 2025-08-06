#!/bin/bash

# Deployment script for Food Platform
# This script is executed on the server by the CI/CD pipeline

set -e  # Exit on any error

# Configuration
PROJECT_DIR="/path/to/your/project"  # Update this to your actual project path
COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="/path/to/backups"  # Update this to your backup directory

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    error "Docker Compose file not found. Please run this script from the project root."
fi

log "Starting deployment process..."



# Backup current database (if exists)
if docker-compose ps | grep -q "backend"; then
    ./script_db_backup.sh
fi

# Pull latest code
log "Pulling latest code from repository..."
git pull origin main || error "Failed to pull latest code"

# Pull latest Docker images
log "Pulling latest Docker images..."
docker-compose pull || error "Failed to pull Docker images"

# Stop existing containers gracefully
log "Stopping existing containers..."
docker-compose down --timeout 30 || warn "Graceful shutdown failed, forcing stop"
docker-compose down --timeout 10 || error "Failed to stop containers"

# Start containers with latest images
log "Starting containers with latest images..."
docker-compose up || error "Failed to start containers"

# Wait for services to be healthy
log "Waiting for services to be ready..."
sleep 10

# Check if services are running
log "Checking service status..."
if docker-compose ps | grep -q "Up"; then
    log "Services are running successfully!"
else
    error "Some services failed to start"
fi

# Run database migrations (if needed)
log "Running database migrations..."
docker-compose exec -T backend python manage.py makemigrations || warn "Database make migrations failed"
docker-compose exec -T backend python manage.py migrate || warn "Database migration failed"

# Collect static files
log "Collecting static files..."
docker-compose exec -T backend python manage.py collectstatic --noinput || warn "Static file collection failed"

# Clean up unused Docker images
log "Cleaning up unused Docker images..."
docker image prune -f || warn "Docker cleanup failed"

# Show final status
log "Deployment completed successfully!"
log "Current service status:"
docker-compose ps

# Health check
log "Performing health checks..."
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    log "Frontend is responding"
else
    warn "Frontend health check failed"
fi

if curl -f http://localhost:8000 > /dev/null 2>&1; then
    log "Backend is responding"
else
    warn "Backend health check failed"
fi

log "Deployment process completed!" 