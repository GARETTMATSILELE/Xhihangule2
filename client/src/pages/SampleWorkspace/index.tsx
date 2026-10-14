import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Seo from '../../components/SEO/Seo';
import { LandingLogo } from '../LandingPage/LandingLogo';
import { ProductMock } from '../LandingPage/ProductMocks';
import { CONTACT, ROUTES, featureTabs, type FeatureKey } from '../LandingPage/landingData';
import { beginTrial } from '../../utils/onboardingState';
import '../LandingPage/LandingPage.css';

const SAMPLE_ROWS = [
  { property: '12 Arundel Road', tenant: 'N. Moyo', rent: '$1,200', status: 'Occupied' },
  { property: 'Avondale Court 2A', tenant: 'T. Dube', rent: '$850', status: 'Occupied' },
  { property: 'Borrowdale cottage', tenant: '—', rent: '$1,400', status: 'Vacant' }
];

const SampleWorkspace: React.FC = () => {
  const [active, setActive] = useState<FeatureKey>('DASHBOARDS');
  const tab = useMemo(() => featureTabs.find((item) => item.key === active) || featureTabs[0], [active]);

  return (
    <div className="lp">
      <Seo
        title="Sample workspace | Mantis Africa"
        description="Explore a labelled sample Mantis workspace with fictional properties, tenants, leases and payments. Sample data is never mixed with a live account."
      />
      <header className="lp-nav is-scrolled">
        <div className="lp-nav-inner">
          <RouterLink to="/" className="lp-logo" aria-label="Mantis Africa home">
            <LandingLogo />
          </RouterLink>
          <div className="lp-nav-cta">
            <RouterLink className="lp-login" to={ROUTES.login}>Log in</RouterLink>
            <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'explore' })}>
              Start free trial
            </RouterLink>
          </div>
        </div>
      </header>

      <main id="main" className="lp-section" style={{ paddingTop: '1.5rem' }}>
        <div className="lp-wrap">
          <div className="lp-sample-banner" role="status">
            <strong>Sample workspace</strong>
            <span>Fictional portfolio for demonstration only. This is not a live account and cannot change real financial records.</span>
          </div>
          <p className="lp-kicker">Explore Mantis</p>
          <h1 className="lp-h2">See how a Mantis workspace is organised.</h1>
          <p className="lp-lead">
            Click through the product areas below. Figures, tenants and properties here are sample data for Harare-style operations.
          </p>

          <div
            className="lp-tabs"
            role="tablist"
            aria-label="Sample workspace areas"
            style={{ marginTop: '1.2rem' }}
          >
            {featureTabs.map((item) => (
              <button
                key={item.key}
                className="lp-tab"
                role="tab"
                aria-selected={active === item.key}
                onClick={() => setActive(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="lp-tour-panel">
            <ProductMock variant={tab.mock} />
            <div className="lp-tour-copy">
              <p className="lp-sample-chip">Sample workspace</p>
              <h2>{tab.title}</h2>
              <p>{tab.description}</p>
              <ul className="lp-checks">
                {tab.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
              <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'explore' })}>
                Start free trial
              </RouterLink>
            </div>
          </div>

          <div className="lp-demo-card" style={{ marginTop: '1.5rem' }}>
            <table className="lp-sample-table">
              <caption>Sample properties</caption>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Tenant</th>
                  <th>Rent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ROWS.map((row) => (
                  <tr key={row.property}>
                    <td>{row.property}</td>
                    <td>{row.tenant}</td>
                    <td>{row.rent}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lp-demo-actions">
            <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'explore' })}>
              Start free trial
            </RouterLink>
            <a className="lp-btn lp-btn-ghost" href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">Talk to sales</a>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SampleWorkspace;
