# Security Migration Checklist

This checklist will guide you through deploying the new security features.

## Pre-Migration Steps

- [ ] **Backup Current Database**

  ```bash
  ./management/pg_backup.sh backup
  ```

- [ ] **Review Documentation**

  - [ ] Read [SECURITY.md](SECURITY.md)
  - [ ] Read [SECURITY_IMPROVEMENTS_SUMMARY.md](SECURITY_IMPROVEMENTS_SUMMARY.md)

- [ ] **Notify Users**
  - Users will need to re-login after migration
  - Old passwords may need to be changed if they don't meet new requirements

## Installation Steps

### 1. Environment Setup

- [ ] **Generate SECRET_KEY**

  ```bash
  cd backend
  python generate_secret_key.py
  ```

- [ ] **Create/Update .env File**

  ```bash
  cp env.template .env
  # Add the generated SECRET_KEY and other required values
  ```

- [ ] **Verify Environment Variables**
  - [ ] SECRET_KEY (newly generated)
  - [ ] DEBUG (set to False for production)
  - [ ] ALLOWED_HOSTS (your domain names)
  - [ ] CORS_ALLOWED_ORIGINS (your frontend URLs)
  - [ ] CSRF_TRUSTED_ORIGINS (your frontend URLs)
  - [ ] Database credentials
  - [ ] AWS credentials

### 2. Backend Installation

- [ ] **Install Python Dependencies**

  ```bash
  cd backend
  pip install -r requirements.txt
  ```

  This installs:

  - djangorestframework-simplejwt
  - django-ratelimit
  - django-axes

- [ ] **Create Logs Directory**

  ```bash
  mkdir -p backend/logs
  chmod 755 backend/logs
  ```

- [ ] **Run Database Migrations**

  ```bash
  python manage.py migrate
  ```

  This creates tables for:

  - JWT token blacklist
  - Django Axes failure tracking

- [ ] **Test Backend Server**
  ```bash
  python manage.py runserver
  # Should start without errors
  ```

### 3. Frontend Installation

- [ ] **Install/Update Node Modules**

  ```bash
  cd frontend-marketplace
  npm install
  ```

- [ ] **Test Frontend Build**
  ```bash
  npm run build
  # Should complete without errors
  ```

## Testing Steps

### 4. Functional Testing

- [ ] **Test User Registration**

  - [ ] Try weak password (should fail)
  - [ ] Try strong password (should succeed)
  - [ ] Verify JWT tokens are returned

- [ ] **Test User Login**

  - [ ] Login with valid credentials
  - [ ] Verify JWT tokens are returned
  - [ ] Check that old tokens don't work

- [ ] **Test Rate Limiting**

  - [ ] Try login 6 times with wrong password
  - [ ] Should get rate limit error after 5 attempts

- [ ] **Test Account Lockout**

  - [ ] After rate limit cooldown, try login again (wrong password)
  - [ ] Account should lock after 5 total failures
  - [ ] Wait 30 minutes or reset in admin

- [ ] **Test Token Refresh**

  - [ ] Login and get tokens
  - [ ] Use refresh token to get new access token
  - [ ] Verify new access token works

- [ ] **Test Logout**

  - [ ] Logout with valid token
  - [ ] Verify token is blacklisted
  - [ ] Verify can't use token after logout

- [ ] **Test Password Change**
  - [ ] Change password with valid old password
  - [ ] Try with invalid old password (should fail)
  - [ ] Try weak new password (should fail)

### 5. Security Testing

- [ ] **Verify Security Headers** (Production)

  ```bash
  curl -I https://yourdomain.com
  ```

  Should include:

  - Strict-Transport-Security
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY

- [ ] **Verify HTTPS Redirect** (Production)

  ```bash
  curl -I http://yourdomain.com
  ```

  Should redirect to https://

- [ ] **Check Security Logs**

  ```bash
  # Check Django logs (logs are created automatically when needed)
  tail -f backend/logs/security.log 2>/dev/null || echo "Security log not yet created"
  tail -f backend/logs/axes.log 2>/dev/null || echo "Axes log not yet created"
  ```

  Should show login attempts and security events

