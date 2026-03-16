import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import API from '../services/api'
import { getToken, logout } from '../services/auth'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

const PatrolDashboard = () => {
  const [alerts, setAlerts] = useState([])
  const [crimes, setCrimes] = useState([])
  const [myLocation, setMyLocation] = useState(null)
  const navigate = useNavigate()

  // Fetch crimes
  const fetchCrimes = async () => {
    try {
      const res = await API.get('/api/crimes', {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setCrimes(res.data)
    } catch (err) {
      console.error(err)
      if (err?.response?.status === 401) {
        logout()
        navigate('/login')
      }
    }
  }

  useEffect(() => { fetchCrimes() }, [])

  // Connect to Socket.IO
  useEffect(() => {
    const socket = io('http://127.0.0.1:5000', {
      transports: ['websocket'],
      auth: { token: getToken() },
    })

    const handleCrimeAlert = (data) => {
      console.log("🚨 Incoming alert data (raw):", data);

      // Extract fields matching what backend actually sends
      const user = data.user || 'Unknown User';
      const crimeType = data.crime_type || 'Unknown Crime';
      const location = data.location || 'Unknown Location';
      const distance = data.distance_km || 0;
      const detectedAt = data.detected_at || new Date().toISOString();
      
      // USER coordinates (where to navigate to)
      const userLat = parseFloat(data.user_lat);
      const userLng = parseFloat(data.user_lng);
      
      // CRIME coordinates (for reference)
      const crimeLat = parseFloat(data.crime_lat);
      const crimeLng = parseFloat(data.crime_lng);

      console.log(`👤 User Coordinates: lat=${userLat}, lng=${userLng}`);
      console.log(`🚨 Crime Coordinates: lat=${crimeLat}, lng=${crimeLng}`);

      // Generate Google Maps directions link (to USER location)
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${userLat},${userLng}`;
      console.log(`🧭 Generated Maps URL: ${mapsUrl}`);

      // Show alert with all details
      const alertMessage = `
🚨 ${crimeType} ALERT

👤 User: ${user}
📍 Crime Location: ${location}
📏 Distance: ${distance} km
⏱️ Time: ${new Date(detectedAt).toLocaleString()}

🧭 Navigate to user:
${mapsUrl}
      `;

      window.alert(alertMessage);

      // Add to alerts list
      setAlerts((prev) => [...prev, {
        user,
        crimeType,
        location,
        distance,
        detectedAt,
        mapsUrl,
        userLat,
        userLng,
        crimeLat,
        crimeLng
      }]);
    };

    socket.on("crime_zone_alert", handleCrimeAlert);

    return () => {
      socket.off("crime_zone_alert", handleCrimeAlert);
      socket.disconnect();
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return alert('Geolocation not supported')
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => alert('Unable to fetch location: ' + err.message),
      { enableHighAccuracy: true }
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-blue-700 text-white p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🚓 Patrol Dashboard</h1>
        <div className="flex gap-3 items-center">
          <button
            className="bg-yellow-500 px-3 py-1 rounded"
            onClick={handleUseMyLocation}
          >
            Use my location
          </button>
          <button
            className="bg-red-500 px-3 py-1 rounded"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        {/* Map */}
        <div className="md:col-span-2 h-full bg-white rounded shadow overflow-hidden">
          <MapContainer center={[13.0827, 80.2707]} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {crimes.map((crime, idx) =>
              crime.lat && crime.lng && (
                <Marker key={idx} position={[crime.lat, crime.lng]}>
                  <Popup>
                    <div className="font-bold">{crime.location}</div>
                    <div>{crime.type}</div>
                    <div className="text-xs">{crime.date}</div>
                  </Popup>
                </Marker>
              )
            )}
            {myLocation && (
              <Marker position={[myLocation.lat, myLocation.lng]}>
                <Popup>Your location</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Alerts */}
        <div className="bg-gray-100 p-3 rounded shadow h-full overflow-y-auto">
          <h2 className="text-lg font-semibold mb-2">🚨 Incoming Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-gray-500">No alerts yet.</p>
          ) : (
            alerts.map((alert, idx) => (
              <div key={idx} className="bg-white p-3 mb-3 rounded shadow-sm border-l-4 border-red-500">
                <p className="font-bold text-red-600 mb-1">
                  {alert.crimeType} Alert
                </p>
                <p className="text-sm mb-1">
                  <strong>👤 User:</strong> {alert.user}
                </p>
                <p className="text-sm mb-1">
                  <strong>📍 Crime Location:</strong> {alert.location}
                </p>
                <p className="text-xs mb-1 text-gray-500">
                  <strong>User Coords:</strong> {alert.userLat?.toFixed(4)}, {alert.userLng?.toFixed(4)}
                </p>
                <p className="text-xs mb-1 text-gray-500">
                  <strong>Crime Coords:</strong> {alert.crimeLat?.toFixed(4)}, {alert.crimeLng?.toFixed(4)}
                </p>
                <p className="text-sm mb-1">
                  <strong>📏 Distance:</strong> {alert.distance} km
                </p>
                <p className="text-sm mb-2 text-gray-600">
                  <strong>⏱️ Time:</strong> {new Date(alert.detectedAt).toLocaleString()}
                </p>
                <a
                  href={alert.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-500 text-white px-3 py-1 rounded text-sm font-semibold hover:bg-blue-600 transition"
                >
                  🧭 Navigate to User
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default PatrolDashboard
