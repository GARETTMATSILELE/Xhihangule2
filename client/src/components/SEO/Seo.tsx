import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

type SeoProps = {
  title?: string;
  description?: string;
  robots?: 'index,follow' | 'noindex,nofollow' | string;
  canonicalPath?: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
};

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

export const Seo: React.FC<SeoProps> = ({
  title,
  description,
  robots = 'index,follow',
  canonicalPath,
  image,
  jsonLd
}) => {
  const location = useLocation();
  const baseUrl = getBaseUrl();
  const path = canonicalPath ?? location.pathname;
  const canonicalUrl = baseUrl ? `${baseUrl}${path}` : path;

  return (
    <Helmet>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonicalUrl} />
      {/* Open Graph (basic) */}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {image && <meta property="og:image" content={image} />}
      {baseUrl && <meta property="og:url" content={canonicalUrl} />}
      {/* JSON-LD structured data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default Seo;

