import React from 'react'

const CrimeList = ({ crimes, onDelete, onAlert, role }) => {
  if (!crimes || crimes.length === 0) return <p>No crimes</p>
  return (
    <div className="space-y-2">
      {crimes.map((c, i) => (
        <div key={i} className="border p-2 rounded">
          <div className="font-medium">{c.location}</div>
          <div className="text-xs">{c.type} - {c.date}</div>
          <div className="flex gap-2 mt-2">
            {role === 'admin' && <button onClick={()=>onDelete(c.location)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>}
            <button onClick={()=>onAlert(c)} className="bg-blue-600 text-white px-2 py-1 rounded">Alert Patrol</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default CrimeList
