# Backend URL Configuration Guide

## Overview
All backend API calls in the mobile app now use a **single centralized configuration file**. This means you only need to change the URL in ONE place instead of multiple files across the codebase.

## Location of Configuration
📁 **File:** `constants/api.ts`

## How to Change the Backend URL

### Step 1: Open the Configuration File
Navigate to: `CrimeSpotMobile/constants/api.ts`

### Step 2: Update the URL
Find this line:
```typescript
export const BACKEND_URL = 'http://192.168.0.142:5000';
```

Replace it with your new backend URL. Examples:
```typescript
// For a different network/machine
export const BACKEND_URL = 'http://192.168.1.100:5000';

// For a domain
export const BACKEND_URL = 'https://api.crimespot.com';

// For localhost with a different port
export const BACKEND_URL = 'http://localhost:8000';
```

### Step 3: That's It! 🎉
All API calls throughout the entire mobile app will automatically use the new URL.

## What Gets Updated
All the following will automatically use your new `BACKEND_URL`:
- Socket.IO connections
- Authentication endpoints (login, register)
- Location tracking API calls
- Crime data management
- Alert management
- Mobile-specific endpoints

## Files Using This Configuration
The following files automatically import and use the centralized URL:
- `services/socket.ts` - WebSocket connections
- `services/background-location.ts` - Location tracking
- `app/login.tsx` - Login screen
- `app/home.tsx` - Home screen location
- `app/patrol/dashboard.tsx` - Patrol dashboard

## Before (Old Way - Multiple URLs)
```typescript
// services/socket.ts
const SOCKET_URL = "http://192.168.0.142:5000";

// services/background-location.ts
const API_URL = 'http://192.168.1.5:5000';

// app/login.tsx
const API_URL = 'http://192.168.0.142:5000';

// etc... (needed to update each file separately)
```

## After (New Way - Single Configuration)
```typescript
// constants/api.ts (ONLY place to change)
export const BACKEND_URL = 'http://YOUR_NEW_URL:5000';

// All files import and use this automatically
import { BACKEND_URL, API_ENDPOINTS } from '@/constants/api';
```

## API Endpoints Available
The configuration file also exports predefined endpoints:
```typescript
API_ENDPOINTS.LOGIN
API_ENDPOINTS.REGISTER
API_ENDPOINTS.MOBILE_LOCATION
API_ENDPOINTS.UPDATE_LOCATION
API_ENDPOINTS.CHECK_LOCATION
API_ENDPOINTS.CRIMES
API_ENDPOINTS.CRIME_DELETE(location)
API_ENDPOINTS.ALERTS_ACTIVE
API_ENDPOINTS.ALERT_CREATE
API_ENDPOINTS.ALERT_MARK_HANDLED(alertId)
API_ENDPOINTS.ALERT_DELETE(alertId)
API_ENDPOINTS.USERS
```

## Example Use Cases

### Scenario 1: Network Switch
**Situation:** You're moving from office WiFi to home WiFi with a different machine IP.

**Before:** Update 5+ files
**After:** Update one line in `constants/api.ts`

### Scenario 2: Production Deployment
**Situation:** Deploy from localhost to production domain.

```typescript
// Development
export const BACKEND_URL = 'http://localhost:5000';

// Production
export const BACKEND_URL = 'https://api.crimespot.com';
```

### Scenario 3: Different Port
**Situation:** Backend running on different port.
```typescript
export const BACKEND_URL = 'http://192.168.0.142:8000';
```

## Best Practices
1. ✅ Always update `constants/api.ts` for URL changes
2. ✅ Never hardcode URLs in component files
3. ✅ Use `API_ENDPOINTS` for standard routes
4. ✅ Keep the backend URL environment-appropriate

## Troubleshooting

### App can't connect to backend
- Verify the URL in `constants/api.ts`
- Ensure backend is running on the specified port
- Check network connectivity between device/emulator and backend machine

### Intermittent connection issues
- Make sure the IP is stable on your network
- Consider using a domain name if available
- Check firewall settings allowing the port

---

**Summary:** Change just one line in `constants/api.ts` and all backend calls update automatically! 🚀
