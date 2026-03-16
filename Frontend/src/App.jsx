// src/App.jsx
import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import PatrolDashboard from './pages/PatrolDashboard'
import { getToken, getRole } from './services/auth'

const App = () => {
  const [auth, setAuthState] = useState({ token: null, role: null, loading: true })

  useEffect(() => {
    const token = getToken()
    const role = getRole()
    setAuthState({ token, role, loading: false })
  }, [])

  if (auth.loading) {
    return (
      <div className="text-center mt-20 text-gray-500">
        Checking authentication...
      </div>
    )
  }

  return (
    <Routes>
      {/* Default route */}
      <Route
        path="/"
        element={
          auth.token
            ? auth.role === 'patrol'
              ? <Navigate to="/patrol-dashboard" />
              : <Navigate to="/dashboard" />
            : <Navigate to="/login" />
        }
      />

      {/* Login/Register */}
      <Route
        path="/login"
        element={
          auth.token
            ? auth.role === 'patrol'
              ? <Navigate to="/patrol-dashboard" />
              : <Navigate to="/dashboard" />
            : <Login setAuthState={setAuthState} />
        }
      />
      <Route
        path="/register"
        element={
          auth.token
            ? auth.role === 'patrol'
              ? <Navigate to="/patrol-dashboard" />
              : <Navigate to="/dashboard" />
            : <Register />
        }
      />

      {/* User/Admin dashboard */}
      <Route
        path="/dashboard"
        element={
          auth.token && auth.role !== 'patrol'
            ? <Dashboard />
            : <Navigate to="/login" />
        }
      />

      {/* Patrol dashboard */}
      <Route
        path="/patrol-dashboard"
        element={
          auth.token && auth.role === 'patrol'
            ? <PatrolDashboard />
            : <Navigate to="/login" />
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App
