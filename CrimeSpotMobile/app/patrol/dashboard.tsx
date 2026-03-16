import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import DashboardMapCard from '@/components/dashboard-map-card';
import { BACKEND_URL, API_ENDPOINTS } from '@/constants/api';
import { isTokenExpired, logout } from '@/services/auth';

const SOCKET_URL = BACKEND_URL;
const API_URL = BACKEND_URL;

interface Alert {
  _id: string;
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
  assigned_patrols?: string[];
}

let globalSocket: Socket | null = null;

export default function PatrolDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string>('');
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    initializePatrol();

    // Set up 2-minute refresh interval
    const refreshInterval = setInterval(async () => {
      console.log('⏰ 2-minute refresh interval triggered');
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          await fetchExistingAlerts(token);
        }
      } catch (error) {
        console.error('❌ Error in 2-minute refresh:', error);
      }
    }, 2 * 60 * 1000); // 2 minutes in milliseconds

    return () => {
      clearInterval(refreshInterval);
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

      // Fetch existing alerts from backend on app load
      await fetchExistingAlerts(token);

      // Reuse the existing socket even if it is still connecting.
      if (globalSocket) {
        socketRef.current = globalSocket;
        setConnected(globalSocket.connected);
        setupSocketListeners(globalSocket);
      } else {
        const socket = io(SOCKET_URL, {
          auth: { token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        globalSocket = socket;
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('✅ Patrol: Socket connected, sid:', socket.id);
          setConnected(true);
          // Setup listeners AFTER connection established
          setupSocketListeners(socket);
        });

        socket.on('disconnect', () => {
          console.log('❌ Patrol: Socket disconnected');
          setConnected(false);
        });

        socket.on('connect_error', (error) => {
          console.warn('Socket connection issue:', error.message);
        });

        // Don't setup listeners here - wait for connect event
      }
    } catch (error) {
      console.error('Patrol initialization error:', error);
    }
  };

  const setupSocketListeners = (socket: Socket) => {
    console.log('🔧 Setting up socket listeners on socket:', socket.id);
    
    socket.off('crime_zone_alert');
    socket.off('crime_zone_alert_updated');
    socket.off('alert_handled');
    socket.off('alert_deleted');

    socket.on('crime_zone_alert', (data: Alert) => {
      console.log('🚨 Patrol received CRIME ZONE ALERT:', data);

      // Add to alerts list if not already there
      setAlerts((prev) => {
        const exists = prev.some((a) => a._id === data._id);
        if (exists) {
          console.log('⚠️ Alert already exists, skipping:', data._id);
          return prev;
        }
        console.log('✅ Adding new alert to list');
        // Ensure alert has status field
        const alertWithStatus = {
          ...data,
          status: (data.status as 'active' | 'handled') || 'active',
        };
        return [alertWithStatus, ...prev];
      });
    });

    socket.on('crime_zone_alert_updated', (data: Alert) => {
      console.log('🔄 Patrol received ALERT UPDATE:', data);

      // Update existing alert with new location/distance data
      setAlerts((prev) =>
        prev.map((alert) =>
          alert._id === data._id
            ? {
                ...alert,
                user_lat: data.user_lat || alert.user_lat,
                user_lng: data.user_lng || alert.user_lng,
                distance_km: data.distance_km || alert.distance_km,
                detected_at: data.detected_at || alert.detected_at,
              }
            : alert
        )
      );
    });

    socket.on('alert_handled', (data: { alert_id: string; handled_by: string }) => {
      console.log('✓ Alert marked as handled:', data.alert_id);

      // Update alert status
      setAlerts((prev) =>
        prev.map((alert) =>
          alert._id === data.alert_id
            ? { ...alert, status: 'handled' }
            : alert
        )
      );
    });

    socket.on('alert_deleted', (data: { alert_id: string; deleted_by: string }) => {
      console.log('🗑️ Alert deleted by admin:', data.alert_id);

      // Remove alert from list
      setAlerts((prev) => prev.filter((a) => a._id !== data.alert_id));
    });
  };

  const fetchExistingAlerts = async (token: string) => {
    try {
      console.log('📥 Fetching existing alerts from backend...');
      const response = await axios.get(
        API_ENDPOINTS.ALERTS_ACTIVE,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const existingAlerts = response.data || [];
      console.log(`✅ Loaded ${existingAlerts.length} existing alerts`);

      // Ensure all alerts have status field
      const alertsWithStatus = existingAlerts.map((alert: any) => ({
        ...alert,
        status: (alert.status as 'active' | 'handled') || 'active',
      }));

      setAlerts(alertsWithStatus);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }

      console.error('❌ Error fetching existing alerts:', error);
    }
  };

  const handleMarkAsHandled = async (alertId: string) => {
    try {
      // Update local state immediately for fast UI response
      setAlerts((prev) =>
        prev.map((alert) =>
          alert._id === alertId
            ? { ...alert, status: 'handled' }
            : alert
        )
      );

      const token = await SecureStore.getItemAsync('token');

      if (!token) {
        router.replace('/login');
        return;
      }

      // Call backend endpoint
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

      console.log('✅ Alert marked as handled:', alertId);
    } catch (error) {
      console.error('❌ Error marking alert as handled:', error);
    }
  };

  const handleNavigate = (userLat: number, userLng: number) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${userLat},${userLng}`;
    Linking.openURL(mapsUrl);
  };

  const handleCall = (phoneNumber?: string, fallbackUser?: string) => {
    const rawNumber = phoneNumber || fallbackUser || '';
    const sanitizedNumber = rawNumber.replace(/[^\d+]/g, '');

    if (!sanitizedNumber) {
      return;
    }

    Linking.openURL(`tel:${sanitizedNumber}`);
  };

  const handleLogout = async () => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }
    globalSocket = null;
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('role');
    await SecureStore.deleteItemAsync('phone');
    router.replace('/login');
  };

  const activeAlerts = alerts
    .filter((a) => !a.status || a.status === 'active')
    .filter((a) => a.user_lat !== null && a.user_lng !== null && a.crime_lat !== null && a.crime_lng !== null);

  const alertMarkers = activeAlerts.flatMap((alert) => {
    const markers = [];

    if (alert.crime_lat != null && alert.crime_lng != null) {
      markers.push({
        lat: alert.crime_lat,
        lng: alert.crime_lng,
        label: `Crime: ${alert.crime_type}`,
        tone: 'red' as const,
      });
    }

    if (alert.user_lat != null && alert.user_lng != null) {
      markers.push({
        lat: alert.user_lat,
        lng: alert.user_lng,
        label: `User: ${alert.user_name || alert.user || 'Unknown'}`,
        tone: 'blue' as const,
      });
    }

    return markers;
  }).slice(0, 5);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Field Operations</Text>
          <Text style={styles.title}>Patrol Dashboard</Text>
          <Text style={styles.email}>{phone}</Text>
        </View>
        <View style={styles.statusIndicator}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? '#22c55e' : '#ef4444' },
            ]}
          />
          <Text style={styles.statusLabel}>
            {connected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>

      {/* Alerts List */}
      <ScrollView style={styles.alertsList}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Active Alerts</Text>
            <Text style={styles.summaryValue}>{activeAlerts.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Socket</Text>
            <Text style={styles.summaryValue}>{connected ? 'Live' : 'Offline'}</Text>
          </View>
        </View>
        <DashboardMapCard
          title="Patrol Response Map"
          subtitle="Crime points and affected users"
          markers={alertMarkers}
        />
        {activeAlerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active alerts</Text>
            <Text style={styles.emptySubText}>
              Waiting for crime zone detections...
            </Text>
          </View>
        ) : (
          activeAlerts.map((alert) => (
            <View key={alert._id} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <View>
                  <Text style={styles.crimeType}>{alert.crime_type}</Text>
                  <Text style={styles.userEmail}>{alert.user}</Text>
                </View>
                <Text style={styles.distance}>{alert.distance_km} km</Text>
              </View>

              <View style={styles.coordsSection}>
                <View style={styles.coordBox}>
                  <Text style={styles.coordLabel}>User Location</Text>
                  <Text style={styles.coords}>
                    {alert.user_lat ? alert.user_lat.toFixed(4) : 'N/A'}, {alert.user_lng ? alert.user_lng.toFixed(4) : 'N/A'}
                  </Text>
                </View>
                <View style={styles.coordBox}>
                  <Text style={styles.coordLabel}>Crime Location</Text>
                  <Text style={styles.coords}>
                    {alert.crime_lat ? alert.crime_lat.toFixed(4) : 'N/A'}, {alert.crime_lng ? alert.crime_lng.toFixed(4) : 'N/A'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>User Name:</Text>
                  <Text style={styles.detailValue}>{alert.user_name || alert.user || 'Unknown'}</Text>
                </View>
                {alert.phone && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>📱 Phone:</Text>
                    <Text style={styles.detailValue}>{alert.phone}</Text>
                  </View>
                )}
                {alert.aadhar && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>🎫 Aadhar:</Text>
                    <Text style={styles.detailValue}>{alert.aadhar}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location Name:</Text>
                  <Text style={styles.detailValue}>{alert.location}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Detected:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(alert.detected_at).toLocaleTimeString()}
                  </Text>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={() => handleNavigate(alert.user_lat, alert.user_lng)}
                >
                  <Text style={styles.navigateButtonText}>Navigate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCall(alert.phone, alert.user)}
                >
                  <Text style={styles.callButtonText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.handleButton}
                  onPress={() => handleMarkAsHandled(alert._id)}
                >
                  <Text style={styles.handleButtonText}>Mark Handled</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Handled Alerts Count */}
      {alerts.length > activeAlerts.length && (
        <View style={styles.stats}>
          <Text style={styles.statsText}>
            {alerts.length - activeAlerts.length} handled
          </Text>
        </View>
      )}

      {/* Logout Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    backgroundColor: '#1e40af',
    padding: 16,
    paddingTop: 40,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  statusIndicator: {
    alignItems: 'flex-end',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 11,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  alertsList: {
    flex: 1,
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#475569',
  },
  alertCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  crimeType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f97316',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#94a3b8',
  },
  distance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60a5fa',
  },
  coordsSection: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 10,
  },
  coordBox: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  coordLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  coords: {
    fontSize: 11,
    color: '#38bdf8',
    fontFamily: 'monospace',
  },
  detailsSection: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: '#e5e7eb',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  navigateButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  navigateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  handleButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  handleButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  callButton: {
    flex: 1,
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  stats: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  statsText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  footer: {
    padding: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
