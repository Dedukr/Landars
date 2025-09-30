# Management Scripts

This folder contains all the management and utility scripts for the FoodPlatform project.

## Scripts Overview

### Database Management

- **`fix_db_sequence.sh`** - Fixes Django database integrity issues and PostgreSQL sequence problems
- **`fix_identity_columns.py`** - Python script that synchronizes PostgreSQL identity column sequences
- **`migrate_final.py`** - Comprehensive migration script for moving from SQLite to PostgreSQL
- **`pg_backup.sh`** - Ultimate database backup script with multiple backup strategies (SQL dumps, PITR, S3 integration)

### Deployment

- **`deploy.sh`** - Main deployment script for the Food Platform (executed by CI/CD pipeline)

## Usage

All scripts should be run from the project root directory:

```bash
# Database fixes
./management/fix_db_sequence.sh

# Database backups
./management/pg_backup.sh backup
./management/pg_backup.sh full-backup
./management/pg_backup.sh status

# Database migration (SQLite to PostgreSQL)
docker cp management/migrate_final.py $(docker-compose ps -q backend):/backend/
docker-compose exec backend python /backend/migrate_final.py

# Deployment
./management/deploy.sh
```

## Dependencies

These scripts work with:

- Docker and Docker Compose
- PostgreSQL database
- Django backend
- AWS S3 (for backup storage)

## Notes

- All scripts include comprehensive error handling and logging
- The `fix_db_sequence.sh` script is idempotent and safe to run multiple times
- The `pg_backup.sh` script supports multiple backup strategies and cloud storage
- All scripts should be executed with proper permissions (`chmod +x`)
