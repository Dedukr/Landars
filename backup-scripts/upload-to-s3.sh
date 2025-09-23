#!/bin/bash

#########################################################################
# Simple AWS S3 Backup Upload Script for FoodPlatform
#
# This script uploads database backups to AWS S3
# Uses your existing .env file for configuration
#
# Usage:
#   chmod +x upload-to-s3.sh
#   ./upload-to-s3.sh [backup-file] [backup-type]
#
# Examples:
#   ./upload-to-s3.sh db_backups/pg_backup_2024-01-01_12-00-00.sql sql
#   ./upload-to-s3.sh pitr_backups/base_backup_20240101_120000 pitr
#
#########################################################################

# Simple logging functions
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_info "AWS S3 Backup Upload Script started"

# Load configuration from .env file
if [[ -f ".env" ]]; then
    source .env
else
    log_error "Configuration file '.env' not found!"
    log_error "Please create the configuration file with your AWS credentials."
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first:"
    log_error "pip install awscli"
    exit 1
fi

# Set AWS credentials from .env file
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# Validate required environment variables
required_vars=("AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "AWS_S3_BUCKET")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    log_error "Missing required environment variables: ${missing_vars[*]}"
    log_error "Please add these to your .env file:"
    log_error "AWS_ACCESS_KEY_ID=your_access_key"
    log_error "AWS_SECRET_ACCESS_KEY=your_secret_key"
    log_error "AWS_S3_BUCKET=your-bucket-name"
    exit 1
fi

# Get command line arguments
BACKUP_FILE="$1"
BACKUP_TYPE="${2:-sql}"

if [[ -z "$BACKUP_FILE" ]]; then
    log_error "Backup file path is required"
    echo "Usage: $0 <backup-file> [backup-type]"
    echo "Example: $0 db_backups/pg_backup_2024-01-01_12-00-00.sql sql"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Set S3 configuration
S3_BUCKET="$AWS_S3_BUCKET"
S3_PREFIX="${AWS_S3_BACKUP_PREFIX:-postgres-backups/}"
S3_REGIONS="${AWS_S3_BACKUP_REGIONS:-us-east-1}"

# Generate S3 key
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME=$(basename "$BACKUP_FILE")
S3_KEY="${S3_PREFIX}${BACKUP_TYPE}/${TIMESTAMP}/${FILENAME}"

log_info "Uploading backup: $BACKUP_FILE"
log_info "S3 Bucket: $S3_BUCKET"
log_info "S3 Key: $S3_KEY"
log_info "Backup Type: $BACKUP_TYPE"

# Function to upload to a specific region
upload_to_region() {
    local region="$1"
    local s3_key="$2"
    
    log_info "Uploading to region: $region"
    
    # Set region for this upload
    export AWS_DEFAULT_REGION="$region"
    
    # Upload with metadata
    if aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/$s3_key" \
        --metadata "backup-timestamp=$(date -Iseconds),server-id=${BACKUP_SERVER_ID:-unknown},backup-type=$BACKUP_TYPE" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256; then
        log_success "Successfully uploaded to region $region"
        return 0
    else
        log_error "Failed to upload to region $region"
        return 1
    fi
}

# Upload to all configured regions
IFS=',' read -ra REGIONS <<< "$S3_REGIONS"
SUCCESS_COUNT=0
TOTAL_REGIONS=${#REGIONS[@]}

for region in "${REGIONS[@]}"; do
    region=$(echo "$region" | xargs) # trim whitespace
    if upload_to_region "$region" "$S3_KEY"; then
        ((SUCCESS_COUNT++))
    fi
done

# Report results
if [[ $SUCCESS_COUNT -eq $TOTAL_REGIONS ]]; then
    log_success "Backup uploaded successfully to all $TOTAL_REGIONS regions"
    log_info "S3 locations:"
    for region in "${REGIONS[@]}"; do
        region=$(echo "$region" | xargs)
        echo "  s3://$S3_BUCKET/$S3_KEY (region: $region)"
    done
elif [[ $SUCCESS_COUNT -gt 0 ]]; then
    log_warning "Backup uploaded to $SUCCESS_COUNT out of $TOTAL_REGIONS regions"
    exit 1
else
    log_error "Failed to upload backup to any region"
    exit 1
fi

# Optional: List recent backups
if [[ "${SHOW_RECENT_BACKUPS:-true}" == "true" ]]; then
    echo ""
    log_info "Recent backups in S3:"
    aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX$BACKUP_TYPE/" --recursive | head -10
fi

log_success "AWS S3 backup upload completed"
