/**
 * Centralized API Configuration
 * Change the BACKEND_URL here and all API calls throughout the app will update automatically
 */

// ⚙️ UPDATE THIS SINGLE URL FOR ALL NETWORK CHANGES
export const BACKEND_URL = 'http://10.199.107.28:5000';

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: `${BACKEND_URL}/login`,
  REGISTER: `${BACKEND_URL}/register`,

  // Location & Mobile
  MOBILE_LOCATION: `${BACKEND_URL}/api/mobile/location`,
  MOBILE_SOS: `${BACKEND_URL}/api/mobile/sos`,
  UPDATE_LOCATION: `${BACKEND_URL}/api/location/update`,
  CHECK_LOCATION: `${BACKEND_URL}/api/check-location`,

  // Crimes
  CRIMES: `${BACKEND_URL}/api/crimes`,
  CRIME_UPDATE: (crimeId: string) => `${BACKEND_URL}/api/crimes/${crimeId}`,
  CRIME_DELETE: (location: string) => `${BACKEND_URL}/api/crimes/${encodeURIComponent(location)}`,

  // Alerts
  ALERTS: `${BACKEND_URL}/api/alerts`,
  ALERTS_ACTIVE: `${BACKEND_URL}/api/alerts/active`,
  ALERT_CREATE: `${BACKEND_URL}/api/alert`,
  ALERT_ADMIN_CREATE: `${BACKEND_URL}/api/alerts`,
  ALERT_UPDATE: (alertId: string) => `${BACKEND_URL}/api/alerts/${alertId}`,
  ALERT_MARK_HANDLED: (alertId: string) => `${BACKEND_URL}/api/alert/${alertId}/mark-handled`,
  ALERT_DELETE: (alertId: string) => `${BACKEND_URL}/api/alerts/${alertId}`,

  // Users
  USERS: `${BACKEND_URL}/api/users`,
  USER_UPDATE: (userId: string) => `${BACKEND_URL}/api/users/${userId}`,
  USER_DELETE: (userId: string) => `${BACKEND_URL}/api/users/${userId}`,
};

export default BACKEND_URL;
