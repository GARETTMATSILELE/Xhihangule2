import { useState, useCallback } from 'react';
import api from '../api/axios';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface ApiResponse<T> extends ApiState<T> {
  execute: (...args: any[]) => Promise<void>;
}

export function useApi<T>(
  apiFunction: (...args: any[]) => Promise<T>,
  initialData: T | null = null
): ApiResponse<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: initialData,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const response = await apiFunction(...args);
        setState({ data: response, loading: false, error: null });
      } catch (error: any) {
        setState({
          data: null,
          loading: false,
          error: error.message || 'An error occurred',
        });
      }
    },
    [apiFunction]
  );

  return {
    ...state,
    execute,
  };
}

// Example usage:
// const { data, loading, error, execute } = useApi(api.getTenants);
// execute(); // Call when needed 