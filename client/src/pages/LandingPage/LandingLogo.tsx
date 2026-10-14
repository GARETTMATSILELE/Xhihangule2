import React, { useState } from 'react';

const PUBLIC = process.env.PUBLIC_URL || '';
const PRIMARY_SRC = `${PUBLIC}/mantis-logo.png`;
const FALLBACK_SRC = `${PUBLIC}/mantis logo.png`;

function MarkFallback() {
  return (
    <svg viewBox="0 0 34 34" width="28" height="28" aria-hidden="true">
      <path
        d="M7 24c2.4-6.2 5.1-11.4 10-16.8 4.9 5.4 7.6 10.6 10 16.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="17" cy="24.5" r="2.1" fill="#fff" />
    </svg>
  );
}

export function LandingLogo({
  withWordmark = true,
  compact = false
}: {
  withWordmark?: boolean;
  compact?: boolean;
}) {
  const [src, setSrc] = useState(PRIMARY_SRC);
  const [failed, setFailed] = useState(false);

  return (
    <>
      <span className="lp-logo-mark">
        {failed ? (
          <MarkFallback />
        ) : (
          <img
            src={src}
            alt="Mantis Africa"
            width={34}
            height={34}
            onError={() => {
              if (src !== FALLBACK_SRC) {
                setSrc(FALLBACK_SRC);
              } else {
                setFailed(true);
              }
            }}
          />
        )}
      </span>
      {withWordmark ? (
        <span className="lp-logo-word">
          Mantis Africa
          {compact ? null : <span>Property management</span>}
        </span>
      ) : (
        <strong>Mantis Africa</strong>
      )}
    </>
  );
}

export default LandingLogo;
