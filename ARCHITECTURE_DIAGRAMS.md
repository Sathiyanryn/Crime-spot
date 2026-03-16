# CrimeSpot - Architecture & System Diagrams

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CrimeSpot Full System                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                              CLIENT LAYER                                        │
│  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐  │
│  │   WEB FRONTEND   │        │  MOBILE APP      │        │   WEB ADMIN      │  │
│  │  (React/Vite)    │        │  (React Native)  │        │   (React/Vite)   │  │
│  │  - Dashboard     │        │  - Live Maps     │        │  - User Mgmt     │  │
│  │  - Crime List    │        │  - GPS Tracking  │        │  - Report View   │  │
│  │  - User/Admin    │        │  - Alerts        │        │  - Stats         │  │
│  │    Panels        │        │  - Background    │        │                  │  │
│  │  - Leaflet Maps  │        │    Location      │        │  - Patrol Mgmt   │  │
│  └────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘  │
│           │                           │                           │             │
│           └───────────────────────────┼───────────────────────────┘             │
│                    HTTP + WebSocket (Socket.IO)                                 │
│                         (JWT Authentication)                                    │
│                           │                  │                                 │
│                      ┌─────▼──────┐   ┌──────▼──────┐                         │
│                      │   REST API  │   │  WebSocket │                         │
│                      │   (HTTP)    │   │  (WS/SSL)  │                         │
│                      └─────▲──────┘   └──────▲──────┘                         │
│                            │                  │                                │
│                            └──────────────────┴────┐                          │
│                                                    │                          │
│                     ┌────────────────────────────┐│                          │
│                     │    APPLICATION LAYER      ││                          │
│                     │    Flask Backend          ││                          │
│                     ├────────────────────────────┤│                          │
│                     │ - Authentication (JWT)    │◄┘                          │
│                     │ - Authorization (RBAC)    │                            │
│                     │ - Route Handlers          │                            │
│                     │ - Business Logic          │                            │
│                     │ - Socket.IO Events        │                            │
│                     │ - Haversine Algorithm     │                            │
│                     │ - Alert System            │                            │
│                     │ - Location Tracking       │                            │
│                     │ - Crime Detection         │                            │
│                     └──────────┬─────────────────┘                            │
│                                │                                              │
│                                │ PyMongo Driver                               │
│                    ┌───────────▼────────┐                                     │
│                    │  DATABASE LAYER    │                                     │
│                    │  MongoDB Atlas     │                                     │
│                    ├────────────────────┤                                     │
│                    │ Collections:       │                                     │
│                    │ - users            │                                     │
│                    │ - crimes           │                                     │
│                    │ - alerts           │                                     │
│                    └────────────────────┘                                     │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
    Production Deployment: Heroku/Railway/etc + MongoDB Atlas (Cloud)
```

---

## Multi-Client Real-Time Communication

```
                    Socket.IO Event Flow
                    
┌─────────────────────────────────────────────────────────────────┐
│                    Connected Clients                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User App (jwt_user)    Patrol App (jwt_patrol)   Admin App     │
│  └─────────┬──────────┐ └─────────┬──────────┐   └────┬─────┘  │
│            │ Socket   │           │ Socket   │        │ Socket   │
│            │ .emit()  │           │ .emit()  │        │ .emit()  │
│            │          │           │          │        │          │
│   ┌────────▼──────────▼───────────▼──────────▼────────▼────────┐ │
│   │   Flask-SocketIO  (Eventlet Async)                         │ │
│   │   - Connection Handler                                     │ │
│   │   - Room Management                                        │ │
│   │   - Broadcast Events                                       │ │
│   └────────────────────────────────────────────────────────────┘ │
│            │                      │                  │            │
│   ┌────────▼──────────────┐  ┌───▼──────────────┐  ┌▼──────────┐ │
│   │  Room: 'users'        │  │  Room: 'patrols' │  │ Room:    │ │
│   │  - User apps          │  │  - Patrol apps   │  │ 'admins' │ │
│   │  Broadcasts:          │  │  - All patrols   │  │ - Admin  │ │
│   │  - crime_zone_alert   │  │  Broadcasts:     │  │   apps   │ │
│   │  - alert_handled      │  │  - crime_zone    │  │          │ │
│   │                       │  │    _alert        │  │          │ │
│   └─────────────────────┬─┘  │  - alert_handled │  └────────┬─┘  │
│                         │    │  - alert_deleted │         │      │
│               ┌─────────┴────┤  (specific:      │         │      │
│               │              │   patrol_<email>)│         │      │
│    ─────────▼─────────      └────┬─────────────┘         │      │
│   Events sent to all              │                      │      │
│   user app instances         Events sent to all      Events    │
│                            patrol instances        sent to    │
│                                                   admins     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Crime Detection to Alert

