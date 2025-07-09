import { useState, useCallback } from 'react';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

interface ApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  etag: string | null;
}

export function useApiRequest<T>() {
  const [state, setState] = useState<ApiResponse<T>>({
    data: null,
    loading: false,
    error: null,
    etag: null
  });

  const request = useCallback(async (
    url: string,
    config?: AxiosRequestConfig
  ) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Add ETag to request if we have one
      const headers = {
        ...config?.headers,
        ...(state.etag ? { 'If-None-Match': state.etag } : {})
      };

      const response: AxiosResponse<T> = await axios(url, {
        ...config,
        headers
      });

      // Store new ETag if provided
      const newEtag = response.headers.etag;
      
      setState({
        data: response.data,
        loading: false,
        error: null,
        etag: newEtag || state.etag
      });

      return response.data;
    } catch (error) {
      // Handle 304 Not Modified
      if (axios.isAxiosError(error) && error.response?.status === 304) {
        setState(prev => ({ ...prev, loading: false }));
        return state.data;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error : new Error('An error occurred')
      }));

      throw error;
    }
  }, [state.etag, state.data]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const clearData = useCallback(() => {
    setState(prev => ({ ...prev, data: null, etag: null }));
  }, []);

  return {
    ...state,
    request,
    clearError,
    clearData
  };
} 