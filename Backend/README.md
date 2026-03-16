
CrimeSpot Backend (Flask) - Simple setup
----------------------------------------
This backend connects to your MongoDB Atlas cluster and exposes endpoints used by the React frontend.

Important: Mongo URI is pre-configured in app.py to point to your Atlas cluster.

Setup:
1. python -m venv venv
2. On Windows: venv\Scripts\activate  OR  On Linux/Mac: source venv/bin/activate
3. pip install -r requirements.txt
4. python app.py
5. Backend runs at http://127.0.0.1:5000

Endpoints:
- POST /register -> {"email","password"}
- POST /login -> {"email","password"} returns {"token","role"}
- GET /api/crimes -> protected (Authorization: Bearer <token>)
- POST /api/crimes -> protected, roles allowed ['admin','patrol']
- DELETE /api/crimes/<location> -> protected, roles allowed ['admin','patrol']
- POST /api/alert -> protected; stores alert in 'alerts' collection
