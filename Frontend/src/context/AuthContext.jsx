// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react'
import { getToken, getRole, setAuth, logout } from '../services/auth'

export const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [auth, setAuthState] = useState({ token: null, role: null, loading: true })

  useEffect(() => {
    const token = getToken()
    const role = getRole()
    if (token && role) setAuthState({ token, role, loading: false })
    else setAuthState({ token: null, role: null, loading: false })
  }, [])

  const login = (token, role) => {
    setAuth(token, role)
    setAuthState({ token, role, loading: false })
  }

  const doLogout = () => {
    logout()
    setAuthState({ token: null, role: null, loading: false })
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout: doLogout }}>
      {children}
    </AuthContext.Provider>
  )
}
