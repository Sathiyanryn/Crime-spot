import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import DashboardMapCard from '@/components/dashboard-map-card';
import { API_ENDPOINTS } from '@/constants/api';
import { AppTheme, severityToColor, severityToTone } from '@/constants/theme';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from '@/services/background-location';
import { logout } from '@/services/auth';

interface Crime {
  _id: string;
  location: string;
  type: string;
  lat: number;
  lng: number;
  date: string;
}

interface RiskAlert {
  location: string;
  message: string;
  lat: number;
  lng: number;
  type: string;
  distance_km: number;
  severity?: string;
  risk_level?: string;
  risk_score?: number;
  time_label?: string;
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getTimeBand = () => {
  const hour = new Date().getHours();

  if (hour >= 22 || hour < 5) {
    return {
      label: 'Late night risk window',
      description: 'Automatic detection is more sensitive right now.',
      color: AppTheme.colors.danger,
    };
  }

  if (hour >= 19) {
    return {
      label: 'Nightfall caution',
      description: 'Stay on better-lit routes and keep patrol reachable.',
      color: AppTheme.colors.warning,
    };
  }

  return {
    label: 'Daytime monitoring',
    description: 'Normal detection is active with background tracking.',
    color: AppTheme.colors.accent,
  };
};

export default function UserHome() {
  const [userName, setUserName] = useState('Citizen');
  const [safetyStatus, setSafetyStatus] = useState('Initializing safety systems');
  const [statusColor, setStatusColor] = useState<string>(AppTheme.colors.textMuted);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const router = useRouter();

  const timeBand = useMemo(() => getTimeBand(), []);

  useEffect(() => {
    let isMounted = true;

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      console.log('Notification tapped from user dashboard');
    });

    const initialize = async () => {
      try {
        const storedName = await SecureStore.getItemAsync('name');
        if (storedName && isMounted) {
          setUserName(storedName);
        }

        const started = await startBackgroundLocationTracking();
        if (isMounted) {
          setBackgroundTracking(started);
          setNotificationsEnabled(true);
        }

        await refreshDashboard(started, isMounted);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
      notificationSubscription.remove();
      stopBackgroundLocationTracking();
    };
  }, []);

