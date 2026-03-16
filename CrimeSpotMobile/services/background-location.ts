import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { API_ENDPOINTS } from '@/constants/api';

const API_URL = API_ENDPOINTS.MOBILE_LOCATION.split('/api/mobile/location')[0];

// Store for alert spam prevention
const alertedZones: Map<string, number> = new Map();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes - prevent spam notifications

// Store location subscription
let locationSubscription: Location.LocationSubscription | null = null;

// Configure notifications to not show alerts while handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

/**
 * Handle location updates while app is in foreground
 */
const handleLocationUpdate = async (location: Location.LocationObject) => {
  try {
    const token = await SecureStore.getItemAsync('token');

    if (!token) {
      console.log('No token, stopping location tracking');
      await stopBackgroundLocationTracking();
      return;
    }

    // Send to backend
    const response = await axios.post(
      API_ENDPOINTS.MOBILE_LOCATION,
      {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;

    // Handle alerts with spam prevention
    if (data.alert && data.alerts && data.alerts.length > 0) {
      const alert = data.alerts[0];
      const zoneKey = `${alert.lat}-${alert.lng}`;
      const lastAlertTime = alertedZones.get(zoneKey);
      const now = Date.now();

      // Check if we alerted for this zone recently
      if (lastAlertTime && now - lastAlertTime < COOLDOWN_MS) {
        console.log(
          `[Alert Spam Prevention] Zone ${zoneKey} already alerted ${
            now - lastAlertTime
          }ms ago - SKIPPING notification`
        );
        return; // STOP HERE - Don't send notification
      }

      // Update cooldown BEFORE sending notification
      alertedZones.set(zoneKey, now);
      console.log(`[Alert] NEW ALERT for zone ${zoneKey} - Sending notification`);

      // Send silent notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${alert.type} Alert`,
          body: `${alert.location} - ${alert.distance_km} km away`,
          data: {
            zone: zoneKey,
          },
        },
        trigger: null, // Send immediately
      });

      console.log(`[Alert] Notification sent for zone ${zoneKey}`);
    }
  } catch (error) {
    console.error('Error handling location update:', error);
  }
};

export const startBackgroundLocationTracking = async () => {
  try {
    // Request foreground location permission
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.error('❌ Foreground location permission not granted');
      console.log('User must allow location access to continue');
      return false;
    }

    // Start watching location (foreground only)
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000, // 30 seconds
        distanceInterval: 0, // Always trigger on interval
      },
      handleLocationUpdate
    );

    console.log('✅ Foreground location tracking started');
    return true;
  } catch (error) {
    console.error('Failed to start location tracking:', error);
    return false;
  }
};

export const stopBackgroundLocationTracking = async () => {
  try {
    if (locationSubscription) {
      locationSubscription.remove();
      locationSubscription = null;
      console.log('✅ Location tracking stopped');
    }
  } catch (error) {
    console.error('Failed to stop location tracking:', error);
  }
};

export const isBackgroundLocationTrackingAvailable = async () => {
  return locationSubscription !== null;
};
