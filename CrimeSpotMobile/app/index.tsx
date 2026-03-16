import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { getRole, getToken, isTokenExpired, logout } from '@/services/auth';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const redirect = async () => {
      const token = await getToken();
      const role = await getRole();

      if (!token || isTokenExpired(token)) {
        await logout();
        router.replace('/login');
        return;
      }

      // Role-based redirect
      if (role === 'user') {
        router.replace('/user/home');
      } else if (role === 'patrol') {
        router.replace('/patrol/dashboard');
      } else if (role === 'admin') {
        router.replace('/admin/dashboard');
      } else {
        // Default to login if role is unknown
        router.replace('/login');
      }
    };

    redirect();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
      <ActivityIndicator size="large" color="#38bdf8" />
    </View>
  );
}
