#!/usr/bin/env python3
"""
Simple AWS S3 Backup Upload Script for FoodPlatform
Uploads database backups to AWS S3 with geographic redundancy
"""

import gzip
import os
import sys
from datetime import datetime
from pathlib import Path

import boto3


def load_env_file(env_file=".env"):
    """Load environment variables from .env file"""
    env_vars = {}
    try:
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()
    except FileNotFoundError:
        print(f"Error: {env_file} file not found")
        sys.exit(1)
    return env_vars


def compress_file(file_path):
    """Compress file using gzip"""
    compressed_path = f"{file_path}.gz"
    with open(file_path, "rb") as f_in:
        with gzip.open(compressed_path, "wb") as f_out:
            f_out.write(f_in.read())
    return compressed_path


def upload_to_s3(file_path, bucket, key, region, metadata=None):
    """Upload file to S3 bucket in specific region"""
    try:
        session = boto3.Session(
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=region,
        )
        s3_client = session.client("s3")

        extra_args = {"ServerSideEncryption": "AES256", "StorageClass": "STANDARD_IA"}

        if metadata:
            extra_args["Metadata"] = metadata

        s3_client.upload_file(file_path, bucket, key, ExtraArgs=extra_args)
        print(f"✓ Uploaded to {region}: s3://{bucket}/{key}")
        return True

    except Exception as e:
        print(f"✗ Failed to upload to {region}: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 s3-upload.py <backup-file> [backup-type]")
        print("Example: python3 s3-upload.py db_backups/pg_backup_2024-01-01.sql sql")
        sys.exit(1)

    backup_file = sys.argv[1]
    backup_type = sys.argv[2] if len(sys.argv) > 2 else "sql"

    if not os.path.exists(backup_file):
        print(f"Error: Backup file not found: {backup_file}")
        sys.exit(1)

    # Load configuration
    config = load_env_file()

    # Set environment variables
    os.environ["AWS_ACCESS_KEY_ID"] = config.get("AWS_ACCESS_KEY_ID", "")
    os.environ["AWS_SECRET_ACCESS_KEY"] = config.get("AWS_SECRET_ACCESS_KEY", "")

    # Get S3 configuration
    bucket = config.get("AWS_S3_BUCKET")
    prefix = config.get("AWS_S3_BACKUP_PREFIX", "postgres-backups/")
    regions = config.get("AWS_S3_BACKUP_REGIONS", "us-east-1").split(",")

    if not bucket:
        print("Error: AWS_S3_BUCKET not found in .env file")
        sys.exit(1)

    # Generate S3 key
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.basename(backup_file)
    s3_key = f"{prefix}{backup_type}/{timestamp}/{filename}"

    # Compress file if it's not already compressed
    file_to_upload = backup_file
    if (
        not filename.endswith(".gz")
        and config.get("BACKUP_COMPRESSION_ENABLED", "true").lower() == "true"
    ):
        print(f"Compressing {backup_file}...")
        file_to_upload = compress_file(backup_file)
        s3_key = f"{s3_key}.gz"

    # Prepare metadata
    metadata = {
        "backup-timestamp": datetime.now().isoformat(),
        "server-id": config.get("BACKUP_SERVER_ID", "unknown"),
        "backup-type": backup_type,
        "original-filename": filename,
    }

    print(f"Uploading {backup_file} to S3...")
    print(f"Bucket: {bucket}")
    print(f"Key: {s3_key}")
    print(f"Regions: {', '.join(regions)}")
    print()

    # Upload to all regions
    success_count = 0
    for region in regions:
        region = region.strip()
        if upload_to_s3(file_to_upload, bucket, s3_key, region, metadata):
            success_count += 1

    # Clean up compressed file if we created it
    if file_to_upload != backup_file and os.path.exists(file_to_upload):
        os.remove(file_to_upload)
        print(f"Cleaned up compressed file: {file_to_upload}")

    # Report results
    total_regions = len(regions)
    if success_count == total_regions:
        print(f"\n✓ Successfully uploaded to all {total_regions} regions")
    elif success_count > 0:
        print(f"\n⚠ Uploaded to {success_count} out of {total_regions} regions")
        sys.exit(1)
    else:
        print(f"\n✗ Failed to upload to any region")
        sys.exit(1)


if __name__ == "__main__":
    main()
