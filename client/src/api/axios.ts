import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Default API URL with sensible defaults for dev and production
const isBrowser = typeof window !== 'undefined';
const isLocalDev = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (window.location.port === '3000' || window.location.port === '5173');
const DEFAULT_API_URL = isLocalDev ? 'http://localhost:5000/api' : (isBrowser ? `${window.location.origin}/api` : 'http://localhost:5000/api');
const API_URL = (typeof window !== 'undefined' && (window as any).__API_BASE__) || import.meta.env?.VITE_API_URL || DEFAULT_API_URL;

// Apply a reasonable global timeout so UI fails fast if API is down
axios.defaults.timeout = 8000;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true, // This ensures cookies are sent with requests
  timeout: 8000
});

// Local token helpers to avoid circular dependency with AuthContext
const getAccessToken = (): string | null => {
  try {
    return localStorage.getItem('accessToken');
  } catch {
    return null;
  }
};

const setTokens = (newAccessToken: string | null, newRefreshToken: string | null) => {
  if (newAccessToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
    try { localStorage.setItem('accessToken', newAccessToken); } catch {}
  } else {
    delete api.defaults.headers.common['Authorization'];
    try { localStorage.removeItem('accessToken'); } catch {}
  }
  if (newRefreshToken !== null) {
    try {
      if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
      else localStorage.removeItem('refreshToken');
    } catch {}
  }
};

// Track if we're currently refreshing a token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    console.log('Axios interceptor error:', {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      isRetry: originalRequest._retry
    });

    // If the error is 401 and we haven't tried to refresh the token yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      console.log('401 error detected, attempting token refresh');
      
      if (isRefreshing) {
        // If we're already refreshing, queue this request
        console.log('Token refresh already in progress, queuing request');
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh token is stored as HttpOnly cookie, so we don't need to check memory
        console.log('Calling refresh token endpoint');
        const refreshResponse = await axios.post(`${API_URL}/auth/refresh-token`, {}, {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true, // This ensures cookies are sent
          timeout: 8000
        });

        console.log('Refresh response received:', {
          status: refreshResponse.status,
          data: refreshResponse.data,
          hasToken: !!refreshResponse.data.token,
          hasRefreshToken: !!refreshResponse.data.refreshToken
        });

        const { token: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data;
        
        if (newAccessToken) {
          console.log('Token refresh successful');
          // Update tokens in memory and localStorage
          setTokens(newAccessToken, newRefreshToken);
          localStorage.setItem('accessToken', newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }
          
          // Process queued requests
          processQueue(null, newAccessToken);
          
          // Retry the original request
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          
          console.log('Retrying original request with new token:', {
            url: originalRequest.url,
            method: originalRequest.method,
            hasAuthHeader: !!originalRequest.headers?.Authorization
          });
          
          isRefreshing = false;
          return api(originalRequest);
        } else {
          throw new Error('No new access token received');
        }
      } catch (refreshError) {
        console.log('Token refresh failed:', refreshError);
        // Refresh failed - clear all tokens and redirect to login
        setTokens(null, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        processQueue(refreshError, null);
        isRefreshing = false;
        
        // Dispatch auth error event for the AuthContext to handle
        window.dispatchEvent(new CustomEvent('authError', { 
          detail: 'Session expired. Please log in again.' 
        }));
        
        return Promise.reject(refreshError);
      }
    }

    // If the error is 403 (forbidden), do NOT clear auth; surface to caller
    if (error.response?.status === 403) {
      const code = (error.response?.data as any)?.code;
      console.log('403 forbidden detected', { code, url: error.config?.url });
      // Business-rule 403s: user may be authenticated but lacks company/permission
      if (code === 'NO_COMPANY' || code === 'INSUFFICIENT_PERMISSIONS' || code === 'OWNER_ACCESS_REQUIRED') {
        return Promise.reject(error);
      }
      // Default: surface error without clearing tokens
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api; 