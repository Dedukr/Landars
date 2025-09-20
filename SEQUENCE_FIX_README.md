# PostgreSQL Sequence Fix

## Problem

When deleting orders (or other records) in the Django admin, you may encounter this error:

```
django.db.utils.IntegrityError: duplicate key value violates unique constraint "django_admin_log_pkey"
DETAIL: Key (id)=(1) already exists.
```

## Root Cause

This happens when PostgreSQL sequences get out of sync with the actual data in the tables. This commonly occurs after:

- Data migrations
- Manual database operations
- Data imports/exports
- Database restores

## Solution

The `fix_sequences.py` script automatically fixes all PostgreSQL sequences to match the actual maximum IDs in each table.

## Usage

### Manual Fix

```bash
# Copy the script to the container
docker cp fix_sequences.py foodplatform-backend-1:/tmp/fix_sequences.py

# Run the fix
docker-compose exec backend python /tmp/fix_sequences.py
```

### Automatic Fix

The sequence fix is now automatically included in the deployment process (`deploy.sh`) and will run after database migrations.

## What It Does

1. Finds all tables with `_id_seq` sequences
2. Checks the maximum ID in each table
3. Resets the sequence to `max_id + 1` if it's behind
4. Reports which sequences were fixed

## Prevention

- The fix runs automatically during deployment
- The script is included in the Docker container
- All sequences are checked and corrected as needed

## Files Modified

- `fix_sequences.py` - Main fix script
- `deploy.sh` - Added automatic sequence fix
- `backend/Dockerfile` - Includes fix script in container
