#!/bin/bash

# This script creates a backup of the SQLite database from a Docker container and saves it to a specified directory on the host machine.
# It also copies the latest backup to a specific location and deletes backups older than 7 days.
# Make sure to run this script from the directory where it is located
# Usage: ./script_db_backup.sh


# For development purposes only. This script is intended to be run in a development environment and should not be used in production.
# CONTAINER=foodplatform-backend-1 
# DB_PATH_IN_CONTAINER=/backend/db/db.sqlite3
# DB_PATH_ON_HOST=./backend/db/db.sqlite3
# BACKUP_DIR_ON_HOST=./db_backups
# DATE=$(date +"%Y-%m-%d_%H-%M-%S")
# FILENAME="db_backup_$DATE.sqlite3"


# For production.
# This script is intended to be run in a production environment and should not be used in development.
CONTAINER="landars-backend-1"
DB_PATH_IN_CONTAINER="/backend/db/db.sqlite3"
DB_PATH_ON_HOST="/home/dedmac/web/Landars/backend/db/db.sqlite3"
BACKUP_DIR_ON_HOST="/home/dedmac/web/Landars/db_backups"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="db_backup_$DATE.sqlite3"

# Create local backup folder if needed
mkdir -p $BACKUP_DIR_ON_HOST

# Use docker cp to extract the file
docker cp $CONTAINER:$DB_PATH_IN_CONTAINER $BACKUP_DIR_ON_HOST/$FILENAME && echo "$DATE | ✅ Backup saved as $BACKUP_DIR_ON_HOST/$FILENAME" || echo "$DATE | ❌ Failed to create backup of $CONTAINER:$DB_PATH_IN_CONTAINER"
cp $BACKUP_DIR_ON_HOST/$FILENAME $DB_PATH_ON_HOST && echo "$DATE | ✅ Latest db saved as $DB_PATH_ON_HOST" || echo "$DATE | ❌ Failed to copy latest backup $BACKUP_DIR_ON_HOST/$FILENAME to $DB_PATH_ON_HOST"

# Delete backups older than 31 days
find $BACKUP_DIR_ON_HOST -name "*.sqlite3" -type f -mtime +31 -exec rm {} \;