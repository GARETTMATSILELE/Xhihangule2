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

export const Canonical: React.FC = () => {
  const location = useLocation();
  const base = getBaseUrl();
  const canonicalUrl = base ? `${base}${location.pathname}` : location.pathname;
  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
    </Helmet>
  );
};

export default Canonical;

