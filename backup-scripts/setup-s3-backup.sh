#!/bin/bash

#########################################################################
# Setup Script for AWS S3 Backup Integration
#
# This script installs the required Python dependencies for S3 backup
#
# Usage:
#   chmod +x setup-s3-backup.sh
#   ./setup-s3-backup.sh
#
#########################################################################

echo "Setting up AWS S3 backup integration..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 is not installed"
    exit 1
fi

# Install required packages
echo "Installing required Python packages..."
pip3 install -r requirements.txt

# Make scripts executable
chmod +x upload-to-s3.sh
chmod +x s3-upload.py

echo "Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Add your AWS credentials to your .env file:"
echo "   AWS_ACCESS_KEY_ID=your_access_key"
echo "   AWS_SECRET_ACCESS_KEY=your_secret_key"
echo "   AWS_S3_BUCKET=your-bucket-name"
echo "   AWS_DEFAULT_REGION=us-east-1"
echo ""
echo "2. Test the upload:"
echo "   python3 s3-upload.py db_backups/your_backup.sql sql"
echo ""
echo "3. Your existing backup script will now automatically upload to S3!"
