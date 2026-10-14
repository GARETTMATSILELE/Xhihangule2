import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { CONTACT, ROUTES, landlordHighlights, managerHighlights } from './landingData';
import { RoleIcon } from './LandingIcons';
import {
  beginPaidPlan,
  beginTrial,
  planForRole,
  readOnboardingState,
  writeOnboardingState,
  type OnboardingRole,
  type SetupMode
} from '../../utils/onboardingState';

const ROLES: {
  id: OnboardingRole;
  title: string;
  blurb: string;
  intents: { id: string; label: string }[];
}[] = [
  {
    id: 'landlord',
    title: 'Landlord',
    blurb: 'You manage your own rental properties.',
    intents: [
      { id: 'manage-properties', label: 'Manage my properties' },
      { id: 'track-rent', label: 'Track rent and payments' },
      { id: 'manage-tenants', label: 'Manage tenants and leases' },
      { id: 'explore', label: 'Explore Mantis' }
    ]
  },
  {
    id: 'manager',
    title: 'Property Manager',
    blurb: 'You manage properties for owners.',
    intents: [
      { id: 'import-portfolio', label: 'Import my portfolio' },
      { id: 'setup-operation', label: 'Set up my management operation' },
      { id: 'manage-people', label: 'Manage owners and tenants' },
      { id: 'explore', label: 'Explore Mantis' }
    ]
  },
  {
    id: 'agency',
    title: 'Estate Agency',
    blurb: 'You run listings, agents and a rental book together.',
    intents: [
      { id: 'agency-properties', label: 'Manage agency properties' },
      { id: 'manage-agents', label: 'Manage agents' },
      { id: 'track-commissions', label: 'Track commissions' },
      { id: 'explore', label: 'Explore Mantis' }
    ]
  },
  {
    id: 'owner',
    title: 'Property Owner',
    blurb: 'You want a clear view of income, expenses and occupancy.',
    intents: [
      { id: 'track-properties', label: 'Track my properties' },
      { id: 'income-expenses', label: 'View income and expenses' },
      { id: 'monitor-tenants', label: 'Monitor tenants' },
      { id: 'explore', label: 'Explore Mantis' }
    ]
  },
  {
    id: 'accountant',
    title: 'Accountant',
    blurb: 'You keep property accounts, payments and reports in order.',
    intents: [
      { id: 'property-accounts', label: 'Manage property accounts' },
      { id: 'track-payments', label: 'Track payments' },
      { id: 'produce-reports', label: 'Produce reports' },
      { id: 'review-accounting', label: 'Review accounting' }
    ]
  }
];

const PATHS: {
  id: SetupMode;
  title: string;
  text: string;
  actions: { label: string; to?: string; href?: string; mode?: SetupMode }[];
}[] = [
  {
    id: 'explore',
    title: 'Explore Mantis',
    text: 'See how Mantis works before adding your own data.',
    actions: [{ label: 'Explore sample workspace', to: '/demo', mode: 'explore' }]
  },
  {
    id: 'manual',
    title: 'Use my data',
    text: 'Start building your real property portfolio.',
    actions: [
      { label: 'Add properties manually', to: ROUTES.trial, mode: 'manual' },
      { label: 'Import spreadsheet', to: '/onboarding/import', mode: 'import' }
    ]
  },
  {
    id: 'help',
    title: 'Get help',
    text: 'Have an existing portfolio or need help getting started?',
    actions: [{ label: 'Talk to Mantis', href: CONTACT.whatsapp, mode: 'help' }]
  }
];

export function OnboardingChooser() {
  const initial = readOnboardingState();
  const [role, setRole] = useState<OnboardingRole | undefined>(initial.role);
  const [intent, setIntent] = useState<string | undefined>(initial.intent);

  const selected = ROLES.find((item) => item.id === role);
  const highlights = role === 'manager' || role === 'agency' || role === 'accountant'
    ? managerHighlights
    : landlordHighlights;

  const prompt = useMemo(() => {
    if (role === 'manager' || role === 'agency') return 'How would you like to get started?';
    return 'What would you like to do first?';
  }, [role]);

  const selectRole = (next: OnboardingRole) => {
    setRole(next);
    setIntent(undefined);
    writeOnboardingState({
      role: next,
      intent: undefined,
      selectedPlan: planForRole(next)
    });
  };

  const selectIntent = (next: string) => {
    const setupMode = next === 'explore' ? 'explore' : next.includes('import') ? 'import' : undefined;
    setIntent(next);
    writeOnboardingState({ intent: next, setupMode });
  };

  const startPath = (mode: SetupMode) => {
    const plan = planForRole(role);
    writeOnboardingState({ setupMode: mode, selectedPlan: plan, role, intent });
    if (mode === 'manual') beginTrial({ role, intent, setupMode: mode, selectedPlan: plan });
    if (mode === 'import') beginPaidPlan(plan === 'SME' ? 'SME' : 'INDIVIDUAL', { role, intent, setupMode: mode });
  };

  return (
    <section id="solutions" className="lp-section">
      <div className="lp-wrap">
        <p className="lp-kicker">Built for property professionals</p>
        <h2 className="lp-h2">Choose your role to see what matters most to you.</h2>
        <p className="lp-lead">Pick a starting point. You can skip any step and explore Mantis first.</p>

        <div className="lp-role-cards">
          {ROLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lp-role-card${role === item.id ? ' is-active' : ''}`}
              aria-pressed={role === item.id}
              onClick={() => selectRole(item.id)}
            >
              <span className="lp-role-icon" aria-hidden="true"><RoleIcon id={item.id} /></span>
              <h3>{item.title}</h3>
              <p>{item.blurb}</p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="lp-onboard-panel" aria-live="polite">
            <p className="lp-kicker">{selected.title}</p>
            <h3 className="lp-onboard-title">{prompt}</h3>
            <div className="lp-intent-row">
              {selected.intents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`lp-intent${intent === item.id ? ' is-active' : ''}`}
                  aria-pressed={intent === item.id}
                  onClick={() => selectIntent(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <RouterLink
              className="lp-text-btn"
              to="/demo"
              onClick={() => writeOnboardingState({ setupMode: 'explore' })}
            >
              Skip and explore Mantis
            </RouterLink>
          </div>
        )}

        <div id="start" className="lp-path-grid">
          {PATHS.map((path) => (
            <article className="lp-path-card" key={path.id}>
              <h3>{path.title}</h3>
              <p>{path.text}</p>
              <div className="lp-path-actions">
                {path.actions.map((action) => (
                  action.href ? (
                    <a
                      key={action.label}
                      className="lp-btn lp-btn-ghost"
                      href={action.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => startPath(action.mode || path.id)}
                    >
                      {action.label}
                    </a>
                  ) : (
                    <RouterLink
                      key={action.label}
                      className={`lp-btn ${path.id === 'explore' || action.mode === 'manual' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                      to={action.to || '/demo'}
                      onClick={() => startPath(action.mode || path.id)}
                    >
                      {action.label}
                    </RouterLink>
                  )
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="lp-highlights">
          {highlights.map((item) => (
            <article className="lp-highlight" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default OnboardingChooser;
