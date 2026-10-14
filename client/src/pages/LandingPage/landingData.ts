export const CONTACT = {
  email: 'garett@kibycom.com',
  phoneDisplay: '+263 78 322 2010',
  phoneTel: '+263783222010',
  whatsapp: 'https://wa.me/263783222010',
  address: '8 Normandy Road, Alexandra Park, Harare, Zimbabwe',
  city: 'Harare, Zimbabwe'
} as const;

export const ROUTES = {
  login: '/login',
  trial: '/signup?checkout=trial',
  landlord: '/signup?plan=INDIVIDUAL&checkout=paid',
  manager: '/signup?plan=SME&checkout=paid',
  enterprise: 'https://wa.me/263783222010',
  demo: '/demo',
  portfolioImport: '/onboarding/import',
  sales: 'https://wa.me/263783222010'
} as const;

export type LandingRouteKey = keyof typeof ROUTES;

export type FeatureKey =
  | 'ACCOUNTING'
  | 'PAYMENTS'
  | 'LEASING'
  | 'MAINTENANCE'
  | 'INTEGRATIONS'
  | 'SALES'
  | 'REPORTING'
  | 'DASHBOARDS';

export type ProductMockVariant =
  | 'dashboard'
  | 'accounting'
  | 'payments'
  | 'leasing'
  | 'maintenance'
  | 'integrations'
  | 'sales'
  | 'reporting'
  | 'dashboards';

export const featureTabs: {
  key: FeatureKey;
  label: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  mock: ProductMockVariant;
}[] = [
  {
    key: 'ACCOUNTING',
    label: 'Accounting',
    title: 'Property-level accounting you can actually follow',
    description:
      'See income, expenses, commissions and owner amounts against the property they belong to — not a generic ledger that hides the detail.',
    bullets: [
      'Property accounts and owner statements',
      'Commission tracking for agency workspaces',
      'VAT-aware reporting where the company is registered'
    ],
    cta: 'Explore accounting',
    mock: 'accounting'
  },
  {
    key: 'PAYMENTS',
    label: 'Payments',
    title: 'Record, allocate and receipt every payment',
    description:
      'Capture rent, levies, sales and municipal payments in USD, ZiG or ZAR, with history, receipts and outstanding balances in one place.',
    bullets: [
      'Rent, levy, sale and municipal payment types',
      'Multi-currency capture: USD, ZiG and ZAR',
      'Receipts and payment history for each property'
    ],
    cta: 'Explore payments',
    mock: 'payments'
  },
  {
    key: 'LEASING',
    label: 'Leasing',
    title: 'Create, renew and track every lease',
    description:
      'Keep tenants, properties and lease terms together so occupancy, renewals and expiries are visible before they become a problem.',
    bullets: [
      'Lease creation, renewals and status tracking',
      'Tenant onboarding linked to the property',
      'Upcoming and expired lease visibility'
    ],
    cta: 'Explore leasing',
    mock: 'leasing'
  },
  {
    key: 'MAINTENANCE',
    label: 'Maintenance',
    title: 'From request to resolution, with a clear owner',
    description:
      'Log maintenance from report through assignment and completion, so work does not live in WhatsApp threads and spreadsheets.',
    bullets: [
      'Requests from staff and property operations',
      'Assign work to agents or vendors',
      'Status tracking through to completion'
    ],
    cta: 'Explore maintenance',
    mock: 'maintenance'
  },
  {
    key: 'INTEGRATIONS',
    label: 'Integrations',
    title: 'Export the records you already keep in Mantis',
    description:
      'Take reports out as CSV, PDF or Excel, and complete Mantis subscription billing through Paynow when you are ready to upgrade.',
    bullets: [
      'CSV, PDF and Excel report exports',
      'Paynow checkout for Mantis subscriptions',
      'Accounting and operational data you can take with you'
    ],
    cta: 'Explore exports',
    mock: 'integrations'
  },
  {
    key: 'SALES',
    label: 'Sales / CRM',
    title: 'Listings, leads and deals in the same workspace',
    description:
      'Move a listing from enquiry to viewing to deal without a separate CRM — including buyers, owners and developments.',
    bullets: [
      'Leads, viewings and buyer tracking',
      'Owners, listings and developments',
      'Deals pipeline with stages'
    ],
    cta: 'Explore sales',
    mock: 'sales'
  },
  {
    key: 'REPORTING',
    label: 'Reporting',
    title: 'Reports that match how the portfolio actually runs',
    description:
      'Income, expenses, occupancy, rent collection and owner statements — generated from the same records used day to day.',
    bullets: [
      'Income, expense and occupancy reports',
      'Owner statements and property performance',
      'CSV and PDF export from reporting screens'
    ],
    cta: 'Explore reporting',
    mock: 'reporting'
  },
  {
    key: 'DASHBOARDS',
    label: 'Dashboards & Portals',
    title: 'A workspace for each role that uses Mantis',
    description:
      'Landlords, agents, owners, accountants and sales each get a dashboard built around their work — not one crowded screen for everyone.',
    bullets: [
      'Individual landlord workspace',
      'Agent, owner, accountant and sales dashboards',
      'Role-based access and permissions'
    ],
    cta: 'Explore dashboards',
    mock: 'dashboards'
  }
];