- [ ] **Test CORS**
  - From allowed origin: Should work
  - From non-allowed origin: Should fail (production)

## Post-Migration Steps

### 6. Monitoring Setup

- [ ] **Set Up Log Monitoring**

  - [ ] Configure system-level log rotation for Django logs
  - [ ] Monitor log directory: `backend/logs/`
  - [ ] Set up alerting for critical events

- [ ] **Configure Alerts** (Recommended)

  - [ ] Alert on >10 failed logins from single IP in 1 hour
  - [ ] Alert on >5 account lockouts per day
  - [ ] Alert on unusual API access patterns

- [ ] **Admin Interface**
  - [ ] Access Django admin at /admin/
  - [ ] Check Axes admin at /admin/axes/
  - [ ] Check Token Blacklist at /admin/token_blacklist/

### 7. User Communication

- [ ] **Notify Users About Changes**

  - [ ] All users must re-login
  - [ ] Password requirements have changed
  - [ ] Provide password reset link if needed

- [ ] **Update Documentation**
  - [ ] Update API documentation
  - [ ] Update user guide
  - [ ] Update admin guide

### 8. Performance Monitoring

- [ ] **Monitor Performance**

  - [ ] Check API response times
  - [ ] Monitor database query performance
  - [ ] Check JWT token generation overhead

- [ ] **Verify No Regressions**
  - [ ] All existing features still work
  - [ ] No unexpected errors in logs
  - [ ] Frontend/backend communication works

## Rollback Plan (If Needed)

### If Issues Occur:

1. **Revert Code Changes**

   ```bash
   git revert HEAD
   ```

2. **Rollback Database Migrations**

   ```bash
   python manage.py migrate account zero
   python manage.py migrate token_blacklist zero
   python manage.py migrate axes zero
   ```

3. **Restore Old Requirements**

   ```bash
   git checkout HEAD~1 requirements.txt
   pip install -r requirements.txt
   ```

4. **Restart Services**
   ```bash
   docker-compose restart
   ```

## Success Criteria

✅ **Migration is successful when:**

- [ ] All tests pass
- [ ] Users can register with strong passwords
- [ ] Users can login and receive JWT tokens
- [ ] Rate limiting works correctly
- [ ] Account lockout works correctly
- [ ] Security logs are being written
- [ ] No errors in application logs
- [ ] Performance is acceptable
- [ ] Frontend and backend communicate correctly

## Common Issues and Solutions

### Issue: "SECRET_KEY not set"

**Solution:** Ensure SECRET_KEY is in .env file and properly loaded

### Issue: Import errors for simplejwt

**Solution:** Ensure `pip install -r requirements.txt` completed successfully

### Issue: Migration errors

**Solution:** Check database connection, ensure migrations haven't been run before

### Issue: Rate limiting too aggressive

**Solution:** Adjust rates in settings.py SIMPLE_JWT configuration

### Issue: Users locked out

**Solution:** Reset in Django admin at /admin/axes/ or wait for cooldown

### Issue: CORS errors in production

**Solution:** Verify CORS_ALLOWED_ORIGINS in .env matches frontend URL exactly

## Support

If you encounter issues:

1. Check logs:

   - `backend/logs/` (Django logging system)
   - Docker logs: `docker-compose logs backend`

2. Review documentation:

   - [SECURITY.md](SECURITY.md)
   - [SECURITY_IMPROVEMENTS_SUMMARY.md](SECURITY_IMPROVEMENTS_SUMMARY.md)

3. Check Django admin:
   - Axes failures: `/admin/axes/`
   - Token blacklist: `/admin/token_blacklist/`

## Post-Migration Verification

Run this command to verify everything is working:

```bash
# Test the complete flow
curl -X POST http://localhost:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ssw0rd123!",
    "name": "Test User"
  }'
```

Expected response: JWT tokens with user data

---

**Date Completed:** **\*\***\_\_\_\_**\*\***

**Completed By:** **\*\***\_\_\_\_**\*\***

**Notes:** **\*\***\_\_\_\_**\*\***
