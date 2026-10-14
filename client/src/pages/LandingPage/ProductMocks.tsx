import React from 'react';
import type { ProductMockVariant } from './landingData';

const NAV = [
  'Dashboard',
  'Properties',
  'Tenants',
  'Leases',
  'Maintenance',
  'Rent Collection',
  'Accounting',
  'Reports'
];

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="lp-kpi">
      <span className="lp-kpi-label">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="lp-kpi-hint">{hint}</span> : null}
    </div>
  );
}

function BrowserChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lp-browser" aria-hidden="true">
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

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="lp-mock-side" aria-hidden="true">
      <div className="lp-mock-brand">
        <span className="lp-mock-brand-kicker">MANTIS</span>
        <strong>Property Owner</strong>
        <span>Individual Workspace</span>
      </div>
      <nav>
        {NAV.map((item) => (
          <span key={item} className={item === active ? 'is-active' : undefined}>
            {item}
          </span>
        ))}
      </nav>
    </aside>
  );
}

function DashboardBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>My Portfolio</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-kpi-row">
        <Kpi label="Total Properties" value="12" />
        <Kpi label="Occupied" value="10" hint="2 vacant" />
        <Kpi label="Rent Collected" value="$8,400" />
        <Kpi label="Maintenance" value="3 open" />
      </div>
      <div className="lp-mock-split">
        <div className="lp-mock-card">
          <p className="lp-mock-h">Action Center</p>
          <ul>
            <li><b>Lease expiry</b><span>Borrowdale cottage · 18 days</span></li>
            <li><b>Outstanding rent</b><span>Avondale 2A · $450</span></li>
            <li><b>Upcoming leases</b><span>2 renewals this quarter</span></li>
          </ul>
        </div>
        <div className="lp-mock-card">
          <p className="lp-mock-h">Collection this quarter</p>
          <div className="lp-bars" aria-hidden="true">
            <span style={{ height: '54%' }} />
            <span style={{ height: '72%' }} />
            <span style={{ height: '61%' }} />
            <span style={{ height: '88%' }} />
            <span style={{ height: '76%' }} />
            <span style={{ height: '93%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountingBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Property accounts</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-kpi-row lp-kpi-row-3">
        <Kpi label="Owner payable" value="$4,280" />
        <Kpi label="Commission" value="$640" />
        <Kpi label="Levies held" value="$310" />
      </div>
      <div className="lp-table-mock">
        <div className="lp-tr lp-th"><span>Property</span><span>Rent</span><span>Owner</span><span>Status</span></div>
        <div className="lp-tr"><span>12 Arundel Rd</span><span>$1,200</span><span>$1,020</span><span>Posted</span></div>
        <div className="lp-tr"><span>Avondale Court 2A</span><span>$850</span><span>$723</span><span>Posted</span></div>
        <div className="lp-tr"><span>Borrowdale cottage</span><span>$1,400</span><span>$1,190</span><span>Review</span></div>
      </div>
    </div>
  );
}

function PaymentsBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Payments</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-table-mock">
        <div className="lp-tr lp-th"><span>Date</span><span>Property</span><span>Type</span><span>Amount</span></div>
        <div className="lp-tr"><span>02 Sep</span><span>12 Arundel Rd</span><span>Rental</span><span>$1,200 USD</span></div>
        <div className="lp-tr"><span>01 Sep</span><span>Avondale Court 2A</span><span>Levy</span><span>$85 USD</span></div>
        <div className="lp-tr"><span>28 Aug</span><span>Borrowdale cottage</span><span>Rental</span><span>ZiG 4,200</span></div>
        <div className="lp-tr"><span>21 Aug</span><span>Enterprise Park</span><span>Sale</span><span>$12,000 USD</span></div>
      </div>
    </div>
  );
}

function LeasingBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Leases</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-kpi-row lp-kpi-row-3">
        <Kpi label="Active leases" value="10" />
        <Kpi label="Expiring 90 days" value="2" />
        <Kpi label="Vacant units" value="2" />
      </div>
      <div className="lp-table-mock">
        <div className="lp-tr lp-th"><span>Tenant</span><span>Property</span><span>End</span><span>Rent</span></div>
        <div className="lp-tr"><span>N. Moyo</span><span>12 Arundel Rd</span><span>31 Mar 2027</span><span>$1,200</span></div>
        <div className="lp-tr"><span>S. Chikore</span><span>Avondale 2A</span><span>04 Oct 2026</span><span>$850</span></div>
        <div className="lp-tr"><span>T. Dube</span><span>Borrowdale cottage</span><span>18 Sep 2026</span><span>$1,400</span></div>
      </div>
    </div>
  );
}

function MaintenanceBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Maintenance</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <ul className="lp-ticket-list">
        <li>
          <span className="lp-pill warn">Open</span>
          <div><b>Geyser not heating</b><span>Borrowdale cottage · assigned to vendor</span></div>
        </li>
        <li>
          <span className="lp-pill">In progress</span>
          <div><b>Gate motor</b><span>12 Arundel Rd · agent follow-up</span></div>
        </li>
        <li>
          <span className="lp-pill ok">Complete</span>
          <div><b>Kitchen tap</b><span>Avondale Court 2A · closed</span></div>
        </li>
      </ul>
    </div>
  );
}

function IntegrationsBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Reports & exports</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-export-grid">
        <div className="lp-mock-card"><p className="lp-mock-h">Rent collection</p><span>CSV · PDF</span></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Owner statement</p><span>CSV · PDF</span></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Income & expense</p><span>CSV · Excel</span></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Occupancy</p><span>CSV · PDF</span></div>
      </div>
    </div>
  );
}

function SalesBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Deals pipeline</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-pipeline">
        <div>
          <p className="lp-mock-h">Lead</p>
          <p>Mount Pleasant house</p>
          <p>Borrowdale stand</p>
        </div>
        <div>
          <p className="lp-mock-h">Viewing</p>
          <p>Avondale duplex</p>
        </div>
        <div>
          <p className="lp-mock-h">Offer</p>
          <p>Enterprise Park unit</p>
        </div>
        <div>
          <p className="lp-mock-h">Won</p>
          <p>Chisipite cottage</p>
        </div>
      </div>
    </div>
  );
}

function ReportingBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Portfolio reporting</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-mock-split">
        <div className="lp-mock-card">
          <p className="lp-mock-h">Income vs expenses</p>
          <div className="lp-bars lp-bars-dual" aria-hidden="true">
            <span style={{ height: '70%' }} />
            <span className="alt" style={{ height: '42%' }} />
            <span style={{ height: '82%' }} />
            <span className="alt" style={{ height: '48%' }} />
            <span style={{ height: '76%' }} />
            <span className="alt" style={{ height: '39%' }} />
          </div>
        </div>
        <div className="lp-mock-card">
          <p className="lp-mock-h">This month</p>
          <ul>
            <li><b>Income</b><span>$11,200</span></li>
            <li><b>Expenses</b><span>$2,140</span></li>
            <li><b>Collection rate</b><span>94%</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function DashboardsBody() {
  return (
    <div className="lp-mock-main">
      <header className="lp-mock-top">
        <strong>Role workspaces</strong>
        <span className="lp-sample-chip">Sample workspace</span>
      </header>
      <div className="lp-role-grid">
        <div className="lp-mock-card"><p className="lp-mock-h">Landlord</p><p>Portfolio, rent, expenses</p></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Agent</p><p>Assigned properties & leases</p></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Owner</p><p>Statements & property view</p></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Accountant</p><p>Accounts, tax, commissions</p></div>
        <div className="lp-mock-card"><p className="lp-mock-h">Sales</p><p>Leads, listings, deals</p></div>
      </div>
    </div>
  );
}

const BODIES: Record<ProductMockVariant, React.FC> = {
  dashboard: DashboardBody,
  accounting: AccountingBody,
  payments: PaymentsBody,
  leasing: LeasingBody,
  maintenance: MaintenanceBody,
  integrations: IntegrationsBody,
  sales: SalesBody,
  reporting: ReportingBody,
  dashboards: DashboardsBody
};

const SIDEBAR_ACTIVE: Record<ProductMockVariant, string> = {
  dashboard: 'Dashboard',
  accounting: 'Accounting',
  payments: 'Rent Collection',
  leasing: 'Leases',
  maintenance: 'Maintenance',
  integrations: 'Reports',
  sales: 'Dashboard',
  reporting: 'Reports',
  dashboards: 'Dashboard'
};

export function ProductMock({
  variant = 'dashboard',
  compact = false
}: {
  variant?: ProductMockVariant;
  compact?: boolean;
}) {
  const Body = BODIES[variant] || DashboardBody;
  return (
    <BrowserChrome title="app.mantisafrica.com">
      <div className={`lp-mock-shell${compact ? ' is-compact' : ''}`}>
        <Sidebar active={SIDEBAR_ACTIVE[variant] || 'Dashboard'} />
        <Body />
      </div>
    </BrowserChrome>
  );
}

export function MobilePropertyMock() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-notch" />
      <div className="lp-phone-screen">
        <p className="lp-phone-kicker">Property</p>
        <strong>12 Arundel Road</strong>
        <span className="lp-pill ok">Occupied</span>
        <div className="lp-phone-stats">
          <div><span>Rent</span><b>$1,200</b></div>
          <div><span>Lease</span><b>Mar 2027</b></div>
        </div>
        <ul>
          <li>Tenant · N. Moyo</li>
          <li>Levy · $85 due</li>
          <li>1 open request</li>
        </ul>
      </div>
    </div>
  );
}

export function FloatingKpis() {
  return (
    <div className="lp-float-kpis" aria-hidden="true">
      <div><span>Occupied</span><b>83%</b></div>
      <div><span>Collected</span><b>$8.4k</b></div>
    </div>
  );
}

export default ProductMock;
