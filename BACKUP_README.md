# PostgreSQL Backup and Recovery System

## Overview

This comprehensive backup system provides both traditional SQL dump backups and advanced Point-in-Time Recovery (PITR) capabilities for the FoodPlatform PostgreSQL database. The system is designed to ensure data protection with minimal data loss and maximum recovery flexibility.

## Features

- **Traditional SQL Backups**: Complete database snapshots for general backup needs
- **Point-in-Time Recovery (PITR)**: Precise recovery to any specific moment in time
- **WAL Archiving**: Continuous archiving of Write-Ahead Log files
- **Docker Integration**: Fully integrated with Docker Compose setup
- **Unified Management**: Single script for all backup operations
- **Automated Cleanup**: Intelligent cleanup of old backup files
- **Comprehensive Monitoring**: Detailed status reporting and diagnostics

## Quick Start

### 1. Initial Setup

```bash
# Start the system with PITR support
docker-compose down
docker-compose build postgres
docker-compose up -d

# Wait for PostgreSQL to be ready
sleep 10
```

### 2. Create Your First Backup

```bash
# Create a traditional SQL backup
./script_pg_backup.sh backup

# Or create a comprehensive backup (SQL + PITR)
./script_pg_backup.sh full-backup
```

### 3. Check System Status

```bash
# Show comprehensive status
./script_pg_backup.sh status
```

## Commands Reference

### Traditional SQL Backup Commands

| Command         | Description             | Example                               |
| --------------- | ----------------------- | ------------------------------------- |
| `backup`        | Create SQL dump backup  | `./script_pg_backup.sh backup`        |
| `restore`       | Restore from SQL backup | `./script_pg_backup.sh restore`       |
| `start-restore` | Fresh start + restore   | `./script_pg_backup.sh start-restore` |
| `stats`         | Show backup statistics  | `./script_pg_backup.sh stats`         |
| `cleanup`       | Clean old SQL backups   | `./script_pg_backup.sh cleanup`       |

### Point-in-Time Recovery (PITR) Commands

| Command        | Description                    | Example                                                                  |
| -------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `pitr-backup`  | Create PITR base backup        | `./script_pg_backup.sh pitr-backup`                                      |
| `pitr-check`   | Check WAL archiving status     | `./script_pg_backup.sh pitr-check`                                       |
| `pitr-test`    | Test WAL archiving             | `./script_pg_backup.sh pitr-test`                                        |
| `pitr-restore` | Perform point-in-time recovery | `./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'` |
| `pitr-cleanup` | Clean PITR archives            | `./script_pg_backup.sh pitr-cleanup`                                     |

### Unified Commands

| Command       | Description                      | Example                             |
| ------------- | -------------------------------- | ----------------------------------- |
| `full-backup` | Create both SQL and PITR backups | `./script_pg_backup.sh full-backup` |
| `status`      | Show unified system status       | `./script_pg_backup.sh status`      |
| `cleanup-all` | Clean both backup systems        | `./script_pg_backup.sh cleanup-all` |
| `help`        | Show help information            | `./script_pg_backup.sh help`        |

## Backup Strategies

### Daily Operations

```bash
# Quick daily backup (recommended)
./script_pg_backup.sh backup

# Check system status
./script_pg_backup.sh status
```

### Weekly Operations

```bash
# Comprehensive backup (both SQL and PITR)
./script_pg_backup.sh full-backup

# Check PITR system
./script_pg_backup.sh pitr-check
```

### Monthly Maintenance

```bash
# Clean up old files
./script_pg_backup.sh cleanup-all

# Show detailed statistics
./script_pg_backup.sh stats
```

## Recovery Scenarios

### Scenario 1: Complete Database Restore

**Use Case**: Complete database corruption or migration

```bash
# Restore from latest SQL backup
./script_pg_backup.sh restore

# Or start fresh with restored data
./script_pg_backup.sh start-restore
```

### Scenario 2: Point-in-Time Recovery

**Use Case**: Accidental data deletion or wrong transaction

```bash
# First, do a dry run to see what would happen
./script_pg_backup.sh pitr-restore --dry-run --target-time '2024-09-22 14:30:00'

# If the dry run looks good, perform the actual recovery
./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'
```

### Scenario 3: Recovery to Specific Transaction

**Use Case**: Need to recover before a specific transaction

```bash
# Find the transaction ID
docker exec -it $(docker-compose ps -q postgres) psql -c "SELECT txid_current();"

# Recover to before that transaction
./script_pg_backup.sh pitr-restore --target-xid '12345'
```

### Scenario 4: Recovery to Specific LSN

**Use Case**: Advanced recovery scenarios

```bash
# Get current LSN
docker exec -it $(docker-compose ps -q postgres) psql -c "SELECT pg_current_wal_lsn();"

# Recover to specific LSN
./script_pg_backup.sh pitr-restore --target-lsn '0/1234567'
```

## Configuration

### Environment Variables

The system uses the following environment variables from your `.env` file:

```bash
POSTGRES_DB=your_database_name
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
PROJECT_DIR=/path/to/your/project
```

### Directory Structure

