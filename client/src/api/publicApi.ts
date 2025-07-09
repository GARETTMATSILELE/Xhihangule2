import axios from 'axios';

// Default API URL if environment variable is not set
const DEFAULT_API_URL = 'http://localhost:5000/api';
const API_URL = import.meta.env?.VITE_API_URL || DEFAULT_API_URL;

// Create a public axios instance for unauthenticated requests
// This instance does NOT have the request interceptor that adds Authorization headers
const publicApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: false // This ensures cookies are NOT sent with requests
});

// Request interceptor for logging (no auth headers)
publicApi.interceptors.request.use(
  (config) => {
    console.log('Public API Request Interceptor:', {
      url: config.url,
      method: config.method,
      currentHeaders: config.headers
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
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

export default publicApi; 