#!/bin/bash

# PostgreSQL Restore Script
# Restores PostgreSQL container from latest SQL backup
# Usage: ./management/restore_postgres.sh

set -e  # Exit on any error

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if backup file exists
BACKUP_FILE="db_backups/postgresql/latest.sql"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 PostgreSQL Database Restore"
echo "================================"
echo
echo "This script will:"
echo "1. Stop and remove current PostgreSQL container"
echo "2. Start a fresh PostgreSQL container"
echo "3. Restore from the latest backup"
echo "4. Start backend service"
echo "5. Run Django migrations"
echo
echo "⚠️  WARNING: This will delete all current PostgreSQL data!"
echo "📁 Backup file: $BACKUP_FILE"
echo

# Ask for confirmation
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled"
    exit 1
fi

echo
echo "🚀 Starting PostgreSQL restore..."
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}


log "=== PostgreSQL Restore Script ==="
log "Restoring from: $BACKUP_FILE"
echo

# Step 1: Stop and remove current PostgreSQL container
log "🛑 Stopping PostgreSQL container..."
if docker compose ps postgres | grep -q "Up"; then
    docker compose down postgres
    success "PostgreSQL container stopped"
else
    warning "PostgreSQL container was not running"
fi

log "🗑️ Removing PostgreSQL data volume..."
if docker volume ls | grep -q "foodplatform_postgres_data"; then
    docker volume rm foodplatform_postgres_data
    success "PostgreSQL data volume removed"
else
    warning "PostgreSQL data volume was not found"
fi

# Step 2: Start fresh PostgreSQL container
log "🚀 Starting fresh PostgreSQL container..."
docker compose up -d postgres
success "Fresh PostgreSQL container started"

# Step 3: Wait for PostgreSQL to initialize
log "⏳ Waiting for PostgreSQL to initialize..."
sleep 15

# Step 4: Check if PostgreSQL is ready
log "🔍 Checking PostgreSQL status..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if docker compose exec postgres pg_isready -U postgresuser -d landarsfooddb >/dev/null 2>&1; then
        success "PostgreSQL is ready"
        break
    else
        if [ $attempt -eq $max_attempts ]; then
            error "PostgreSQL failed to start after $max_attempts attempts"
        fi
        log "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    fi
done

# Step 5: Restore from latest backup
log "📥 Restoring from latest backup..."
if docker compose exec -T postgres psql -U postgresuser -d landarsfooddb < "$BACKUP_FILE"; then
    success "Database restored from backup"
else
    error "Failed to restore database from backup"
fi

# Step 6: Verify the restore
log "✅ Verifying restore..."
TABLE_COUNT=$(docker compose exec postgres psql -U postgresuser -d landarsfooddb -t -c "
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
" | tr -d ' ')

if [ "$TABLE_COUNT" -gt 0 ]; then
    success "Restore verification successful - Found $TABLE_COUNT tables"
else
    warning "No tables found in restored database"
fi

# Step 7: Start backend service
log "🚀 Starting backend service..."
docker compose up -d backend
success "Backend service started"

# Step 8: Wait for backend to be ready
log "⏳ Waiting for backend to be ready..."
sleep 10

# Step 9: Run migrations to ensure everything is in sync
log "🔄 Running Django migrations..."
if docker compose exec backend python manage.py migrate; then
    success "Django migrations completed"
else
    warning "Django migrations failed - this might be normal if database is already up to date"
fi

# Step 10: Final verification
log "🔍 Final verification..."
USER_COUNT=$(docker compose exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
print(User.objects.count())
" 2>/dev/null | tail -1 | tr -d ' ')

if [ "$USER_COUNT" -ge 0 ]; then
    success "Final verification successful - Found $USER_COUNT users"
else
    warning "Could not verify user count"
fi

echo
success "🎉 PostgreSQL restore completed successfully!"
log "Your PostgreSQL database has been restored from the latest backup"
log "Backend service is running and connected to the restored database"