```
CYCLE 1: User Location Update
─────────────────────────────

1. Mobile App                2. Backend              3. Database        4. Socket.IO
   POST /api/mobile/           
   location                    
   {lat, lng}
      │
      │ JWT Auth
      ├─────────────────────►  Validate Token
      │                           │
      │                           ├─► Check Crime Database
      │                           │   (haversine distance)
      │                           │
      │                           ├─────────────────────►  Find crimes
      │                        MongoDB Query                within 1km
      │                           │
      │                        Process Alerts
      │                           ├─► Check for existing
      │                           │   zone_key alerts
      │                           │
      │                           ├─► If new:
      │                           │   - Assign patrols
      │                           │   - Create entry
      │                           ├─────────────────────►  alerts
      │                           │                        collection
      │                           │
      │                           ├─► Emit events
      │                           ├─────────────────────►  Broadcast to
      │                        Broadcast Alert              patrol rooms
      │                           │
      │◄──────────────────────────┤
      │ Response
      │ {alert, alerts[]}
      │ + Socket Event received


CYCLE 2: Patrol Response
─────────────────────────

1. Patrol App              2. Backend             3. Database        4. Socket.IO
   Receives 
   crime_zone_alert
   via Socket.IO
      │
      │ Display Alert
      │ - Show Map
      │ - Show Distance
      │ - "Mark Handled"
      │   Button
      │
      │ Clicks Button
      │ PUT /api/alert/id/
      │ mark-handled
      │      │
      │      │ JWT Auth
      │      ├─────────────────► Update Alert
      │      │                      │
      │      │                      ├──────────────────► Update 'alerts'
      │      │                   MongoDB Update collection
      │      │                      │
      │      │                      ├─► Emit 'alert_handled'
      │      │                      ├──────────────────► Broadcast to
      │      │                   All patrols           all clients
      │      │
      │◄─────┤
      │ Response: {message}
      │
   Hide Alert
   (all other
   apps too)
```

---

## Authentication & Authorization Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER REGISTRATION                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Input: email, password, role (optional)                         │
│                                                                  │
│ 1. POST /register                                               │
│    ├─ Receive JSON payload                                      │
│    ├─ Check if user exists (queries DB)                        │
│    ├─ If exists → 400 "User already exists"                    │
│    ├─ Hash password with Werkzeug                              │
│    └─ Insert into users collection                             │
│       {email, password_hash, role}                             │
│                                                                  │
│ Output: {"message": "User registered successfully"}             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      USER LOGIN                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Input: email, password                                           │
│                                                                  │
│ 1. POST /login                                                  │
│    ├─ Receive JSON payload                                      │
│    ├─ Query users collection by email                          │
│    ├─ If not found → 401 "Invalid credentials"                │
│    ├─ Check password hash (Werkzeug.check_password_hash)       │
│    ├─ If mismatch → 401 "Invalid credentials"                 │
│    │                                                            │
│    └─ Generate JWT Token                                        │
│       ├─ Payload: {email, exp: now + 12h}                      │
│       ├─ Secret: app.config['SECRET_KEY']                      │
│       ├─ Algorithm: HS256                                       │
│       └─ Return: {token, role}                                 │
│                                                                  │
│ 2. Frontend Stores Token                                        │
│    └─ localStorage.setItem('token', token)                     │
│                                                                  │
│ 3. Attach to All Requests                                       │
│    └─ Headers: Authorization: Bearer <token>                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│             REQUEST WITH TOKEN VERIFICATION                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Incoming Request                                                 │
│ Headers: GET /api/crimes                                        │
│          Authorization: Bearer eyJhbGc...                       │
│                                                                  │
│ @token_required Decorator:                                      │
│ ├─ Extract token from Authorization header                     │
│ ├─ Parse "Bearer <token>"                                      │
│ ├─ Decode JWT (verify signature)                               │
│ │  └─ If invalid → 401 "Token is invalid!"                    │
│ │  └─ If expired → 401 "Token is invalid!"                    │
│ ├─ Extract email from decoded payload                          │
│ └─ Query users collection by email                             │
│    └─ If not found → 404 "User not found!"                    │
│                                                                  │
│ Pass current_user to route handler                             │
│ └─ Route executes with user context                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│           ROLE-BASED ACCESS CONTROL (RBAC)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ @role_required(['admin', 'patrol'])                            │
│ ├─ Check current_user.role                                     │
│ ├─ If role NOT in allowed list → 403 "Access denied"         │
│ └─ If role matches → Continue to route handler                │
│                                                                  │
│ Roles:                                                           │
│ ├─ 'user': Public citizen                                      │
│ ├─ 'patrol': Police/Security officer                            │
│ └─ 'admin': System administrator                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database Query Patterns