export const coreFeatures = [
  {
    key: 'ACCOUNTING',
    title: 'Accounting',
    value: 'Know where every dollar goes.',
    body: 'Property-level financial workflows designed for clear owner and operational reporting.',
    points: ['Property accounting', 'Owner statements', 'Commission tracking']
  },
  {
    key: 'PAYMENTS',
    title: 'Payments',
    value: 'Keep rent and other money movements in one record.',
    body: 'Capture payments against the right property, tenant and period, then issue a receipt.',
    points: ['Rent, levies and sales', 'USD, ZiG and ZAR', 'Receipts and history']
  },
  {
    key: 'LEASING',
    title: 'Leasing',
    value: 'See occupancy before a lease quietly expires.',
    body: 'Create and track leases with the tenant and property already connected.',
    points: ['Lease creation', 'Renewals and expiry', 'Tenant onboarding']
  },
  {
    key: 'MAINTENANCE',
    title: 'Maintenance',
    value: 'Give every request an owner and a status.',
    body: 'Track work from the first report through assignment and completion.',
    points: ['Work requests', 'Vendor and agent assignment', 'Status to completion']
  },
  {
    key: 'SALES',
    title: 'Sales / CRM',
    value: 'Run listings without a second system.',
    body: 'Leads, viewings, buyers and deals live next to the property record.',
    points: ['Leads and viewings', 'Buyer and owner records', 'Deals pipeline']
  },
  {
    key: 'REPORTING',
    title: 'Reporting',
    value: 'Show owners and managers the same truth.',
    body: 'Operational and financial reports generated from live workspace data.',
    points: ['Income and expenses', 'Occupancy and collection', 'CSV / PDF export']
  }
] as const;

export const landlordHighlights = [
  {
    title: 'Your properties in one workspace',
    text: 'Add properties, tenants and leases without a spreadsheet for each building.'
  },
  {
    title: 'Rent collection you can check in minutes',
    text: 'See what is paid, outstanding and coming due against each property.'
  },
  {
    title: 'Expenses, bills and maintenance together',
    text: 'Municipal bills, levies, repairs and files sit on the same property record.'
  }
] as const;

export const managerHighlights = [
  {
    title: 'One operation for the whole agency',
    text: 'Agents, owners, accountants and sales work from role-based dashboards.'
  },
  {
    title: 'Owner statements and commissions',
    text: 'Property accounts, commission splits and owner reporting are built in.'
  },
  {
    title: 'Listings and rentals in the same product',
    text: 'CRM, leasing, maintenance and accounting share the same property data.'
  }
] as const;

export const howItWorks = [
  {
    step: '01',
    title: 'Add your properties',
    text: 'Create the buildings and units you manage, with owners and basic details attached.'
  },
  {
    step: '02',
    title: 'Add tenants & leases',
    text: 'Connect people to properties so occupancy, rent and lease dates are visible.'
  },
  {
    step: '03',
    title: 'Manage payments, maintenance & work',
    text: 'Record money in and out, log requests, and keep files on the property they belong to.'
  },
  {
    step: '04',
    title: 'See your portfolio clearly',
    text: 'Use dashboards and reports to see occupancy, collection, expenses and owner position.'
  }
] as const;

export const zimbabwePoints = [
  'USD, ZiG and ZAR payment capture',
  'Property-level commission structures',
  'Owner statements from live property accounts',
  'Agent commission tracking on agency plans',
  'Property-specific financial reporting',
  'Role-based workspaces for the people who actually do the work',
  'Onboarding and support from Harare'
] as const;

export const securityPoints = [
  {
    title: 'Role-based permissions',
    text: 'Admin, agent, owner, accountant and sales access is separated by role.'
  },
  {
    title: 'Secure authentication',
    text: 'Users sign in with authenticated accounts. Protected routes keep workspace data behind login.'
  },
  {
    title: 'Audit trails',
    text: 'Payment changes and trust-account activity keep a record of what happened.'
  },
  {
    title: 'Operational backups',
    text: 'Platform backups are run as part of system administration.'
  },
  {
    title: 'Data export',
    text: 'Reports can be exported as CSV, PDF or Excel from the workspace.'
  }
] as const;

export const credibilityPoints = [
  {
    title: 'Role-based product, not a generic spreadsheet',
    text: 'Separate workspaces exist for landlords, agents, owners, accountants and sales.'
  },
  {
    title: 'Built around Zimbabwean property operations',
    text: 'USD/ZiG/ZAR capture, commissions, owner statements and Harare-based support.'
  },
  {
    title: 'Accounting that follows the property',
    text: 'Property accounts, receipts, levies and reports are part of the same workspace.'
  }
] as const;

export const faqs = [
  {
    q: 'Do I need a credit card to start?',
    a: 'No. The 14-day trial starts from account signup. You are not asked for a card to create the workspace.'
  },
  {
    q: 'What happens after the 14-day trial?',
    a: 'Trial access ends after 14 days. You can choose a Landlord, Property Manager or Enterprise plan from billing setup to continue.'
  },
  {
    q: 'Can I import my existing properties?',
    a: 'You can validate a spreadsheet from the import screen, then add properties from the dashboard after signup. Mantis does not silently overwrite financial records. For a large existing portfolio, talk to us and we will advise on the practical way to get it in.'
  },
  {
    q: 'Can landlords/owners access their own information?',
    a: 'Yes. Property owners can sign in to an owner dashboard to see their properties, statements and related activity.'
  },
  {
    q: 'Can my accountant have separate access?',
    a: 'Yes. Accountant users have a dedicated dashboard for payments, property accounts, commissions, reports and related financial work.'
  },
  {
    q: 'Can agents have separate permissions?',
    a: 'Yes. Agents have their own dashboard for assigned properties, tenants, leases, payments, maintenance and related work.'
  },
  {
    q: 'Can I upgrade as my portfolio grows?',
    a: 'Yes. Move from the Landlord plan (up to 10 properties) to Property Manager (up to 120) or Enterprise. Billing setup handles plan and cycle changes.'
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Reporting screens support CSV, PDF and Excel exports, including rent collection, owner statements and income/expense reports.'
  }
] as const;
