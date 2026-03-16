# CrimeSpot - Quick Start & Deployment Guide

## 🚀 Quick Start Guide

### Prerequisites
- **Python** 3.8+ ([Download](https://www.python.org/downloads/))
- **Node.js** 16+ ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **MongoDB Atlas Account** (Free tier available: [Sign up](https://www.mongodb.com/cloud/atlas))
- **Expo Go App** (for mobile testing - available on iOS App Store and Google Play)

---

## 📦 Backend Setup

### Step 1: Navigate to Backend Directory
```bash
cd Backend
```

### Step 2: Create Virtual Environment
**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Mac/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

Expected output:
```
Successfully installed bidict-0.23.1 Flask-2.3.3 PyJWT-2.8.0 pymongo-4.15.1 ...
```

### Step 4: Configure MongoDB
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user (remember username & password)
4. Get connection string
5. Open `app.py` and update line 32:
```python
MONGO_URI = "mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/CrimeSpot?retryWrites=true&w=majority"
```

### Step 5: Run Backend Server
```bash
python app.py
```

Expected output:
```
 * Running on http://127.0.0.1:5000
 * Press CTRL+C to quit
```

✅ **Backend is running!** Keep this terminal open.

---

## 🎨 Frontend (Web) Setup

### Step 1: Navigate to Frontend Directory
**In a new terminal:**
```bash
cd Frontend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start Development Server
```bash
npm run dev
```

Expected output:
```
  VITE v5.0.0  ready in 245 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

✅ **Frontend is running!** Open http://localhost:5173 in your browser.

---

## 📱 Mobile (React Native) Setup

### Step 1: Navigate to Mobile Directory
**In a new terminal:**
```bash
cd CrimeSpotMobile
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Backend URL
Open `constants/api.ts` and set your backend URL:

**For Local Development (Android Emulator):**
```typescript
export const BACKEND_URL = 'http://10.0.2.2:5000';  // Android emulator special IP
```

**For Local Development (Physical Device/iOS):**
```typescript
export const BACKEND_URL = 'http://192.168.x.x:5000';  // Your computer's LAN IP
```

To find your computer's IP:
- **Windows:** `ipconfig` → look for "IPv4 Address" under your network
- **Mac/Linux:** `ifconfig` → look for "inet" address

### Step 4: Start Expo Development Server
```bash
npm start
```

Expected output:
```
expo start -- --clear
Starting development server
Expo Dev Client is running at http://localhost:19000
```

### Step 5: Run on Device/Emulator

**Android Emulator:**
```bash
npm run android
```

**iOS Simulator (Mac only):**
```bash
npm run ios
```

**Expo Go (Physical Device):**
1. Install "Expo Go" app from App Store or Play Store
2. Scan QR code shown in terminal
3. App loads in Expo Go

---

## 🧪 Testing the System

### Test 1: User Registration
```bash
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456","role":"user"}'

# Expected: {"message": "User registered successfully"}
```

### Test 2: User Login
```bash
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# Expected: {"token":"eyJhbGc...","role":"user"}
```

### Test 3: Get Crimes (Protected)
```bash
curl -X GET http://localhost:5000/api/crimes \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected: [{...crime data...}]
```

### Test 4: Check Location
```bash
curl -X POST http://localhost:5000/api/check-location \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"lat":40.7128,"lng":-74.0060}'

# Expected: {"alerts":[...]}
```

---

## 📊 Database Setup

### Create Test Data

Connect to MongoDB Atlas and run these operations:

**Insert Test Users:**
```javascript
db.users.insertMany([
  {
    email: "user@example.com",
    password: "$2b$12$...",  // hashed password
    role: "user",
    last_location: { lat: 40.7128, lng: -74.0060, updated_at: new Date() }
  },
  {
    email: "patrol@example.com",
    password: "$2b$12$...",
    role: "patrol",
    last_location: { lat: 40.7150, lng: -74.0070, updated_at: new Date() }
  },
  {
    email: "admin@example.com",
    password: "$2b$12$...",
    role: "admin"
  }
])
```

**Insert Test Crimes:**
```javascript
db.crimes.insertMany([
  {
    location: "5th Avenue, NYC",
    type: "Theft",
    date: "2026-03-09",
    lat: 40.7130,
    lng: -74.0062
  },
  {
    location: "Times Square, NYC",
    type: "Disturbance",
    date: "2026-03-09",
    lat: 40.7580,
    lng: -73.9855
  },
  {
    location: "Central Park, NYC",
    type: "Robbery",
    date: "2026-03-09",
    lat: 40.7829,
    lng: -73.9654
  }
])
```

---

## 🌐 Environment Variables (Optional)

Create `.env` file in `Backend/` for production:

```bash
# Backend/.env
FLASK_ENV=production
SECRET_KEY=your-super-secret-key
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/CrimeSpot
CORS_ORIGINS=https://frontend.example.com,https://another-domain.com
```

Update `app.py`:
```python
import os
from dotenv import load_dotenv

load_dotenv()
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'supersecretjwtkey')
MONGO_URI = os.getenv('MONGO_URI')
```

---

## 🏗️ Deployment

### Option 1: Deploy Backend to Heroku

```bash
# 1. Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# 2. Login to Heroku
heroku login

# 3. Create app
heroku create your-app-name

# 4. Set environment variables
heroku config:set MONGO_URI="your-mongo-uri"
heroku config:set SECRET_KEY="your-secret-key"

# 5. Create Procfile in Backend/
echo "web: gunicorn --worker-class eventlet -w 1 app:app" > Procfile

# 6. Deploy
git push heroku main

# 7. View logs
heroku logs --tail
```

### Option 2: Deploy Backend to Railway

```bash
# 1. Go to railway.app
# 2. Create new project
# 3. Connect your GitHub repo
# 4. Add MongoDB plugin (environment variables auto-set)
# 5. Deploy automatically on push
```

### Option 3: Deploy Backend to Render

```bash
# 1. Go to render.com
# 2. Create new Web Service
# 3. Connect GitHub repo
# 4. Build command: pip install -r requirements.txt
# 5. Start command: gunicorn --worker-class eventlet -w 1 app:app
# 6. Add environment variables
# 7. Deploy
```

### Option 4: Deploy Frontend to Vercel

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy from Frontend directory
cd Frontend
vercel

# 4. Set environment variable:
# VITE_BACKEND_URL=https://your-backend.herokuapp.com
```

### Option 5: Deploy Frontend to Netlify

```bash
# 1. Build
npm run build

# 2. Connect Frontend/dist/ folder to Netlify
# Via GitHub or direct upload

# 3. Set build settings:
# Build command: npm run build
# Publish directory: dist
```

### Option 6: Deploy Mobile to App Stores

**Android (Google Play Store):**
```bash
cd CrimeSpotMobile

# 1. Build APK/AAB
eas build --platform android

# 2. Submit
eas submit --platform android
```

**iOS (Apple App Store):**
```bash
# Requires Apple Developer account
eas build --platform ios
eas submit --platform ios
```

---

## 🔧 Troubleshooting

### Issue: Backend won't start
```
ModuleNotFoundError: No module named 'flask'
```
**Solution:**
```bash
# Ensure venv is activated
# Windows:
venv\Scripts\activate
# or
pip install -r requirements.txt  # Install dependencies
```

### Issue: MongoDB connection fails
```
ServerSelectionTimeoutError: No suitable servers found
```
**Solution:**
- Check MongoDB Atlas connection string is correct
- Ensure IP address is whitelisted in MongoDB Atlas (Security → Network Access)
- Try using: `mongodb+srv://` (not `mongodb://`)

### Issue: CORS error when connecting from frontend
```
Access to XMLHttpRequest blocked by CORS policy
```
**Solution:**
```python
# Update in Backend/app.py
CORS(app, supports_credentials=True, 
     origins=["http://localhost:5173", "https://yourdomain.com"])
```

### Issue: Socket.IO connection fails
```
WebSocketError: Connection closed prematurely
```
**Solution:**
- Ensure both backend and frontend use same Socket.IO version
- Check firewall isn't blocking WebSocket connections
- Use `polling` fallback:
```typescript
import io from 'socket.io-client';
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
});
```

### Issue: Mobile can't connect to backend
```
Network request failed
```
**Solution:**
```typescript
// Check IP in constants/api.ts
// For Android emulator: http://10.0.2.2:5000
// For physical device: http://192.168.x.x:5000
// Get your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
```

### Issue: JWT token expired
```
Token is invalid!
```
**Solution:**
- Tokens expire after 12 hours
- User must login again
- Or implement refresh tokens (future enhancement)

---

## 📈 Performance Tuning

### Backend
```python
# app.py optimizations

# 1. Add MongoDB indexes
from pymongo import ASCENDING, DESCENDING
users_col.create_index("email", unique=True)
crimes_col.create_index([("lat", ASCENDING), ("lng", ASCENDING)])
alerts_col.create_index([("status", ASCENDING), ("user", ASCENDING)])

# 2. Cache frequent queries (Redis)
import redis
cache = redis.Redis(host='localhost', port=6379)

# 3. Use connection pooling
# Already handled by pymongo MongoClient
```

### Frontend
```javascript
// React best practices

// 1. Code split routes
import React, { lazy, Suspense } from 'react'
const Dashboard = lazy(() => import('./pages/Dashboard'))

// 2. Memoize expensive components
export default React.memo(MyComponent)

// 3. Use useCallback for event handlers
const handleClick = useCallback(() => { ... }, [])

// 4. Virtualize long lists
import { FixedSizeList } from 'react-window'
```

### Mobile
```typescript
// React Native optimizations

// 1. Limit location updates
LocationUpdatesInterval = 30000  // 30 seconds instead of 5

// 2. Use background tasks wisely
// Use ExpoBackgroundFetch for non-critical tasks only

// 3. Batch API requests
// Group multiple updates into one request

// 4. Cache location data locally
import AsyncStorage from '@react-native-async-storage/async-storage'
```

---

## ✅ Pre-Launch Checklist

- [ ] All three services running without errors
- [ ] Backend: `http://localhost:5000` responds
- [ ] Frontend: `http://localhost:5173` loads
- [ ] Mobile: Connects via Expo Go
- [ ] MongoDB connection tested
- [ ] Users can register successfully
- [ ] Users can login and receive JWT tokens
- [ ] Crime list displays correctly
- [ ] Location tracking works (shows alerts when near crimes)
- [ ] Patrol app receives real-time alerts via Socket.IO
- [ ] Alerts marked as "handled" update across all clients
- [ ] admin role can delete crimes and alerts
- [ ] No console errors in any app
- [ ] Network requests show in browser DevTools
- [ ] Socket.IO events visible in browser DevTools

---

## 📞 Support Resources

| Resource | Link |
|----------|------|
| Flask Documentation | https://flask.palletsprojects.com/ |
| React Documentation | https://react.dev/ |
| React Native Docs | https://reactnative.dev/ |
| Expo Documentation | https://docs.expo.dev/ |
| MongoDB Docs | https://docs.mongodb.com/ |
| Socket.IO Docs | https://socket.io/docs/ |
| JWT Best Practices | https://tools.ietf.org/html/rfc7519 |

---

**Last Updated**: March 9, 2026  
**Version**: 1.0  
**Status**: Ready for Deployment
