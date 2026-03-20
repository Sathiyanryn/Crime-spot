import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity, Alert as RNAlert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import DashboardMapCard from '@/components/dashboard-map-card';
import { BACKEND_URL, API_ENDPOINTS } from '@/constants/api';
import { isTokenExpired, logout } from '@/services/auth';
import { AppTheme, severityToColor, severityToTone } from '@/constants/theme';

interface Alert {
  _id: string;
  type?: string;
  user: string;
  user_name?: string;
  phone?: string;
  aadhar?: string;
  crime_type: string;
  location: string;
  user_lat: number;
  user_lng: number;
  crime_lat: number;
  crime_lng: number;
  distance_km: number;
  detected_at: string;
  status: 'active' | 'handled';
  severity?: string;
  risk_level?: string;
  risk_score?: number;
  time_label?: string;
  assigned_to?: string;
  patrol_status?: string;
  patrol_eta_minutes?: number;
}

let globalSocket: Socket | null = null;

export default function PatrolDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Send location every 30 seconds
  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied');
        return;
      }

      const sendLocation = async () => {
        try {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const token = await SecureStore.getItemAsync('token');
          
          if (token) {
            await axios.put(
              `${BACKEND_URL}/api/patrols/location`,
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
          }
        } catch (error) {
          console.error('Error sending location:', error);
        }
      };

      // Send immediately
      await sendLocation();

      // Then every 30 seconds
      locationIntervalRef.current = setInterval(sendLocation, 30000);
    } catch (error) {
      console.error('Location tracking error:', error);
    }
  };

  useEffect(() => {
    initializePatrol();
    startLocationTracking();

    const refreshInterval = setInterval(async () => {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        await fetchExistingAlerts(token);
      }
    }, 2 * 60 * 1000);

    return () => {
      clearInterval(refreshInterval);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
      if (socketRef.current?.connected) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initializePatrol = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const userPhone = await SecureStore.getItemAsync('phone');

      if (!token || isTokenExpired(token) || !userPhone) {
        await logout();
        router.replace('/login');
        return;
      }

      setPhone(userPhone);
      await fetchExistingAlerts(token);

      if (globalSocket) {
        socketRef.current = globalSocket;
        setConnected(globalSocket.connected);
        setupSocketListeners(globalSocket);
        return;
      }

      const socket = io(BACKEND_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      globalSocket = socket;
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setupSocketListeners(socket);
      });

      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (error) => console.warn('Socket connection issue:', error.message));
    } catch (error) {
      console.error('Patrol initialization error:', error);
    }
  };

  const setupSocketListeners = (socket: Socket) => {
    socket.off('crime_zone_alert');
    socket.off('crime_zone_alert_updated');
    socket.off('alert_assigned_to_you');
    socket.off('alert_status_updated');
    socket.off('alert_handled');
    socket.off('alert_deleted');

    socket.on('crime_zone_alert', (data: Alert) => {
      setAlerts((prev) => {
        const exists = prev.some((a) => a._id === data._id);
        return exists ? prev : [{ ...data, status: data.status || 'active' }, ...prev];
      });
    });

    socket.on('crime_zone_alert_updated', (data: Alert) => {
      setAlerts((prev) => prev.map((alert) => (alert._id === data._id ? { ...alert, ...data } : alert)));
    });

    socket.on('alert_assigned_to_you', (data: any) => {
      setAlerts((prev) => {
        const exists = prev.some((a) => a._id === data.alert_id);
        if (exists) {
          return prev.map((alert) =>
            alert._id === data.alert_id
              ? {
                  ...alert,
                  assigned_to: phone,
                  patrol_status: 'assigned',
                  patrol_eta_minutes: data.eta_minutes,
                }
              : alert
          );
        }
        return prev;
      });
    });

    socket.on('alert_status_updated', (data: any) => {
      setAlerts((prev) =>
        prev.map((alert) =>
          alert._id === data.alert_id
            ? { ...alert, patrol_status: data.patrol_status, status: data.status }
            : alert
        )
      );
    });

    socket.on('alert_handled', (data: { alert_id: string }) => {
      setAlerts((prev) => prev.map((alert) => (alert._id === data.alert_id ? { ...alert, status: 'handled' } : alert)));
    });

    socket.on('alert_deleted', (data: { alert_id: string }) => {
      setAlerts((prev) => prev.filter((a) => a._id !== data.alert_id));
    });
  };

  const fetchExistingAlerts = async (token: string) => {
    try {
      const response = await axios.get(API_ENDPOINTS.ALERTS_ACTIVE, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      setAlerts((response.data || []).map((alert: Alert) => ({ ...alert, status: alert.status || 'active' })));
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }

      console.error('Error fetching existing alerts:', error);
    }
  };

  const handleMarkAsHandled = async (alertId: string) => {
    try {
      setAlerts((prev) => prev.map((alert) => (alert._id === alertId ? { ...alert, status: 'handled' } : alert)));
      const token = await SecureStore.getItemAsync('token');

      if (!token) {
        router.replace('/login');
        return;
      }

      await axios.put(
        API_ENDPOINTS.ALERT_MARK_HANDLED(alertId),
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      console.error('Error marking alert as handled:', error);
    }
  };

  const handleNavigate = (userLat: number, userLng: number) => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${userLat},${userLng}`);
  };

  const handleCall = (phoneNumber?: string, fallbackUser?: string) => {
    const rawNumber = phoneNumber || fallbackUser || '';
    const sanitizedNumber = rawNumber.replace(/[^\d+]/g, '');
    if (sanitizedNumber) {
      Linking.openURL(`tel:${sanitizedNumber}`);
    }
  };

  const handleStatusUpdate = async (alertId: string, newStatus: string) => {
    try {
      setUpdatingStatus((prev) => ({ ...prev, [alertId]: true }));
      const token = await SecureStore.getItemAsync('token');

      if (!token) {
        router.replace('/login');
        return;
      }

      await axios.put(
        `${BACKEND_URL}/api/alerts/${alertId}/status`,
        { patrol_status: newStatus },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setAlerts((prev) =>
        prev.map((alert) =>
          alert._id === alertId ? { ...alert, patrol_status: newStatus } : alert
        )
      );
    } catch (error) {
      console.error('Error updating status:', error);
      RNAlert.alert('Error', 'Failed to update status');
    } finally {
      setUpdatingStatus((prev) => ({ ...prev, [alertId]: false }));
    }
  };

  const getStatusColor = (status?: string) => {
    const colors: { [key: string]: string } = {
      assigned: '#3b82f6',
      on_way: '#f59e0b',
      checking: '#8b5cf6',
      in_progress: '#ef4444',
      resolved: '#10b981',
    };
    return colors[status || ''] || '#6b7280';
  };

  const handleLogout = async () => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }
    globalSocket = null;
    await logout();
    router.replace('/login');
  };

  const activeAlerts = useMemo(
    () =>
      alerts
        .filter((a) => a.status === 'active')
        .filter((a) => a.user_lat != null && a.user_lng != null && a.crime_lat != null && a.crime_lng != null),
    [alerts]
  );

  const alertMarkers = activeAlerts
    .flatMap((alert) => [
      {
        lat: alert.crime_lat,
        lng: alert.crime_lng,
        label: `Crime: ${alert.crime_type}`,
        tone: severityToTone(alert.risk_level || alert.severity),
      },
      {
        lat: alert.user_lat,
        lng: alert.user_lng,
        label: `User: ${alert.user_name || alert.user || 'Unknown'}`,
        tone: 'blue' as const,
      },
    ])
    .slice(0, 6);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Field Operations</Text>
          <Text style={styles.title}>Patrol Dashboard</Text>
          <Text style={styles.subline}>{phone}</Text>
        </View>
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: connected ? AppTheme.colors.accent : AppTheme.colors.danger }]} />
          <Text style={styles.statusLabel}>{connected ? 'Socket Live' : 'Offline'}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Active Alerts</Text>
            <Text style={styles.metricValue}>{activeAlerts.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Handled</Text>
            <Text style={styles.metricValue}>{alerts.length - activeAlerts.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Critical</Text>
            <Text style={[styles.metricValue, { color: AppTheme.colors.danger }]}>
              {activeAlerts.filter((alert) => (alert.risk_level || alert.severity) === 'critical').length}
            </Text>
          </View>
        </View>

        <DashboardMapCard
          title="Patrol Response Grid"
          subtitle="Redder zones indicate higher risk or active mobile SOS incidents."
          markers={alertMarkers}
        />

        {activeAlerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active alerts</Text>
            <Text style={styles.emptyCopy}>The control center is synced and waiting for the next mobile incident.</Text>
          </View>
        ) : (
          activeAlerts.map((alert) => {
            const severity = alert.risk_level || alert.severity || 'guarded';
            const accentColor = severityToColor(severity);
            const isSos = alert.type === 'mobile_sos' || alert.crime_type === 'SOS Emergency';

            return (
              <View key={alert._id} style={[styles.alertCard, { borderLeftColor: accentColor }]}>
                <View style={styles.alertHeader}>
                  <View style={styles.alertTitleBlock}>
                    <Text style={styles.alertTitle}>{alert.crime_type}</Text>
                    <Text style={styles.alertUser}>{alert.user_name || alert.user}</Text>
                  </View>
                  <View style={styles.badgeStack}>
                    {isSos ? (
                      <View style={[styles.inlineBadge, { backgroundColor: AppTheme.colors.dangerDeep }]}>
                        <Text style={styles.inlineBadgeText}>SOS</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.alertDistance, { color: accentColor }]}>
                      {alert.distance_km != null ? `${Number(alert.distance_km).toFixed(2)} km` : 'Nearby'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.alertLocation}>{alert.location}</Text>
                <Text style={styles.alertMeta}>{alert.time_label || 'Live detection'} • {severity.toUpperCase()}</Text>

                {alert.assigned_to && (
                  <View style={styles.assignmentInfo}>
                    <Text style={styles.assignmentText}>Assigned: <Text style={{ fontWeight: 'bold' }}>{alert.assigned_to}</Text></Text>
                    {alert.patrol_eta_minutes && <Text style={styles.assignmentText}>ETA: {alert.patrol_eta_minutes} min</Text>}
                  </View>
                )}

                <View style={styles.coordsRow}>
                  <View style={styles.coordCard}>
                    <Text style={styles.coordLabel}>User</Text>
                    <Text style={styles.coordValue}>{alert.user_lat?.toFixed(4)}, {alert.user_lng?.toFixed(4)}</Text>
                  </View>
                  <View style={styles.coordCard}>
                    <Text style={styles.coordLabel}>Crime Point</Text>
                    <Text style={styles.coordValue}>{alert.crime_lat?.toFixed(4)}, {alert.crime_lng?.toFixed(4)}</Text>
                  </View>
                </View>

                {alert.assigned_to === phone && alert.patrol_status && (
                  <View style={styles.statusContainer}>
                    <Text style={styles.statusLabel}>Status: <Text style={{ color: getStatusColor(alert.patrol_status), fontWeight: 'bold' }}>{alert.patrol_status}</Text></Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusButtonsRow}>
                      {['assigned', 'on_way', 'checking', 'in_progress', 'resolved'].map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.statusButton,
                            {
                              backgroundColor: alert.patrol_status === status ? getStatusColor(status) : AppTheme.colors.backgroundAlt,
                            },
                          ]}
                          onPress={() => handleStatusUpdate(alert._id, status)}
                          disabled={updatingStatus[alert._id]}
                        >
                          <Text style={[
                            styles.statusButtonText,
                            { color: alert.patrol_status === status ? 'white' : AppTheme.colors.textPrimary }
                          ]}>
                            {status.replace('_', ' ')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => handleNavigate(alert.user_lat, alert.user_lng)}>
                    <Text style={styles.buttonText}>Navigate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCall(alert.phone, alert.user)}>
                    <Text style={styles.buttonText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.successButton} onPress={() => handleMarkAsHandled(alert._id)}>
                    <Text style={styles.buttonText}>Handled</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.colors.background,
  },
  header: {
    backgroundColor: AppTheme.colors.surface,
    paddingHorizontal: 18,
    paddingTop: 42,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.colors.border,
  },
  eyebrow: {
    color: AppTheme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: AppTheme.colors.textPrimary,
  },
  subline: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppTheme.colors.backgroundAlt,
    borderRadius: AppTheme.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  statusLabel: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 24,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: AppTheme.colors.surface,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radii.md,
    padding: 14,
  },
  metricLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  metricValue: {
    color: AppTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyState: {
    backgroundColor: AppTheme.colors.surface,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radii.md,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
  },
  emptyCopy: {
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  alertCard: {
    backgroundColor: AppTheme.colors.surface,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderLeftWidth: 5,
    borderRadius: AppTheme.radii.md,
    padding: 16,
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  alertTitleBlock: {
    flex: 1,
  },
  alertTitle: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  alertUser: {
    color: AppTheme.colors.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  inlineBadge: {
    borderRadius: AppTheme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inlineBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
  },
  alertDistance: {
    fontSize: 13,
    fontWeight: '800',
  },
  alertLocation: {
    color: AppTheme.colors.primary,
    fontSize: 13,
    marginTop: 8,
  },
  alertMeta: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  coordCard: {
    flex: 1,
    backgroundColor: AppTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: 12,
    padding: 10,
  },
  coordLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  coordValue: {
    color: AppTheme.colors.textPrimary,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: AppTheme.colors.primaryDeep,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: AppTheme.colors.warning,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  successButton: {
    flex: 1,
    backgroundColor: AppTheme.colors.accent,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  assignmentInfo: {
    backgroundColor: AppTheme.colors.backgroundAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: AppTheme.colors.primary,
    borderRadius: 6,
  },
  assignmentText: {
    fontSize: 12,
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
    fontWeight: '600',
  },
  statusContainer: {
    marginTop: 10,
  },
  statusButtonsRow: {
    marginBottom: 10,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.surface,
  },
  logoutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppTheme.colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: AppTheme.colors.danger,
    fontWeight: '800',
    fontSize: 14,
  },
});
