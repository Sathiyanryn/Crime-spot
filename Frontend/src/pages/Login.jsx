// src/pages/Login.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../services/api'
import { setAuth, getToken, getRole } from '../services/auth'
import './Login.css'

const Login = ({ setAuthState }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    const token = getToken()
    const role = getRole()
    if (token && role) {
      setAuthState({ token, role, loading: false })
      if (role === 'patrol') navigate('/patrol-dashboard')
      else navigate('/dashboard')
    } else {
      setCheckingAuth(false)
    }
  }, [navigate, setAuthState])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const res = await API.post('/login', { email, password })
      const { token, role } = res.data

      if (token && role) {
        // Save in localStorage
        setAuth(token, role)
        // Update App state immediately
        setAuthState({ token, role, loading: false })
        // Redirect
        if (role === 'patrol') navigate('/patrol-dashboard')
        else navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    }
  }

  if (checkingAuth) {
    return (
      <div className="login-container">
        <p className="text-center text-gray-500">Checking authentication...</p>
      </div>
    )
  }

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2 className="text-3xl font-bold mb-6 text-center">CrimeSpot Login</h2>
        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="login-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="login-input"
        />
        <button type="submit" className="login-button">
          Login
        </button>
        <p className="mt-4 text-sm text-center">
          Don't have an account?{' '}
          <a href="/register" className="text-blue-500 hover:underline">
            Register
          </a>
        </p>
      </form>
    </div>
  )
}

export default Login