  const refreshDashboard = async (trackingState = backgroundTracking, isMounted = true) => {
    try {
      setRefreshing(true);
      const token = await SecureStore.getItemAsync('token');

      if (!token) {
        await logout();
        router.replace('/login');
        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();
      let nextLocation = location;

      if (permission.granted) {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        nextLocation = {
          lat: currentLocation.coords.latitude,
          lng: currentLocation.coords.longitude,
        };

        if (isMounted) {
          setLocation(nextLocation);
        }
      }

      const [crimeResponse, alertResponse] = await Promise.all([
        axios.get(API_ENDPOINTS.CRIMES, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        nextLocation
          ? axios.post(
              API_ENDPOINTS.CHECK_LOCATION,
              {
                lat: nextLocation.lat,
                lng: nextLocation.lng,
                timezone_offset_minutes: new Date().getTimezoneOffset(),
              },
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            )
          : Promise.resolve({ data: { alerts: [] } }),
      ]);

      if (!isMounted) {
        return;
      }

      const nextCrimes = crimeResponse.data || [];
      const nextAlerts = alertResponse.data?.alerts || [];

      setCrimes(nextCrimes);
      setRiskAlerts(nextAlerts);

      if (!nextLocation) {
        setSafetyStatus('Location access needed for active monitoring');
        setStatusColor(AppTheme.colors.warning);
      } else if (nextAlerts.length > 0) {
        const mostSevere = nextAlerts[0];
        setSafetyStatus(`${mostSevere.risk_level || mostSevere.severity || 'elevated'} risk detected nearby`);
        setStatusColor(severityToColor(mostSevere.risk_level || mostSevere.severity));
      } else if (trackingState) {
        setSafetyStatus('Protected with live mobile monitoring');
        setStatusColor(AppTheme.colors.accent);
      } else {
        setSafetyStatus('Tracking is offline');
        setStatusColor(AppTheme.colors.warning);
      }
    } catch (error) {
      console.error('Dashboard refresh error:', error);
      if (isMounted) {
        setSafetyStatus('Unable to sync mobile safety data');
        setStatusColor(AppTheme.colors.danger);
      }
    } finally {
      if (isMounted) {
        setRefreshing(false);
      }
    }
  };

  const handleSendSos = async () => {
    try {
      setSendingSos(true);
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        await logout();
        router.replace('/login');
        return;
      }

      let currentLocation = location;
      if (!currentLocation) {
        const latest = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        currentLocation = {
          lat: latest.coords.latitude,
          lng: latest.coords.longitude,
        };
        setLocation(currentLocation);
      }

      await axios.post(
        API_ENDPOINTS.MOBILE_SOS,
        {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          location: 'Live mobile SOS',
          message: 'Emergency SOS triggered from the mobile dashboard.',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert('SOS sent', 'Patrol has been notified with your latest location.');
      setSafetyStatus('SOS dispatched to patrol');
      setStatusColor(AppTheme.colors.danger);
    } catch (error: any) {
      Alert.alert('SOS failed', error?.response?.data?.message || 'Unable to notify patrol right now.');
    } finally {
      setSendingSos(false);
    }
  };

  const handleLogout = async () => {
    await stopBackgroundLocationTracking();
    await logout();
    router.replace('/login');
  };

  const nearbyCrimes = useMemo<(Crime & { distance?: number })[]>(() => {
    if (!location) {
      return crimes.slice(0, 4);
    }

    return [...crimes]
      .map((crime) => ({
        ...crime,
        distance: haversineKm(location.lat, location.lng, Number(crime.lat), Number(crime.lng)),
      }))
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .slice(0, 4);
  }, [crimes, location]);

  const mapMarkers = useMemo(() => {
    const userMarker = location
      ? [
          {
            lat: location.lat,
            lng: location.lng,
            label: 'Your current mobile position',
            tone: 'blue' as const,
          },
        ]
      : [];

    const alertMarkers = riskAlerts.slice(0, 3).map((alert) => ({
      lat: alert.lat,
      lng: alert.lng,
      label: `${alert.type} - ${alert.risk_level || alert.severity || 'risk'}`,
      tone: severityToTone(alert.risk_level || alert.severity),
    }));

    const crimeMarkers = nearbyCrimes.slice(0, 2).map((crime) => ({
      lat: Number(crime.lat),
      lng: Number(crime.lng),
      label: `${crime.type} hotspot`,
      tone: 'yellow' as const,
    }));

    return [...userMarker, ...alertMarkers, ...crimeMarkers];
  }, [location, nearbyCrimes, riskAlerts]);

  const professionalMetrics = [
    {
      label: 'Tracking',
      value: backgroundTracking ? 'Live' : 'Off',
      tone: backgroundTracking ? AppTheme.colors.accent : AppTheme.colors.warning,
    },
    {
      label: 'Active Risks',
      value: String(riskAlerts.length),
      tone: riskAlerts.length ? severityToColor(riskAlerts[0]?.risk_level || riskAlerts[0]?.severity) : AppTheme.colors.info,
    },
    {
      label: 'Hotspots',
      value: String(crimes.length),
      tone: AppTheme.colors.primary,
    },
  ];

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={AppTheme.colors.primary} />
        <Text style={styles.loadingText}>Preparing your safety dashboard</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Mobile Safety Center</Text>
        <Text style={styles.title}>Welcome back, {userName}</Text>
        <Text style={styles.heroDescription}>
          Mobile detection is the live incident source. The dashboard keeps background monitoring active, highlights
          crime-prone zones, and gives you a one-tap SOS line to patrol.
        </Text>

        <View style={styles.heroFooter}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{safetyStatus}</Text>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => refreshDashboard()}>
            <Text style={styles.secondaryButtonText}>{refreshing ? 'Syncing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metricsRow}>
        {professionalMetrics.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={[styles.metricValue, { color: metric.tone }]}>{metric.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.sosButton, sendingSos && styles.disabledButton]}
          onPress={handleSendSos}
          disabled={sendingSos}
        >
          <Text style={styles.sosTitle}>{sendingSos ? 'Sending SOS...' : 'Emergency SOS'}</Text>
          <Text style={styles.sosSubtitle}>Notify patrol immediately with your live location.</Text>
        </TouchableOpacity>

        <View style={styles.timeCard}>
          <Text style={styles.cardEyebrow}>Time-Based Detection</Text>
          <Text style={[styles.timeBandTitle, { color: timeBand.color }]}>{timeBand.label}</Text>
          <Text style={styles.timeBandCopy}>{timeBand.description}</Text>
        </View>
      </View>

      <DashboardMapCard
        title="Crime-Prone Area Overlay"
        subtitle="Blue marks your position. Warmer tones represent higher nearby crime severity."
        markers={mapMarkers}
      />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Security Posture</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Background Location</Text>
          <Text style={styles.infoDescription}>
            The app checks your mobile position in the background and prevents duplicate zone incidents for the same
            hotspot.
          </Text>
          <Text style={styles.infoValue}>{backgroundTracking ? 'Enabled' : 'Needs attention'}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Silent Alerts</Text>
          <Text style={styles.infoDescription}>
            Notifications stay focused and avoid repeat spam while keeping patrol aware of real movement updates.
          </Text>
          <Text style={styles.infoValue}>{notificationsEnabled ? 'Operational' : 'Unavailable'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Nearby Risk Zones</Text>
        {riskAlerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No immediate risks detected</Text>
            <Text style={styles.emptyCopy}>Live monitoring is still active and will escalate if you move into a hotspot.</Text>
          </View>
        ) : (
          riskAlerts.map((alert, index) => (
            <View
              key={`${alert.location}-${index}`}
              style={[styles.riskCard, { borderLeftColor: severityToColor(alert.risk_level || alert.severity) }]}
            >
              <View style={styles.riskHeader}>
                <Text style={styles.riskTitle}>{alert.type}</Text>
                <Text style={[styles.riskBadge, { color: severityToColor(alert.risk_level || alert.severity) }]}>
                  {(alert.risk_level || alert.severity || 'guarded').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.riskLocation}>{alert.location}</Text>
              <Text style={styles.riskCopy}>{alert.message}</Text>
              <View style={styles.riskFooter}>
                <Text style={styles.riskMeta}>{Number(alert.distance_km || 0).toFixed(2)} km away</Text>
                <Text style={styles.riskMeta}>{alert.time_label || 'Live monitoring'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Nearest Crime Hotspots</Text>
        {nearbyCrimes.map((crime) => (
          <View key={crime._id} style={styles.hotspotCard}>
            <View>
              <Text style={styles.hotspotTitle}>{crime.type}</Text>
              <Text style={styles.hotspotLocation}>{crime.location}</Text>
            </View>
            <Text style={styles.hotspotDistance}>
              {crime.distance != null ? `${crime.distance.toFixed(2)} km` : 'Mapped'}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.background,
    gap: 12,
  },
  loadingText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  eyebrow: {
    color: AppTheme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: AppTheme.colors.textPrimary,
  },
  heroDescription: {
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  heroFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: AppTheme.colors.backgroundAlt,
    borderRadius: AppTheme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: AppTheme.colors.surfaceStrong,
    borderRadius: AppTheme.radii.pill,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  metricLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  sosButton: {
    flex: 1.15,
    backgroundColor: AppTheme.colors.dangerDeep,
    borderRadius: AppTheme.radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: AppTheme.colors.danger,
  },
  disabledButton: {
    opacity: 0.7,
  },
  sosTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  sosSubtitle: {
    color: '#fecaca',
    fontSize: 12,
    lineHeight: 18,
  },
  timeCard: {
    flex: 1,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  cardEyebrow: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  timeBandTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  timeBandCopy: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  panel: {
    marginBottom: 16,
  },
  panelTitle: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  infoDescription: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
    lineHeight: 18,
  },
  infoValue: {
    marginTop: 10,
    color: AppTheme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  emptyTitle: {
    color: AppTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyCopy: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  riskCard: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 16,
    borderLeftWidth: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  riskTitle: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  riskBadge: {
    fontWeight: '800',
    fontSize: 11,
  },
  riskLocation: {
    color: AppTheme.colors.primary,
    fontSize: 13,
    marginBottom: 6,
  },
  riskCopy: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  riskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  riskMeta: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
  },
  hotspotCard: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  hotspotTitle: {
    color: AppTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  hotspotLocation: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
  },
  hotspotDistance: {
    color: AppTheme.colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: 'transparent',
    borderRadius: AppTheme.radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.danger,
    marginTop: 8,
  },
  logoutButtonText: {
    color: AppTheme.colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
