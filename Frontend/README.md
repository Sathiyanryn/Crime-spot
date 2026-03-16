
CrimeSpot React Frontend (Vite + Tailwind + Leaflet)
---------------------------------------------------

Setup:
1. unzip the project
2. cd crime-spot-frontend
3. npm install
4. npm run dev
5. open http://localhost:5173

Notes:
- The frontend expects your Flask backend at http://127.0.0.1:5000 with endpoints:
  POST /register -> { email, password }
  POST /login -> { email, password } returns { token, role }
  GET /api/crimes -> returns array of crimes with lat & lng
  POST /api/crimes -> protected: add crime { location,type,date,lat,lng }
  DELETE /api/crimes/:location -> protected: delete by location
  POST /api/alert -> (optional) receive alert requests from UI (location,message,lat,lng)

- Admin users should have role 'admin' in the users collection.
- The "Use my location" button uses browser geolocation and fills lat/lng for the add form.
- Alert Patrol will POST to /api/alert. If backend doesn't support it, the frontend will still show an alert that it's sent client-side.

