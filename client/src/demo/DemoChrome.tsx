import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Alert, Snackbar } from '@mui/material';
import { LandingLogo } from '../pages/LandingPage/LandingLogo';
import { ROUTES } from '../pages/LandingPage/landingData';
import { beginTrial } from '../utils/onboardingState';
import { DEMO_BLOCKED_MESSAGE } from './demoMode';
import '../pages/LandingPage/LandingPage.css';

export function DemoChrome({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const agency = location.pathname.startsWith('/demo/enterprise');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || DEMO_BLOCKED_MESSAGE);
    };
    window.addEventListener('mantis:demo-blocked', onBlocked as EventListener);
    return () => window.removeEventListener('mantis:demo-blocked', onBlocked as EventListener);
  }, []);

  return (
    <div className="demo-shell">
      <div className="demo-banner" role="status">
        <strong>DEMO MODE</strong>
        <span>Sample workspace with fictional properties, tenants and payments. Actions that would change financial records are disabled.</span>
        <nav className="demo-banner-nav" aria-label="Demo workspace switch">
          <RouterLink className={!agency ? 'is-active' : undefined} to="/demo">Landlord workspace</RouterLink>
          <RouterLink className={agency ? 'is-active' : undefined} to="/demo/enterprise">Agency workspace</RouterLink>
          <RouterLink to="/">Back to site</RouterLink>
          <RouterLink to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'explore' })}>Start free trial</RouterLink>
        </nav>
      </div>
      <div className="demo-brandbar">
        <RouterLink to="/" className="lp-logo" aria-label="Mantis Africa home">
          <LandingLogo compact />
        </RouterLink>
        <span className="lp-sample-chip">SAMPLE WORKSPACE</span>
      </div>
      {children}
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)}>
        <Alert severity="info" onClose={() => setMessage(null)}>{message}</Alert>
      </Snackbar>
    </div>
  );
}

export default DemoChrome;
