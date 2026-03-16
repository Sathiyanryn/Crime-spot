// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import API from '../services/api'
import { logout, getRole, getToken } from '../services/auth'
import { useNavigate } from 'react-router-dom'
import AddCrimeForm from '../components/AddCrimeForm'
import CrimeList from '../components/CrimeList'
import L from 'leaflet'
import { io } from 'socket.io-client'

// ---- Fix Leaflet icon issue ----
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

const Dashboard = () => {
  const [crimes, setCrimes] = useState([])
  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [myLocation, setMyLocation] = useState(null)
  const [activeTab, setActiveTab] = useState('crimes') // crimes, alerts, users
  const [selectedAlerts, setSelectedAlerts] = useState(new Set())
  const navigate = useNavigate()
  const role = getRole() || 'user'
  
  // Alert deduplication - store recent alert zones with timestamps
  const [recentAlerts] = useState(new Map())
  const ALERT_COOLDOWN = 10 * 60 * 1000 // 10 minutes

  // ---- Socket.IO setup ----
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const newSocket = io('http://127.0.0.1:5000', {
      auth: { token },
    })

    newSocket.on('connect', () => console.log('Socket connected'))
    newSocket.on('disconnect', () => console.log('Socket disconnected'))
    newSocket.on('crime_zone_alert', (data) => {
      // Spam prevention - check if we alerted for this zone recently
      const zoneKey = `${data.lat}-${data.lng}`
      const lastAlertTime = recentAlerts.get(zoneKey)
      const now = Date.now()
      
      if (lastAlertTime && now - lastAlertTime < ALERT_COOLDOWN) {
        console.log(`[Web Alert Spam Prevention] Zone ${zoneKey} already alerted ${now - lastAlertTime}ms ago - SKIPPING`)
        return
      }
      
      // New alert or cooldown expired
      alert(`⚠️ Crime Alert: ${data.message}`)
      recentAlerts.set(zoneKey, now)
      console.log(`[Web Alert] Showing notification for zone ${zoneKey}`)
      
      if (role === 'admin') fetchAlerts()
    })

    return () => newSocket.disconnect()
  }, [role, recentAlerts])

  // ---- Fetch crimes on load ----
  useEffect(() => {
    if (role === 'admin') {
      fetchCrimes()
      fetchAlerts()
      fetchUsers()
    } else {
      fetchCrimes()
    }
  }, [role])

  // ---- Fetch user's location ----
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMyLocation({ lat, lng })

        try {
          const res = await API.post('/api/location/update', {
            latitude: lat,
            longitude: lng,
          })
          if (res.data?.alert) {
            res.data.alerts.forEach((a) => {
              alert(`⚠️ ${a.message}`)
            })
          }
        } catch (err) {
          console.error('Location update failed:', err)
        }
      },
      (err) => {
        console.error('Geolocation error:', err)
      },
      { enableHighAccuracy: true }
    )
  }, [])

  const fetchCrimes = async () => {
    try {
      setLoading(true)
      const res = await API.get('/api/crimes')
      setCrimes(res.data)
    } catch (err) {
      console.error(err)
      if (err?.response?.status === 401) {
        logout()
        navigate('/login')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await API.get('/api/alerts/active')
      setAlerts(res.data || [])
    } catch (err) {
      console.error('Error fetching alerts:', err)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await API.get('/api/users')
      setUsers(res.data || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleDelete = async (location) => {
    if (!window.confirm(`Delete crime at ${location}?`)) return
    try {
      const res = await API.delete(`/api/crimes/${encodeURIComponent(location)}`)
      alert(res.data.message)
      fetchCrimes()
    } catch (err) {
      alert(err?.response?.data?.message || 'Delete failed')
    }
  }

  const handleAlertPatrol = async (crime) => {
    try {
      const body = {
        location: crime.location,
        message: `Patrol requested for ${crime.location} - ${crime.type}`,
        lat: crime.lat,
        lng: crime.lng,
      }
      const res = await API.post('/api/alert', body)
      alert(res.data.message)
      if (role === 'admin') fetchAlerts()
    } catch (err) {
      console.error(err)
      alert('Failed to send alert')
    }
  }

  const handleCreateAlert = async (e) => {
    e.preventDefault()
    if (!newAlertForm.location || !newAlertForm.message || !newAlertForm.lat || !newAlertForm.lng) {
      alert('All fields required')
      return
    }
    try {
      const res = await API.post('/api/alert', {
        location: newAlertForm.location,
        message: newAlertForm.message,
        type: newAlertForm.type,
        lat: parseFloat(newAlertForm.lat),
        lng: parseFloat(newAlertForm.lng),
      })
      alert(res.data.message)
      setNewAlertForm({ location: '', message: '', type: 'Alert', lat: '', lng: '' })
      fetchAlerts()
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to create alert')
    }
  }

  const handleDeleteAlert = async (alertId) => {
    if (!window.confirm('Delete this alert?')) return
    try {
      console.log('Deleting alert:', alertId)
      const response = await API.delete(`/api/alerts/${alertId}`)
      console.log('Delete response:', response)
      alert('Alert deleted successfully')
      fetchAlerts()
    } catch (err) {
      console.error('Delete error:', err)
      alert(err?.response?.data?.message || err?.message || 'Failed to delete alert')
    }
  }

  const handleMarkAlertHandled = async (alertId) => {
    try {
      await API.put(`/api/alert/${alertId}/mark-handled`, {})
      fetchAlerts()
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to mark alert')
    }
  }

  const toggleAlertSelection = (alertId) => {
    const newSelected = new Set(selectedAlerts)
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId)
    } else {
      newSelected.add(alertId)
    }
    setSelectedAlerts(newSelected)
  }

  const toggleSelectAllAlerts = () => {
    const activeAlerts = alerts.filter((a) => a.status !== 'handled')
    if (selectedAlerts.size === activeAlerts.length) {
      setSelectedAlerts(new Set())
    } else {
      setSelectedAlerts(new Set(activeAlerts.map((a) => a._id)))
    }
  }

  const handleBulkDeleteAlerts = async () => {
    if (selectedAlerts.size === 0) {
      alert('Select alerts to delete')
      return
    }
    if (!window.confirm(`Delete ${selectedAlerts.size} alert(s)?`)) return

    try {
      let deletedCount = 0
      let failedCount = 0
      const alertIds = Array.from(selectedAlerts)

      console.log(`Deleting ${alertIds.length} alerts...`)

      for (const alertId of alertIds) {
        try {
          console.log(`Deleting alert: ${alertId}`)
          const response = await API.delete(`/api/alerts/${alertId}`)
          console.log(`Delete successful: ${alertId}`, response)
          deletedCount++
        } catch (err) {
          console.error(`Failed to delete alert ${alertId}:`, err)
          failedCount++
        }
      }

      if (deletedCount > 0 && failedCount === 0) {
        alert(`✅ Deleted ${deletedCount} alert(s)`)
      } else if (deletedCount > 0) {
        alert(`⚠️ Deleted ${deletedCount}/${alertIds.length} alerts. ${failedCount} failed.`)
      } else {
        alert(`❌ Failed to delete all ${alertIds.length} alerts. Check browser console.`)
      }

      setSelectedAlerts(new Set())
      fetchAlerts()
    } catch (err) {
      console.error('Bulk delete error:', err)
      alert('Bulk delete failed: ' + (err?.message || 'Unknown error'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* -------- Header -------- */}
      <div className="flex justify-between items-center p-4 bg-gray-800 text-white sticky top-0 z-10">
        <h1 className="text-2xl font-bold">CrimeSpot Dashboard ({role})</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded font-semibold"
        >
          Logout
        </button>
      </div>

      {/* -------- Admin Tabs -------- */}
      {role === 'admin' && (
        <div className="flex gap-2 p-4 bg-white border-b sticky top-16 z-10">
          <button
            onClick={() => setActiveTab('crimes')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'crimes'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            🚨 Crimes
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'alerts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            ⚠️ Alerts ({alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            👥 Users ({users.length})
          </button>
        </div>
      )}

      {/* -------- Main Content -------- */}
      <div className="p-4 max-w-7xl mx-auto">
        {/* CRIMES TAB */}
        {(role !== 'admin' || activeTab === 'crimes') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Map */}
            <div className="md:col-span-2 h-[70vh] bg-white rounded shadow overflow-hidden">
              <MapContainer
                center={
                  myLocation ? [myLocation.lat, myLocation.lng] : [13.0827, 80.2707]
                }
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {crimes.map(
                  (crime, idx) =>
                    crime.lat &&
                    crime.lng && (
                      <Marker key={idx} position={[crime.lat, crime.lng]}>
                        <Popup>
                          <div className="font-bold">{crime.location}</div>
                          <div>{crime.type}</div>
                          <div className="text-xs">{crime.date}</div>

                          <div className="mt-2 flex gap-2">
                            {role === 'admin' && (
                              <button
                                onClick={() => handleDelete(crime.location)}
                                className="bg-red-500 text-white px-2 py-1 rounded text-sm"
                              >
                                Delete
                              </button>
                            )}

                            <button
                              onClick={() => handleAlertPatrol(crime)}
                              className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
                            >
                              Alert Patrol
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    )
                )}

                {myLocation && (
                  <Marker position={[myLocation.lat, myLocation.lng]}>
                    <Popup>You are here</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            {/* Side Panel */}
            <div className="space-y-4">
              {role === 'admin' && (
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-2">Add Crime</h3>
                  <AddCrimeForm onAdded={fetchCrimes} useLocation={myLocation} />
                </div>
              )}

              <div className="bg-white p-4 rounded shadow max-h-[70vh] overflow-y-auto">
                <h3 className="font-semibold mb-2">Crime List</h3>
                <CrimeList
                  crimes={crimes}
                  onDelete={handleDelete}
                  onAlert={handleAlertPatrol}
                  role={role}
                />
              </div>
            </div>
          </div>
        )}

        {/* ALERTS TAB */}
        {role === 'admin' && activeTab === 'alerts' && (
          <div>
            {/* Alerts Management */}
            <div className="bg-white p-4 rounded shadow">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Active Alerts</h3>
                <div className="flex gap-2">
                  <button
                    onClick={toggleSelectAllAlerts}
                    className={`px-3 py-1 rounded text-sm font-semibold ${
                      selectedAlerts.size > 0
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    }`}
                  >
                    {selectedAlerts.size === 0 ? 'Select All' : 'Deselect All'}
                  </button>
                  {selectedAlerts.size > 0 && (
                    <button
                      onClick={handleBulkDeleteAlerts}
                      className="px-3 py-1 rounded text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
                    >
                      🗑️ Delete ({selectedAlerts.size})
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="text-gray-500">No alerts</p>
                ) : (
                  alerts
                    .filter((a) => a.status !== 'handled')
                    .map((alert) => (
                      <div
                        key={alert._id}
                        className={`border-l-4 p-3 rounded flex items-start gap-3 ${
                          selectedAlerts.has(alert._id)
                            ? 'border-l-blue-600 bg-blue-50'
                            : 'border-l-orange-500 bg-orange-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAlerts.has(alert._id)}
                          onChange={() => toggleAlertSelection(alert._id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-orange-600">
                            {alert.crime_type}
                          </p>
                          <p className="text-sm text-gray-700">{alert.location}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            From: {alert.user}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(alert.detected_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Coords: ({alert.user_lat?.toFixed(4)},{' '}
                            {alert.user_lng?.toFixed(4)})
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleMarkAlertHandled(alert._id)}
                            className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600 whitespace-nowrap"
                          >
                            Handled
                          </button>
                          <button
                            onClick={() => handleDeleteAlert(alert._id)}
                            className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 whitespace-nowrap"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {role === 'admin' && activeTab === 'users' && (
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-4 text-lg">Users Management</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2">
                  <tr>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Role</th>
                    <th className="text-left p-2">Last Location</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{user.email}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-red-100 text-red-700'
                              : user.role === 'patrol'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="p-2 text-xs">
                        {user.last_location ? (
                          <>
                            {user.last_location.lat?.toFixed(4)},{' '}
                            {user.last_location.lng?.toFixed(4)}
                            <br />
                            <span className="text-gray-500">
                              {new Date(user.last_location.updated_at).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          'No location'
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() =>
                            alert(
                              `User: ${user.email}\nRole: ${user.role}\nCreated tracking for this user`
                            )
                          }
                          className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
