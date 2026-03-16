# CrimeSpot - Technical Stack & Workflow Report

**Project Overview**: CrimeSpot is a comprehensive crime detection and reporting system with real-time alerts, featuring web and mobile platforms for users, patrol officers, and administrators.

---

## 📋 Table of Contents
1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Workflow & Data Flow](#workflow--data-flow)
5. [API Endpoints](#api-endpoints)
6. [Real-time Communication](#real-time-communication)
7. [Authentication & Authorization](#authentication--authorization)
8. [Installation & Setup](#installation--setup)
9. [Deployment](#deployment)
10. [Project Structure](#project-structure)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CrimeSpot System                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐   ┌─────────────┐   │
│  │   Web Frontend   │    │  Mobile Frontend │   │   Admin UI  │   │
│  │   (React/Vite)   │    │  (Expo/RN/TS)    │   │  (React)    │   │
│  └─────────┬────────┘    └────────┬─────────┘   └──────┬──────┘   │
│            │                      │                     │          │
│            └──────────────────────┼─────────────────────┘          │
│                   REST API + WebSocket (Socket.IO)                 │
│                           │                                         │
│  ┌────────────────────────▼──────────────────────────┐             │
│  │      Flask Backend (Python)                       │             │
│  │  - JWT Authentication                             │             │
│  │  - Role-based Access Control (RBAC)              │             │
│  │  - Crime Zone Detection (Haversine algorithm)     │             │
│  │  - Real-time Alert System                        │             │
│  │  - Location Tracking                             │             │
│  └────────────────────────┬──────────────────────────┘             │
│                           │                                         │
│                  MongoDB Atlas (Cloud)                             │
│                           │                                         │
│  ┌────────────────────────▼──────────────────────────┐             │
│  │   Collections:                                    │             │
│  │   - users (roles: user, patrol, admin)           │             │
│  │   - crimes (crime reports)                       │             │
│  │   - alerts (active/handled)                      │             │
│  └─────────────────────────────────────────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Backend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Flask | 2.3.3 | REST API & Web framework |
| **Real-time** | Flask-SocketIO | 5.5.1 | WebSocket communication |
| **Database** | MongoDB | 4.15.1 | NoSQL database driver |
| **Authentication** | PyJWT | 2.8.0 | JWT token generation/validation |
| **Async** | Eventlet | 0.40.4 | Green thread-based async I/O |
| **CORS** | Flask-CORS | 4.0.1 | Cross-Origin Resource Sharing |
| **Password** | Werkzeug | 3.1.3 | Secure password hashing |
| **Deployment** | Gunicorn | 23.0.0 | WSGI HTTP server |

### Frontend (Web)
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | React | 18.2.0 | UI library |
| **Build Tool** | Vite | 5.0.0 | Fast development server & bundler |
| **Routing** | React Router DOM | 6.22.3 | Client-side routing |
| **HTTP Client** | Axios | 1.12.2 | REST API calls |
| **Styling** | Tailwind CSS | 3.3.3 | Utility-first CSS framework |
| **Maps** | Leaflet + React-Leaflet | 1.9.4 + 4.2.1 | Interactive mapping |
| **Real-time** | Socket.IO Client | 4.8.1 | WebSocket client |

### Mobile (React Native/Expo)
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | React Native | 0.81.5 | Cross-platform mobile UI |
| **Platform** | Expo | ~54.0.32 | Development & deployment platform |
| **Router** | Expo Router | ~6.0.22 | File-based routing |
| **Language** | TypeScript | ~5.9.2 | Static type checking |
| **HTTP Client** | Axios | 1.13.2 | REST API calls |
| **Real-time** | Socket.IO Client | 4.8.3 | WebSocket client |
| **Location** | Expo Location | ~19.0.8 | GPS location service |
| **Background** | Expo Background Fetch | ~14.0.9 | Background task runner |
| **Notifications** | Expo Notifications | ~0.32.16 | Push notifications |
| **Secure Storage** | Expo Secure Store | ~15.0.8 | Credential storage |

### Database
| Service | Type | Provider |
|---------|------|----------|
| **MongoDB** | NoSQL Database | MongoDB Atlas (Cloud) |
| **Connection** | URI | `mongodb+srv://...` (Secured with TLS) |

---

## 🗄️ Database Schema

### Collections

#### 1. **users**
```json
{
  "_id": ObjectId,
  "email": "string (unique)",
  "password": "string (hashed)",
  "role": "enum: ['user', 'patrol', 'admin']",
  "last_location": {
    "lat": "float",
    "lng": "float",
    "updated_at": "ISO string"
  }
}
```

#### 2. **crimes**
```json
{
  "_id": ObjectId,
  "location": "string",
  "type": "string (Murder, Rape, Theft, etc.)",
  "date": "string",
  "lat": "float",
  "lng": "float",
  "created_at": "ISO string (optional)"
}
```

#### 3. **alerts**
```json
{
  "_id": ObjectId,
  "type": "enum: ['auto_crime_zone_detection', 'mobile_auto_detection', 'user_alert']",
  "user": "string (email)",
  "user_role": "string",
  "crime_type": "string",
  "location": "string",
  "message": "string",
  "user_lat": "float",
  "user_lng": "float",
  "crime_lat": "float",
  "crime_lng": "float",
  "distance_km": "float",
  "detected_at": "ISO string",
  "status": "enum: ['active', 'handled']",
  "assigned_patrols": ["array of emails"],
  "zone_key": "string (for deduplication)",
  "handled_by": "string (email, optional)",
  "handled_at": "ISO string (optional)",
  "created_at": "ISO string"
}
```

---

## 🔄 Workflow & Data Flow

### 1. **User Registration & Authentication**

```
User Input → POST /register
  ↓
Backend: Hash password (Werkzeug)
  ↓
Save to DB (users collection)
  ↓
Response: "User registered successfully"

─────────────────────────────────

User Login → POST /login
  ↓
Backend: Verify email & check password
  ↓
Generate JWT Token (PyJWT, 12-hour expiry)
  ↓
Response: { token, role }
  ↓
Frontend: Store in localStorage
  ↓
Attach to all subsequent requests as Bearer token
```

### 2. **Location-Based Crime Detection (Mobile)**

```
Mobile App: GPS Location Update
  ↓
POST /api/mobile/location { lat, lng }
  ↓
Backend:
  1. Save user's last_location
  2. Haversine Algorithm: Check crimes within 1km radius
  3. For each detected crime:
     - Check if alert exists for this user+zone
     - If new: Create alert, emit via Socket.IO
     - If exists: Update only (no duplicate alerts)
  4. Find nearest patrol officers (max 2, within 10km)
  ↓
MongoDB: Insert/Update alerts collection
  ↓
Socket.IO: Emit 'crime_zone_alert' to patrols
  ↓
Response: { alert, message, alerts[] }
```

### 3. **Crime Zone Alert System**

```
┌─────────────────────────────────────────┐
│  Crime Zone Detected (>= 1 crime)       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Generate Payload:                      │
│  - _id, user, crime_type                │
│  - location, lat, lng                   │
│  - message, distance_km                 │
│  - assigned_patrols                     │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
  MongoDB       Socket.IO
  Insert        Emit to:
  Alert         - 'patrols' room
                - Individual patrol rooms
                - 'admins' room (optional)
```

### 4. **Patrol Officer Alert Handling**

```
Patrol App: Receives crime_zone_alert via Socket.IO
  ↓
Display Alert with:
- Crime location (map marker)
- Distance to user
- User coordinates
- Crime type
- "Mark as Handled" button
  ↓
Patrol clicks "Mark as Handled"
  ↓
PUT /api/alert/{alertId}/mark-handled
  ↓
Backend:
  - Update alert status: 'handled'
  - Set handled_by, handled_at
  ↓
Socket.IO: Broadcast 'alert_handled' to all clients
  ↓
All clients: Remove or gray out the alert
```

### 5. **User Manual Alert Reporting**

```
User clicks "Report Crime"
  ↓
Enter: location, message, type
  ↓
POST /api/alert { location, message, type, lat, lng }
  ↓
Backend:
  1. Create payload matching crime_zone_alert structure
  2. Insert into alerts collection
  3. Emit 'crime_zone_alert' to:
     - All patrols
     - All admins
     - All users (awareness)
  ↓
Patrols see alert and can respond
```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| POST | `/register` | ❌ | - | Register new account |
| POST | `/login` | ❌ | - | Login & get JWT token |

### Users
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/api/users` | ✅ JWT | admin | Fetch all users |

### Crimes
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/api/crimes` | ✅ JWT | all | Fetch all crime reports |
| POST | `/api/crimes` | ✅ JWT | admin, patrol | Add crime report |
| DELETE | `/api/crimes/<location>` | ✅ JWT | admin, patrol | Delete crime report |

### Location & Detection
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| POST | `/api/check-location` | ✅ JWT | all | Check if in crime zone (no update) |
| POST | `/api/location/update` | ✅ JWT | all | Update location (web) |
| POST | `/api/mobile/location` | ✅ JWT | all | Update location (mobile, deduplication) |

### Alerts
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/api/alerts/active` | ✅ JWT | all | Fetch unhandled alerts |
| POST | `/api/alert` | ✅ JWT | all | Report new alert |
| PUT | `/api/alert/<alertId>/mark-handled` | ✅ JWT | patrol | Mark alert as handled |
| DELETE | `/api/alerts/<alertId>` | ✅ JWT | admin | Delete alert |

**Note**: All POST/PUT/DELETE require JWT token in `Authorization: Bearer <token>` header

---

## 📡 Real-time Communication

### Socket.IO Events

#### Client → Server (Connect)
```javascript
// Connect with token
socket.emit('connect', { token: jwtToken })

// Join room on successful connection
// Automatically handled by backend
```

#### Server → Client (Broadcast)

| Event | Payload | Rooms |
|-------|---------|-------|
| `crime_zone_alert` | Alert payload (see schema) | patrols, admins, users |
| `alert_handled` | `{ alert_id, handled_by, handled_at }` | patrols |
| `alert_deleted` | `{ alert_id, deleted_by }` | patrols |

#### Room Management
```
Patrol Officer:
  ↓
Joined Rooms:
  - 'patrols' (broadcasts to all patrols)
  - 'patrol_<email>' (direct alerts based on distance)

Admin User:
  ↓
Joined Rooms:
  - 'admins' (admin-specific broadcasts)

Regular User:
  ↓
Joined Rooms:
  - 'users' (user awareness alerts)
```

---

## 🔐 Authentication & Authorization

### JWT Token Structure
```
Header: { typ: "JWT", alg: "HS256" }
Payload: { email: "user@example.com", exp: <12 hours from now> }
Secret: "supersecretjwtkey" (from app.config['SECRET_KEY'])
```

### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| **user** | - View crimes<br>- Report alerts<br>- Check own location<br>- Receive alerts |
| **patrol** | - View crimes<br>- Add/delete crimes<br>- Mark alerts as handled<br>- Receive crime alerts<br>- Receive distance-based alerts |
| **admin** | - View all users<br>- Add/delete crimes<br>- Delete alerts<br>- All patrol permissions |

### Decorators
```python
@token_required      # Verifies JWT token exists & valid
@role_required([...]) # Verifies user role is in list
```

---

## 🚀 Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js 16+ (for Frontend & Mobile)
- MongoDB Atlas account (free tier)
- Expo Go app (for mobile testing)

### Backend Setup
```bash
# Navigate to backend
cd Backend

# Create virtual environment
python -m venv venv

# Activate venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
python app.py
# Runs on http://127.0.0.1:5000
```

### Frontend Setup
```bash
# Navigate to frontend
cd Frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# Runs on http://localhost:5173 (default Vite port)

# Build for production
npm run build
```

### Mobile Setup
```bash
# Navigate to mobile
cd CrimeSpotMobile

# Install dependencies
npm install

# Start Expo dev server
npm start

# For Android emulator
npm run android

# For iOS simulator (Mac only)
npm run ios

# For web version
npm run web
```

### Database Configuration

1. Create MongoDB Atlas account: https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create a database user with read/write permissions
4. Get connection string: `mongodb+srv://user:password@cluster.mongodbnet/...`
5. Update in [Backend/app.py](Backend/app.py):
   ```python
   MONGO_URI = "your-connection-string"
   ```

### Environment Configuration

**Mobile Backend URL** ([CrimeSpotMobile/constants/api.ts](CrimeSpotMobile/constants/api.ts)):
```typescript
// Update for your local/production backend
export const BACKEND_URL = 'http://192.168.1.5:5000';
```

For different environments:
- **Local Development**: `http://localhost:5000` (web) or `http://192.168.x.x:5000` (mobile on LAN)
- **Production**: Your deployed backend URL

---

## 🌐 Deployment

### Backend Deployment (Heroku/Railway/Render)

```bash
# Install Gunicorn (already in requirements.txt)
# Create Procfile
echo "web: gunicorn --worker-class eventlet -w 1 app:app" > Procfile

# Deploy to Heroku
heroku create your-app-name
git push heroku main
```

### Frontend Deployment (Vercel/Netlify)

```bash
# Build
npm run build

# Deploy dist/ folder to Vercel/Netlify
# Or push to GitHub and connect repository
```

### Mobile Deployment (EAS Build)

```bash
# Build for Android
eas build --platform android

# Build for iOS (requires Apple Developer account)
eas build --platform ios

# Submit to app stores
eas submit --platform android
```

---

## 📁 Project Structure

```
CrimeSpot/
├── Backend/
│   ├── app.py                    # Main Flask application
│   ├── requirements.txt          # Python dependencies
│   ├── README.md                 # Backend documentation
│   └── .venv/                    # Virtual environment
│
├── Frontend/
│   ├── src/
│   │   ├── App.jsx               # Main router component
│   │   ├── main.jsx              # Entry point
│   │   ├── index.css             # Global styles
│   │   ├── components/
│   │   │   ├── AddCrimeForm.jsx  # Crime reporting form
│   │   │   └── CrimeList.jsx     # Display crimes
│   │   ├── pages/
│   │   │   ├── Login.jsx         # Login page
│   │   │   ├── Register.jsx      # Registration page
│   │   │   ├── Dashboard.jsx     # User/Admin dashboard
│   │   │   └── PatrolDashboard.jsx # Patrol dashboard
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Auth state management
│   │   └── services/
│   │       ├── api.js            # Axios API client
│   │       └── auth.js           # Auth helpers
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── README.md
│
├── CrimeSpotMobile/
│   ├── app/                      # Route-based screens (Expo Router)
│   │   ├── _layout.tsx           # Root layout
│   │   ├── index.tsx             # Home screen
│   │   ├── login.tsx             # Login screen
│   │   ├── home.tsx              # User home
│   │   ├── admin/
│   │   │   └── dashboard.tsx     # Admin dashboard
│   │   ├── patrol/
│   │   │   └── dashboard.tsx     # Patrol dashboard
│   │   └── user/
│   │       └── home.tsx          # User home
│   ├── components/               # Reusable components
│   ├── constants/
│   │   ├── api.ts                # API endpoints & backend URL
│   │   └── theme.ts              # Color scheme
│   ├── hooks/                    # Custom React hooks
│   ├── services/
│   │   ├── auth.ts               # Authentication logic
│   │   ├── socket.ts             # Socket.IO setup
│   │   └── background-location.ts # Background tracking
│   ├── package.json
│   ├── app.json                  # Expo config
│   ├── tsconfig.json
│   └── README.md
│
├── TECHNICAL_STACK_REPORT.md     # This file
└── README.md                      # Project overview
```

---

## 🔄 Request/Response Flow Examples

### Example 1: User Login & Location Check

```
1. User submits login form
   POST /login
   Body: { email, password }
   
2. Backend validates credentials
   Response: { token: "jwt_token_here", role: "user" }
   
3. Frontend stores token in localStorage
   
4. Frontend updates location
   POST /api/mobile/location
   Headers: { Authorization: "Bearer jwt_token_here" }
   Body: { lat: 40.7128, lng: -74.0060 }
   
5. Backend checks crime zones
   - Queries all crimes in database
   - Calculates distance using Haversine
   - Returns nearby crimes
   
6. Response: { alert: true, alerts: [...], message: "..." }
```

### Example 2: Patrol Receives Alert

```
1. User detects crime zone
   Alert created in MongoDB
   
2. Socket.IO emits 'crime_zone_alert'
   Payload includes:
   - User email
   - Crime location & coordinates
   - Distance from patrol
   - Alert message
   
3. Patrol app receives event
   - Updates UI with new alert
   - Shows map marker
   - Plays notification sound
   
4. Patrol clicks "Mark as Handled"
   PUT /api/alert/63f7abc123/mark-handled
   Headers: { Authorization: "Bearer ..." }
   
5. Backend updates alert status
   Response: { message: "Alert marked as handled" }
   
6. Socket.IO broadcasts 'alert_handled'
   All patrols remove this alert from display
```

---

## 📊 Key Algorithms

### Haversine Distance Calculation
Calculates great-circle distance between two lat/lng coordinates:

```python
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)² + cos(lat1) × cos(lat2) × sin(dlon/2)²
    c = 2 × atan2(√a, √(1-a))
    return R × c
```

### Crime Zone Detection
- Radius: 1.0 km (configurable)
- Check: User's current location vs all crimes
- Return: All crimes within radius with calculated distances
- Nighttime filtering: Optional (20:00-05:00 UTC)

### Alert Deduplication (Mobile)
- Generate zone_key: `f"{round(lat,5)}-{round(lng,5)}"`
- Check: Query alerts where `zone_key` matches & status='active'
- If exists: Update only (prevents spam)
- If new: Create alert & emit socket event

---

## ✅ Testing Checklist

- [ ] Backend starts without errors
- [ ] MongoDB connection successful
- [ ] JWT tokens generated & verified
- [ ] CORS enabled for frontend URL
- [ ] Socket.IO connections established
- [ ] Haversine distance calculations accurate
- [ ] Role-based access control working
- [ ] Alert deduplication preventing spam
- [ ] Nearest patrol detection accurate
- [ ] Frontend receives real-time alerts
- [ ] Mobile app connects to backend
- [ ] Location updates save correctly
- [ ] Alerts persist in MongoDB
- [ ] Admin can view all users/alerts

---

## 📝 Notes for Report Generation

This technical stack means:

1. **Full-featured real-time system** - WebSocket + REST API combo
2. **Cross-platform support** - Web, Android, iOS from single codebase
3. **Scalable architecture** - Microservices ready, async processing
4. **Modern tech stack** - TypeScript/React/Expo for type safety
5. **Cloud-first** - MongoDB Atlas, works on any device worldwide
6. **Enterprise-ready** - JWT auth, RBAC, error handling

---

**Generated**: March 9, 2026  
**Project**: CrimeSpot  
**Status**: Active Development
