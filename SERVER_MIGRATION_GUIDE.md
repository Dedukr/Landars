# SQLite to PostgreSQL Migration Guide for Server Deployment

This guide provides step-by-step instructions for migrating your Django food platform from SQLite to PostgreSQL on your server.

## Prerequisites

- Docker and Docker Compose installed on your server
- Access to your server via SSH
- Your Django application code deployed
- Backup of your current SQLite database

## Overview

The migration process involves:

1. Updating your codebase with PostgreSQL configuration
2. Setting up environment variables
3. Running database migration scripts
4. Verifying data integrity

## Step 1: Prepare Your Server Environment

### 1.1 Connect to Your Server

```bash
ssh your-username@your-server-ip
cd /path/to/your/food-platform
```

### 1.2 Create Environment File

Create a `.env` file in your project root with PostgreSQL credentials:

```bash
nano .env
```

Add the following content:

```env
DEBUG=True
ALLOWED_HOSTS=your-domain.com,www.your-domain.com,localhost,your-server-ip
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com,https://localhost

# AWS S3 Configuration (if using)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_STORAGE_BUCKET_NAME=your-bucket-name
AWS_S3_REGION_NAME=your-region

# PostgreSQL Configuration
POSTGRES_DB=your_database_name
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Business Information
BUSINESS_NAME="Your Business Name"
BUSINESS_ADDRESS="Your Address"
BUSINESS_CITY="Your City"
BUSINESS_COUNTRY="Your Country"
BUSINESS_POSTAL_CODE="Your Postal Code"
BUSINESS_ACCOUNT_NAME="Your Account Name"
BUSINESS_ACCOUNT_NUMBER="Your Account Number"
BUSINESS_SORT_CODE="Your Sort Code"
```

### 1.3 Update File Permissions

```bash
chmod 600 .env
```


### 5.1 Backup Your Current Database

```bash
# Create backup directory
mkdir -p db_backups

# Backup SQLite database
cp backend/db/db_prod.sqlite3 db_backups/db_backup_$(date +%Y-%m-%d_%H-%M-%S).sqlite3

# Also backup any other SQLite files
cp backend/db/db.sqlite3 db_backups/db_backup_$(date +%Y-%m-%d_%H-%M-%S)_alt.sqlite3 2>/dev/null || true
```

### 5.2 Stop Current Services

```bash
docker-compose down
```

### 5.3 Remove Old PostgreSQL Data (if exists)

```bash
docker volume rm foodplatform_postgres_data 2>/dev/null || true
```

### 5.4 Start PostgreSQL Service

```bash
docker-compose up -d postgres
```

### 5.5 Wait for PostgreSQL to Initialize

```bash
# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 15

# Check if PostgreSQL is ready
docker-compose logs postgres | grep -q "database system is ready to accept connections"
echo "PostgreSQL is ready!"
```

### 5.6 Start Backend Service

```bash
docker-compose up -d backend
```

### 5.7 Run Migration Script

```bash
# Copy migration script to container
docker cp migrate_final.py $(docker-compose ps -q backend):/backend/

# Run migration
docker-compose exec backend python /backend/migrate_final.py
```

### 5.8 Start All Services

```bash
docker-compose up -d
```

## Step 5: Verify Migration

### 5.1 Check Data Counts

```bash
# Check if data was migrated correctly
docker-compose exec backend python manage.py shell -c "
from api.models import ProductCategory, Product, Order
from account.models import CustomUser
print(f'Categories: {ProductCategory.objects.count()}')
print(f'Products: {Product.objects.count()}')
print(f'Orders: {Order.objects.count()}')
print(f'Users: {CustomUser.objects.count()}')
"
```

### 5.2 Test Application

```bash
# Check if backend is responding
curl http://localhost:8000/api/

# Check if frontend is accessible
curl http://localhost:3000/
```

### 5.3 Check Logs

```bash
# Check backend logs
docker-compose logs backend

# Check PostgreSQL logs
docker-compose logs postgres
```

## Step 6: Post-Migration Cleanup

### 6.1 Remove SQLite Mount (Optional)

Once you're confident the migration is successful, you can remove the SQLite mount from `docker-compose.yml`:

```yaml
# Remove this line from backend service volumes:
# - ./backend/db:/backend/db
```

### 6.2 Update Deployment Scripts

Update any deployment scripts to use PostgreSQL instead of SQLite.

### 6.3 Monitor Application

Monitor your application for any issues and verify all functionality works correctly.

## Troubleshooting

### Common Issues

1. **Environment Variables Not Found**

   - Ensure `.env` file exists and has correct permissions
   - Check that all required variables are set

2. **PostgreSQL Connection Failed**

   - Verify PostgreSQL service is running
   - Check credentials in `.env` file
   - Ensure network connectivity between services

3. **Foreign Key Constraint Errors**

   - The migration script handles this automatically
   - If issues persist, check the migration order

4. **Permission Denied**
   - Ensure proper file permissions on migration scripts
   - Check Docker container permissions

### Rollback Plan

If you need to rollback to SQLite:

1. Stop all services: `docker-compose down`
2. Restore SQLite database from backup
3. Revert Django settings to use SQLite
4. Restart services: `docker-compose up -d`

## Security Considerations

1. **Database Credentials**: Use strong, unique passwords
2. **Environment File**: Ensure `.env` file has restricted permissions (600)
3. **Network Security**: Configure firewall rules appropriately
4. **Backup Strategy**: Implement regular database backups

## Performance Optimization

1. **PostgreSQL Tuning**: Adjust PostgreSQL configuration for your server
2. **Connection Pooling**: Consider using connection pooling for high traffic
3. **Indexing**: Review and optimize database indexes
4. **Monitoring**: Set up database monitoring and alerting

## Support

If you encounter issues during migration:

1. Check the logs: `docker-compose logs`
2. Verify environment variables: `docker-compose exec backend env | grep POSTGRES`
3. Test database connection: `docker-compose exec backend python manage.py dbshell`
4. Review this guide and ensure all steps were followed correctly

---

**Important**: Always test the migration in a staging environment before running it on production!
