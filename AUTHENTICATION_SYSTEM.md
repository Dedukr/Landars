# Professional Authentication System

## Overview

This document describes the comprehensive authentication system implemented for the FoodPlatform application. The system provides automatic token refresh, seamless user experience, and professional-grade security features.

## Key Features

### 1. Automatic Token Refresh

- **Access tokens expire after 60 minutes**
- **Refresh tokens expire after 7 days**
- **Automatic token refresh on API calls**
- **Seamless user experience - no manual re-login required**
- **Token rotation for enhanced security**

### 2. Professional HTTP Client

- **Request/Response interceptors**
- **Automatic retry logic**
- **CSRF token management**
- **Error handling and user feedback**
- **Queue management for concurrent requests**

### 3. User Feedback System

- **Real-time notifications**
- **Authentication event notifications**
- **Error messages and success confirmations**
- **Non-intrusive UI notifications**

### 4. Security Features

- **JWT token blacklisting**
- **Account lockout protection (5 failed attempts)**
- **Rate limiting**
- **Secure cookie handling**
- **Session timeout management**

## Architecture

### HTTP Client (`/src/utils/httpClient.ts`)

The HTTP client is the core of the authentication system:

```typescript
// Automatic token refresh example
const data = await httpClient.get("/api/protected-endpoint");
// If token is expired, it automatically refreshes and retries
```

**Key Features:**

- Automatic token refresh on 401 responses
- Request queue management during token refresh
- CSRF token handling
- Error handling with user notifications
- Retry logic with exponential backoff

### Authentication Context (`/src/contexts/AuthContext.tsx`)

Manages authentication state and integrates with the HTTP client:

```typescript
const { user, login, logout, loading } = useAuth();
```

**Features:**

- Automatic logout on token refresh failure
- Event-driven logout system
- User state management
- Integration with notification system

### Notification System (`/src/utils/notifications.ts`)

Provides user feedback for authentication events:

```typescript
import { authNotifications } from "@/utils/notifications";

// Show success notification
authNotifications.loginSuccess();

// Show error notification
authNotifications.loginError("Invalid credentials");
```

**Notification Types:**

- Login/Logout success
- Session expired
- Token refresh success/failure
- Account locked
- Registration success/failure

## Usage Examples

### Making Authenticated API Calls

```typescript
import { httpClient } from "@/utils/httpClient";

// GET request with automatic token refresh
const products = await httpClient.get("/api/products");

// POST request with automatic token refresh
const newProduct = await httpClient.post("/api/products", {
  name: "New Product",
  price: 29.99,
});

// PUT request with automatic token refresh
const updatedProduct = await httpClient.put("/api/products/1", {
  name: "Updated Product",
});

// DELETE request with automatic token refresh
await httpClient.delete("/api/products/1");
```

### Handling Authentication Events

```typescript
import { useAuth } from "@/contexts/AuthContext";
import { authNotifications } from "@/utils/notifications";

function LoginComponent() {
  const { login, logout, user } = useAuth();

  const handleLogin = async (credentials) => {
    try {
      const data = await httpClient.post("/api/auth/login/", credentials);
      login(data.tokens, data.user);
      // Success notification is automatically shown
    } catch (error) {
      // Error notification is automatically shown
      console.error("Login failed:", error);
    }
  };

  return (
    <div>
      {user ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={handleLogin}>Login</button>
      )}
    </div>
  );
}
```

### Custom Notifications

```typescript
import { notificationManager } from "@/utils/notifications";

// Show custom notification
notificationManager.success(
  "Operation Complete",
  "Your data has been saved successfully"
);

// Show error notification
notificationManager.error("Operation Failed", "Unable to save your data");

// Show warning notification
notificationManager.warning("Warning", "This action cannot be undone");

// Show info notification
notificationManager.info(
  "Information",
  "Your session will expire in 5 minutes"
);
```

## Configuration

### JWT Settings (Backend)

```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}
```

### Session Settings (Backend)

```python
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_COOKIE_AGE = 86400  # 24 hours
```

### Rate Limiting (Backend)

```python
"DEFAULT_THROTTLE_RATES": {
    "anon": "100/hour",
    "user": "1000/hour",
    "login": "5/minute",
    "register": "3/hour",
}
```

## Security Features

### 1. Account Lockout

- **5 failed login attempts** trigger a 30-minute lockout
- **Tracks by username and IP combination**
- **Automatic unlock after cooldown period**

