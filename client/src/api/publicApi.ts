import axios from 'axios';

// Default API URL with sensible defaults for dev and production
const isBrowser = typeof window !== 'undefined';
const isLocalDev =
  isBrowser &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  (window.location.port === '3000' || window.location.port === '5173');
const DEFAULT_API_URL = isLocalDev
  ? 'http://localhost:5000/api'
  : isBrowser
    ? `${window.location.origin}/api`
    : 'http://localhost:5000/api';
const API_URL =
  (typeof window !== 'undefined' && (window as any).__API_BASE__) ||
  import.meta.env?.VITE_API_URL ||
  DEFAULT_API_URL;

// Create a public axios instance for unauthenticated requests
// This instance does NOT have the request interceptor that adds Authorization headers
const publicApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false, // This ensures cookies are NOT sent with requests
});

// Request interceptor for logging (no auth headers)
publicApi.interceptors.request.use(
  (config) => {
    console.log('Public API Request Interceptor:', {
      url: config.url,
      method: config.method,
      currentHeaders: config.headers,
    });

    return config;
  },
  (error) => {
    console.error('Public API Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
publicApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Public API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
    });
    return Promise.reject(error);
  }
);

export default publicApi;