```
PATTERN 1: User Authentication
─────────────────────────────

users_col.find_one({'email': data['email']})
  │
  └─ Returns: {_id, email, password_hash, role, last_location}


PATTERN 2: Crime Zone Detection
─────────────────────────────

crimes_col.find({})  # Get all crimes
  │
  ├─ For each crime:
  │  │
  │  ├─ Extract coordinates (lat, lng)
  │  │
  │  ├─ Calculate distance using Haversine
  │  │
  │  ├─ If distance <= 1km:
  │  │  └─ Add to notifications list
  │  │
  │  └─ Return: [crimes within radius + distance]
  │
  └─ Returns: [
       {location, type, lat, lng, distance_km},
       ...
     ]


PATTERN 3: Alert Deduplication
───────────────────────────────

zone_key = f"{round(lat, 5)}-{round(lng, 5)}"

alerts_col.find_one({
  'user': email,
  'zone_key': zone_key,
  'status': 'active'
})
  │
  ├─ If exists:
  │  │
  │  └─ alerts_col.update_one(
  │     {_id: alert._id},
  │     {$set: {
  │       user_lat, user_lng,
  │       distance_km,
  │       updated_at
  │     }}
  │     )
  │       └─ SUCCESS: Update only (no Socket.IO emit)
  │
  └─ If not exists:
     │
     └─ alerts_col.insert_one({
        _id, user, crime_type,
        location, message,
        user_lat, user_lng,
        distance_km, status,
        zone_key, assigned_patrols,
        created_at
        })
        └─ Then Socket.IO emit


PATTERN 4: Active Alerts Query
──────────────────────────────

alerts_col.find({'status': {'$ne': 'handled'}})
          .sort('detected_at', -1)
          .limit(100)
  │
  └─ Returns: [
       {_id, user, crime_type, location, message,
        user_lat, user_lng, crime_lat, crime_lng,
        distance_km, detected_at, status, 
        assigned_patrols, ...},
       ...
     ]


PATTERN 5: Mark Alert as Handled
────────────────────────────────

alerts_col.update_one(
  {_id: ObjectId(alert_id)},
  {$set: {
    status: 'handled',
    handled_by: email,
    handled_at: timestamp
  }}
)
  │
  └─ Returns: {matched_count, modified_count}
     └─ Used to check if alert found
```

---

## Location Tracking Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│              MOBILE USER LOCATION TRACKING                         │
└────────────────────────────────────────────────────────────────────┘

BACKGROUND SERVICE (Always Running)
───────────────────────────────────

Expo Background Fetch
    │
    ├─ Interval: Every 5-15 min (OS dependent)
    │
    ├─ Get GPS Location
    │  └─ Expo Location API
    │
    ├─ Even if app is closed:
    │  └─ Still sends location to backend
    │
    └─ POST /api/mobile/location
       └─ Same alert detection logic
          runs even when app backgrounded


FOREGROUND SERVICE (App Open)
──────────────────────────────

User Opens App
    │
    ├─ Login & get JWT token
    │
    ├─ Socket.IO Connect
    │  └─ Parameters: {token: jwtToken}
    │
    ├─ Enable Location Permissions
    │  └─ "Always" or "While Using App"
    │
    ├─ Start Location Listener
    │  └─ Accuracy: High (GPS + networks)
    │
    ├─ Listen to Location Changes
    │  └─ Every 100m moved OR every 30s
    │
    ├─ On Location Change:
    │  │
    │  └─ POST /api/mobile/location {lat, lng}
    │     │
    │     ├─ Backend checks crime zones
    │     │
    │     ├─ Detects alerts
    │     │
    │     ├─ Socket.IO emits new alerts
    │     │
    │     └─ Frontend receives & displays


USER LAST KNOWN LOCATION (Stored in DB)
───────────────────────────────────────

Every location update also runs:

users_col.update_one(
  {email: current_user['email']},
  {$set: {
    last_location: {
      lat, lng,
      updated_at: timestamp
    }
  }}
)

Used For:
├─ Finding nearest patrols (Haversine)
├─ Patrol proximity calculation
├─ User safety assessment
└─ Historical location tracking


LOCATION PRIVACY CONSIDERATIONS
───────────────────────────────

