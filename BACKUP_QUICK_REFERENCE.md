# Backup System Quick Reference

## 🚀 Essential Commands

### Daily Operations

```bash
# Create backup
./script_pg_backup.sh backup

# Check status
./script_pg_backup.sh status
```

### Weekly Operations

```bash
# Comprehensive backup (SQL + PITR)
./script_pg_backup.sh full-backup

# Check PITR system
./script_pg_backup.sh pitr-check
```

### Emergency Recovery

```bash
# Traditional restore
./script_pg_backup.sh restore

# Point-in-time recovery
./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'

# Dry run first (recommended)
./script_pg_backup.sh pitr-restore --dry-run --target-time '2024-09-22 14:30:00'
```

## 📋 Command Reference

| Command         | Purpose                 | Example                                                                  |
| --------------- | ----------------------- | ------------------------------------------------------------------------ |
| `backup`        | Create SQL backup       | `./script_pg_backup.sh backup`                                           |
| `restore`       | Restore from SQL backup | `./script_pg_backup.sh restore`                                          |
| `start-restore` | Fresh start + restore   | `./script_pg_backup.sh start-restore`                                    |
| `stats`         | Show SQL backup stats   | `./script_pg_backup.sh stats`                                            |
| `cleanup`       | Clean SQL backups       | `./script_pg_backup.sh cleanup`                                          |
| `pitr-backup`   | Create PITR backup      | `./script_pg_backup.sh pitr-backup`                                      |
| `pitr-check`    | Check WAL archiving     | `./script_pg_backup.sh pitr-check`                                       |
| `pitr-test`     | Test WAL archiving      | `./script_pg_backup.sh pitr-test`                                        |
| `pitr-restore`  | Point-in-time recovery  | `./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'` |
| `pitr-cleanup`  | Clean PITR archives     | `./script_pg_backup.sh pitr-cleanup`                                     |
| `full-backup`   | Both SQL + PITR         | `./script_pg_backup.sh full-backup`                                      |
| `status`        | Unified status          | `./script_pg_backup.sh status`                                           |
| `cleanup-all`   | Clean both systems      | `./script_pg_backup.sh cleanup-all`                                      |
| `help`          | Show help               | `./script_pg_backup.sh help`                                             |

## 🔧 PITR Restore Options

| Option          | Description                     | Example                               |
| --------------- | ------------------------------- | ------------------------------------- |
| `--target-time` | Recover to specific time        | `--target-time '2024-09-22 14:30:00'` |
| `--target-lsn`  | Recover to specific LSN         | `--target-lsn '0/1234567'`            |
| `--target-xid`  | Recover to specific transaction | `--target-xid '12345'`                |
| `--dry-run`     | Show what would be done         | `--dry-run`                           |

## 🧹 Cleanup Options

| Option          | Description                | Example            |
| --------------- | -------------------------- | ------------------ |
| `--wal-days`    | WAL retention days         | `--wal-days 14`    |
| `--backup-days` | Backup retention days      | `--backup-days 60` |
| `--dry-run`     | Show what would be deleted | `--dry-run`        |

## 📊 Monitoring Commands

```bash
# Check overall system
./script_pg_backup.sh status

# Check PITR specifically
./script_pg_backup.sh pitr-check

# Test WAL archiving
./script_pg_backup.sh pitr-test

# Show SQL backup stats
./script_pg_backup.sh stats
```

## 🚨 Emergency Procedures

### 1. Complete Database Failure

```bash
# Stop and restart with fresh data
./script_pg_backup.sh start-restore
```

### 2. Accidental Data Deletion

```bash
# Recover to before deletion
./script_pg_backup.sh pitr-restore --target-time '2024-09-22 14:30:00'
```

### 3. Wrong Transaction Executed

```bash
# Find transaction ID
docker exec -it $(docker-compose ps -q postgres) psql -c "SELECT txid_current();"

# Recover to before that transaction
./script_pg_backup.sh pitr-restore --target-xid '12345'
```

## 📁 Directory Structure

```
FoodPlatform/
├── script_pg_backup.sh          # Main backup script
├── db_backups/                  # SQL backup storage
├── db_data/                     # Current SQL backup
├── pitr_backups/                # PITR base backups
├── pitr_archive/                # WAL archive files
└── postgresql/                  # PITR configuration
```

## ⚠️ Important Notes

1. **Always test recovery first**: Use `--dry-run` option
2. **Database unavailable during recovery**: Plan accordingly
3. **Check disk space**: Before creating backups
4. **Monitor logs**: Check for errors and warnings
5. **Regular testing**: Test procedures in staging environment

## 🔍 Troubleshooting

### Container Not Running

```bash
docker-compose ps
docker-compose up -d
```

### WAL Archiving Issues

```bash
./script_pg_backup.sh pitr-check
./script_pg_backup.sh pitr-test
docker logs $(docker-compose ps -q postgres)
```

### Recovery Fails

```bash
# Check recovery logs
docker exec -it $(docker-compose ps -q postgres) cat /var/lib/postgresql/restore/recovery.log

# Check WAL files
docker exec -it $(docker-compose ps -q postgres) ls -la /var/lib/postgresql/archive/
```

### Disk Space Issues

```bash
./script_pg_backup.sh status
./script_pg_backup.sh cleanup-all --dry-run
./script_pg_backup.sh cleanup-all
```

## 📞 Getting Help

1. Check this quick reference
2. See [BACKUP_README.md](BACKUP_README.md) for detailed documentation
3. Check container logs: `docker-compose logs [service]`
4. Run diagnostics: `./script_pg_backup.sh status`
