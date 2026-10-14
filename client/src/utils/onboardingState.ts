export type OnboardingRole = 'landlord' | 'manager' | 'agency' | 'owner' | 'accountant';
export type SetupMode = 'explore' | 'manual' | 'import' | 'help';
export type SelectedPlan = 'TRIAL' | 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';

export interface OnboardingState {
  role?: OnboardingRole;
  intent?: string;
  setupMode?: SetupMode;
  selectedPlan?: SelectedPlan;
  billingCycle?: 'monthly' | 'yearly';
  registrationMode?: 'trial' | 'paid';
  setupProgress?: number;
}

export const ONBOARDING_STORAGE_KEY = 'mantis.onboarding.v1';

const EMPTY: OnboardingState = {};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readOnboardingState(): OnboardingState {
  if (!canUseStorage()) return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
    return {
      role: parsed.role,
      intent: parsed.intent,
      setupMode: parsed.setupMode,
      selectedPlan: parsed.selectedPlan,
      billingCycle: parsed.billingCycle === 'yearly' ? 'yearly' : parsed.billingCycle === 'monthly' ? 'monthly' : undefined,
      registrationMode: parsed.registrationMode === 'paid' ? 'paid' : parsed.registrationMode === 'trial' ? 'trial' : undefined,
      setupProgress: typeof parsed.setupProgress === 'number' ? parsed.setupProgress : undefined
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeOnboardingState(partial: Partial<OnboardingState>): OnboardingState {
  const next = { ...readOnboardingState(), ...partial };
  if (!canUseStorage()) return next;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures. Onboarding still works in-memory for this session.
  }
  return next;
}

export function planForRole(role?: OnboardingRole): SelectedPlan {
  if (role === 'landlord' || role === 'owner') return 'INDIVIDUAL';
  if (role === 'manager' || role === 'agency' || role === 'accountant') return 'SME';
  return 'TRIAL';
}

export function billingPlanFromOnboarding(state: OnboardingState = readOnboardingState()): 'INDIVIDUAL' | 'SME' | 'ENTERPRISE' {
  if (state.selectedPlan === 'INDIVIDUAL' || state.selectedPlan === 'SME' || state.selectedPlan === 'ENTERPRISE') {
    return state.selectedPlan;
  }
  const inferred = planForRole(state.role);
  return inferred === 'TRIAL' ? 'INDIVIDUAL' : inferred;
}

export function workspaceTypeFromOnboarding(state: OnboardingState = readOnboardingState()): 'individual' | 'agency' {
  return billingPlanFromOnboarding(state) === 'INDIVIDUAL' ? 'individual' : 'agency';
}

export function beginTrial(extra: Partial<OnboardingState> = {}) {
  writeOnboardingState({
    ...extra,
    selectedPlan: 'TRIAL',
    registrationMode: 'trial'
  });
}

export function beginPaidPlan(plan: 'INDIVIDUAL' | 'SME', extra: Partial<OnboardingState> = {}) {
  writeOnboardingState({
    ...extra,
    role: plan === 'INDIVIDUAL' ? extra.role || 'landlord' : extra.role || 'manager',
    selectedPlan: plan,
    registrationMode: 'paid',
    billingCycle: extra.billingCycle === 'yearly' ? 'yearly' : 'monthly'
  });
}
