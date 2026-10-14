import { describe, expect, it } from 'vitest';
import { getWorkspaceBasePath, isDemoPath, workspacePath } from './demoMode';

describe('demoMode', () => {
  it('treats /demo and nested demo paths as demo', () => {
    expect(isDemoPath('/demo')).toBe(true);
    expect(isDemoPath('/demo/properties')).toBe(true);
    expect(isDemoPath('/demo/enterprise')).toBe(true);
    expect(isDemoPath('/individual-dashboard')).toBe(false);
  });

  it('remaps workspace links onto the demo base path', () => {
    expect(getWorkspaceBasePath('/demo/properties')).toBe('/demo');
    expect(workspacePath('/individual-dashboard/leases', '/demo')).toBe('/demo/leases');
    expect(workspacePath('/individual-dashboard/properties/1', '/individual-dashboard')).toBe(
      '/individual-dashboard/properties/1'
    );
  });
});
