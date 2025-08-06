# CI/CD Pipeline Setup Guide

This guide will help you set up the automated CI/CD pipeline for your Food Platform project.

## Overview

The CI/CD pipeline consists of three main jobs:

1. **Test**: Runs tests for both frontend and backend
2. **Build and Push**: Builds Docker images and pushes them to Docker Hub
3. **Deploy**: Deploys the application to your server

## Prerequisites

### 1. GitHub Repository Setup

Ensure your repository has the following structure:

```
FoodPlatform/
├── .github/workflows/test.yml
├── deploy.sh
├── docker-compose.yml
├── backend/
└── frontend-marketplace/
```

### 2. Docker Hub Account

You need a Docker Hub account to store your Docker images:

- Create an account at [Docker Hub](https://hub.docker.com)
- Create a repository for your backend image: `dedukr/landar-backend`
- Create a repository for your frontend image: `dedukr/landar-frontend-marketplace`

### 3. Server Setup

Your server should have:

- Docker and Docker Compose installed
- Git access to your repository
- SSH access configured

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add the following secrets:

### Docker Hub Credentials

- `DOCKERHUB_USERNAME`: Your Docker Hub username
- `DOCKERHUB_TOKEN`: Your Docker Hub access token (not your password)

### Server Access

- `SERVER_HOST`: Your server's IP address or domain
- `SERVER_USERNAME`: SSH username for your server
- `SERVER_SSH_KEY`: Private SSH key for server access
- `SERVER_PORT`: SSH port (usually 22)
- `PROJECT_PATH`: Full path to your project directory on the server

## How to Generate Docker Hub Token

1. Log in to Docker Hub
2. Go to Account Settings → Security
3. Click "New Access Token"
4. Give it a name (e.g., "GitHub Actions")
5. Copy the token and save it as `DOCKERHUB_TOKEN` in GitHub secrets

## How to Generate SSH Key

If you don't have an SSH key for your server:

```bash
# Generate a new SSH key
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# Copy the public key to your server
ssh-copy-id username@your-server-ip

# Copy the private key content
cat ~/.ssh/id_rsa
```

Copy the private key content and save it as `SERVER_SSH_KEY` in GitHub secrets.

## Configuration Files

### 1. Update deploy.sh

Edit the `deploy.sh` file and update these variables:

```bash
PROJECT_DIR="/path/to/your/project"  # Your actual project path on server
BACKUP_DIR="/path/to/backups"        # Your backup directory
```

### 2. Update docker-compose.yml

Ensure your `docker-compose.yml` uses the correct image names:

```yaml
services:
  backend:
    image: dedukr/landar-backend:latest
  frontend-marketplace:
    image: dedukr/landar-frontend-marketplace:latest
```

## Pipeline Workflow

### On Push to Main/Master Branch

1. **Test Job**:

   - Sets up Python and Node.js environments
   - Installs dependencies
   - Runs Django tests
   - Runs frontend linting and build

2. **Build and Push Job** (only if tests pass):

   - Logs into Docker Hub
   - Builds backend and frontend Docker images
   - Pushes images with appropriate tags
   - Uses GitHub Actions cache for faster builds

3. **Deploy Job** (only if build succeeds):
   - Connects to your server via SSH
   - Runs the deployment script
   - Pulls latest code and Docker images
   - Restarts services with zero downtime
   - Performs health checks

### On Pull Request

Only the **Test Job** runs to ensure code quality before merging.

## Manual Deployment

If you need to deploy manually:

```bash
# On your server
cd /path/to/your/project
chmod +x deploy.sh
./deploy.sh
```

## Monitoring and Troubleshooting

### Check Pipeline Status

1. Go to your GitHub repository
2. Click on "Actions" tab
3. View the latest workflow run

### Common Issues

1. **Docker Hub Authentication Failed**:

   - Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are correct
   - Ensure the token has write permissions

2. **SSH Connection Failed**:

   - Verify server credentials in GitHub secrets
   - Check if the server is accessible
   - Ensure SSH key is properly formatted

3. **Deployment Failed**:
   - Check server logs: `docker-compose logs`
   - Verify project path in `PROJECT_PATH` secret
   - Check if Docker and Docker Compose are installed on server

### Logs and Debugging

- **GitHub Actions Logs**: Available in the Actions tab
- **Server Logs**: `docker-compose logs -f`
- **Deployment Script Logs**: Check the output in GitHub Actions

## Security Considerations

1. **Secrets Management**: Never commit secrets to your repository
2. **SSH Keys**: Use dedicated SSH keys for CI/CD, not your personal keys
3. **Docker Hub Tokens**: Use access tokens instead of passwords
4. **Server Access**: Limit SSH access to necessary users only

## Backup Strategy

The deployment script automatically creates database backups before deployment. Backups are stored in the configured `BACKUP_DIR`.

## Rollback Procedure

If deployment fails, you can rollback:

```bash
# On your server
cd /path/to/your/project

# Stop current containers
docker-compose down

# Pull previous images
docker-compose pull

# Start with previous version
docker-compose up -d

# Restore database if needed
docker-compose exec backend python manage.py loaddata /path/to/backup.json
```

## Performance Optimization

1. **Docker Layer Caching**: The pipeline uses GitHub Actions cache for faster builds
2. **Parallel Jobs**: Tests run in parallel for faster feedback
3. **Conditional Deployment**: Only deploys on main/master branch pushes

## Support

If you encounter issues:

1. Check the GitHub Actions logs for detailed error messages
2. Verify all secrets are correctly configured
3. Test the deployment script manually on your server
4. Check server resources (CPU, memory, disk space)
