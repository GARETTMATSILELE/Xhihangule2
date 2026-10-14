import { User } from '../models/User';
import AdminAuditLog from '../models/AdminAuditLog';

export type BootstrapDecision =
  | { action: 'skip'; reason: 'production' | 'disabled' | 'incomplete' }
  | { action: 'create'; email: string; password: string };

/**
 * Break-glass provisioning is opt-in and create-only.
 * Production startup never creates or repairs an administrator.
 * An existing account is never re-passworded, reactivated, or given roles.
 */
export function systemAdminBootstrapDecision(env: NodeJS.ProcessEnv = process.env): BootstrapDecision {
  if (env.NODE_ENV === 'production') {
    return { action: 'skip', reason: 'production' };
  }
  if (String(env.ALLOW_SYSTEM_ADMIN_BOOTSTRAP || '').toLowerCase() !== 'true') {
    return { action: 'skip', reason: 'disabled' };
  }
  const email = String(env.SYSTEM_ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = String(env.SYSTEM_ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!email.includes('@') || password.length < 12) {
    return { action: 'skip', reason: 'incomplete' };
  }
  return { action: 'create', email, password };
}

export async function provisionBreakGlassSystemAdmin(): Promise<'skipped' | 'created' | 'exists'> {
  const decision = systemAdminBootstrapDecision(process.env);
  if (decision.action === 'skip') {
    if (decision.reason === 'production' && String(process.env.ALLOW_SYSTEM_ADMIN_BOOTSTRAP || '').toLowerCase() === 'true') {
      console.error('ALLOW_SYSTEM_ADMIN_BOOTSTRAP is ignored in production. No administrator was created or changed.');
    }
    if (decision.reason === 'incomplete') {
      console.error('System admin bootstrap is enabled but the email or password is missing or too short. No administrator was created.');
    }
    return 'skipped';
  }

  const existing = await User.findOne({ email: decision.email }).select('_id').maxTimeMS(5000);
  if (existing) {
    console.log('System admin bootstrap left the existing user unchanged.', { userId: String(existing._id) });
    return 'exists';
  }

  const user = new User({
    email: decision.email,
    password: decision.password,
    firstName: 'System',
    lastName: 'Admin',
    role: 'admin',
    roles: ['admin', 'system_admin'],
    isActive: true,
  });
  await user.save();

  try {
    await AdminAuditLog.create({
      actorId: 'startup',
      action: 'system_admin:bootstrap_create',
      payload: { userId: String(user._id) },
      success: true,
      startedAt: new Date(),
      completedAt: new Date(),
    });
  } catch {
    console.error('System admin bootstrap created a user, but the audit record could not be saved.');
  }

  console.log('System admin bootstrap created a new user.', { userId: String(user._id) });
  return 'created';
}