### 2. Rate Limiting

- **Login: 5 attempts per minute**
- **Registration: 3 attempts per hour**
- **API calls: 100/hour (anonymous), 1000/hour (authenticated)**

### 3. Token Security

- **Short-lived access tokens (60 minutes)**
- **Token rotation on refresh**
- **Automatic blacklisting of old tokens**
- **Secure cookie handling**

### 4. Session Management

- **Sessions expire on browser close**
- **24-hour session timeout**
- **Automatic cleanup on logout**

## Error Handling

The system provides comprehensive error handling:

### 1. Network Errors

- Automatic retry for transient failures
- User-friendly error messages
- Fallback mechanisms

### 2. Authentication Errors

- Automatic token refresh
- Graceful logout on refresh failure
- Clear error notifications

### 3. Server Errors

- Proper HTTP status code handling
- Error message extraction
- User notification system

## Testing

The system includes comprehensive tests:

```bash
# Run tests
npm test

# Run specific test file
npm test httpClient.test.ts
```

**Test Coverage:**

- Token refresh functionality
- Request/response handling
- Error scenarios
- CSRF token management
- Authentication flow

## Migration Guide

### From Old System

1. **Replace `makeAuthenticatedRequest` calls:**

   ```typescript
   // Old way
   const response = await makeAuthenticatedRequest("/api/endpoint", {
     method: "POST",
     body: JSON.stringify(data),
   });
   const result = await response.json();

   // New way
   const result = await httpClient.post("/api/endpoint", data);
   ```

2. **Update error handling:**

   ```typescript
   // Old way
   if (response.ok) {
     // handle success
   } else {
     // handle error
   }

   // New way
   try {
     const result = await httpClient.get("/api/endpoint");
     // handle success
   } catch (error) {
     // handle error (notifications are automatic)
   }
   ```

3. **Add notification container to layout:**

   ```typescript
   import NotificationContainer from "@/components/NotificationContainer";

   // Add to your layout
   <NotificationContainer />;
   ```

## Best Practices

### 1. Error Handling

- Always use try-catch blocks with HTTP client
- Let the system handle automatic token refresh
- Use notification system for user feedback

### 2. Authentication State

- Use `useAuth` hook for authentication state
- Don't manually manage tokens
- Trust the automatic logout system

### 3. API Calls

- Use HTTP client methods (get, post, put, patch, delete)
- Don't use raw fetch for authenticated requests
- Let the system handle CSRF tokens

### 4. Notifications

- Use predefined notification helpers when possible
- Provide clear, actionable error messages
- Don't overwhelm users with too many notifications

## Troubleshooting

### Common Issues

1. **Token refresh not working:**

   - Check if refresh token is valid
   - Verify backend token refresh endpoint
   - Check browser console for errors

2. **Notifications not showing:**

   - Ensure NotificationContainer is in layout
   - Check notification manager imports
   - Verify notification permissions

3. **Automatic logout not working:**
   - Check event listener setup in AuthContext
   - Verify HTTP client logout trigger
   - Check browser console for errors

### Debug Mode

Enable debug logging:

```typescript
// In development
localStorage.setItem("debug", "true");
```

This will show detailed logs of:

- Token refresh attempts
- Request/response cycles
- Authentication state changes
- Notification events

## Performance Considerations

### 1. Token Refresh

- Only one refresh request at a time
- Queued requests wait for refresh completion
- Automatic cleanup of failed requests

### 2. Memory Management

- Automatic cleanup of expired tokens
- Event listener cleanup on component unmount
- Notification auto-removal

### 3. Network Optimization

- Request deduplication
- Automatic retry with backoff
- Efficient error handling

## Future Enhancements

### Planned Features

1. **Offline support** with request queuing
2. **Biometric authentication** integration
3. **Multi-factor authentication** support
4. **Advanced session management** with device tracking
5. **Real-time security monitoring**

### Extensibility

The system is designed to be easily extensible:

- Custom notification types
- Additional authentication methods
- Custom error handling strategies
- Integration with external services

## Conclusion

This professional authentication system provides:

- **Seamless user experience** with automatic token refresh
- **Enterprise-grade security** with comprehensive protection
- **Professional error handling** with user feedback
- **Maintainable codebase** with clear separation of concerns
- **Comprehensive testing** with high coverage

The system eliminates the need for manual token management while providing robust security and excellent user experience.
