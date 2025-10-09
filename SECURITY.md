# Security Implementation Guide

This document outlines the comprehensive security measures implemented in the FoodPlatform application.

## Overview

The authentication and authorization system has been significantly enhanced with industry best practices to protect user data and prevent common security vulnerabilities.

## Security Features Implemented

### 1. JWT Authentication with Token Expiration

**What Changed:**

- Migrated from simple token-based authentication to JWT (JSON Web Tokens)
- Access tokens expire after 60 minutes
- Refresh tokens expire after 7 days
- Token rotation on refresh
- Automatic token blacklisting after rotation

**Benefits:**

- Prevents token theft and replay attacks
- Reduces the attack window with short-lived access tokens
- Allows for graceful token management

**Configuration:**

```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}
```

### 2. Rate Limiting

**What Changed:**

- Implemented rate limiting on all API endpoints
- Special rate limits for authentication endpoints:
  - Login: 5 attempts per minute
  - Registration: 3 attempts per hour
  - General API: 100 requests per hour (anonymous), 1000 requests per hour (authenticated)

**Benefits:**

- Prevents brute force attacks
- Protects against DDoS attacks
- Prevents account enumeration

### 3. Account Lockout (Django Axes)

**What Changed:**

- Automatic account lockout after 5 failed login attempts
- 30-minute cooldown period
- Tracks failures by user and IP combination
- Comprehensive logging of failed attempts

**Benefits:**

- Prevents brute force attacks
- Alerts administrators to suspicious activity
- Protects user accounts from unauthorized access

**Configuration:**

```python
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=30)
AXES_LOCK_OUT_BY_COMBINATION_USER_AND_IP = True
```

### 4. Enhanced Password Validation

**What Changed:**

- Minimum password length increased to 12 characters
- Required password complexity:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
- Password similarity checks with user attributes
- Common password validation

**Benefits:**

- Significantly increases password entropy
- Protects against dictionary attacks
- Reduces risk of account compromise

**Frontend Validation:**

```typescript
const validatePassword = (password: string): string | null => {
  if (password.length < 12) {
    return "Password must be at least 12 characters long";
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return "Password must contain uppercase, lowercase, number, and special character";
  }

  return null;
};
```

### 5. Security Headers and HTTPS Enforcement

**What Changed:**

- Enabled HTTPS redirect in production
- Implemented HSTS (HTTP Strict Transport Security) with 1-year duration
- Enabled XSS protection headers
- Content-Type nosniff
- X-Frame-Options set to DENY
- Secure and HttpOnly cookies
- SameSite cookie attribute set to Strict

**Benefits:**

- Prevents man-in-the-middle attacks
- Protects against XSS attacks
- Prevents clickjacking
- Ensures all communication is encrypted

**Configuration:**

```python
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = "DENY"
    SESSION_COOKIE_HTTPONLY = True
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Strict"
    CSRF_COOKIE_SAMESITE = "Strict"
```

### 6. Comprehensive Security Logging

**What Changed:**

- Implemented security event logging for:
  - Failed login attempts
  - Successful logins
  - Registration attempts
  - Password changes
  - Account lockouts
- Logs include IP addresses and timestamps
- Separate log files for security events and axes events

**Benefits:**

- Enables security auditing
- Helps identify suspicious activity
- Provides forensic data for security incidents
- Meets compliance requirements

**Log Files:**

- Security logs are now handled by Django's logging configuration
- Log files are created automatically in `backend/logs/` when needed
- Log rotation should be configured at the system level

### 7. Secure Secret Key Management

**What Changed:**

- Removed hardcoded SECRET_KEY from settings
- SECRET_KEY now loaded from environment variables
- Application fails to start in production without SECRET_KEY

**Benefits:**

- Prevents secret key exposure in version control
- Allows for key rotation without code changes
- Follows 12-factor app principles

**Configuration:**

```python
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-only-key-change-in-production"
    else:
        raise ValueError("SECRET_KEY must be set in production environment")
```

### 8. Improved CORS and Permission Settings

**What Changed:**

- Changed default permission from AllowAny to IsAuthenticated
- CORS configured to only allow specific origins in production
- Proper CORS headers configured

**Benefits:**

- Reduces attack surface
- Prevents unauthorized API access
- Protects against CSRF attacks

### 9. Session Security

**What Changed:**

- Session timeout set to 24 hours
- Sessions expire when browser closes
- Secure session cookies in production

**Benefits:**

- Reduces risk of session hijacking
- Automatic logout after inactivity
- Better security for shared computers

