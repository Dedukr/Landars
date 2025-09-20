# PostgreSQL Backup and Restore System

This system provides simple backup and restore functionality for your PostgreSQL database running in Docker.

## Files Structure

```
FoodPlatform/
├── script_pg_backup_restore.sh          # Main backup/restore script
├── db_backups/                # Timestamped backups directory
│   └── pg_backup_YYYY-MM-DD_HH-MM-SS.sql
├── db_data/                   # Current backup directory
│   └── pg.sql                 # Current database dump (overwritten on each backup)
└── docker-compose.yml         # Your Docker configuration
```

## Usage

### 1. Create a Backup

```bash
./script_pg_backup_restore.sh backup
```

This will:

- Create a timestamped backup in `db_backups/` folder (e.g., `pg_backup_2024-01-15_14-30-25.sql`)
- Save the current version as `db_data/pg.sql` (overwrites previous version)

### 2. Restore from Current Backup

```bash
./script_pg_backup_restore.sh restore
```

This will:

- Restore the database from `db_data/pg.sql`
- Requires PostgreSQL container to be running

### 3. Start Fresh with Restored Data

```bash
./script_pg_backup_restore.sh start-restore
```

This will:

- Stop existing PostgreSQL container
- Remove old data volume
- Start fresh PostgreSQL container
- Restore from `db_data/pg.sql`

## Manual Restore Process

If you want to restore from a specific backup:

1. Copy your desired backup file to `db_data/pg.sql`:

   ```bash
   cp db_backups/pg_backup_2024-01-15_14-30-25.sql db_data/pg.sql
   ```

2. Run the restore:
   ```bash
   ./script_pg_backup_restore.sh start-restore
   ```

## Prerequisites

- Docker and docker-compose must be installed
- PostgreSQL container must be running (for backup and restore commands)
- Database credentials are configured in the script

## Configuration

The script uses these database settings:

- Database: `landarsfooddb`
- User: `postgresuser`
- Password: `20022006Krv@`

To change these, edit the variables at the top of `script_pg_backup_restore.sh`.

## Examples

```bash
# Create a backup
./script_pg_backup_restore.sh backup

# Restore from current pg.sql (container running)
./script_pg_backup_restore.sh restore

# Fresh start with pg.sql data
./script_pg_backup_restore.sh start-restore

# Show help
./script_pg_backup_restore.sh help
```

## Notes

- The `db_data/pg.sql` file is always the "current" version and gets overwritten on each backup
- Timestamped backups in `db_backups/` are never overwritten
- The script automatically creates the required directories if they don't exist
- All operations include detailed logging with timestamps
