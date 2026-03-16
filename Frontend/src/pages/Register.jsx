import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import API from '../services/api'

const Register = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await API.post('/register', { email, password })
      alert('Registered. Please login.')
      navigate('/login')
    } catch (err) {
      setError(err?.response?.data?.message || 'User already exists')
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-4">Register</h2>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        <input className="border p-2 w-full mb-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" className="border p-2 w-full mb-3" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="bg-green-500 text-white px-4 py-2 rounded w-full">Register</button>
        <p className="mt-3 text-sm">Already have an account? <Link to="/login" className="text-blue-600">Login</Link></p>
      </form>
    </div>
  )
}

export default Register
