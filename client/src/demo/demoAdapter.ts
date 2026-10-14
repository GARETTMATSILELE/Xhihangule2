import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { DEMO_BLOCKED_MESSAGE, isDemoMode, notifyDemoBlocked } from './demoMode';
import { resolveDemoGet } from './demoData';

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
  return asResponse(config, resolveDemoGet(String(config.url || '')));
}

export function attachDemoAdapter(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (!isDemoMode()) return config;
  const url = String(config.url || '');
  if (url.includes('/auth/')) return config;
  config.adapter = demoAdapter as any;
  return config;
}
