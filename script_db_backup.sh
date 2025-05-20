#!/bin/bash

# Adjust to match your Docker service/container name
CONTAINER=landars-backend-1  # or just `backend` depending on your setup
DB_PATH_IN_CONTAINER=/backend/db/db.sqlite3
DB_PATH_ON_HOST=/home/dedmac/web/Landars/backend/db/db.sqlite3
BACKUP_DIR_ON_HOST=/home/dedmac/web/Landars/db_backups
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="db_backup_$DATE.sqlite3"

# Create local backup folder if needed
mkdir -p $BACKUP_DIR_ON_HOST

# Use docker cp to extract the file
docker cp $CONTAINER:$DB_PATH_IN_CONTAINER $BACKUP_DIR_ON_HOST/$FILENAME && echo "$DATE | ✅ Backup saved as $BACKUP_DIR_ON_HOST/$FILENAME" || echo "$DATE | ❌ Failed to create backup"
cp $BACKUP_DIR_ON_HOST/$FILENAME $DB_PATH_ON_HOST && echo "$DATE | ✅ Latest db saved as $DB_PATH_ON_HOST" || echo "$DATE | ❌ Failed to copy latest backup to $DB_PATH_ON_HOST"

# Delete backups older than 7 days
find $BACKUP_DIR_ON_HOST -name "*.sqlite3" -type f -mtime +7 -exec rm {} \;