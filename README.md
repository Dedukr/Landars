# FoodPlatform

A comprehensive food platform with Django backend, Next.js frontend, and PostgreSQL database.

## Features

- **Backend**: Django REST API with PostgreSQL database
- **Frontend**: Next.js marketplace application
- **Database**: PostgreSQL with advanced backup and recovery
- **Deployment**: Docker containerized with Nginx reverse proxy
- **Backup System**: Comprehensive backup with Point-in-Time Recovery (PITR)

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 2. Start the System

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### 3. Database Setup

```bash
# Run migrations
docker-compose exec backend python manage.py migrate

# Create superuser
docker-compose exec backend python manage.py createsuperuser
```

## Backup and Recovery

This platform includes a comprehensive backup system with both traditional SQL backups and advanced Point-in-Time Recovery (PITR).

### Quick Backup Commands

```bash
# Create backup
./script_pg_backup.sh backup

# Create comprehensive backup (SQL + PITR)
./script_pg_backup.sh full-backup

# Check system status
./script_pg_backup.sh status
```

### Recovery Commands

```bash
# Traditional restore
./script_pg_backup.sh restore

# Point-in-time recovery
./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'
```

For detailed backup documentation, see [BACKUP_README.md](BACKUP_README.md).

## Services

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **PostgreSQL**: localhost:5432
- **Nginx**: http://localhost (production)

## Development

### Backend Development

```bash
# Enter backend container
docker-compose exec backend bash

# Run Django commands
python manage.py migrate
python manage.py collectstatic
python manage.py runserver
```

### Frontend Development

```bash
# Enter frontend container
docker-compose exec frontend-marketplace bash

# Install dependencies
npm install

# Run development server
npm run dev
```

## Production Deployment

See [CI_CD_SETUP.md](CI_CD_SETUP.md) for production deployment instructions.

## Backup System

The platform includes a comprehensive backup system:

- **Traditional SQL Backups**: Complete database snapshots
- **Point-in-Time Recovery**: Precise recovery to any moment
- **WAL Archiving**: Continuous data protection
- **Automated Cleanup**: Intelligent file management

For complete backup documentation, see [BACKUP_README.md](BACKUP_README.md).

## Documentation

- [BACKUP_README.md](BACKUP_README.md) - Complete backup and recovery guide
- [CI_CD_SETUP.md](CI_CD_SETUP.md) - Production deployment guide
- [PITR_README.md](PITR_README.md) - Technical PITR implementation details

## Support

For issues or questions:

1. Check the relevant documentation
2. Review container logs: `docker-compose logs [service]`
3. Check backup status: `./script_pg_backup.sh status`
