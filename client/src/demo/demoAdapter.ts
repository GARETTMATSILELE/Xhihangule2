import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { DEMO_BLOCKED_MESSAGE, isDemoMode, notifyDemoBlocked } from './demoMode';
import { resolveDemoGet } from './demoData';

function demoRequestUrl(config: AxiosRequestConfig) {
  const base = String(config.url || '');
  const params = config.params;
  if (!params || typeof params !== 'object') return base;
  const search = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, String(value));
  });
  const extra = search.toString();
  if (!extra) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${extra}`;
}

function asResponse(config: AxiosRequestConfig, data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config: config as InternalAxiosRequestConfig
  };
}

export async function demoAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const method = String(config.method || 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') {
    notifyDemoBlocked();
    const error: any = new Error(DEMO_BLOCKED_MESSAGE);
    error.demoBlocked = true;
    error.response = {
      status: 403,
      data: { message: DEMO_BLOCKED_MESSAGE, code: 'DEMO_MODE' }
    };
    return Promise.reject(error);
  }
  return asResponse(config, resolveDemoGet(demoRequestUrl(config)));
}

export function attachDemoAdapter(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (!isDemoMode()) return config;
  const url = String(config.url || '');
  if (url.includes('/auth/')) return config;
  config.adapter = demoAdapter as any;
  return config;
}
