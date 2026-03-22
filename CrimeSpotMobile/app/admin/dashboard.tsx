import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Linking } from 'react-native';
import { io, Socket } from 'socket.io-client';
import DashboardMapCard, { MapMarker } from '@/components/dashboard-map-card';
import { API_ENDPOINTS, BACKEND_URL } from '@/constants/api';

type Role = 'user' | 'patrol' | 'admin';
type AdminTab = 'overview' | 'crimes' | 'users' | 'alerts';
type AlertStatus = 'active' | 'handled';

interface AssignModal {
  show: boolean;
  alertId: string | null;
  selectedPatrol: string;
  isAssigning: boolean;
}

interface Crime {
  _id: string;
  location: string;
  type: string;
  lat: number;
  lng: number;
  date: string;
}

interface User {
  _id: string;
  phone: string;
  name: string;
  aadhar: string;
  role: Role;
  last_location?: {
    lat: number;
    lng: number;
    updated_at?: string;
  };
}

interface AlertRecord {
  _id: string;
  user?: string;
  user_name?: string;
  aadhar?: string;
  crime_type: string;
  location: string;
  message?: string;
  user_lat?: number | null;
  user_lng?: number | null;
  crime_lat?: number | null;
  crime_lng?: number | null;
  distance_km?: number | null;
  detected_at?: string;
  status: AlertStatus;
}

const emptyCrimeForm = {
  id: '',
  location: '',
  type: '',
  date: '',
  lat: '',
  lng: '',
};

const emptyUserForm = {
  id: '',
  phone: '',
  password: '',
  name: '',
  aadhar: '',
  role: 'user' as Role,
};

const emptyAlertForm = {
  id: '',
  user: '',
  user_name: '',
  aadhar: '',
  crime_type: '',
  location: '',
  message: '',
  user_lat: '',
  user_lng: '',
  crime_lat: '',
  crime_lng: '',
  status: 'active' as AlertStatus,
};

const toNumberOrUndefined = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const validatePhoneInput = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 10);
};

const validatePasswordInput = (value: string) => {
  return value;
};

const validatePassword = (password: string) => {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return {
    isValid: hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar,
    message: `Password must have: 8+ chars, uppercase, lowercase, number, special char (!@#$%^&*)`
  };
};

const validateNameInput = (value: string) => {
  return value.replace(/[^a-zA-Z0-9\s-]/g, '');
};

const validateNumericInput = (value: string) => {
  return value.replace(/[^0-9]/g, '');
};

const validateAadharInput = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 12);
};

const validateLocationInput = (value: string) => {
  return value.replace(/[^a-zA-Z0-9\s,.-]/g, '');
};

const validateCrimeTypeInput = (value: string) => {
  return value.replace(/[^a-zA-Z0-9\s-]/g, '');
};

const validateCoordinateInput = (value: string) => {
  return value.replace(/[^0-9.\-]/g, '');
};