Real User Identity: Only visible to:
├─ App owner (themselves)
├─ Assigned patrol officers
├─ System admins

Anonymizations:
├─ Distance calculated server-side
├─ Only distance_km sent to other users
├─ Exact coordinates encrypted (optional future)
└─ Location data auto-purged after X days (optional)
```

---

## HTTP Request/Response Examples

### Login Request
```http
POST /login HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "patrol"
}
```

### Location Update Request
```http
POST /api/mobile/location HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "lat": 40.7128,
  "lng": -74.0060
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "alert": true,
  "message": "1 crime risk(s) detected near you",
  "alerts": [
    {
      "location": "5th Avenue, NYC",
      "message": "CRIME ZONE ALERT: Theft detected nearby.",
      "lat": 40.7130,
      "lng": -74.0062,
      "type": "Theft",
      "distance_km": 0.035
    }
  ]
}
```

### Alert Mark Handled Request
```http
PUT /api/alert/63f7abc123def456/mark-handled HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Alert marked as handled"
}
```

---

## Performance Optimization Points

```
┌────────────────────────────────────────────────┐
│      WHERE OPTIMIZATION MATTERS                │
└────────────────────────────────────────────────┘

1. CRIME ZONE DETECTION (Backend)
   ├─ Current: O(n) - checks every crime
   ├─ Issue: Slow with 10,000+ crimes
   └─ Solution: MongoDB Geospatial Index
      {location: "2dsphere"}
      Query: {location: {$near: {$geometry: ...}}}

2. ALERT DEDUPLICATION (Database)
   ├─ Current: find_one query per alert
   ├─ Solution: Index on zone_key + user + status
      db.alerts.createIndex({zone_key: 1, user: 1, status: 1})
   └─ Result: O(1) lookup instead of collection scan

3. SOCKET.IO ROOMS (Broadcasting)
   ├─ Current: Emit to all patrols for each alert
   ├─ Better: Use distance-based rooms
      room: f"patrol_{email}"
   └─ Result: Only nearest patrols notified

4. LOCATION QUERIES (Mobile)
   ├─ Current: POST every location change
   ├─ Issue: Battery drain, network overhead
   ├─ Solution: Batch updates (send every 30s)
   └─ Result: 90% fewer requests

5. JWT VALIDATION (Middleware)
   ├─ Current: Decode on every request
   ├─ Solution: Cache decoded tokens (Redis)
   └─ Result: Skip decode for repeated requests

6. DATABASE INDEXES
   ├─ users: {email: 1} [unique]
   ├─ crimes: {lat: 1, lng: 1}
   ├─ alerts: {status: 1, user: 1, zone_key: 1}
   └─ Result: Faster queries, lower CPU
```

---

## Scalability Roadmap

```
PHASE 1: Single Server (Current)
├─ Backend: Single Flask instance
├─ Database: MongoDB Atlas shared
├─ Load: < 1000 concurrent users
└─ Cost: $5-20/month

PHASE 2: Load Balanced
├─ Backend: Multiple Flask + Gunicorn
├─ Load Balancer: Nginx
├─ Message Queue: Redis for pub/sub
├─ Load: 10,000+ concurrent users
└─ Cost: $100-300/month

PHASE 3: Microservices
├─ Auth Service: Separate
├─ Location Service: Separate
├─ Alert Service: Separate
├─ Analytics Service: Separate
├─ Message Queue: RabbitMQ
├─ Cache Layer: Redis
├─ Database: MongoDB sharding
└─ Load: 100,000+ users
```

---

## Security Considerations

```
AUTHENTICATION
├─ JWT tokens (12-hour expiry)
├─ Password hashing (Werkzeug)
├─ Bearer token in Authorization header
└─ HTTPS enforced in production

AUTHORIZATION
├─ Role-based access control (RBAC)
├─ Token validation on every request
├─ Route-level permissions
└─ User isolation (can't access other user data)

DATA PROTECTION
├─ TLS/SSL for MongoDB connection
├─ TLS/SSL for API calls (HTTPS)
├─ CORS configured for known origins
├─ Input validation on all routes
└─ SQL injection not applicable (MongoDB)

POTENTIAL IMPROVEMENTS
├─ Refresh tokens (separate short/long-lived)
├─ Rate limiting (prevent brute force)
├─ Audit logging (track all actions)
├─ Location data encryption
├─ 2FA/MFA support
└─ OAuth2 integration (social login)
```

---

**Generated**: March 9, 2026  
**Document**: CrimeSpot Architecture Diagrams  
**Version**: 1.0
