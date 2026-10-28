import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

function getBaseUrl(): string {
  const envUrl = process.env.REACT_APP_SITE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

function signupParameterSearch(pathname: string, search: string): string {
  if (pathname !== '/signup' && pathname !== '/admin-signup') return '';
  const incoming = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ['plan', 'checkout', 'cycle']) {
    const value = incoming.get(key);
    if (value) kept.set(key, value);
  }
  const text = kept.toString();
  return text ? `?${text}` : '';
}

export const Canonical: React.FC = () => {
  const location = useLocation();
  const base = getBaseUrl();
  const path = `${location.pathname}${signupParameterSearch(location.pathname, location.search)}`;
  const canonicalUrl = base ? `${base}${path}` : path;
  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
    </Helmet>
  );
};

export default Canonical;

