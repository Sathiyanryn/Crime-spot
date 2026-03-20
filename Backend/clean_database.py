#!/usr/bin/env python3
"""
Clean CrimeSpot database - Remove all users and alerts
"""
from pymongo import MongoClient

MONGO_URI = "mongodb+srv://poseidon2005:Sathiya007@crime-cluster.qmgnmfw.mongodb.net/CrimeSpot?retryWrites=true&w=majority&appName=crime-cluster"
client = MongoClient(MONGO_URI)
db = client['CrimeSpot']

users_col = db['users']
alerts_col = db['alerts']
crimes_col = db['crimes']

try:
    # Delete all users
    users_result = users_col.delete_many({})
    print(f"✅ Deleted {users_result.deleted_count} users")
    
    # Delete all alerts
    alerts_result = alerts_col.delete_many({})
    print(f"✅ Deleted {alerts_result.deleted_count} alerts")
    
    # Delete all crimes
    crimes_result = crimes_col.delete_many({})
    print(f"✅ Deleted {crimes_result.deleted_count} crimes")
    
    print("\n🧹 Database cleaned successfully! Ready for new phone+password authentication system.")
    
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    client.close()
