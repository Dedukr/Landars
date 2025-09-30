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

# Initialize unified logging
init_logging() {
    # Create logs directory if it doesn't exist
    mkdir -p "$PROJECT_DIR/logs"
    
    # Initialize Python logging system
    python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
logger.log_info('Deployment script started', 'deploy')
" 2>/dev/null || echo "Warning: Could not initialize unified logging"
}

# Logging functions with unified logging integration
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    # Also log to unified system
    python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import log_info
log_info('$1', 'deploy')
" 2>/dev/null || true
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
    # Also log to unified system
    python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import log_warning
log_warning('$1', 'deploy')
" 2>/dev/null || true
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    # Also log to unified system
    python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import log_error
log_error('$1', 'deploy')
" 2>/dev/null || true
    exit 1
}

# Initialize logging
init_logging

# Check if we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    error "Docker Compose file not found. Please run this script from the project root."
fi

log "Starting deployment process..."

# Log deployment start to unified system
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('deployment', 'deploy'):
    pass
" 2>/dev/null || true

# Backup current database (if exists)
if docker-compose ps | grep -q "backend"; then
    log "Creating database backup..."
    python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('database_backup', 'backup'):
    pass
" 2>/dev/null || true
    ./management/pg_backup.sh backup
fi

# Pull latest code
log "Pulling latest code from repository..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('git_pull', 'git'):
    pass
" 2>/dev/null || true
git pull origin main || error "Failed to pull latest code"

# Pull latest Docker images
log "Pulling latest Docker images..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('docker_pull', 'docker'):
    pass
" 2>/dev/null || true
docker-compose pull || error "Failed to pull Docker images"

# Stop existing containers gracefully
log "Stopping existing containers..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('docker_stop', 'docker'):
    pass
" 2>/dev/null || true
docker-compose down --timeout 30 || warn "Graceful shutdown failed, forcing stop"
docker-compose down --timeout 10 || error "Failed to stop containers"

# Start containers with latest images
log "Starting containers with latest images..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('docker_start', 'docker'):
    pass
" 2>/dev/null || true
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
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('database_migrations', 'database'):
    pass
" 2>/dev/null || true
docker-compose exec -T backend python manage.py makemigrations || warn "Database make migrations failed"
docker-compose exec -T backend python manage.py migrate || warn "Database migration failed"

# Fix PostgreSQL sequences to prevent duplicate key errors
log "Fixing PostgreSQL sequences..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('sequence_fix', 'database'):
    pass
" 2>/dev/null || true
# Copy and run the sequence fix script
docker cp management/fix_identity_columns.py $(docker-compose ps -q backend):/tmp/fix_identity_columns.py
docker-compose exec -T backend python /tmp/fix_identity_columns.py || warn "Sequence fix failed"

# Collect static files
log "Collecting static files..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('static_collection', 'django'):
    pass
" 2>/dev/null || true
docker-compose exec -T backend python manage.py collectstatic --noinput || warn "Static file collection failed"

# Clean up unused Docker images
log "Cleaning up unused Docker images..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
with logger.process_logger('docker_cleanup', 'docker'):
    pass
" 2>/dev/null || true
docker image prune -f || warn "Docker cleanup failed"

# Show final status
log "Deployment completed successfully!"
log "Current service status:"
docker-compose ps

# Health check
log "Performing health checks..."
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
logger.run_health_checks()
" 2>/dev/null || true

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

# Log final stats
python3 -c "
import sys
sys.path.append('$PROJECT_DIR')
from unified_logging import get_logger
logger = get_logger('$PROJECT_DIR')
stats = logger.get_stats_summary()
print(f'Deployment Stats: {stats[\"successful_processes\"]}/{stats[\"total_processes\"]} processes successful')
" 2>/dev/null || true 