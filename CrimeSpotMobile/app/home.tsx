import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useEffect } from "react";
import { API_ENDPOINTS } from '@/constants/api';


export default function Home() {
  const [location, setLocation] = useState<any>(null);
  const router = useRouter();

  const isLateNight = () => {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 5;
  };

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location access required');
      return;
    }

    let loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    setLocation(loc.coords);

    // Send location to backend
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      try {
        await fetch(API_ENDPOINTS.MOBILE_LOCATION, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude
          })
        });
      } catch (error) {
        console.error('Error sending location:', error);
      }
    }

    if (isLateNight()) {
      Alert.alert(
        '⚠️ Safety Alert',
        'You are in a late-night time window. Stay alert.'
      );
    }
    
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('role');
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CrimeSpot</Text>

      <Button title="Use My Location" onPress={getLocation} />

      {location && (
        <Text style={styles.text}>
          Latitude: {location.latitude}{'\n'}
          Longitude: {location.longitude}
        </Text>
      )}

      <View style={{ marginTop: 30 }}>
        <Button title="Logout" color="#ef4444" onPress={handleLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 26,
    color: '#38bdf8',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  text: {
    color: '#e5e7eb',
    marginTop: 15,
    textAlign: 'center',
  },
});
