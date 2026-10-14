import React, { useState } from 'react';
import { ProductMock } from './ProductMocks';
import type { ProductMockVariant } from './landingData';

export function ProductFrame({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lp-browser">
      <div className="lp-browser-bar">
        <span className="lp-browser-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-browser-url">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function ProductShot({
  src,
  alt,
  fallback = 'dashboard',
  priority = false
}: {
  src: string;
  alt: string;
  fallback?: ProductMockVariant;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <ProductMock variant={fallback} />;
  }

  return (
    <ProductFrame title="app.mantisafrica.com">
      <img
        className="lp-product-shot"
        src={src}
        alt={alt}
        width={1440}
        height={900}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </ProductFrame>
  );
}
