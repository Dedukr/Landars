# PostgreSQL Point-in-Time Recovery (PITR) Implementation

This document describes the Point-in-Time Recovery (PITR) implementation for the FoodPlatform using PostgreSQL's continuous archiving and WAL archiving capabilities.

## Overview

Point-in-Time Recovery allows you to restore your PostgreSQL database to any specific point in time using a combination of:

- Base backups (full database snapshots)
- WAL (Write-Ahead Log) files that contain all changes since the base backup

## Features

- **Continuous WAL Archiving**: Automatically archives WAL files for precise recovery
- **Base Backup Creation**: Creates compressed base backups with metadata
- **Flexible Recovery Options**: Restore to specific time, LSN, or transaction ID
- **Archive Management**: Automatic cleanup of old WAL files and backups
- **Monitoring Tools**: Comprehensive status checking and diagnostics
- **Docker Integration**: Fully integrated with Docker Compose setup

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │───▶│   WAL Archive    │───▶│   Base Backups  │
│   Database      │    │   Directory      │    │   Directory     │
│                 │    │                  │    │                 │
│ - WAL Generation│    │ - WAL Files      │    │ - Full Backups  │
│ - Archive Mode  │    │ - Archive Logs   │    │ - Metadata      │
│ - Recovery Mode │    │ - Cleanup        │    │ - Compression   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Configuration

### PostgreSQL Settings

The following key settings are configured in `postgresql/postgresql.conf`:

```ini
# WAL Configuration
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/archive/%f && cp %p /var/lib/postgresql/archive/%f'
archive_timeout = 300

# Recovery Configuration
restore_command = 'cp /var/lib/postgresql/archive/%f %p'
recovery_target_action = 'promote'

# Performance Settings
wal_buffers = 16MB
max_wal_size = 1GB
min_wal_size = 80MB
checkpoint_timeout = 5min
checkpoint_completion_target = 0.9
```

### Docker Volumes

The following volumes are configured in `docker-compose.yml`:

- `postgres_data`: Main database data directory
- `postgres_archive`: WAL archive directory
- `postgres_backups`: Base backup directory

## Usage

### 1. Initial Setup

The PITR setup is automatically initialized when the PostgreSQL container starts. The initialization script:

- Creates necessary directories
- Sets up database functions for monitoring
- Creates backup tracking tables
- Enables WAL archiving

### 2. Creating Base Backups

```bash
# Create a base backup
./script_pitr_management.sh backup

# The backup will be created in both:
# - Container: /var/lib/postgresql/backups/
# - Host: ./pitr_backups/
```

### 3. Monitoring WAL Archiving

```bash
# Check archiving status
./script_pitr_management.sh check

# Test archiving functionality
./script_pitr_management.sh test

# Show comprehensive status
./script_pitr_management.sh status
```

### 4. Point-in-Time Recovery

#### Restore to Specific Time

```bash
./script_pitr_management.sh restore --target-time '2024-01-01 15:30:00'
```

#### Restore to Specific LSN

```bash
./script_pitr_management.sh restore --target-lsn '0/1234567'
```

#### Restore to Specific Transaction ID

```bash
./script_pitr_management.sh restore --target-xid '12345'
```

#### Dry Run (Preview Recovery)

```bash
./script_pitr_management.sh restore --dry-run --target-time '2024-01-01 15:30:00'
```

### 5. Archive Cleanup

```bash
# Clean up with default retention (7 days WAL, 30 days backups)
./script_pitr_management.sh cleanup

# Custom retention periods
./script_pitr_management.sh cleanup --wal-days 14 --backup-days 60

# Dry run to see what would be deleted
./script_pitr_management.sh cleanup --dry-run
```

## Recovery Process

### 1. Automatic Recovery

When you run a restore command, the system:

1. Stops the current PostgreSQL instance
2. Backs up the existing data directory
3. Extracts the base backup
4. Creates a `recovery.conf` file with target settings
5. Starts PostgreSQL in recovery mode
6. Applies WAL files until the target point
7. Promotes the database to normal operation

### 2. Recovery Configuration

The recovery process uses a `recovery.conf` file with settings like:

```ini
restore_command = 'cp /var/lib/postgresql/archive/%f %p'
recovery_target_time = '2024-01-01 15:30:00'
recovery_target_action = 'promote'
archive_cleanup_command = 'pg_archivecleanup /var/lib/postgresql/archive %r'
```

