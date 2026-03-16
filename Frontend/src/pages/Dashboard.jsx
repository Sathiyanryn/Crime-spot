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

const initialCrimeForm = {
  id: '',
  location: '',
  type: '',
  date: '',
  lat: '',
  lng: '',
};

const initialUserForm = {
  id: '',
  phone: '',
  password: '',
  name: '',
  aadhar: '',
  role: 'user',
};

const initialAlertForm = {
  id: '',
  user: '',
  user_name: '',
  aadhar: '',
  crime_type: '',
  location: '',
  message: '',
  user_lat: '',
  user_lng: '',
  crime_lat: '',
  crime_lng: '',
  status: 'active',
};

const toNumeric = (value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const Dashboard = ({ setAuthState }) => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [crimes, setCrimes] = useState([]);
  const [users, setUsers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [crimeForm, setCrimeForm] = useState(initialCrimeForm);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [alertForm, setAlertForm] = useState(initialAlertForm);

  const loadData = async () => {
    try {
      setError('');
      const [crimesRes, usersRes, alertsRes] = await Promise.all([
        API.get('/api/crimes'),
        API.get('/api/users'),
        API.get('/api/alerts').catch(() => API.get('/api/alerts/active')),
      ]);

      setCrimes(crimesRes.data || []);
      setUsers(usersRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load dashboard data');
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        handleLogout();
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const saveCrime = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        location: crimeForm.location,
        type: crimeForm.type,
        date: crimeForm.date,
        lat: Number(crimeForm.lat),
        lng: Number(crimeForm.lng),
      };

      if (crimeForm.id) {
        await API.put(`/api/crimes/${crimeForm.id}`, payload);
      } else {
        await API.post('/api/crimes', payload);
      }

      setCrimeForm(initialCrimeForm);
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Crime could not be saved');
    }
  };

  const deleteCrime = async (crime) => {
    if (!window.confirm(`Delete ${crime.location}?`)) {
      return;
    }

    try {
      await API.delete(`/api/crimes/${crime._id || encodeURIComponent(crime.location)}`);
      if (crimeForm.id === crime._id) {
        setCrimeForm(initialCrimeForm);
      }
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Crime could not be deleted');
    }
  };

  const saveUser = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        phone: userForm.phone,
        password: userForm.password || undefined,
        name: userForm.name,
        aadhar: userForm.aadhar,
        role: userForm.role,
      };

      if (userForm.id) {
        await API.put(`/api/users/${userForm.id}`, payload);
      } else {
        await API.post('/api/users', payload);
      }

      setUserForm(initialUserForm);
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'User could not be saved');
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.phone}?`)) {
      return;
    }

    try {
      await API.delete(`/api/users/${user._id}`);
      if (userForm.id === user._id) {
        setUserForm(initialUserForm);
      }
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'User could not be deleted');
    }
  };

  const saveAlert = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        user: alertForm.user || undefined,
        user_name: alertForm.user_name || undefined,
        aadhar: alertForm.aadhar || undefined,
        crime_type: alertForm.crime_type,
        location: alertForm.location,
        message: alertForm.message || undefined,
        user_lat: toNumeric(alertForm.user_lat),
        user_lng: toNumeric(alertForm.user_lng),
        crime_lat: toNumeric(alertForm.crime_lat),
        crime_lng: toNumeric(alertForm.crime_lng),
        status: alertForm.status,
      };

      if (alertForm.id) {
        await API.put(`/api/alerts/${alertForm.id}`, payload);
      } else {
        await API.post('/api/alerts', payload);
      }

      setAlertForm(initialAlertForm);
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Alert could not be saved');
    }
  };

  const deleteAlert = async (alertItem) => {
    if (!window.confirm(`Delete alert at ${alertItem.location}?`)) {
      return;
    }

    try {
      await API.delete(`/api/alerts/${alertItem._id}`);
      if (alertForm.id === alertItem._id) {
        setAlertForm(initialAlertForm);
      }
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Alert could not be deleted');
    }
  };

  const markAlertHandled = async (alertId) => {
    try {
      await API.put(`/api/alert/${alertId}/mark-handled`, {});
      loadData();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Alert could not be marked handled');
    }
  };

  const callUser = (phone) => {
    const sanitizedPhone = (phone || '').replace(/[^\d+]/g, '');
    if (!sanitizedPhone) {
      return;
    }
    window.location.href = `tel:${sanitizedPhone}`;
  };

  const overviewMarkers = useMemo(() => {
    const crimeMarkers = crimes
      .filter((crime) => crime.lat != null && crime.lng != null)
      .slice(0, 6)
      .map((crime) => ({
        lat: Number(crime.lat),
        lng: Number(crime.lng),
        label: `${crime.type} - ${crime.location}`,
      }));

    const userMarkers = users
      .filter((user) => user.last_location?.lat != null && user.last_location?.lng != null)
      .slice(0, 4)
      .map((user) => ({
        lat: Number(user.last_location.lat),
        lng: Number(user.last_location.lng),
        label: `${user.role} - ${user.phone}`,
      }));

    return [...crimeMarkers, ...userMarkers];
  }, [crimes, users]);

  const mapCenter = overviewMarkers[0]
    ? [overviewMarkers[0].lat, overviewMarkers[0].lng]
    : [13.0827, 80.2707];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Control Center</span>
          <h1>Admin Dashboard</h1>
          <p>
            Manage crimes, users, and alerts in the same four-section flow used by
            the mobile admin app.
          </p>
        </div>

        <div className="dashboard-actions">
          <div className="profile-chip">
            <strong>{getName() || 'Admin'}</strong>
            <span>{getPhone() || 'No phone stored'}</span>
          </div>
          <button className="ghost-button" onClick={() => { setRefreshing(true); loadData(); }}>
            Refresh
          </button>
          <button className="danger-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <nav className="tab-row">
        {['overview', 'crimes', 'users', 'alerts'].map((tab) => (
          <button
            key={tab}
            className={selectedTab === tab ? 'is-active' : ''}
            onClick={() => setSelectedTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {error ? <p className="page-error">{error}</p> : null}

      {selectedTab === 'overview' && (
        <section className="page-grid">
          <div className="card stats-stack">
            <div className="stat-card">
              <span>Crimes</span>
              <strong>{crimes.length}</strong>
            </div>
            <div className="stat-card">
              <span>Users</span>
              <strong>{users.length}</strong>
            </div>
            <div className="stat-card">
              <span>Active Alerts</span>
              <strong>{alerts.filter((item) => item.status !== 'handled').length}</strong>
            </div>
          </div>

          <div className="card map-card">
            <div className="section-head">
              <div>
                <h2>Operational Map</h2>
                <p>Crime points and recent user locations</p>
              </div>
            </div>
            <MapContainer center={mapCenter} zoom={12} style={{ height: '420px', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {overviewMarkers.map((marker, index) => (
                <Marker key={`${marker.label}-${index}`} position={[marker.lat, marker.lng]}>
                  <Popup>{marker.label}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </section>
      )}

      {selectedTab === 'crimes' && (
        <section className="page-grid">
          <form className="card editor-card" onSubmit={saveCrime}>
            <div className="section-head">
              <div>
                <h2>{crimeForm.id ? 'Edit Crime' : 'Add Crime'}</h2>
                <p>Mirror the mobile admin crime editor on the web.</p>
              </div>
            </div>
            <input placeholder="Location" value={crimeForm.location} onChange={(e) => setCrimeForm({ ...crimeForm, location: e.target.value })} required />
            <input placeholder="Crime Type" value={crimeForm.type} onChange={(e) => setCrimeForm({ ...crimeForm, type: e.target.value })} required />
            <input placeholder="Date" value={crimeForm.date} onChange={(e) => setCrimeForm({ ...crimeForm, date: e.target.value })} required />
            <div className="split-inputs">
              <input placeholder="Latitude" value={crimeForm.lat} onChange={(e) => setCrimeForm({ ...crimeForm, lat: e.target.value })} required />
              <input placeholder="Longitude" value={crimeForm.lng} onChange={(e) => setCrimeForm({ ...crimeForm, lng: e.target.value })} required />
            </div>
            <div className="action-row">
              <button type="submit" className="primary-button">{crimeForm.id ? 'Update Crime' : 'Create Crime'}</button>
              <button type="button" className="ghost-button" onClick={() => setCrimeForm(initialCrimeForm)}>Clear</button>
            </div>
          </form>

          <div className="card list-card">
            <div className="section-head">
              <div>
                <h2>Saved Crimes</h2>
                <p>Map-backed incidents from the shared backend.</p>
              </div>
            </div>
            {crimes.map((crime) => (
              <article key={crime._id || crime.location} className="list-item">
                <div>
                  <strong>{crime.type}</strong>
                  <p>{crime.location}</p>
                  <span>{crime.date}</span>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setCrimeForm({
                        id: crime._id || '',
                        location: crime.location || '',
                        type: crime.type || '',
                        date: crime.date || '',
                        lat: String(crime.lat ?? ''),
                        lng: String(crime.lng ?? ''),
                      })
                    }
                  >
                    Edit
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteCrime(crime)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedTab === 'users' && (
        <section className="page-grid">
          <form className="card editor-card" onSubmit={saveUser}>
            <div className="section-head">
              <div>
                <h2>{userForm.id ? 'Edit User' : 'Add User'}</h2>
                <p>Create and manage `user`, `patrol`, and `admin` roles.</p>
              </div>
            </div>
            <input placeholder="Phone" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} required />
            <input placeholder={userForm.id ? 'New Password (optional)' : 'Password'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            <input placeholder="Aadhar" value={userForm.aadhar} onChange={(e) => setUserForm({ ...userForm, aadhar: e.target.value })} required />
            <div className="role-picker">
              {['user', 'patrol', 'admin'].map((role) => (
                <button
                  key={role}
                  type="button"
                  className={userForm.role === role ? 'is-active' : ''}
                  onClick={() => setUserForm({ ...userForm, role })}
                >
                  {role}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button type="submit" className="primary-button">{userForm.id ? 'Update User' : 'Create User'}</button>
              <button type="button" className="ghost-button" onClick={() => setUserForm(initialUserForm)}>Clear</button>
            </div>
          </form>

          <div className="card list-card">
            <div className="section-head">
              <div>
                <h2>Users</h2>
                <p>Role and location data visible to admin operations.</p>
              </div>
            </div>
            {users.map((user) => (
              <article key={user._id} className="list-item">
                <div>
                  <strong>{user.name || user.phone}</strong>
                  <p>{user.phone}</p>
                  <span>{user.role}</span>
                  {user.last_location ? (
                    <small>
                      {Number(user.last_location.lat).toFixed(4)},{' '}
                      {Number(user.last_location.lng).toFixed(4)}
                    </small>
                  ) : null}
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setUserForm({
                        id: user._id,
                        phone: user.phone || '',
                        password: '',
                        name: user.name || '',
                        aadhar: user.aadhar || '',
                        role: user.role || 'user',
                      })
                    }
                  >
                    Edit
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteUser(user)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedTab === 'alerts' && (
        <section className="page-grid">
          <form className="card editor-card" onSubmit={saveAlert}>
            <div className="section-head">
              <div>
                <h2>{alertForm.id ? 'Edit Alert' : 'Create Alert'}</h2>
                <p>Broadcast or update incidents the same way the mobile admin panel does.</p>
              </div>
            </div>
            <input placeholder="User Phone" value={alertForm.user} onChange={(e) => setAlertForm({ ...alertForm, user: e.target.value })} />
            <input placeholder="User Name" value={alertForm.user_name} onChange={(e) => setAlertForm({ ...alertForm, user_name: e.target.value })} />
            <input placeholder="Aadhar" value={alertForm.aadhar} onChange={(e) => setAlertForm({ ...alertForm, aadhar: e.target.value })} />
            <input placeholder="Crime Type" value={alertForm.crime_type} onChange={(e) => setAlertForm({ ...alertForm, crime_type: e.target.value })} required />
            <input placeholder="Location" value={alertForm.location} onChange={(e) => setAlertForm({ ...alertForm, location: e.target.value })} required />
            <textarea placeholder="Message" value={alertForm.message} onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })} rows={4} />
            <div className="split-inputs">
              <input placeholder="Crime Latitude" value={alertForm.crime_lat} onChange={(e) => setAlertForm({ ...alertForm, crime_lat: e.target.value })} />
              <input placeholder="Crime Longitude" value={alertForm.crime_lng} onChange={(e) => setAlertForm({ ...alertForm, crime_lng: e.target.value })} />
            </div>
            <div className="split-inputs">
              <input placeholder="User Latitude" value={alertForm.user_lat} onChange={(e) => setAlertForm({ ...alertForm, user_lat: e.target.value })} />
              <input placeholder="User Longitude" value={alertForm.user_lng} onChange={(e) => setAlertForm({ ...alertForm, user_lng: e.target.value })} />
            </div>
            <div className="role-picker">
              {['active', 'handled'].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={alertForm.status === status ? 'is-active' : ''}
                  onClick={() => setAlertForm({ ...alertForm, status })}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button type="submit" className="primary-button">{alertForm.id ? 'Update Alert' : 'Create Alert'}</button>
              <button type="button" className="ghost-button" onClick={() => setAlertForm(initialAlertForm)}>Clear</button>
            </div>
          </form>

          <div className="card list-card">
            <div className="section-head">
              <div>
                <h2>Alerts</h2>
                <p>Track active incidents, call users, and close response loops.</p>
              </div>
            </div>
            {alerts.map((alertItem) => (
              <article key={alertItem._id} className="list-item">
                <div>
                  <strong>{alertItem.crime_type}</strong>
                  <p>{alertItem.location}</p>
                  <span>{alertItem.user || alertItem.user_name || 'Unknown user'}</span>
                  <small>Status: {alertItem.status || 'active'}</small>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setAlertForm({
                        id: alertItem._id,
                        user: alertItem.user || '',
                        user_name: alertItem.user_name || '',
                        aadhar: alertItem.aadhar || '',
                        crime_type: alertItem.crime_type || '',
                        location: alertItem.location || '',
                        message: alertItem.message || '',
                        user_lat: alertItem.user_lat != null ? String(alertItem.user_lat) : '',
                        user_lng: alertItem.user_lng != null ? String(alertItem.user_lng) : '',
                        crime_lat: alertItem.crime_lat != null ? String(alertItem.crime_lat) : '',
                        crime_lng: alertItem.crime_lng != null ? String(alertItem.crime_lng) : '',
                        status: alertItem.status || 'active',
                      })
                    }
                  >
                    Edit
                  </button>
                  {alertItem.status !== 'handled' ? (
                    <button type="button" className="primary-button" onClick={() => markAlertHandled(alertItem._id)}>
                      Handle
                    </button>
                  ) : null}
                  <button type="button" className="ghost-button" onClick={() => callUser(alertItem.user)}>
                    Call
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteAlert(alertItem)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Dashboard;