### 10. Input Validation and Sanitization

**What Changed:**

- Email format validation
- Input sanitization (strip, lowercase for emails)
- Generic error messages to prevent information disclosure

**Benefits:**

- Prevents SQL injection
- Prevents email enumeration
- Reduces attack surface

## Environment Variables Required

Create a `.env` file in the project root with the following variables:

```bash
# Secret Key (Generate a secure random key)
SECRET_KEY=your-super-secret-key-here-change-in-production

# Debug Mode (Set to False in production)
DEBUG=False

# Allowed Hosts (Comma-separated)
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# CORS Settings
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Database Configuration
POSTGRES_DB=your_database_name
POSTGRES_USER=your_database_user
POSTGRES_PASSWORD=your_secure_database_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_STORAGE_BUCKET_NAME=your_bucket_name
AWS_S3_REGION_NAME=your_region

# Business Information
BUSINESS_NAME=Your Business Name
BUSINESS_ADDRESS=Your Address
BUSINESS_CITY=Your City
BUSINESS_COUNTRY=Your Country
BUSINESS_POSTAL_CODE=Your Postal Code
BUSINESS_ACCOUNT_NAME=Your Bank Account Name
BUSINESS_ACCOUNT_NUMBER=Your Account Number
BUSINESS_SORT_CODE=Your Sort Code
```

## Database Migrations

After implementing these security changes, run the following migrations:

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

This will create the necessary database tables for:

- JWT token blacklist
- Django Axes failure tracking

## Testing the Security Implementation

### 1. Test Rate Limiting

Try to login with incorrect credentials more than 5 times within a minute:

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "wrong"}'
```

After 5 attempts, you should receive a 429 Too Many Requests response.

### 2. Test Account Lockout

After 5 failed login attempts, the account should be locked for 30 minutes.

### 3. Test Password Validation

Try to register with a weak password (e.g., less than 12 characters or missing complexity requirements):

```bash
curl -X POST http://localhost:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "weak", "name": "Test User"}'
```

You should receive a validation error.

### 4. Test JWT Token Expiration

1. Login to get tokens
2. Wait for 60 minutes
3. Try to access a protected endpoint with the access token
4. Should receive 401 Unauthorized
5. Use refresh token to get new access token

## Security Best Practices for Deployment

1. **Always use HTTPS in production**
2. **Generate a strong SECRET_KEY** (use `python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'`)
3. **Set DEBUG=False in production**
4. **Configure proper ALLOWED_HOSTS**
5. **Use environment variables for all sensitive data**
6. **Regularly update dependencies** (`pip list --outdated`)
7. **Monitor security logs regularly**
8. **Set up alerts for multiple failed login attempts**
9. **Implement database backups**
10. **Use a Web Application Firewall (WAF)**

## Security Monitoring

### Log Files to Monitor

1. Django logging system - Security events and account lockouts
2. System-level log rotation - Configured at the OS level

### Key Metrics to Track

- Failed login attempts per IP
- Account lockouts per day
- Password change frequency
- API rate limit hits
- JWT token refresh patterns

### Alerting Recommendations

Set up alerts for:

- More than 10 failed login attempts from single IP within 1 hour
- More than 5 account lockouts per day
- Unusual API access patterns
- High rate of token refresh requests

## Additional Security Recommendations

1. **Email Verification**: Implement email verification for new registrations
2. **Two-Factor Authentication (2FA)**: Add TOTP-based 2FA for high-value accounts
3. **Password Reset**: Implement secure password reset flow with time-limited tokens
4. **API Versioning**: Implement API versioning for backward compatibility
5. **Security Headers**: Consider adding Content Security Policy (CSP) headers
6. **Regular Security Audits**: Conduct periodic security assessments
7. **Penetration Testing**: Perform regular penetration testing
8. **Dependency Scanning**: Use tools like Safety or Snyk to scan for vulnerable dependencies

## Compliance Considerations

These security implementations help meet various compliance requirements:

- **GDPR**: Data protection and user privacy
- **PCI DSS**: Secure authentication and session management
- **OWASP Top 10**: Protection against common vulnerabilities
- **SOC 2**: Security monitoring and logging

## Support and Updates

For security issues or questions:

1. Check the logs in `backend/logs/`
2. Review Django Axes admin interface at `/admin/axes/`
3. Monitor failed login attempts
4. Keep dependencies updated

## Version History

- v1.0 - Initial security implementation (Current)
  - JWT authentication
  - Rate limiting
  - Account lockout
  - Enhanced password validation
  - Security headers
  - Comprehensive logging
