import { View, Text, TextInput, StyleSheet, Alert, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useState } from 'react';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';

export default function Login() {
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [aadhar, setAadhar] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<'user' | 'patrol' | 'admin'>('user');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleAuth = async () => {
    if (!phone || !password) {
      Alert.alert('Error', 'Please enter phone and password');
      return;
    }

    if (!isLogin && !aadhar) {
      Alert.alert('Error', 'Please enter aadhar for registration');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/login' : '/register';
      const payload = isLogin 
        ? { phone, password }
        : { phone, password, aadhar, name, role };

      const response = await axios.post(`${BACKEND_URL}${endpoint}`, payload);
      
      if (isLogin) {
        await SecureStore.setItemAsync('token', response.data.token);
        await SecureStore.setItemAsync('phone', phone);
        await SecureStore.setItemAsync('name', response.data.name || phone);
        await SecureStore.setItemAsync('role', response.data.role);
        
        if (response.data.role === 'admin') {
          router.replace('/admin/dashboard');
        } else if (response.data.role === 'patrol') {
          router.replace('/patrol/dashboard');
        } else {
          router.replace('/user/home');
        }
      } else {
        Alert.alert('Success', 'Registration successful! Please login.');
        setPhone('');
        setPassword('');
        setAadhar('');
        setName('');
        setRole('user');
        setIsLogin(true);
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || (isLogin ? 'Login failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>🚨 CrimeSpot</Text>
          <Text style={styles.subtitle}>{isLogin ? 'Login' : 'Register'}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>📱 Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="9876543210"
              placeholderTextColor="#64748b"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>🔐 Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter password"
                placeholderTextColor="#64748b"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!isLogin && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>🎫 Aadhar Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123456789012"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  maxLength={12}
                  value={aadhar}
                  onChangeText={setAadhar}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>👤 Name (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#64748b"
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>👮 Select Your Role</Text>
                <View style={styles.roleContainer}>
                  {(['user', 'patrol', 'admin'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.roleButton,
                        role === r && styles.roleButtonActive,
                      ]}
                      onPress={() => setRole(r)}
                      disabled={loading}
                    >
                      <Text style={[styles.roleButtonText, role === r && styles.roleButtonTextActive]}>
                        {r === 'user' && '👤 User'}
                        {r === 'patrol' && '🚗 Patrol'}
                        {r === 'admin' && '👨‍💼 Admin'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? '🔓 Login' : '✍️ Register'}</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => {
              setIsLogin(!isLogin);
              setPhone('');
              setPassword('');
              setAadhar('');
              setName('');
              setRole('user');
            }}
            disabled={loading}
          >
            <Text style={styles.toggle}>
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.toggleLink}>{isLogin ? 'Register' : 'Login'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#38bdf8',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    letterSpacing: 1,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 12,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    marginTop: 20,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
  },
  toggleLink: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  roleButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  roleButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
});
