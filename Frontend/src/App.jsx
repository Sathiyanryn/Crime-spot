import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PatrolDashboard from './pages/PatrolDashboard';
import UserHome from './pages/UserHome';
import { getAuthState } from './services/auth';

const getHomeRoute = (role) => {
  if (role === 'admin') {
    return '/admin/dashboard';
  }

  if (role === 'patrol') {
    return '/patrol/dashboard';
  }

  return '/user/home';
};

const ProtectedRoute = ({ auth, allowedRoles, children }) => {
  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    return <Navigate to={getHomeRoute(auth.role)} replace />;
  }

  return children;
};

const App = () => {
  const [auth, setAuthState] = useState({
    token: null,
    role: null,
    phone: null,
    name: null,
    loading: true,
  });

  useEffect(() => {
    setAuthState((current) => ({
      ...current,
      ...getAuthState(),
      loading: false,
    }));
  }, []);

  if (auth.loading) {
    return (
      <div className="app-shell">
        <div className="status-card">
          <span className="status-chip">Booting</span>
          <h1>Loading CrimeSpot</h1>
          <p>Checking your role and active session.</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={auth.token ? getHomeRoute(auth.role) : '/login'} replace />}
      />
      <Route
        path="/login"
        element={
          auth.token ? (
            <Navigate to={getHomeRoute(auth.role)} replace />
          ) : (
            <Login setAuthState={setAuthState} />
          )
        }
      />
      <Route
        path="/register"
        element={
          auth.token ? (
            <Navigate to={getHomeRoute(auth.role)} replace />
          ) : (
            <Register setAuthState={setAuthState} />
          )
        }
      />
      <Route
        path="/user/home"
        element={
          <ProtectedRoute auth={auth} allowedRoles={['user']}>
            <UserHome setAuthState={setAuthState} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute auth={auth} allowedRoles={['admin']}>
            <Dashboard setAuthState={setAuthState} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patrol/dashboard"
        element={
          <ProtectedRoute auth={auth} allowedRoles={['patrol']}>
            <PatrolDashboard setAuthState={setAuthState} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
