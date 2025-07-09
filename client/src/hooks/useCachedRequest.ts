import { useState, useEffect, useCallback, useRef } from 'react';
import axios, { AxiosRequestConfig } from 'axios';

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

interface Cache {
  [key: string]: CacheItem<any>;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cache: Cache = {};

export function useCachedRequest<T>(
  url: string,
  config?: AxiosRequestConfig,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  const fetchData = useCallback(async () => {
    const cacheKey = `${url}-${JSON.stringify(config)}`;
    const cachedItem = cache[cacheKey];
    const now = Date.now();

    if (cachedItem && now - cachedItem.timestamp < CACHE_DURATION) {
      setData(cachedItem.data);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios(url, config);
      const newData = response.data;
      
      cache[cacheKey] = {
        data: newData,
        timestamp: now
      };
      
      setData(newData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(config)]);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchData();
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [fetchData, ...dependencies]);

  const invalidateCache = useCallback(() => {
    const cacheKey = `${url}-${JSON.stringify(config)}`;
    delete cache[cacheKey];
  }, [url, JSON.stringify(config)]);

  return { data, loading, error, refetch: fetchData, invalidateCache };
} 