export default function AdminDashboard() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<AdminTab>('overview');
  const [token, setToken] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [crimeForm, setCrimeForm] = useState(emptyCrimeForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [alertForm, setAlertForm] = useState(emptyAlertForm);
  const [assignModal, setAssignModal] = useState<AssignModal>({
    show: false,
    alertId: null,
    selectedPatrol: '',
    isAssigning: false,
  });
  const [passwordError, setPasswordError] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const setupSocket = async () => {
      const storedToken = await SecureStore.getItemAsync('token');
      if (!storedToken) {
        return;
      }

      const socket: Socket = io(BACKEND_URL, {
        auth: { token: storedToken },
      });

      socket.on('connect', () => {
        console.log('Admin dashboard connected to socket');
      });

      socket.on('alert_status_updated', (data) => {
        console.log('Alert status updated:', data);
        setAlerts((current) =>
          current.map((alert) =>
            alert._id === data.alert_id
              ? {
                  ...alert,
                  patrol_status: data.patrol_status,
                  status: data.status,
                  handled_by: data.handled_by,
                  handled_at: data.handled_at,
                }
              : alert
          )
        );
        
        // Show alert notification for patrol status changes
        if (data.patrol_status) {
          const statusText = data.patrol_status.replace(/_/g, ' ').toUpperCase();
          const patrolName = data.patrol_name || data.patrol_phone;
          Alert.alert(
            'Patrol Status Update',
            `${patrolName} is now: ${statusText}`,
            [{ text: 'OK', onPress: () => {} }]
          );
        }
      });

      socket.on('alert_handled', (data) => {
        setAlerts((current) =>
          current.map((alert) =>
            alert._id === data.alert_id
              ? { ...alert, status: 'handled', handled_by: data.handled_by, handled_at: data.handled_at }
              : alert
          )
        );
        
        // Show alert notification for handled status
        Alert.alert(
          'Alert Handled',
          `${data.handled_by} has marked the alert as handled`,
          [{ text: 'OK', onPress: () => {} }]
        );
      });

      return () => {
        socket.disconnect();
      };
    };

    const cleanup = setupSocket();
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then((disconnect) => disconnect?.());
      }
    };
  }, []);

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const loadData = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('token');
      if (!storedToken) {
        router.replace('/login');
        return;
      }

      setToken(storedToken);

      const headers = {
        Authorization: `Bearer ${storedToken}`,
      };

      const [crimesRes, usersRes, alertsRes] = await Promise.all([
        axios.get(API_ENDPOINTS.CRIMES, { headers }),
        axios.get(API_ENDPOINTS.USERS, { headers }),
        axios.get(API_ENDPOINTS.ALERTS, { headers }).catch(() => axios.get(API_ENDPOINTS.ALERTS_ACTIVE, { headers })),
      ]);

      setCrimes(crimesRes.data || []);
      setUsers(usersRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const resetCrimeForm = () => setCrimeForm(emptyCrimeForm);
  const resetUserForm = () => setUserForm(emptyUserForm);
  const resetAlertForm = () => setAlertForm(emptyAlertForm);

  const saveCrime = async () => {
    if (!crimeForm.location || !crimeForm.type || !crimeForm.date || !crimeForm.lat || !crimeForm.lng) {
      Alert.alert('Missing Fields', 'Fill all crime fields before saving.');
      return;
    }

    const payload = {
      location: crimeForm.location,
      type: crimeForm.type,
      date: crimeForm.date,
      lat: Number(crimeForm.lat),
      lng: Number(crimeForm.lng),
    };

    try {
      if (crimeForm.id) {
        await axios.put(API_ENDPOINTS.CRIME_UPDATE(crimeForm.id), payload, { headers: authHeaders() });
      } else {
        await axios.post(API_ENDPOINTS.CRIMES, payload, { headers: authHeaders() });
      }

      resetCrimeForm();
      await loadData();
    } catch (error) {
      Alert.alert('Error', 'Crime could not be saved.');
    }
  };

  const deleteCrime = (crime: Crime) => {
    Alert.alert('Delete Crime', `Delete ${crime.location}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(API_ENDPOINTS.CRIME_DELETE(crime._id), { headers: authHeaders() });
            if (crimeForm.id === crime._id) {
              resetCrimeForm();
            }
            await loadData();
          } catch (error) {
            Alert.alert('Error', 'Crime could not be deleted.');
          }
        },
      },
    ]);
  };

  const saveUser = async () => {
    if (!userForm.phone || !userForm.aadhar || !userForm.role) {
      Alert.alert('Missing Fields', 'Phone, aadhar, and role are required.');
      return;
    }

    if (userForm.phone.length !== 10) {
      Alert.alert('Invalid Phone', 'Phone number must be exactly 10 digits.');
      return;
    }

    if (userForm.aadhar.length !== 12) {
      Alert.alert('Invalid Aadhar', 'Aadhar must be exactly 12 digits.');
      return;
    }

    if (!userForm.id && !userForm.password) {
      Alert.alert('Missing Password', 'Set a password for new users.');
      return;
    }

    if (userForm.password && !validatePassword(userForm.password).isValid) {
      Alert.alert('Weak Password', validatePassword(userForm.password).message);
      return;
    }

    const payload = {
      phone: userForm.phone,
      password: userForm.password || undefined,
      name: userForm.name,
      aadhar: userForm.aadhar,
      role: userForm.role,
    };

    try {
      if (userForm.id) {
        await axios.put(API_ENDPOINTS.USER_UPDATE(userForm.id), payload, { headers: authHeaders() });
      } else {
        await axios.post(API_ENDPOINTS.USERS, payload, { headers: authHeaders() });
      }

      resetUserForm();
      await loadData();
    } catch (error) {
      Alert.alert('Error', 'User could not be saved.');
    }
  };

  const deleteUser = (user: User) => {
    Alert.alert('Delete User', `Delete ${user.phone}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(API_ENDPOINTS.USER_DELETE(user._id), { headers: authHeaders() });
            if (userForm.id === user._id) {
              resetUserForm();
            }
            await loadData();
          } catch (error) {
            Alert.alert('Error', 'User could not be deleted.');
          }
        },
      },
    ]);
  };

  const saveAlert = async () => {
    if (!alertForm.crime_type || !alertForm.location) {
      Alert.alert('Missing Fields', 'Crime type and location are required.');
      return;
    }

    const payload = {
      user: alertForm.user || undefined,
      user_name: alertForm.user_name || undefined,
      aadhar: alertForm.aadhar || undefined,
      crime_type: alertForm.crime_type,
      location: alertForm.location,
      message: alertForm.message || undefined,
      user_lat: toNumberOrUndefined(alertForm.user_lat),
      user_lng: toNumberOrUndefined(alertForm.user_lng),
      crime_lat: toNumberOrUndefined(alertForm.crime_lat),
      crime_lng: toNumberOrUndefined(alertForm.crime_lng),
      status: alertForm.status,
    };

    try {
      if (alertForm.id) {
        await axios.put(API_ENDPOINTS.ALERT_UPDATE(alertForm.id), payload, { headers: authHeaders() });
      } else {
        await axios.post(API_ENDPOINTS.ALERT_ADMIN_CREATE, payload, { headers: authHeaders() });
      }

      resetAlertForm();
      await loadData();
    } catch (error) {
      Alert.alert('Error', 'Alert could not be saved.');
    }
  };

  const deleteAlert = (alertItem: AlertRecord) => {
    Alert.alert('Delete Alert', `Delete alert at ${alertItem.location}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(API_ENDPOINTS.ALERT_DELETE(alertItem._id), { headers: authHeaders() });
            if (alertForm.id === alertItem._id) {
              resetAlertForm();
            }
            await loadData();
          } catch (error) {
            Alert.alert('Error', 'Alert could not be deleted.');
          }
        },
      },
    ]);
  };

  const markAlertHandled = async (alertId: string) => {
    try {
      await axios.put(API_ENDPOINTS.ALERT_MARK_HANDLED(alertId), {}, { headers: authHeaders() });
      await loadData();
    } catch (error) {
      Alert.alert('Error', 'Alert could not be marked handled.');
    }
  };

  const callAlertUser = (phoneNumber?: string) => {
    const sanitizedNumber = (phoneNumber || '').replace(/[^\d+]/g, '');

    if (!sanitizedNumber) {
      Alert.alert('No Phone Number', 'This alert does not include a callable phone number.');
      return;
    }

    Linking.openURL(`tel:${sanitizedNumber}`);
  };

  const getPatrolUsers = () => {
    return users.filter((user) => user.role === 'patrol');
  };

  const handleReassign = async () => {
    if (!assignModal.alertId) return;

    try {
      setAssignModal((prev) => ({ ...prev, isAssigning: true }));
      await axios.put(
        API_ENDPOINTS.ALERT_REASSIGN(assignModal.alertId!),
        {
          patrol_phone: assignModal.selectedPatrol || null,
          reason: 'admin_assignment',
        },
        { headers: authHeaders() }
      );

      Alert.alert('Success', 'Alert assigned successfully');
      setAssignModal({ show: false, alertId: null, selectedPatrol: '', isAssigning: false });
      await loadData();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to assign alert'
      );
    } finally {
      setAssignModal((prev) => ({ ...prev, isAssigning: false }));
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('role');
    await SecureStore.deleteItemAsync('phone');
    router.replace('/login');
  };

  const overviewMarkers = useMemo<MapMarker[]>(() => {
    const crimeMarkers = crimes
      .filter((crime) => Number.isFinite(crime.lat) && Number.isFinite(crime.lng))
      .slice(0, 3)
      .map((crime) => ({
        lat: crime.lat,
        lng: crime.lng,
        label: `Crime: ${crime.type}`,
        tone: 'red' as const,
      }));

    const userMarkers = users
      .filter((user) => user.last_location?.lat != null && user.last_location?.lng != null)
      .slice(0, 2)
      .map((user) => ({
        lat: user.last_location!.lat,
        lng: user.last_location!.lng,
        label: `User: ${user.phone}`,
        tone: user.role === 'patrol' ? ('blue' as const) : ('green' as const),
      }));

    return [...crimeMarkers, ...userMarkers];
  }, [crimes, users]);

  const crimeMarkers = crimes
    .filter((crime) => Number.isFinite(crime.lat) && Number.isFinite(crime.lng))
    .map((crime) => ({
      lat: crime.lat,
      lng: crime.lng,
      label: `${crime.type} - ${crime.location}`,
      tone: 'red' as const,
    }));

  const userMarkers = users
    .filter((user) => user.last_location?.lat != null && user.last_location?.lng != null)
    .map((user) => ({
      lat: user.last_location!.lat,
      lng: user.last_location!.lng,
      label: `${user.role.toUpperCase()} - ${user.phone}`,
      tone: user.role === 'patrol' ? ('blue' as const) : ('green' as const),
    }));

  const alertMarkers = alerts
    .filter((item) => item.crime_lat != null && item.crime_lng != null)
    .map((item) => ({
      lat: Number(item.crime_lat),
      lng: Number(item.crime_lng),
      label: `${item.crime_type} - ${item.location}`,
      tone: item.status === 'handled' ? ('green' as const) : ('yellow' as const),
    }));

  const renderOverview = () => (
    <View>
      <DashboardMapCard
        title="Operational Map"
        subtitle="Crimes, patrol positions, and recent user locations"
        markers={overviewMarkers}
      />
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Crimes</Text>
          <Text style={styles.statValue}>{crimes.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Users</Text>
          <Text style={styles.statValue}>{users.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Active Alerts</Text>
          <Text style={styles.statValue}>{alerts.filter((item) => item.status !== 'handled').length}</Text>
        </View>
      </View>
    </View>
  );

  const renderCrimes = () => (
    <View>
      <DashboardMapCard title="Crime Map" subtitle="Every saved crime location" markers={crimeMarkers} />
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>{crimeForm.id ? 'Edit Crime' : 'Add Crime'}</Text>
        <TextInput
          style={styles.input}
          placeholder="Location"
          placeholderTextColor="#64748b"
          value={crimeForm.location}
          onChangeText={(value) => setCrimeForm((current) => ({ ...current, location: validateLocationInput(value) }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Crime Type"
          placeholderTextColor="#64748b"
          value={crimeForm.type}
          onChangeText={(value) => setCrimeForm((current) => ({ ...current, type: validateCrimeTypeInput(value) }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD)"
          placeholderTextColor="#64748b"
          value={crimeForm.date}
          onChangeText={(value) => setCrimeForm((current) => ({ ...current, date: value.replace(/[^0-9-]/g, '') }))}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Latitude"
            placeholderTextColor="#64748b"
            value={crimeForm.lat}
            onChangeText={(value) => setCrimeForm((current) => ({ ...current, lat: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Longitude"
            placeholderTextColor="#64748b"
            value={crimeForm.lng}
            onChangeText={(value) => setCrimeForm((current) => ({ ...current, lng: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryButton} onPress={saveCrime}>
            <Text style={styles.buttonText}>{crimeForm.id ? 'Update Crime' : 'Create Crime'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={resetCrimeForm}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {crimes.map((crime) => (
        <View key={crime._id} style={styles.listCard}>
          <View style={styles.listContent}>
            <Text style={styles.cardTitle}>{crime.type}</Text>
            <Text style={styles.cardSubtitle}>{crime.location}</Text>
            <Text style={styles.cardMeta}>{crime.date}</Text>
            <Text style={styles.cardMeta}>{crime.lat}, {crime.lng}</Text>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.smallBlueButton}
              onPress={() =>
                setCrimeForm({
                  id: crime._id,
                  location: crime.location,
                  type: crime.type,
                  date: crime.date,
                  lat: String(crime.lat),
                  lng: String(crime.lng),
                })
              }
            >
              <Text style={styles.smallButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallRedButton} onPress={() => deleteCrime(crime)}>
              <Text style={styles.smallButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  const renderUsers = () => (
    <View>
      <DashboardMapCard title="User Map" subtitle="Last known locations when available" markers={userMarkers} />
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>{userForm.id ? 'Edit User' : 'Add User'}</Text>
        <TextInput
          style={styles.input}
          placeholder="Phone"
          placeholderTextColor="#64748b"
          value={userForm.phone}
          onChangeText={(value) => setUserForm((current) => ({ ...current, phone: validatePhoneInput(value) }))}
          keyboardType="phone-pad"
          maxLength={10}
        />
        <TextInput
          style={styles.input}
          placeholder={userForm.id ? 'New Password (optional)' : 'Password'}
          placeholderTextColor="#64748b"
          value={userForm.password}
          onChangeText={(value) => setUserForm((current) => ({ ...current, password: value }))}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#64748b"
          value={userForm.name}
          onChangeText={(value) => setUserForm((current) => ({ ...current, name: validateNameInput(value) }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Aadhar"
          placeholderTextColor="#64748b"
          value={userForm.aadhar}
          onChangeText={(value) => setUserForm((current) => ({ ...current, aadhar: validateAadharInput(value) }))}
          keyboardType="numeric"
          maxLength={12}
        />
        <View style={styles.roleRow}>
          {(['user', 'patrol', 'admin'] as Role[]).map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.roleChip, userForm.role === role && styles.roleChipActive]}
              onPress={() => setUserForm((current) => ({ ...current, role }))}
            >
              <Text style={[styles.roleChipText, userForm.role === role && styles.roleChipTextActive]}>
                {role}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryButton} onPress={saveUser}>
            <Text style={styles.buttonText}>{userForm.id ? 'Update User' : 'Create User'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={resetUserForm}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {users.map((user) => (
        <View key={user._id} style={styles.listCard}>
          <View style={styles.listContent}>
            <Text style={styles.cardTitle}>{user.name || 'Unnamed User'}</Text>
            <Text style={styles.cardSubtitle}>{user.phone}</Text>
            <Text style={styles.cardMeta}>Role: {user.role}</Text>
            <Text style={styles.cardMeta}>Aadhar: {user.aadhar}</Text>
            {user.last_location ? (
              <Text style={styles.cardMeta}>
                Last seen: {user.last_location.lat}, {user.last_location.lng}
              </Text>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.smallBlueButton}
              onPress={() =>
                setUserForm({
                  id: user._id,
                  phone: user.phone,
                  password: '',
                  name: user.name || '',
                  aadhar: user.aadhar,
                  role: user.role,
                })
              }
            >
              <Text style={styles.smallButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallRedButton} onPress={() => deleteUser(user)}>
              <Text style={styles.smallButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  const renderAlerts = () => (
    <View>
      <DashboardMapCard title="Alert Map" subtitle="Live and handled incidents" markers={alertMarkers} />
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>{alertForm.id ? 'Edit Alert' : 'Create Alert'}</Text>
        <TextInput
          style={styles.input}
          placeholder="User Phone (10 digits)"
          placeholderTextColor="#64748b"
          value={alertForm.user}
          onChangeText={(value) => setAlertForm((current) => ({ ...current, user: validatePhoneInput(value) }))}
          keyboardType="phone-pad"
          maxLength={10}
        />
        <TextInput
          style={styles.input}
          placeholder="User Name"
          placeholderTextColor="#64748b"
          value={alertForm.user_name}
          onChangeText={(value) => setAlertForm((current) => ({ ...current, user_name: validateNameInput(value) }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Crime Type"
          placeholderTextColor="#64748b"
          value={alertForm.crime_type}
          onChangeText={(value) => setAlertForm((current) => ({ ...current, crime_type: validateCrimeTypeInput(value) }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Location"
          placeholderTextColor="#64748b"
          value={alertForm.location}
          onChangeText={(value) => setAlertForm((current) => ({ ...current, location: validateLocationInput(value) }))}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Message"
          placeholderTextColor="#64748b"
          value={alertForm.message}
          onChangeText={(value) => setAlertForm((current) => ({ ...current, message: value }))}
          multiline
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Crime Lat"
            placeholderTextColor="#64748b"
            value={alertForm.crime_lat}
            onChangeText={(value) => setAlertForm((current) => ({ ...current, crime_lat: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Crime Lng"
            placeholderTextColor="#64748b"
            value={alertForm.crime_lng}
            onChangeText={(value) => setAlertForm((current) => ({ ...current, crime_lng: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="User Lat"
            placeholderTextColor="#64748b"
            value={alertForm.user_lat}
            onChangeText={(value) => setAlertForm((current) => ({ ...current, user_lat: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="User Lng"
            placeholderTextColor="#64748b"
            value={alertForm.user_lng}
            onChangeText={(value) => setAlertForm((current) => ({ ...current, user_lng: validateCoordinateInput(value) }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.roleRow}>
          {(['active', 'handled'] as AlertStatus[]).map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.roleChip, alertForm.status === status && styles.roleChipActive]}
              onPress={() => setAlertForm((current) => ({ ...current, status }))}
            >
              <Text style={[styles.roleChipText, alertForm.status === status && styles.roleChipTextActive]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryButton} onPress={saveAlert}>
            <Text style={styles.buttonText}>{alertForm.id ? 'Update Alert' : 'Create Alert'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={resetAlertForm}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {alerts.map((alertItem) => (
        <View key={alertItem._id} style={styles.listCard}>
          <View style={styles.listContent}>
            <Text style={styles.cardTitle}>{alertItem.crime_type}</Text>
            <Text style={styles.cardSubtitle}>{alertItem.location}</Text>
            <Text style={styles.cardMeta}>User: {alertItem.user || 'Unknown'}</Text>
            <Text style={styles.cardMeta}>Status: {alertItem.status}</Text>
            {alertItem.detected_at ? <Text style={styles.cardMeta}>{alertItem.detected_at}</Text> : null}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.smallBlueButton}
              onPress={() =>
                setAlertForm({
                  id: alertItem._id,
                  user: alertItem.user || '',
                  user_name: alertItem.user_name || '',
                  aadhar: alertItem.aadhar || '',
                  crime_type: alertItem.crime_type,
                  location: alertItem.location,
                  message: alertItem.message || '',
                  user_lat: alertItem.user_lat != null ? String(alertItem.user_lat) : '',
                  user_lng: alertItem.user_lng != null ? String(alertItem.user_lng) : '',
                  crime_lat: alertItem.crime_lat != null ? String(alertItem.crime_lat) : '',
                  crime_lng: alertItem.crime_lng != null ? String(alertItem.crime_lng) : '',
                  status: alertItem.status,
                })
              }
            >
              <Text style={styles.smallButtonText}>Edit</Text>
            </TouchableOpacity>
            {alertItem.status !== 'handled' ? (
              <TouchableOpacity style={styles.smallGreenButton} onPress={() => markAlertHandled(alertItem._id)}>
                <Text style={styles.smallButtonText}>Handle</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.smallAmberButton} onPress={() => callAlertUser(alertItem.user)}>
              <Text style={styles.smallButtonText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallOrangeButton}
              onPress={() =>
                setAssignModal({
                  show: true,
                  alertId: alertItem._id,
                  selectedPatrol: '',
                  isAssigning: false,
                })
              }
            >
              <Text style={styles.smallButtonText}>Assign</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallRedButton} onPress={() => deleteAlert(alertItem)}>
              <Text style={styles.smallButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {assignModal.show && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Alert to Patrol</Text>
            <Text style={styles.modalSubtitle}>
              Select a patrol officer or auto-assign to nearest
            </Text>

            <View style={styles.pickerContainer}>
              <ScrollView>
                <TouchableOpacity
                  style={[
                    styles.patrolOption,
                    assignModal.selectedPatrol === '' && styles.patrolOptionSelected,
                  ]}
                  onPress={() => setAssignModal((prev) => ({ ...prev, selectedPatrol: '' }))}
                >
                  <Text
                    style={[
                      styles.patrolOptionText,
                      assignModal.selectedPatrol === '' && styles.patrolOptionTextSelected,
                    ]}
                  >
                    Auto-assign to nearest patrol
                  </Text>
                </TouchableOpacity>
                {getPatrolUsers().map((patrol) => (
                  <TouchableOpacity
                    key={patrol._id}
                    style={[
                      styles.patrolOption,
                      assignModal.selectedPatrol === patrol.phone && styles.patrolOptionSelected,
                    ]}
                    onPress={() =>
                      setAssignModal((prev) => ({ ...prev, selectedPatrol: patrol.phone }))
                    }
                  >
                    <Text
                      style={[
                        styles.patrolOptionText,
                        assignModal.selectedPatrol === patrol.phone && styles.patrolOptionTextSelected,
                      ]}
                    >
                      {patrol.name || patrol.phone}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  assignModal.isAssigning && styles.modalButtonDisabled,
                ]}
                onPress={handleReassign}
                disabled={assignModal.isAssigning}
              >
                <Text style={styles.modalButtonText}>
                  {assignModal.isAssigning ? 'Assigning...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() =>
                  setAssignModal({
                    show: false,
                    alertId: null,
                    selectedPatrol: '',
                    isAssigning: false,
                  })
                }
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>Manage crimes, users, alerts, and map visibility</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['overview', 'crimes', 'users', 'alerts'] as AdminTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, selectedTab === tab && styles.tabActive]}
            onPress={() => setSelectedTab(tab)}
          >
            <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
      >
        {selectedTab === 'overview' ? renderOverview() : null}
        {selectedTab === 'crimes' ? renderCrimes() : null}
        {selectedTab === 'users' ? renderUsers() : null}
        {selectedTab === 'alerts' ? renderAlerts() : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    maxWidth: 220,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutText: {
    color: '#ef4444',
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#020617',
  },
  tab: {
    flex: 1,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#0ea5e9',
  },
  tabText: {
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'capitalize',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  statsGrid: {
    gap: 12,
  },
  statCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  statValue: {
    color: '#38bdf8',
    fontSize: 30,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 10,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  roleChipText: {
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  listCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  listContent: {
    marginBottom: 12,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    marginTop: 4,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  smallBlueButton: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallGreenButton: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallRedButton: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallAmberButton: {
    backgroundColor: '#d97706',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallOrangeButton: {
    backgroundColor: '#f97316',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 16,
  },
  pickerContainer: {
    maxHeight: 250,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  patrolOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  patrolOptionSelected: {
    backgroundColor: '#064e3b',
  },
  patrolOptionText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  patrolOptionTextSelected: {
    color: '#10b981',
    fontWeight: '700',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalConfirmButton: {
    backgroundColor: '#3b82f6',
  },
  modalCancelButton: {
    backgroundColor: '#6b7280',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
});
