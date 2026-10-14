import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Seo from '../../components/SEO/Seo';
import { LandingLogo } from '../LandingPage/LandingLogo';
import { CONTACT, ROUTES } from '../LandingPage/landingData';
import { beginTrial, readOnboardingState } from '../../utils/onboardingState';
import { parsePortfolioCsv, type ImportPreview } from '../../utils/portfolioImport';
import '../LandingPage/LandingPage.css';

const SAMPLE_TEMPLATE = 'name,address,city,type\n12 Arundel Road,Alexandra Park,Harare,House\nAvondale Court 2A,Avondale,Harare,Apartment';

const OnboardingImport: React.FC = () => {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const onboarding = readOnboardingState();

  const handleFile = async (file: File) => {
    setError(null);
    setStatus('loading');
    try {
      const text = await file.text();
      const next = parsePortfolioCsv(text);
      if (!next.rows.length) {
        setPreview(null);
        setStatus('error');
        setError('That file did not contain any property rows. Use name, address and city columns.');
        return;
      }
      setPreview(next);
      setStatus('success');
    } catch {
      setStatus('error');
      setError('Something went wrong while reading the spreadsheet. Try again with a CSV file.');
    }
  };

  return (
    <div className="lp">
      <Seo
        title="Import portfolio | Mantis Africa"
        description="Validate a property spreadsheet before adding anything to Mantis. Nothing is imported until you confirm the next step."
      />
      <header className="lp-nav is-scrolled">
        <div className="lp-nav-inner">
          <RouterLink to="/" className="lp-logo" aria-label="Mantis Africa home">
            <LandingLogo />
          </RouterLink>
          <div className="lp-nav-cta">
            <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'import' })}>
              Start free trial
            </RouterLink>
          </div>
        </div>
      </header>

      <main id="main" className="lp-section" style={{ paddingTop: '1.5rem' }}>
        <div className="lp-wrap" style={{ maxWidth: 860 }}>
          <p className="lp-kicker">Bring your portfolio</p>
          <h1 className="lp-h2">Bring your existing portfolio to Mantis.</h1>
          <p className="lp-lead">
            Import properties, tenants and leases from your existing spreadsheet. Mantis checks the file first and will not create records automatically.
          </p>

          <div className="lp-path-grid" style={{ marginTop: '1.4rem' }}>
            <article className="lp-path-card">
              <h3>Upload spreadsheet</h3>
              <p>CSV with columns for name, address and city. Invalid rows stay visible until you fix them.</p>
              <label className="lp-btn lp-btn-primary" style={{ cursor: 'pointer' }}>
                {status === 'loading' ? 'Reading file…' : 'Upload spreadsheet'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </article>
            <article className="lp-path-card">
              <h3>Enter manually</h3>
              <p>Add properties one at a time after signup. Best for a small portfolio.</p>
              <RouterLink className="lp-btn lp-btn-ghost" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'manual', role: onboarding.role })}>
                Enter manually
              </RouterLink>
            </article>
          </div>

          {error && (
            <div className="lp-import-error" role="alert">
              <p>{error}</p>
              <button type="button" className="lp-btn lp-btn-ghost" onClick={() => setError(null)}>Try again</button>
            </div>
          )}

          {preview && (
            <div className="lp-demo-card" style={{ marginTop: '1.4rem' }}>
              <p className="lp-sample-chip">Validation preview</p>
              <p>
                {preview.validCount} ready · {preview.invalidCount} need attention. Nothing has been saved.
              </p>
              <table className="lp-sample-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 12).map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.address || '—'}</td>
                      <td>{row.errors.length ? row.errors.join('; ') : 'Ready'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lp-lead" style={{ marginTop: '1rem' }}>
                There is no bulk commit from this screen. Start a trial and add the valid properties yourself, or talk to Mantis for a guided import of a large book.
              </p>
              <div className="lp-demo-actions">
                <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial({ setupMode: 'import' })}>
                  Start free trial
                </RouterLink>
                <a className="lp-btn lp-btn-ghost" href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">Talk to Mantis</a>
              </div>
            </div>
          )}

          <p className="lp-lead" style={{ marginTop: '1.4rem' }}>
            Example file: <code>{SAMPLE_TEMPLATE.split('\n')[0]}</code>
          </p>
        </div>
      </main>
    </div>
  );
};

export default OnboardingImport;
