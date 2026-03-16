import eventlet
eventlet.monkey_patch()

from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import json
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask_socketio import SocketIO, join_room
from math import radians, sin, cos, sqrt, atan2
import requests
from bson import ObjectId



# ---------------------- App Setup ----------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = 'supersecretjwtkey'  

# Allow the frontend origins
CORS(app, supports_credentials=True)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet"
)

# ---------------------- MongoDB ------------------------
MONGO_URI = "mongodb+srv://poseidon2005:Sathiya007@crime-cluster.qmgnmfw.mongodb.net/?retryWrites=true&w=majority&appName=crime-cluster"
client = MongoClient(MONGO_URI, tls=True)
db = client['CrimeSpot']

users_col = db['users']
crimes_col = db['crimes']
alerts_col = db['alerts']

# ---------------------- Helpers / Auth -----------------
def decode_token(token):
    try:
        return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    except Exception as e:
        print("JWT decode error:", e)
        return None


def get_user_by_phone(phone):
    """Get user by phone number"""
    return users_col.find_one({'phone': phone})


def token_required(f):
    """Ensures a valid JWT token is provided with the request"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            parts = request.headers['Authorization'].split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        data = decode_token(token)
        if not data:
            return jsonify({'message': 'Token is invalid!'}), 401

        current_user = get_user_by_phone(data['phone'])
        if not current_user:
            return jsonify({'message': 'User not found!'}), 404

        return f(current_user, *args, **kwargs)
    return decorated


def role_required(roles):
    """Restricts route access to specific roles"""
    def decorator(f):
        @wraps(f)
        def wrapper(current_user, *args, **kwargs):
            if current_user.get('role') not in roles:
                return jsonify({'message': 'Access denied'}), 403
            return f(current_user, *args, **kwargs)
        return wrapper
    return decorator

def generate_zone_key(lat, lng):
    return f"{round(lat, 5)}-{round(lng, 5)}"

# ---------------------- Utility -----------------------
def serialize_doc(doc):
    """Converts MongoDB ObjectIds and datetime fields to JSON-serializable format"""
    if not doc:
        return None
    doc = dict(doc)
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
    return doc


def actor_identity(user):
    """Return a stable identifier for audit trails and UI labels."""
    return user.get('phone') or user.get('email') or user.get('name') or 'unknown'


def clean_user_doc(user):
    """Serialize a user document and remove sensitive fields."""
    serialized = serialize_doc(user)
    if serialized:
        serialized.pop('password', None)
    return serialized


def normalize_alert_doc(alert):
    """Flatten mixed alert storage formats into a dashboard-friendly shape."""
    serialized = serialize_doc(alert)
    payload = serialized.get('payload', {}) if serialized else {}

    return {
        '_id': serialized.get('_id'),
        'type': serialized.get('type'),
        'user': (
            serialized.get('user')
            or serialized.get('phone')
            or serialized.get('reported_by')
            or payload.get('user')
            or payload.get('phone')
        ),
        'user_name': serialized.get('user_name') or payload.get('user_name'),
        'aadhar': serialized.get('aadhar') or payload.get('aadhar'),
        'crime_type': (
            serialized.get('crime_type')
            or payload.get('crime_type')
            or serialized.get('type')
            or 'Alert'
        ),
        'location': serialized.get('location') or payload.get('location'),
        'message': serialized.get('message') or payload.get('message'),
        'user_lat': serialized.get('user_lat') if serialized.get('user_lat') is not None else payload.get('user_lat'),
        'user_lng': serialized.get('user_lng') if serialized.get('user_lng') is not None else payload.get('user_lng'),
        'crime_lat': serialized.get('crime_lat') if serialized.get('crime_lat') is not None else payload.get('crime_lat'),
        'crime_lng': serialized.get('crime_lng') if serialized.get('crime_lng') is not None else payload.get('crime_lng'),
        'distance_km': serialized.get('distance_km') if serialized.get('distance_km') is not None else payload.get('distance_km', 0),
        'detected_at': (
            serialized.get('detected_at')
            or payload.get('detected_at')
            or serialized.get('timestamp')
            or serialized.get('created_at')
        ),
        'status': serialized.get('status', 'active'),
        'reported_by': serialized.get('reported_by'),
        'handled_by': serialized.get('handled_by'),
        'handled_at': serialized.get('handled_at'),
        'created_at': serialized.get('created_at'),
    }


def alert_lookup_query(alert_id):
    """Support alerts stored with either string ids or ObjectIds."""
    lookup = [{'_id': alert_id}]
    try:
        lookup.append({'_id': ObjectId(alert_id)})
    except Exception:
        pass
    return {'$or': lookup}


def haversine_km(lat1, lon1, lat2, lon2):
    """Return distance between two lat/lon points in kilometers using Haversine formula."""
    R = 6371.0  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def check_crime_zone(user_lat, user_lng, current_time, radius_km=1.0):
    """
    Checks if user is within a high-crime zone (default radius_km kilometers).
    Returns a list of notification dicts for crimes within the radius.
    Each notification includes computed distance (km).
    """
    crimes = list(crimes_col.find({}))
    notifications = []

    for crime in crimes:
        try:
            # Support both forms:
            # 1) crime['lat'], crime['lng'] (your current format)
            # 2) crime['location'] GeoJSON -> {'type':'Point', 'coordinates':[lng, lat]}
            if 'lat' in crime and 'lng' in crime:
                crime_lat = float(crime['lat'])
                crime_lng = float(crime['lng'])
            else:
                loc = crime.get('location')
                if isinstance(loc, dict) and 'coordinates' in loc:
                    # GeoJSON coordinates are [lng, lat]
                    crime_lng = float(loc['coordinates'][0])
                    crime_lat = float(loc['coordinates'][1])
                else:
                    # skip if format not recognized
                    continue

            distance_km = haversine_km(user_lat, user_lng, crime_lat, crime_lng)

            if distance_km <= radius_km:
                # If you want time-based filtering (example: night hours), keep same logic:
                # nighttime considered 20:00 - 05:00 UTC (you can adjust or remove)
                if current_time.hour >= 20 or current_time.hour <= 5:
                    notifications.append({
                        'location': crime.get('location') or f"{crime_lat},{crime_lng}",
                        'message': f'You are in a high-crime zone ({crime.get("type","")}) during night hours.',
                        'lat': crime_lat,
                        'lng': crime_lng,
                        'type': crime.get('type'),
                        'distance_km': round(distance_km, 3)
                    })
                else:
                    # Optionally, also notify during daytime — include below if desired.
                    notifications.append({
                        'location': crime.get('location') or f"{crime_lat},{crime_lng}",
                        'message': f'CRIME ZONE ALERT: {crime.get("type","")} detected nearby.',
                        'lat': crime_lat,
                        'lng': crime_lng,
                        'type': crime.get('type'),
                        'distance_km': round(distance_km, 3),
                        'severity': 'high' if crime.get('type') in ['Murder', 'Rape'] else 'medium'
                    })

        except Exception as e:
            print("Error checking crime entry:", e)
            continue

    return notifications


# ---------------------- Routes ------------------------
@app.route('/')
def index():
    return jsonify({'message': '🚨 CrimeSpot Backend Running Successfully!'})


# --------- Register/Login ----------
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    required = ['phone', 'password', 'aadhar']
    if not data or not all(k in data for k in required):
        return jsonify({'message': 'Missing required fields: phone, password, aadhar'}), 400

    # Check if user already exists by phone number
    if users_col.find_one({'phone': data['phone']}):
        return jsonify({'message': 'Phone number already registered'}), 400

    hashed_password = generate_password_hash(data['password'])

    users_col.insert_one({
        'phone': data['phone'],
        'password': hashed_password,
        'aadhar': data['aadhar'],
        'name': data.get('name', ''),
        'role': data.get('role', 'user'),
        'created_at': datetime.now(timezone.utc).isoformat()
    })

    return jsonify({'message': 'User registered successfully'})


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'phone' not in data or 'password' not in data:
        return jsonify({'message': 'Bad request - phone and password required'}), 400

    user = users_col.find_one({'phone': data['phone']})
    if not user or not check_password_hash(user['password'], data['password']):
        return jsonify({'message': 'Invalid credentials'}), 401

    token = jwt.encode(
        {'phone': user['phone'], 'exp': datetime.now(timezone.utc) + timedelta(hours=12)},
        app.config['SECRET_KEY'],
        algorithm='HS256'
    )

    role = user.get('role', 'user')
    return jsonify({'token': token, 'role': role, 'name': user.get('name')})


# --------- Users ----------
@app.route('/api/users', methods=['GET'])
@token_required
@role_required(['admin'])
def get_users(current_user):
    """Fetch all users (admin only)"""
    users = [clean_user_doc(u) for u in users_col.find({})]
    return jsonify(users)


@app.route('/api/users', methods=['POST'])
@token_required
@role_required(['admin'])
def create_user(current_user):
    data = request.get_json() or {}
    required = ['phone', 'password', 'aadhar', 'role']
    if not all(data.get(field) for field in required):
        return jsonify({'message': 'phone, password, aadhar, and role are required'}), 400

    if users_col.find_one({'phone': data['phone']}):
        return jsonify({'message': 'Phone number already registered'}), 400

    if data['role'] not in ['user', 'patrol', 'admin']:
        return jsonify({'message': 'Invalid role'}), 400

    user_doc = {
        'phone': data['phone'],
        'password': generate_password_hash(data['password']),
        'aadhar': data['aadhar'],
        'name': data.get('name', ''),
        'role': data['role'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    if isinstance(data.get('last_location'), dict):
        user_doc['last_location'] = data['last_location']

    inserted = users_col.insert_one(user_doc)
    created = users_col.find_one({'_id': inserted.inserted_id})
    return jsonify(clean_user_doc(created)), 201


@app.route('/api/users/<user_id>', methods=['PUT'])
@token_required
@role_required(['admin'])
def update_user(current_user, user_id):
    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({'message': 'Invalid user ID'}), 400

    data = request.get_json() or {}
    updates = {}

    for field in ['phone', 'aadhar', 'name', 'role']:
        if field in data and data[field] is not None:
            updates[field] = data[field]

    if 'role' in updates and updates['role'] not in ['user', 'patrol', 'admin']:
        return jsonify({'message': 'Invalid role'}), 400

    if 'phone' in updates:
        existing = users_col.find_one({'phone': updates['phone'], '_id': {'$ne': user_obj_id}})
        if existing:
            return jsonify({'message': 'Phone number already registered'}), 400

    if data.get('password'):
        updates['password'] = generate_password_hash(data['password'])

    if isinstance(data.get('last_location'), dict):
        updates['last_location'] = data['last_location']

    if not updates:
        return jsonify({'message': 'No valid fields provided'}), 400

    result = users_col.update_one({'_id': user_obj_id}, {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'message': 'User not found'}), 404

    updated = users_col.find_one({'_id': user_obj_id})
    return jsonify(clean_user_doc(updated)), 200


@app.route('/api/users/<user_id>', methods=['DELETE'])
@token_required
@role_required(['admin'])
def delete_user(current_user, user_id):
    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({'message': 'Invalid user ID'}), 400

    result = users_col.delete_one({'_id': user_obj_id})
    if result.deleted_count == 0:
        return jsonify({'message': 'User not found'}), 404

    return jsonify({'message': 'User deleted successfully'}), 200


# --------- Crimes ----------
@app.route('/api/crimes', methods=['GET'])
@token_required
def get_crimes(current_user):
    crimes = [serialize_doc(c) for c in crimes_col.find({})]
    return jsonify(crimes)


@app.route('/api/crimes', methods=['POST'])
@token_required
@role_required(['admin', 'patrol'])
def add_crime(current_user):
    data = request.get_json()
    required = ['location', 'type', 'date', 'lat', 'lng']
    if not data or not all(k in data for k in required):
        return jsonify({'message': 'Missing fields'}), 400

    try:
        data['lat'] = float(data['lat'])
        data['lng'] = float(data['lng'])
    except:
        return jsonify({'message': 'lat and lng must be numbers'}), 400

    inserted = crimes_col.insert_one(data)
    created = crimes_col.find_one({'_id': inserted.inserted_id})
    return jsonify(serialize_doc(created)), 201


@app.route('/api/crimes/<crime_id>', methods=['PUT'])
@token_required
@role_required(['admin', 'patrol'])
def update_crime(current_user, crime_id):
    try:
        crime_obj_id = ObjectId(crime_id)
    except Exception:
        return jsonify({'message': 'Invalid crime ID'}), 400

    data = request.get_json() or {}
    updates = {}

    for field in ['location', 'type', 'date']:
        if field in data and data[field] is not None:
            updates[field] = data[field]

    for field in ['lat', 'lng']:
        if field in data and data[field] is not None:
            try:
                updates[field] = float(data[field])
            except Exception:
                return jsonify({'message': f'{field} must be a number'}), 400

    if not updates:
        return jsonify({'message': 'No valid fields provided'}), 400

    result = crimes_col.update_one({'_id': crime_obj_id}, {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'message': 'Crime not found'}), 404

    updated = crimes_col.find_one({'_id': crime_obj_id})
    return jsonify(serialize_doc(updated)), 200


@app.route('/api/crimes/<string:loc>', methods=['DELETE'])
@token_required
@role_required(['admin', 'patrol'])
def delete_crime(current_user, loc):
    res = None
    try:
        res = crimes_col.delete_one({'_id': ObjectId(loc)})
    except Exception:
        pass

    if not res or res.deleted_count == 0:
        res = crimes_col.delete_one({'location': loc})

    if res.deleted_count == 0:
        return jsonify({'message': 'No crime found for that location'}), 404
    return jsonify({'message': 'Crime deleted successfully'})


# --------- User location check ----------
@app.route('/api/check-location', methods=['POST'])
@token_required
def check_location(current_user):
    data = request.get_json()
    if not data or 'lat' not in data or 'lng' not in data:
        return jsonify({'message': 'Bad request'}), 400

    try:
        user_lat = float(data['lat'])
        user_lng = float(data['lng'])
    except:
        return jsonify({'message': 'Invalid coordinates'}), 400

    current_time = datetime.now(timezone.utc)
    alerts = check_crime_zone(user_lat, user_lng, current_time, radius_km=1.0)

    # No socket emit here - alerts are handled in /api/location/update endpoint only

    # Include debug info: distances included in alerts
    return jsonify({'alerts': alerts})


# --------- User location update (new) ----------
@app.route('/api/location/update', methods=['POST'])
@token_required
def update_location(current_user):
    """
    Used after login to:
    - Save user's last location
    - Detect nearby crime zones
    - Create DB-backed alerts
    - Emit alerts to patrols with valid _id
    """

    data = request.get_json() or {}

    # Accept both lat/lng and latitude/longitude
    lat_key = 'lat' if 'lat' in data else ('latitude' if 'latitude' in data else None)
    lng_key = 'lng' if 'lng' in data else ('longitude' if 'longitude' in data else None)

    if not lat_key or not lng_key:
        return jsonify({'message': 'Bad request - missing coordinates'}), 400

    try:
        user_lat = float(data.get(lat_key))
        user_lng = float(data.get(lng_key))
    except (ValueError, TypeError):
        return jsonify({'message': 'Invalid coordinates'}), 400

    current_time = datetime.now(timezone.utc)

    # 🔹 Save user's last known location
    try:
        users_col.update_one(
            {'phone': current_user['phone']},
            {'$set': {
                'last_location': {
                    'lat': user_lat,
                    'lng': user_lng,
                    'updated_at': current_time.isoformat()
                }
            }}
        )
    except Exception as e:
        print("Failed to save last_location:", e)

    # 🔹 Detect nearby crime zones
    alerts = check_crime_zone(
        user_lat,
        user_lng,
        current_time,
        radius_km=1.0
    )

    created_alerts = []

    # 🔹 Create DB-backed alerts and emit
    for alert in alerts:
        alert_id = ObjectId()

        payload = {
            'user': current_user['phone'],
            'user_role': current_user.get('role'),
            'crime_type': alert.get('type'),
            'location': alert.get('location'),
            'message': alert.get('message'),
            'user_lat': user_lat,
            'user_lng': user_lng,
            'crime_lat': float(alert.get('lat')),
            'crime_lng': float(alert.get('lng')),
            'distance_km': alert.get('distance_km'),
            'detected_at': current_time.isoformat(),
            'status': 'active',
            'assigned_patrols': []
        }

        # ✅ 1. Insert into MongoDB FIRST
        alerts_col.insert_one({
            '_id': alert_id,
            'type': 'auto_crime_zone_detection',
            **payload,
            'created_at': current_time
        })

        # ✅ 2. Emit SAME payload to patrols
        socketio.emit('crime_zone_alert', {'_id': str(alert_id), **payload}, room='patrols')

        created_alerts.append({'_id': str(alert_id), **payload})

    return jsonify({
        'alert': len(created_alerts) > 0,
        'message': f'{len(created_alerts)} crime-zone alert(s) detected near your location.',
        'alerts': created_alerts
    }), 200

# ---------------------- Mobile Location Update (SAFE ADDITION) ----------------------
def get_nearest_patrols(user_lat, user_lng, limit=2, max_distance_km=10.0):
    """
    Find the nearest patrol officers based on their last known location.
    Returns list of patrol emails within max_distance_km, sorted by distance.
    """
    patrols = users_col.find({'role': 'patrol', 'last_location': {'$exists': True}})
    patrol_distances = []
    
    for patrol in patrols:
        try:
            patrol_lat = float(patrol['last_location']['lat'])
            patrol_lng = float(patrol['last_location']['lng'])
            distance = haversine_km(user_lat, user_lng, patrol_lat, patrol_lng)
            
            if distance <= max_distance_km:
                patrol_distances.append({
                    'phone': actor_identity(patrol),
                    'distance': distance
                })
        except Exception as e:
            print(f"Error calculating patrol distance: {e}")
            continue
    
    # Sort by distance and return top N
    patrol_distances.sort(key=lambda x: x['distance'])
    return [p['phone'] for p in patrol_distances[:limit]]


@app.route('/api/mobile/location', methods=['POST'])
@token_required
def mobile_location_update(current_user):
    """
    Mobile-only endpoint.
    - Updates user location
    - Detects crime zones
    - Creates ONE alert per user+zone (NO DUPLICATES)
    - Updates existing alert instead of creating new ones
    - Emits socket ONLY on first detection
    """

    data = request.get_json() or {}

    if 'lat' not in data or 'lng' not in data:
        return jsonify({'message': 'lat and lng required'}), 400

    try:
        user_lat = float(data['lat'])
        user_lng = float(data['lng'])
    except Exception:
        return jsonify({'message': 'lat/lng must be numbers'}), 400

    # Save user's last known location
    users_col.update_one(
        {'phone': current_user['phone']},
        {'$set': {
            'last_location': {
                'lat': user_lat,
                'lng': user_lng,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }}
    )

    current_time = datetime.now(timezone.utc)

    # 🔍 Use your existing crime detection logic
    alerts = check_crime_zone(
        user_lat,
        user_lng,
        current_time,
        radius_km=1.0
    )

    # If no alerts → user is safe
    if not alerts:
        return jsonify({
            'alert': False,
            'message': 'Location safe',
            'alerts': []
        }), 200

    # Process each detected crime zone
    created_alerts_count = 0
    for alert in alerts:
        crime_lat = float(alert.get('lat'))
        crime_lng = float(alert.get('lng'))
        zone_key = generate_zone_key(crime_lat, crime_lng)

        # 🔎 CHECK: existing active alert for same user + same zone
        existing_alert = alerts_col.find_one({
            'phone': current_user['phone'],
            'zone_key': zone_key,
            'status': 'active'
        })

        if existing_alert:
            # ✅ UPDATE ONLY (NO NEW ALERT - prevent duplicates)
            alerts_col.update_one(
                {'_id': existing_alert['_id']},
                {'$set': {
                    'user_lat': user_lat,
                    'user_lng': user_lng,
                    'user_name': current_user.get('name'),
                    'distance_km': alert.get('distance_km'),
                    'detected_at': current_time.isoformat(),
                    'updated_at': current_time
                }}
            )
            # 📡 Emit UPDATE (not new alert)
            socketio.emit('crime_zone_alert_updated', {
                '_id': str(existing_alert['_id']),
                'user_lat': user_lat,
                'user_lng': user_lng,
                'distance_km': alert.get('distance_km'),
                'updated_at': current_time.isoformat()
            }, room='patrols')
            continue

        # 🆕 FIRST TIME ALERT FOR THIS ZONE
        alert_id = ObjectId()

        payload = {
            'phone': current_user['phone'],
            'user_name': current_user.get('name'),
            'aadhar': current_user.get('aadhar'),
            'user_role': current_user.get('role'),
            'crime_type': alert.get('type'),
            'location': alert.get('location'),
            'message': alert.get('message'),
            'user_lat': user_lat,
            'user_lng': user_lng,
            'crime_lat': crime_lat,
            'crime_lng': crime_lng,
            'distance_km': alert.get('distance_km'),
            'detected_at': current_time.isoformat(),
            'status': 'active',
            'zone_key': zone_key
        }

        # 💾 Store alert ONCE
        alerts_col.insert_one({
            '_id': alert_id,
            'type': 'mobile_auto_detection',
            **payload,
            'created_at': current_time
        })

        # 📡 Emit socket ONLY ONCE for new alerts
        socketio.emit('crime_zone_alert', {'_id': str(alert_id), **payload}, room='patrols')
        created_alerts_count += 1

    # 📱 Response used by USER app for popup
    return jsonify({
        'alert': True,
        'message': f'{len(alerts)} crime risk(s) detected near you',
        'alerts': alerts
    }), 200


# --------- User alert to patrol ----------
@app.route('/api/alert', methods=['POST'])
@token_required
def alert_patrol(current_user):
    data = request.get_json()
    if not data or 'location' not in data or 'message' not in data:
        return jsonify({'message': 'Bad request'}), 400

    current_time = datetime.now(timezone.utc)
    actor = actor_identity(current_user)
    
    # Format alert to match crime_zone_alert payload for consistency
    payload = {
        'user': actor,
        'crime_type': data.get('type', 'Reported Alert'),
        'location': data['location'],
        'message': data['message'],
        'user_lat': data.get('lat'),
        'user_lng': data.get('lng'),
        'crime_lat': data.get('lat'),
        'crime_lng': data.get('lng'),
        'distance_km': 0,
        'detected_at': current_time.isoformat()
    }

    # Store in DB
    inserted = alerts_col.insert_one({
        'type': 'user_alert',
        'user': actor,
        'crime_type': payload['crime_type'],
        'location': data['location'],
        'message': data['message'],
        'user_lat': data.get('lat'),
        'user_lng': data.get('lng'),
        'crime_lat': data.get('lat'),
        'crime_lng': data.get('lng'),
        'distance_km': 0,
        'detected_at': current_time.isoformat(),
        'status': 'active',
        'payload': payload,
        'reported_by': actor,
        'timestamp': current_time.isoformat()
    })
    
    payload['_id'] = str(inserted.inserted_id)

    # Emit to all patrols and admins (use crime_zone_alert for consistency)
    safe_alert = json.loads(json.dumps(payload, default=str))
    socketio.emit('crime_zone_alert', safe_alert, room='patrols')
    socketio.emit('crime_zone_alert', safe_alert, room='admins')
    
    # Emit to all users for situational awareness
    socketio.emit('crime_zone_alert', safe_alert, room='users')

    return jsonify({'message': 'Alert sent to patrols successfully'})


@app.route('/api/alerts', methods=['GET'])
@token_required
@role_required(['admin'])
def get_all_alerts(current_user):
    alerts = list(
        alerts_col.find({})
        .sort([('detected_at', -1), ('created_at', -1)])
        .limit(200)
    )
    return jsonify([normalize_alert_doc(alert) for alert in alerts]), 200


@app.route('/api/alerts', methods=['POST'])
@token_required
@role_required(['admin'])
def create_alert(current_user):
    data = request.get_json() or {}
    required = ['crime_type', 'location']
    if not all(data.get(field) for field in required):
        return jsonify({'message': 'crime_type and location are required'}), 400

    current_time = datetime.now(timezone.utc)
    actor = actor_identity(current_user)
    alert_doc = {
        'type': data.get('type', 'admin_alert'),
        'user': data.get('user', actor),
        'user_name': data.get('user_name'),
        'aadhar': data.get('aadhar'),
        'crime_type': data['crime_type'],
        'location': data['location'],
        'message': data.get('message', ''),
        'user_lat': data.get('user_lat'),
        'user_lng': data.get('user_lng'),
        'crime_lat': data.get('crime_lat'),
        'crime_lng': data.get('crime_lng'),
        'distance_km': data.get('distance_km', 0),
        'status': data.get('status', 'active'),
        'reported_by': actor,
        'detected_at': data.get('detected_at', current_time.isoformat()),
        'created_at': current_time.isoformat()
    }

    inserted = alerts_col.insert_one(alert_doc)
    created = alerts_col.find_one({'_id': inserted.inserted_id})
    safe_alert = normalize_alert_doc(created)
    socketio.emit('crime_zone_alert', safe_alert, room='patrols')
    socketio.emit('crime_zone_alert', safe_alert, room='admins')
    return jsonify(safe_alert), 201


@app.route('/api/alert/<alert_id>/mark-handled', methods=['PUT'])
@token_required
@role_required(['patrol', 'admin'])
def mark_alert_handled(current_user, alert_id):
    """
    Mark an alert as handled by a patrol officer.
    Stops sending further notifications for that incident.
    """
    current_time = datetime.now(timezone.utc)
    actor = actor_identity(current_user)
    
    # Update alert status
    result = alerts_col.update_one(
        alert_lookup_query(alert_id),
        {
            '$set': {
                'status': 'handled',
                'handled_by': actor,
                'handled_at': current_time.isoformat()
            }
        }
    )
    
    if result.matched_count == 0:
        return jsonify({'message': 'Alert not found'}), 404
    
    # Notify all connected clients that this alert is handled
    socketio.emit('alert_handled', {
        'alert_id': alert_id,
        'handled_by': actor,
        'handled_at': current_time.isoformat()
    }, room='patrols')
    
    return jsonify({'message': 'Alert marked as handled'}), 200


# --------- Get Active Alerts ----------
@app.route('/api/alerts/active', methods=['GET'])
@token_required
def get_active_alerts(current_user):
    """
    Fetch all active (unhandled) alerts for patrols/admins
    Used on app load to restore alerts after refresh
    """
    try:
        # Get all active alerts (not handled)
        active_alerts = list(alerts_col.find({'status': {'$ne': 'handled'}}).sort('timestamp', -1).limit(100))
        
        print(f"Found {len(active_alerts)} active alerts for user {actor_identity(current_user)}")
        return jsonify([normalize_alert_doc(alert) for alert in active_alerts]), 200
    except Exception as e:
        print(f"Error fetching alerts: {e}")
        return jsonify({'message': f'Error fetching alerts: {str(e)}'}), 500


@app.route('/api/alerts/<alert_id>', methods=['PUT'])
@token_required
@role_required(['admin'])
def update_alert(current_user, alert_id):
    data = request.get_json() or {}
    updates = {}
    allowed_fields = [
        'type',
        'user',
        'user_name',
        'aadhar',
        'crime_type',
        'location',
        'message',
        'user_lat',
        'user_lng',
        'crime_lat',
        'crime_lng',
        'distance_km',
        'status',
        'detected_at',
    ]

    for field in allowed_fields:
        if field in data and data[field] is not None:
            updates[field] = data[field]

    for field in ['user_lat', 'user_lng', 'crime_lat', 'crime_lng', 'distance_km']:
        if field in updates:
            try:
                updates[field] = float(updates[field])
            except Exception:
                return jsonify({'message': f'{field} must be numeric'}), 400

    if not updates:
        return jsonify({'message': 'No valid fields provided'}), 400

    if updates.get('status') == 'handled':
        updates['handled_at'] = datetime.now(timezone.utc).isoformat()
        updates['handled_by'] = actor_identity(current_user)

    result = alerts_col.update_one(alert_lookup_query(alert_id), {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'message': 'Alert not found'}), 404

    updated = alerts_col.find_one(alert_lookup_query(alert_id))
    safe_alert = normalize_alert_doc(updated)

    if safe_alert.get('status') == 'handled':
        socketio.emit('alert_handled', {
            'alert_id': alert_id,
            'handled_by': safe_alert.get('handled_by'),
            'handled_at': safe_alert.get('handled_at')
        }, room='patrols')
    else:
        socketio.emit('crime_zone_alert_updated', safe_alert, room='patrols')

    return jsonify(safe_alert), 200


# --------- Delete Alert ----------
@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
@token_required
@role_required(['admin'])
def delete_alert(current_user, alert_id):
    """Delete an alert (admin only)"""
    print(f"Attempting to delete alert: {alert_id}")
    try:
        result = alerts_col.delete_one(alert_lookup_query(alert_id))
        print(f"Delete result: deleted_count={result.deleted_count}")
        if result.deleted_count == 0:
            return jsonify({'message': 'Alert not found'}), 404
        
        # Notify all patrols that an alert was deleted
        socketio.emit('alert_deleted', {
            'alert_id': alert_id,
            'deleted_by': actor_identity(current_user)
        }, room='patrols')
        
        return jsonify({'message': 'Alert deleted successfully'}), 200
    except Exception as e:
        print(f"Error deleting alert: {e}")
        return jsonify({'message': f'Error deleting alert: {str(e)}'}), 500


# ---------------------- Socket.IO ---------------------
@socketio.on('connect')
def handle_connect(auth):
    token = auth.get('token') if isinstance(auth, dict) else None
    user_info = decode_token(token) if token else None

    if not user_info:
        print("Socket connection with invalid token - disconnecting")
        return False

    phone = user_info.get('phone')
    user = users_col.find_one({'phone': phone})
    if not user:
        print("Socket connection for unknown user - disconnecting")
        return False

    role = user.get('role', 'user')
    sid = request.sid
    print(f"Socket connected: sid={sid}, phone={phone}, role={role}")

    if role == 'patrol':
        join_room('patrols')
        join_room(f'patrol_{phone}')  # Personal room for distance-based alerts
    elif role == 'admin':
        join_room('admins')
    else:
        join_room('users')


@socketio.on('disconnect')
def handle_disconnect():
    print('Socket disconnected')


# ---------------------- Run Server -------------------
if __name__ == '__main__':
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False
    )
