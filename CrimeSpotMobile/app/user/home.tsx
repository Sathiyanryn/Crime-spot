import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import axios from 'axios';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from '@/services/background-location';
import * as Notifications from 'expo-notifications';
import DashboardMapCard from '@/components/dashboard-map-card';
import { API_ENDPOINTS } from '@/constants/api';

interface Crime {
  _id: string;
  location: string;
  type: string;
  lat: number;
  lng: number;
  date: string;
}

export default function UserHome() {
  const [safetyStatus, setSafetyStatus] = useState('Initializing...');
  const [statusColor, setStatusColor] = useState('#94a3b8');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [spamPrevention, setSpamPrevention] = useState(false);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const router = useRouter();

  useEffect(() => {
    initializeTracking();
    setupNotificationListener();

    return () => {
      stopBackgroundLocationTracking();
    };
  }, []);

  const setupNotificationListener = () => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification tapped:', response.notification.request.content.data);
      }
    );

    return () => subscription.remove();
  };

  const initializeTracking = async () => {
    try {
      // Start background location tracking
      const started = await startBackgroundLocationTracking();
      setBackgroundTracking(started);
      setNotificationsEnabled(true);
      setSpamPrevention(true);

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          lat: currentLocation.coords.latitude,
          lng: currentLocation.coords.longitude,
        });
      }

      const token = await SecureStore.getItemAsync('token');
      if (token) {
        const response = await axios.get(API_ENDPOINTS.CRIMES, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCrimes(response.data || []);
      }

      if (started) {
        setSafetyStatus('Location tracking active');
        setStatusColor('#22c55e');
      } else {
        setSafetyStatus('Failed to start tracking');
        setStatusColor('#ef4444');
      }
    } catch (error) {
      console.error('Initialization error:', error);
      setSafetyStatus('Error initializing');
      setStatusColor('#ef4444');
    }
  };

  const handleLogout = async () => {
    await stopBackgroundLocationTracking();
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('role');
    await SecureStore.deleteItemAsync('phone');
    router.replace('/login');
  };

  const mapMarkers = [
    ...(location
      ? [
          {
            lat: location.lat,
            lng: location.lng,
            label: 'Your current location',
            tone: 'blue' as const,
          },
        ]
      : []),
    ...crimes.slice(0, 4).map((crime) => ({
      lat: crime.lat,
      lng: crime.lng,
      label: `${crime.type} - ${crime.location}`,
      tone: 'red' as const,
    })),
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Personal Safety</Text>
        <Text style={styles.title}>User Dashboard</Text>
        <Text style={styles.heroDescription}>
          Monitor nearby crime zones, keep location tracking active, and stay reachable through silent alerts.
        </Text>
        <View style={styles.statusPill}>
          <Text style={[styles.statusText, { color: statusColor }]}>{safetyStatus}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Tracking</Text>
          <Text style={styles.metricValue}>{backgroundTracking ? 'On' : 'Off'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Notifications</Text>
          <Text style={styles.metricValue}>{notificationsEnabled ? 'Ready' : 'Muted'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Crime Points</Text>
          <Text style={styles.metricValue}>{crimes.length}</Text>
        </View>
      </View>

      <DashboardMapCard
        title="Safety Map"
        subtitle="Your location compared with saved crime spots"
        markers={mapMarkers}
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Background Location Tracking</Text>
        <Text style={styles.infoDescription}>
          Your location is being monitored every 30 seconds to detect nearby crime zones.
        </Text>
        <Text style={styles.infoValue}>{backgroundTracking ? 'Enabled' : 'Disabled'}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Silent Notifications</Text>
        <Text style={styles.infoDescription}>
          If you enter a crime zone, you will receive a notification in your notification tray.
        </Text>
        <Text style={styles.infoValue}>{notificationsEnabled ? 'Ready' : 'Unavailable'}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Spam Prevention</Text>
        <Text style={styles.infoDescription}>
          Same zones will only alert you once per 5 minutes to avoid notification overload.
        </Text>
        <Text style={styles.infoValue}>{spamPrevention ? 'Active' : 'Inactive'}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Text style={styles.logoutButton} onPress={handleLogout}>
          Logout
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  eyebrow: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#f8fafc',
  },
  heroDescription: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 14,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#020617',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  metricValue: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '800',
  },
  infoCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
  infoValue: {
    marginTop: 10,
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 40,
  },
  logoutButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    textAlign: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
});
