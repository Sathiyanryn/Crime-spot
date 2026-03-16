import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import API from '../services/api';
import { getName, getPhone, logout } from '../services/auth';
import { useNavigate } from 'react-router-dom';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

const UserHome = ({ setAuthState }) => {
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [crimes, setCrimes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('Initializing...');
  const [isTracking, setIsTracking] = useState(false);

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
    let watcherId = null;

    const load = async () => {
      try {
        const crimesRes = await API.get('/api/crimes');
        setCrimes(crimesRes.data || []);
      } catch (err) {
        console.error('Unable to load crimes', err);
      }

      if (!navigator.geolocation) {
        setStatus('Geolocation not supported in this browser');
        return;
      }

      watcherId = navigator.geolocation.watchPosition(
        async (position) => {
          const nextLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          setLocation(nextLocation);
          setIsTracking(true);

          try {
            const response = await API.post('/api/check-location', {
              lat: nextLocation.lat,
              lng: nextLocation.lng,
              timezone_offset_minutes: new Date().getTimezoneOffset(),
            });

            const newAlerts = response.data?.alerts || [];
            setAlerts(newAlerts);
            setStatus(newAlerts.length ? `${newAlerts.length} risk zone(s) detected nearby` : 'Location tracking active');
          } catch (err) {
            setStatus('Tracking active, but server updates are failing');
          }
        },
        () => {
          setStatus('Location permission denied');
          setIsTracking(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 20000,
        }
      );
    };

    load();

    return () => {
      if (watcherId != null) {
        navigator.geolocation.clearWatch(watcherId);
      }
    };
  }, []);

  const markers = useMemo(() => {
    const crimeMarkers = crimes
      .filter((crime) => crime.lat != null && crime.lng != null)
      .slice(0, 6)
      .map((crime) => ({
        lat: Number(crime.lat),
        lng: Number(crime.lng),
        label: `${crime.type} - ${crime.location}`,
      }));

    if (!location) {
      return crimeMarkers;
    }

    return [
      { lat: location.lat, lng: location.lng, label: 'Your current location' },
      ...crimeMarkers,
    ];
  }, [crimes, location]);

  const mapCenter = location ? [location.lat, location.lng] : [13.0827, 80.2707];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Personal Safety</span>
          <h1>User Dashboard</h1>
          <p>Follow the same safety flow as mobile: live location tracking, nearby crime map, and risk summaries.</p>
        </div>

        <div className="dashboard-actions">
          <div className="profile-chip">
            <strong>{getName() || 'User'}</strong>
            <span>{getPhone() || 'No phone stored'}</span>
          </div>
          <button className="danger-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="page-grid">
        <div className="card stats-stack">
          <div className="stat-card">
            <span>Tracking</span>
            <strong>{isTracking ? 'On' : 'Off'}</strong>
          </div>
          <div className="stat-card">
            <span>Nearby Alerts</span>
            <strong>{alerts.length}</strong>
          </div>
          <div className="stat-card">
            <span>Crime Points</span>
            <strong>{crimes.length}</strong>
          </div>
          <div className="status-banner">{status}</div>
        </div>

        <div className="card map-card">
          <div className="section-head">
            <div>
              <h2>Safety Map</h2>
              <p>Your current position compared with recent crime markers.</p>
            </div>
          </div>
          <MapContainer center={mapCenter} zoom={13} style={{ height: '420px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {markers.map((marker, index) => (
              <Marker key={`${marker.label}-${index}`} position={[marker.lat, marker.lng]}>
                <Popup>{marker.label}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </section>

      <section className="page-grid">
        <div className="card list-card">
          <div className="section-head">
            <div>
              <h2>Safety Checks</h2>
              <p>Web equivalents of the mobile status cards.</p>
            </div>
          </div>
          <article className="list-item static-card">
            <div>
              <strong>Background-style tracking</strong>
              <p>The browser keeps updating your location while this page remains open.</p>
            </div>
            <span>{isTracking ? 'Ready' : 'Waiting'}</span>
          </article>
          <article className="list-item static-card">
            <div>
              <strong>Preview-only checks</strong>
              <p>The webpage only evaluates nearby risk zones locally and does not dispatch patrol alerts.</p>
            </div>
            <span>{alerts.length ? 'Previewing' : 'Clear'}</span>
          </article>
          <article className="list-item static-card">
            <div>
              <strong>Notification awareness</strong>
              <p>Risk alerts are surfaced inside the dashboard so the web flow matches the mobile home screen.</p>
            </div>
            <span>Visible</span>
          </article>
        </div>

        <div className="card list-card">
          <div className="section-head">
            <div>
              <h2>Nearby Risk Alerts</h2>
              <p>Latest server-evaluated crime zone results.</p>
            </div>
          </div>
          {alerts.length === 0 ? (
            <p className="empty-copy">No active crime-zone warnings right now.</p>
          ) : (
            alerts.map((alert, index) => (
              <article key={`${alert.location}-${index}`} className="list-item">
                <div>
                  <strong>{alert.type || alert.crime_type || 'Crime Alert'}</strong>
                  <p>{alert.location}</p>
                  <span>{alert.message}</span>
                </div>
                <small>{alert.distance_km != null ? `${alert.distance_km} km` : 'Nearby'}</small>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default UserHome;
