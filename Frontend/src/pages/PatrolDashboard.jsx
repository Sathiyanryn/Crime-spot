import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import API, { API_BASE_URL } from '../services/api';
import { getName, getPhone, getToken, logout } from '../services/auth';
import { useNavigate } from 'react-router-dom';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

const PatrolDashboard = ({ setAuthState }) => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);

  const handleLogout = () => {
    logout();
    setAuthState({
      token: null,
      role: null,
      phone: null,
      name: null,
      loading: false,
    });
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const response = await API.get('/api/alerts/active');
        setAlerts(response.data || []);
      } catch (err) {
        console.error('Unable to load patrol alerts', err);
      }
    };

    loadAlerts();

    const token = getToken();
    if (!token) {
      return undefined;
    }

    const socket = io(API_BASE_URL, {
      auth: { token },
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('crime_zone_alert', (data) => {
      setAlerts((current) => {
        const exists = current.some((alert) => alert._id === data._id);
        if (exists) {
          return current;
        }
        return [{ ...data, status: data.status || 'active' }, ...current];
      });
    });

    socket.on('crime_zone_alert_updated', (data) => {
      setAlerts((current) =>
        current.map((alert) =>
          alert._id === data._id ? { ...alert, ...data } : alert
        )
      );
    });

    socket.on('alert_handled', (data) => {
      setAlerts((current) =>
        current.map((alert) =>
          alert._id === data.alert_id ? { ...alert, status: 'handled' } : alert
        )
      );
    });

    socket.on('alert_deleted', (data) => {
      setAlerts((current) => current.filter((alert) => alert._id !== data.alert_id));
    });

    return () => socket.disconnect();
  }, []);

  const activeAlerts = alerts.filter((alert) => alert.status !== 'handled');

  const markers = useMemo(
    () =>
      activeAlerts.flatMap((alert) => {
        const items = [];

        if (alert.crime_lat != null && alert.crime_lng != null) {
          items.push({
            lat: Number(alert.crime_lat),
            lng: Number(alert.crime_lng),
            label: `Crime: ${alert.crime_type}`,
          });
        }

        if (alert.user_lat != null && alert.user_lng != null) {
          items.push({
            lat: Number(alert.user_lat),
            lng: Number(alert.user_lng),
            label: `User: ${alert.user_name || alert.user || 'Unknown'}`,
          });
        }

        return items;
      }),
    [activeAlerts]
  );

  const mapCenter = markers[0] ? [markers[0].lat, markers[0].lng] : [13.0827, 80.2707];

  const handleNavigate = (alert) => {
    if (alert.user_lat == null || alert.user_lng == null) {
      return;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${alert.user_lat},${alert.user_lng}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleCall = (phoneValue) => {
    const sanitizedPhone = (phoneValue || '').replace(/[^\d+]/g, '');
    if (!sanitizedPhone) {
      return;
    }
    window.location.href = `tel:${sanitizedPhone}`;
  };

  const handleMarkHandled = async (alertId) => {
    try {
      await API.put(`/api/alert/${alertId}/mark-handled`, {});
      setAlerts((current) =>
        current.map((alert) =>
          alert._id === alertId ? { ...alert, status: 'handled' } : alert
        )
      );
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Unable to mark alert handled');
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Field Operations</span>
          <h1>Patrol Dashboard</h1>
          <p>Real-time incident queue with the same call, navigate, and handle workflow as mobile patrol.</p>
        </div>

        <div className="dashboard-actions">
          <div className="profile-chip">
            <strong>{getName() || 'Patrol'}</strong>
            <span>{getPhone() || 'No phone stored'}</span>
          </div>
          <div className={`signal-chip ${connected ? 'signal-chip--live' : ''}`}>
            {connected ? 'Socket Live' : 'Socket Offline'}
          </div>
          <button className="danger-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="page-grid">
        <div className="card stats-stack">
          <div className="stat-card">
            <span>Active Alerts</span>
            <strong>{activeAlerts.length}</strong>
          </div>
          <div className="stat-card">
            <span>Connection</span>
            <strong>{connected ? 'Live' : 'Offline'}</strong>
          </div>
          <div className="stat-card">
            <span>Handled</span>
            <strong>{alerts.length - activeAlerts.length}</strong>
          </div>
        </div>

        <div className="card map-card">
          <div className="section-head">
            <div>
              <h2>Patrol Response Map</h2>
              <p>Crime markers and affected user positions.</p>
            </div>
          </div>
          <MapContainer center={mapCenter} zoom={12} style={{ height: '420px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {markers.map((marker, index) => (
              <Marker key={`${marker.label}-${index}`} position={[marker.lat, marker.lng]}>
                <Popup>{marker.label}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </section>

      <section className="card list-card">
        <div className="section-head">
          <div>
            <h2>Incoming Alerts</h2>
            <p>Newest unhandled incidents are shown first.</p>
          </div>
        </div>

        {activeAlerts.length === 0 ? (
          <p className="empty-copy">No active alerts right now.</p>
        ) : (
          activeAlerts.map((alert) => (
            <article key={alert._id} className="list-item alert-item">
              <div>
                <strong>{alert.crime_type}</strong>
                <p>{alert.location}</p>
                <span>{alert.user_name || alert.user || 'Unknown user'}</span>
                <small>
                  {alert.distance_km != null ? `${alert.distance_km} km away` : 'Distance unavailable'}
                </small>
              </div>

              <div className="action-row">
                <button className="primary-button" onClick={() => handleNavigate(alert)}>
                  Navigate
                </button>
                <button className="ghost-button" onClick={() => handleCall(alert.phone || alert.user)}>
                  Call
                </button>
                <button className="danger-button" onClick={() => handleMarkHandled(alert._id)}>
                  Mark Handled
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default PatrolDashboard;
