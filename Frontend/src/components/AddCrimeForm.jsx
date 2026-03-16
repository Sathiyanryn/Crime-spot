import React, { useState } from 'react'
import API from '../services/api'

const AddCrimeForm = ({ onAdded, useLocation }) => {
  const [location, setLocation] = useState('')
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [lat, setLat] = useState(useLocation?.lat || '')
  const [lng, setLng] = useState(useLocation?.lng || '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await API.post('/api/crimes', { location, type, date, lat, lng })
      alert('Crime added')
      setLocation(''); setType(''); setDate(''); setLat(''); setLng('')
      if (onAdded) onAdded()
    } catch (err) {
      alert(err?.response?.data?.message || 'Add failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Location" className="border p-1 w-full" />
      <input value={type} onChange={(e)=>setType(e.target.value)} placeholder="Type" className="border p-1 w-full" />
      <input value={date} onChange={(e)=>setDate(e.target.value)} placeholder="Date" className="border p-1 w-full" />
      <input value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="Lat" className="border p-1 w-full" />
      <input value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="Lng" className="border p-1 w-full" />
      <button className="bg-green-500 text-white px-3 py-1 rounded">Add</button>
    </form>
  )
}

export default AddCrimeForm
