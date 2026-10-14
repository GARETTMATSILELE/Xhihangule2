import {
  billingPlanFromOnboarding,
  planForRole,
  workspaceTypeFromOnboarding,
  type OnboardingState
} from './onboardingState';

describe('onboardingState helpers', () => {
  it('maps roles to billing plans without creating extra signup systems', () => {
    expect(planForRole('landlord')).toBe('INDIVIDUAL');
    expect(planForRole('owner')).toBe('INDIVIDUAL');
    expect(planForRole('manager')).toBe('SME');
    expect(planForRole('agency')).toBe('SME');
    expect(planForRole('accountant')).toBe('SME');
  });

  it('prefers an explicit selected plan over role inference', () => {
    const state: OnboardingState = { role: 'landlord', selectedPlan: 'SME' };
    expect(billingPlanFromOnboarding(state)).toBe('SME');
    expect(workspaceTypeFromOnboarding(state)).toBe('agency');
  });

  it('uses individual workspace for landlord/owner trial defaults', () => {
    expect(billingPlanFromOnboarding({ role: 'landlord' })).toBe('INDIVIDUAL');
    expect(workspaceTypeFromOnboarding({ role: 'owner' })).toBe('individual');
  });
});
