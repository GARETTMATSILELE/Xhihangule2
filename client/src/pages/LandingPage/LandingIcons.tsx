import React from 'react';

const common = {
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

export function IconAccounting() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M8 19V10M12 19V7M16 19v-6M20 19V4" /></svg>;
}

export function IconPayments() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 14h4" /></svg>;
}

export function IconLeasing() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v5h5M9 13h6M9 17h4" /></svg>;
}

export function IconMaintenance() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M14 7l3 3M4 20l7-7M15 6a4 4 0 015 5l-8.5 8.5H7v-4.5L15 6z" /></svg>;
}

export function IconReporting() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16V10M12 16V8M16 16v-4" /></svg>;
}

export function IconCrm() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 13a3 3 0 100-6 3 3 0 000 6z" /><path d="M3.5 19a4.5 4.5 0 019 0M11.5 19a4.5 4.5 0 019 0" /></svg>;
}

export function IconIntegrations() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8M8 17h8M7 12h10" /><rect x="4" y="4" width="4" height="6" rx="1" /><rect x="16" y="14" width="4" height="6" rx="1" /></svg>;
}

export function IconSecurity() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V7l8-4z" /></svg>;
}

export function IconProperties() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10l8-6 8 6v10" /><path d="M10 20v-6h4v6" /></svg>;
}

export function IconTenants() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5 19c1.4-3.2 3.8-5 7-5s5.6 1.8 7 5" /></svg>;
}

export function IconLandlord() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11l8-6 8 6v9" /><path d="M9 20v-6h6v6" /></svg>;
}

export function IconManager() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V9l5-3 5 3v11" /><path d="M13 20V11l4-2 4 2v9" /><path d="M7 20v-5h3v5M17 20v-4h2v4" /></svg>;
}

export function IconAgency() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M7 8V5h10v3M8 12h2M12 12h2M16 12h2M8 16h2M12 16h2M16 16h2" /></svg>;
}

export function IconOwner() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20V10l5-4 5 4v10" /><circle cx="16.5" cy="14.5" r="2.5" /><path d="M16.5 17v2" /></svg>;
}

export function IconAccountant() {
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h5M8 16h3" /></svg>;
}

export function IconWhatsApp() {
  return (
    <svg {...common} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 19.2l.7-2.6A7.5 7.5 0 1119 12a7.4 7.4 0 01-1.2 4.1l.3 2.7-2.6-.5A7.5 7.5 0 016.5 19.2z" />
      <path d="M9.2 9.8c.2-.5.4-.5.7-.5h.6c.2 0 .4 0 .5.4l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.1-.1.3 0 .4.4.7 1.1 1.4 1.9 1.8.2.1.3.1.4 0l.6-.4c.2-.1.4-.1.5 0l1.6.9c.3.2.4.4.3.7-.3 1.1-1.6 1.4-2.6.9-1.5-.7-3.2-2.2-4.3-3.8-.9-1.3-1.2-2.6-1.1-3.4.1-.4.4-.6.6-1z" />
    </svg>
  );
}

const FEATURE_ICONS: Record<string, React.FC> = {
  Accounting: IconAccounting,
  Payments: IconPayments,
  Leasing: IconLeasing,
  Maintenance: IconMaintenance,
  'Sales / CRM': IconCrm,
  Reporting: IconReporting,
  Integrations: IconIntegrations,
  Security: IconSecurity,
  Properties: IconProperties,
  Tenants: IconTenants
};

export function FeatureIcon({ name }: { name: string }) {
  const Icon = FEATURE_ICONS[name] || IconProperties;
  return <Icon />;
}

const ROLE_ICONS: Record<string, React.FC> = {
  landlord: IconLandlord,
  manager: IconManager,
  agency: IconAgency,
  owner: IconOwner,
  accountant: IconAccountant
};

export function RoleIcon({ id }: { id: string }) {
  const Icon = ROLE_ICONS[id] || IconLandlord;
  return <Icon />;
}
