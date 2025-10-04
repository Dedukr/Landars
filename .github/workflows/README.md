# CI/CD Pipeline Documentation

## Overview

This repository now uses a single, comprehensive CI/CD pipeline (`ci-cd.yml`) that replaces the previous separate `deploy.yml` and `test.yml` workflows. The new pipeline provides a complete solution for testing, building, deploying, and monitoring your Food Platform application.

## Pipeline Structure

### 1. Security & Quality Scan

- **Python Security**: Uses `safety` and `bandit` to scan for vulnerabilities
- **Node.js Security**: Runs `npm audit` to check for security issues
- **Docker Security**: Placeholder for Docker image security scanning

### 2. Testing Phase

- **Backend Tests**: Django test suite with coverage reporting
- **Frontend Tests**: Node.js linting, building, and testing
- **Database Tests**: Uses PostgreSQL service for integration testing
- **Coverage Reports**: Uploads coverage data to Codecov

### 3. Build and Push

- **Multi-Platform**: Builds for both AMD64 and ARM64 architectures
- **Caching**: Uses GitHub Actions cache for faster builds
- **Matrix Strategy**: Builds all services (backend, frontend, nginx, postgres) in parallel

### 4. Database Backup

- **Pre-deployment Backup**: Creates timestamped database backups
- **Compression**: Compresses backups to save space
- **Retention**: Keeps only the last 10 backups

### 5. Deployment

- **Graceful Shutdown**: Stops containers with proper timeouts
- **Health Checks**: Comprehensive health verification for all services
- **Database Migrations**: Runs Django migrations automatically
- **Sequence Fixes**: Fixes PostgreSQL identity column sequences
- **Static Files**: Collects Django static files
- **Performance Optimization**: Runs PostgreSQL VACUUM ANALYZE

### 6. Verification

- **Service Endpoints**: Tests all service endpoints
- **Database Connectivity**: Verifies database access
- **Resource Monitoring**: Shows system resource usage
- **Final Status**: Comprehensive deployment verification

### 7. Rollback (Automatic)

- **Failure Detection**: Automatically triggers on deployment failure
- **Backup Restoration**: Restores from the latest backup
- **Service Recovery**: Restarts services with previous configuration

## Key Features

### ✅ Security

- Python dependency vulnerability scanning
- Node.js security audit
- Docker image security scanning (placeholder)
- SSL certificate verification

### ✅ Testing

- Backend Django test suite
- Frontend linting and building
- Database integration testing
- Coverage reporting

### ✅ Deployment

- Zero-downtime deployment
- Database backup before deployment
- Health checks for all services
- Automatic rollback on failure

### ✅ Monitoring

- Service health verification
- Resource usage monitoring
- Performance optimization
- Comprehensive logging

### ✅ Backup & Recovery

- Automated database backups
- Backup compression and retention
- Automatic rollback mechanism
- Data integrity verification

## Environment Variables Required

### GitHub Secrets

- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token
- `SERVER_HOST`: Target server hostname/IP
- `SERVER_USERNAME`: SSH username for deployment
- `SERVER_SSH_KEY`: SSH private key for deployment
- `SERVER_PORT`: SSH port (usually 22)
- `PROJECT_PATH`: Path to project on server

### Server Environment

- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password
- `POSTGRES_PORT`: Database port

## Workflow Triggers

### Automatic Triggers

- **Push to main/master**: Full deployment pipeline
- **Push to develop**: Build and test only
- **Pull Requests**: Test and security scan only

### Manual Triggers

- **Workflow Dispatch**: Manual deployment with environment selection
- **Skip Tests Option**: Emergency deployment option

## Deployment Environments

- **Production**: Main deployment (main/master branches)
- **Staging**: Development deployment (develop branch)

## Monitoring and Alerts

The pipeline includes comprehensive monitoring:

- Service health checks
- Resource usage tracking
- Performance metrics
- Error logging and reporting

## Rollback Strategy

In case of deployment failure:

1. Automatic rollback is triggered
2. Latest database backup is restored
3. Previous service configuration is applied
4. Health checks verify recovery

## Best Practices Implemented

1. **Security First**: Security scanning before any deployment
2. **Test Coverage**: Comprehensive testing with coverage reporting
3. **Backup Strategy**: Automated backups before deployment
4. **Health Monitoring**: Continuous health verification
5. **Performance Optimization**: Database and system optimization
6. **Rollback Capability**: Automatic recovery from failures
7. **Resource Management**: Docker cleanup and optimization

## Maintenance

### Regular Tasks

- Monitor backup retention
- Review security scan results
- Update dependencies regularly
- Monitor resource usage

### Troubleshooting

- Check GitHub Actions logs for detailed error information
- Verify server connectivity and permissions
- Ensure SSL certificates are properly configured
- Monitor database backup integrity

## Migration from Old Workflows

The new `ci-cd.yml` workflow replaces:

- `deploy.yml` (deployment workflow)
- `test.yml` (testing workflow)

All functionality has been consolidated and enhanced in the single comprehensive pipeline.
