import React from 'react';

type PaynowBadgeProps = {
  className?: string;
  style?: React.CSSProperties;
};

const PaynowBadge: React.FC<PaynowBadgeProps> = ({ className, style }) => (
  <a
    className={className}
    style={style}
    href="https://www.paynow.co.zw/"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Payments processed by Paynow"
  >
    <img
      src="/assets/payments/paynow-badge.png"
      alt="Paynow. Visa, Mastercard, EcoCash, Zimswitch and Telecash."
      style={{ display: 'block', width: '100%', maxWidth: 420, height: 'auto' }}
    />
  </a>
);

export default PaynowBadge;
