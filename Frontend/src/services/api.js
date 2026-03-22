import axios from 'axios';
import { getToken, logout } from './auth';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://3.87.167.103:5000';

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

API.interceptors.request.use((config) => {
  const token = getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      logout();
    }

    return Promise.reject(error);
  }
);

export default API;
