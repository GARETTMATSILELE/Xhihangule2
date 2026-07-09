import type { AxiosResponse } from 'axios';
import api from '../api/axios';

export function shouldUseAgentDataRoutes(pathname: string, options?: {
  workspaceType?: string;
  plan?: string;
  role?: string;
}): boolean {
  if (pathname.includes('/individual-dashboard')) return false;
  if (options?.workspaceType === 'individual' || options?.plan === 'INDIVIDUAL') return false;
  return pathname.includes('/agent-dashboard') || options?.role === 'agent';
}

export function unwrapProperties(data: unknown): any[] {
  const raw = data as any;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.properties)) return raw.properties;
  return [];
}

export function unwrapTenants(data: unknown): any[] {
  const raw = data as any;
  if (Array.isArray(raw?.tenants)) return raw.tenants;
  if (Array.isArray(raw?.data?.tenants)) return raw.data.tenants;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw)) return raw;
  return [];
}

export function unwrapLeases(data: unknown): any[] {
  const raw = data as any;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.leases)) return raw.leases;
  return [];
}

export async function fetchWorkspaceProperties(useAgentRoutes: boolean): Promise<any[]> {
  const response: AxiosResponse = useAgentRoutes
    ? await api.get('/agents/properties')
    : await api.get('/properties');
  return unwrapProperties(response.data);
}

export async function fetchWorkspaceTenants(useAgentRoutes: boolean): Promise<any[]> {
  const response: AxiosResponse = useAgentRoutes
    ? await api.get('/agents/tenants')
    : await api.get('/tenants', { params: { page: 1, limit: 10000 } });
  return unwrapTenants(response.data);
}

export async function fetchWorkspaceLeases(useAgentRoutes: boolean): Promise<any[]> {
  try {
    const response: AxiosResponse = useAgentRoutes
      ? await api.get('/agents/leases')
      : await api.get('/leases');
    return unwrapLeases(response.data);
  } catch {
    return [];
  }
}