## Monitoring and Maintenance

### Backup Tracking

The system maintains a `backup_info` table with:

- Backup metadata (name, type, timestamps)
- WAL LSN ranges
- Backup sizes
- Status information

### Monitoring Queries

```sql
-- View all backups
SELECT * FROM backup_summary ORDER BY start_time DESC;

-- Check WAL archiving status
SELECT name, setting FROM pg_settings
WHERE name IN ('wal_level', 'archive_mode', 'archive_command');

-- Current WAL position
SELECT pg_current_wal_lsn() as current_lsn,
       pg_walfile_name(pg_current_wal_lsn()) as current_wal_file;
```

### Log Files

- **Recovery Log**: `/var/lib/postgresql/restore/recovery.log`
- **PostgreSQL Log**: `/var/lib/postgresql/data/log/postgresql-*.log`
- **Archive Logs**: Available in the archive directory

## Best Practices

### 1. Regular Backups

- Create base backups regularly (daily or weekly)
- Monitor backup success and WAL archiving
- Test recovery procedures periodically

### 2. Archive Management

- Set appropriate retention periods
- Monitor archive disk space
- Clean up old archives regularly

### 3. Recovery Testing

- Test recovery procedures in a staging environment
- Document recovery procedures
- Train team members on recovery operations

### 4. Monitoring

- Set up alerts for backup failures
- Monitor WAL archiving status
- Track backup sizes and growth

## Troubleshooting

### Common Issues

#### WAL Archiving Not Working

```bash
# Check archiving status
./script_pitr_management.sh check

# Test archiving
./script_pitr_management.sh test

# Check archive directory permissions
docker exec postgres_container ls -la /var/lib/postgresql/archive/
```

#### Recovery Fails

- Check that WAL files are available in archive directory
- Verify target time/LSN is within backup range
- Check recovery log for specific error messages

#### Disk Space Issues

```bash
# Check archive and backup sizes
./script_pitr_management.sh status

# Clean up old files
./script_pitr_management.sh cleanup --dry-run
./script_pitr_management.sh cleanup
```

### Log Analysis

```bash
# View recovery log
docker exec postgres_container cat /var/lib/postgresql/restore/recovery.log

# View PostgreSQL logs
docker exec postgres_container tail -f /var/lib/postgresql/data/log/postgresql-*.log
```

## Security Considerations

1. **Archive Security**: WAL files contain sensitive data - secure the archive directory
2. **Backup Encryption**: Consider encrypting base backups for sensitive data
3. **Access Control**: Restrict access to backup and archive directories
4. **Network Security**: Ensure secure communication between containers

## Performance Impact

- **WAL Archiving**: Minimal impact on write performance
- **Base Backups**: Temporary impact during backup creation
- **Recovery**: Database unavailable during recovery process
- **Storage**: Additional space required for WAL files and backups

## Integration with Existing Backup System

The PITR system integrates with the existing `script_pg_backup_restore.sh`:

- **Complementary**: PITR provides precise recovery, traditional backups provide full snapshots
- **Shared Configuration**: Uses same environment variables and project structure
- **Unified Management**: Both systems can be managed through the same interface

## File Structure

```
postgresql/
├── Dockerfile                 # Custom PostgreSQL image
├── postgresql.conf           # PostgreSQL configuration
├── init-pitr.sh             # PITR initialization script
└── backup-scripts/
    ├── base-backup.sh       # Base backup creation
    ├── restore-pitr.sh      # PITR recovery
    ├── check-archiving.sh   # Archiving monitoring
    └── cleanup-archive.sh   # Archive cleanup

script_pitr_management.sh     # Main PITR management script
PITR_README.md               # This documentation
```

## Support and Maintenance

For issues or questions regarding the PITR implementation:

1. Check the troubleshooting section above
2. Review PostgreSQL documentation on continuous archiving
3. Check container logs for specific error messages
4. Test in a staging environment before production use

## References

- [PostgreSQL Continuous Archiving Documentation](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [PostgreSQL Point-in-Time Recovery](https://www.postgresql.org/docs/current/backup-pitr.html)
- [PostgreSQL WAL Configuration](https://www.postgresql.org/docs/current/wal-configuration.html)
