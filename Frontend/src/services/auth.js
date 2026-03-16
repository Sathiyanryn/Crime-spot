const TOKEN_KEY = 'crimeSpot.token';
const ROLE_KEY = 'crimeSpot.role';
const PHONE_KEY = 'crimeSpot.phone';
const NAME_KEY = 'crimeSpot.name';

const decodeBase64Url = (value) => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
};

const storage = localStorage;

export const getToken = () => storage.getItem(TOKEN_KEY);
export const getRole = () => storage.getItem(ROLE_KEY);
export const getPhone = () => storage.getItem(PHONE_KEY);
export const getName = () => storage.getItem(NAME_KEY);

export const isTokenExpired = (token) => {
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
    const parsed = JSON.parse(payload);
    if (typeof parsed.exp !== 'number') {
      return false;
    }

    return parsed.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

export const setAuth = ({ token, role, phone, name }) => {
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(ROLE_KEY, role);

  if (phone) {
    storage.setItem(PHONE_KEY, phone);
  }

  if (name) {
    storage.setItem(NAME_KEY, name);
  }
};

export const clearAuth = () => {
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(ROLE_KEY);
  storage.removeItem(PHONE_KEY);
  storage.removeItem(NAME_KEY);
};

export const logout = () => {
  clearAuth();
};

export const getAuthState = () => {
  const token = getToken();
  const role = getRole();
  const phone = getPhone();
  const name = getName();

  if (!token || !role || isTokenExpired(token)) {
    clearAuth();
    return { token: null, role: null, phone: null, name: null };
  }

  return { token, role, phone, name };
};