```
FoodPlatform/
├── script_pg_backup.sh              # Main backup script
├── postgresql/                      # PITR configuration
│   ├── Dockerfile                   # Custom PostgreSQL image
│   ├── postgresql.conf              # PostgreSQL configuration
│   ├── init-pitr.sh                 # PITR initialization
│   └── backup-scripts/              # PITR backup scripts
│       ├── base-backup.sh
│       ├── restore-pitr.sh
│       ├── check-archiving.sh
│       └── cleanup-archive.sh
├── db_backups/                      # SQL backup storage
├── db_data/                         # Current SQL backup
├── pitr_backups/                    # PITR base backups
├── pitr_archive/                    # WAL archive files
└── BACKUP_README.md                 # This documentation
```

## Monitoring and Maintenance

### Regular Health Checks

```bash
# Check overall system status
./script_pg_backup.sh status

# Check PITR archiving specifically
./script_pg_backup.sh pitr-check

# Test WAL archiving
./script_pg_backup.sh pitr-test
```

### Backup Statistics

```bash
# Show SQL backup statistics
./script_pg_backup.sh stats

# Show comprehensive status
./script_pg_backup.sh status
```

### Cleanup Operations

```bash
# Clean up with default retention (7 days WAL, 30 days backups)
./script_pg_backup.sh cleanup-all

# Custom retention periods
./script_pg_backup.sh cleanup-all --wal-days 14 --backup-days 60

# Dry run to see what would be deleted
./script_pg_backup.sh cleanup-all --dry-run
```

## Troubleshooting

### Common Issues

#### 1. PostgreSQL Container Not Running

```bash
# Check container status
docker-compose ps

# Start the system
docker-compose up -d

# Wait for PostgreSQL to be ready
sleep 10
```

#### 2. WAL Archiving Not Working

```bash
# Check archiving status
./script_pg_backup.sh pitr-check

# Test archiving
./script_pg_backup.sh pitr-test

# Check container logs
docker logs $(docker-compose ps -q postgres)
```

#### 3. Recovery Fails

```bash
# Check recovery logs
docker exec -it $(docker-compose ps -q postgres) cat /var/lib/postgresql/restore/recovery.log

# Verify WAL files are available
docker exec -it $(docker-compose ps -q postgres) ls -la /var/lib/postgresql/archive/

# Check backup availability
./script_pg_backup.sh status
```

#### 4. Disk Space Issues

```bash
# Check disk usage
./script_pg_backup.sh status

# Clean up old files
./script_pg_backup.sh cleanup-all --dry-run
./script_pg_backup.sh cleanup-all
```

### Log Files

- **Recovery Log**: `/var/lib/postgresql/restore/recovery.log`
- **PostgreSQL Log**: `/var/lib/postgresql/data/log/postgresql-*.log`
- **Archive Logs**: Available in the archive directory

## Best Practices

### 1. Regular Backups

- **Daily**: Create SQL backups for general protection
- **Weekly**: Create comprehensive backups (SQL + PITR)
- **Monthly**: Clean up old files and verify system health

### 2. Testing

- **Test Recovery**: Regularly test recovery procedures in staging
- **Verify Backups**: Check backup integrity and completeness
- **Document Procedures**: Keep recovery procedures documented

### 3. Monitoring

- **Set Up Alerts**: Monitor backup success and failures
- **Check Logs**: Regularly review backup and recovery logs
- **Track Growth**: Monitor backup storage growth

### 4. Security

- **Secure Archives**: Protect WAL archive files (contain sensitive data)
- **Access Control**: Restrict access to backup directories
- **Encryption**: Consider encrypting backups for sensitive data

## Performance Considerations

### Backup Performance

- **SQL Backups**: Temporary impact during backup creation
- **PITR Backups**: Minimal impact on database performance
- **WAL Archiving**: Very low overhead on write operations

### Recovery Performance

- **SQL Restore**: Database unavailable during restore
- **PITR Recovery**: Database unavailable during recovery
- **Recovery Time**: Depends on amount of WAL data to apply

### Storage Requirements

- **SQL Backups**: Full database size per backup
- **PITR Backups**: Full database size per base backup
- **WAL Archives**: Continuous growth until cleanup

## Integration with Existing System

The backup system integrates seamlessly with your existing FoodPlatform setup:

- **Docker Compose**: Uses existing PostgreSQL service
- **Environment Variables**: Uses existing `.env` configuration
- **Volume Mounts**: Uses existing volume structure
- **Network**: Works with existing container networking

## Support and Maintenance

### Regular Tasks

1. **Daily**: Run `./script_pg_backup.sh backup`
2. **Weekly**: Run `./script_pg_backup.sh full-backup`
3. **Monthly**: Run `./script_pg_backup.sh cleanup-all`
4. **As Needed**: Run `./script_pg_backup.sh status` to check health

### Emergency Procedures

1. **Data Loss**: Use `./script_pg_backup.sh pitr-restore --target-time 'YYYY-MM-DD HH:MM:SS'`
2. **Complete Failure**: Use `./script_pg_backup.sh start-restore`
3. **System Issues**: Check logs and run diagnostics

### Getting Help

- Check this documentation for common issues
- Review PostgreSQL logs for specific errors
- Test procedures in staging environment first
- Consult PostgreSQL documentation for advanced scenarios

## Version History

- **v1.0**: Initial implementation with traditional SQL backups
- **v2.0**: Added Point-in-Time Recovery (PITR) capabilities
- **v3.0**: Unified all backup functions into single script

## License

This backup system is part of the FoodPlatform project and follows the same licensing terms.

---

**Note**: Always test backup and recovery procedures in a staging environment before using in production. Keep this documentation updated as the system evolves.
