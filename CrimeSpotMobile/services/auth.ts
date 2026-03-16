import * as SecureStore from 'expo-secure-store';

export const getToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync('token');
};

export const getRole = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync('role');
};

const decodeBase64Url = (value: string): string | null => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return global.atob(padded);
  } catch {
    return null;
  }
};

export const isTokenExpired = (token: string | null): boolean => {
  if (!token) {
    return true;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return true;
  }

  const payload = decodeBase64Url(parts[1]);
  if (!payload) {
    return true;
  }

  try {
    const parsed = JSON.parse(payload) as { exp?: number };
    if (typeof parsed.exp !== 'number') {
      return false;
    }

    return parsed.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

export const logout = async () => {
  await SecureStore.deleteItemAsync('token');
  await SecureStore.deleteItemAsync('role');
  await SecureStore.deleteItemAsync('phone');
  await SecureStore.deleteItemAsync('name');
};
