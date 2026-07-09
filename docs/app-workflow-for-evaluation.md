# App Workflow for Evaluation

## Purpose

This document describes the start-to-finish workflow for the Azure Property Management System, a multi-tenant property management application for property companies, agents, owners, accountants, sales teams, and system administrators.

Use it as an evaluation guide to understand how a user enters the application, how authentication and onboarding work, and how each role completes its core tasks.

## Application Entry Points

The React client starts at `/` and renders the application through `client/src/router.tsx` and `client/src/App.tsx`. Public visitors can access marketing, authentication, signup, billing, checkout, and password reset routes. Business workflows after login are protected by role-based routes.

Main public routes:

- `/` - landing page with product overview, features, pricing, and calls to sign up or log in.
- `/login` - existing user sign-in.
- `/signup` - workspace signup flow for a new customer.
- `/admin-signup` - admin-focused signup flow.
- `/forgot-password` - request a password reset email.
- `/reset-password` - complete password reset using an email token.
- `/billing/setup` and `/billing/upgrade` - subscription setup or upgrade.
- `/checkout` and `/checkout/paypal` - Paynow or cash-code checkout.

Main authenticated routes:

- `/choose-dashboard` - role picker for users with more than one role.
- `/admin-dashboard/*` - admin, principal, and PREA workspace.
- `/agent-dashboard/*` - rental agent workspace.
- `/owner-dashboard/*` - property owner portal.
- `/accountant-dashboard/*` - accounting and finance workspace.
- `/sales-dashboard/*` - sales CRM workspace.
- `/system-admin/*` - platform administration workspace.
- `/settings`, `/leases`, `/admin/users`, `/admin/maintenance`, and `/admin/payments` - shared or admin-specific protected pages.

## Start-to-Finish Customer Workflow

### 1. Visitor Reviews the Product

The workflow begins on the landing page at `/`.

The visitor can:

- Review modules such as accounting, payments, leasing, maintenance, integrations, sales CRM, reporting, and dashboards.
- Compare plans: Individual, SME, and Enterprise.
- Choose a billing cycle.
- Start signup or proceed to login if they already have an account.

Evaluation focus:

- The landing page clearly explains the product modules.
- Pricing and feature sections guide users toward signup.
- Public pages do not require authentication.

### 2. New Customer Creates an Account

A new customer starts at `/signup` or `/admin-signup`.

The signup flow collects:

- Full name.
- Email address.
- Password and confirmation.
- Selected plan: `INDIVIDUAL`, `SME`, or `ENTERPRISE`.
- Optional company/workspace details when SaaS onboarding v2 is enabled.

When SaaS onboarding v2 is enabled, signup calls the onboarding API and creates a payment session. The user is then sent to `/checkout/paypal` with the selected plan, billing cycle, and payment session ID.

When SaaS onboarding v2 is not enabled, signup creates the user account first, then sends the user to checkout for subscription activation.

Evaluation focus:

- Required fields validate before submission.
- Plan selection carries through to checkout.
- Signup creates an admin user/workspace path, not a dead-end account.
- Duplicate or repeated onboarding submissions should be handled idempotently by the onboarding API.

### 3. Customer Completes Subscription Checkout

Checkout happens at `/checkout/paypal`.

The page displays:

- Selected plan.
- Billing cycle.
- Total amount.
- Payment method options.

Payment options:

- Paynow checkout: sends the user to Paynow for card or wallet payment.
- Cash code: accepts an offline cash code and PIN issued by a system administrator.

After successful cash-code redemption, the user is redirected to `/admin-dashboard`. For Paynow, the user is redirected externally to complete payment and the backend handles payment status through billing/payment routes and webhooks.

Evaluation focus:

- Checkout amount matches selected plan and billing cycle.
- Paynow redirect is generated successfully.
- Cash-code redemption activates the subscription and returns the user to the app.
- Payment failures show a clear error.

### 4. Admin Completes Workspace Setup

Admins without a company are routed to `/admin/company-setup`.

Company setup collects:

- Company name.
- Email.
- Phone.
- Website.
- Address.
- Registration number.
- TIN number.
- Optional VAT number.

After company creation, the app refreshes company and user context, then redirects to `/admin-dashboard`.

If a company exists but onboarding is not complete, the admin is routed to `/workspace-setup`.

Workspace setup has five steps:

1. Company basics.
2. Preferences such as currency, timezone, measurement units, and invoice prefix.
3. Portfolio prompt.
4. Team prompt.
5. Workspace initialization.

On completion, the company is marked active and onboarding is marked complete.

Evaluation focus:

- Admin users cannot bypass required company setup.
- Workspace setup persists progress for company basics and preferences.
- Final setup activates the workspace and opens the admin dashboard.

### 5. User Logs In

Existing users sign in at `/login`.

The app posts credentials to the auth API. On success:

- The access token is stored in memory.
- The authenticated user is stored for app services.
- Company data is loaded when available.
- A single-role user is routed directly to that role's dashboard.
- A multi-role user is routed to `/choose-dashboard`.
- If the login came from a protected deep link, the app honors the `next` path when the user has permission for that path.

If login fails because the backend is temporarily unavailable, the app shows a friendly warm-up message and retries once.

Evaluation focus:

- Invalid credentials show an error.
- Deep links preserve the intended destination after login.
- Multi-role accounts must explicitly choose a dashboard.
- Unauthorized role access redirects to the dashboard chooser or an appropriate fallback.

## Role-Based Workflows

### Admin Workflow

Route: `/admin-dashboard/*`

Allowed roles:

- `admin`
- `principal`
- `prea`

The admin dashboard is the main operational workspace for a property management company. It provides portfolio oversight, property operations, tenant and lease management, payments, owners, reports, files, communications, settings, approvals, and data sync.

Primary admin routes:

- `/admin-dashboard` - overview with portfolio KPIs and operational summaries.
- `/admin-dashboard/properties` - create, view, update, and filter properties.
- `/admin-dashboard/property-owners` - manage property owners.
- `/admin-dashboard/tenants` - manage tenants.
- `/admin-dashboard/leases` - manage leases.
- `/admin-dashboard/levies` - track levy and municipal payments.
- `/admin-dashboard/communications` - messaging and communication workflows.
- `/admin-dashboard/files` - upload and manage files.
- `/admin-dashboard/reports` - operational and financial reports.
- `/admin-dashboard/approvals` - review pending approvals.
- `/admin-dashboard/sync` - database synchronization tools.
- `/admin-dashboard/settings` - admin settings.
- `/admin-dashboard/agents/:agentId` - view individual agent details.

Expected admin workflow:

1. Review dashboard KPIs.
2. Add property owners.
3. Add properties and assign relevant ownership or agent details.
4. Add tenants.
5. Create leases for occupied properties.
6. Record or review rent, levy, and municipal payments.
7. Manage maintenance, files, communications, approvals, and reports.
8. Invite or manage users when needed.

Evaluation focus:

- Admin users can run the full property management lifecycle.
- Company data remains isolated to the current workspace.
- Dashboard totals update from properties, leases, tenants, and payments.

### Agent Workflow

Route: `/agent-dashboard/*`

Allowed role:

- `agent`

The agent dashboard gives agents a focused view of the properties, tenants, leases, commissions, inspections, files, schedules, and tasks assigned to them.

Primary agent routes:

- `/agent-dashboard` - overview with assigned property, tenant, lease, and commission metrics.
- `/agent-dashboard/properties` - manage assigned properties.
- `/agent-dashboard/properties/:propertyId` - inspect one property.
- `/agent-dashboard/tenants` - manage tenants linked to the agent's portfolio.
- `/agent-dashboard/leases` - manage leases.
- `/agent-dashboard/property-owners` - view or manage owners related to assigned properties.
- `/agent-dashboard/levies` - view and manage levies.
- `/agent-dashboard/files` - manage files.
- `/agent-dashboard/inspections` - inspection workflow.
- `/agent-dashboard/tasks` - agent leads or task workflow.
- `/agent-dashboard/schedule` - schedule management.
- `/agent-dashboard/settings` - agent settings.

Expected agent workflow:

1. Review assigned portfolio and active work.
2. Open assigned properties and inspect property details.
3. Track tenants and leases.
4. Record or follow up on payments and levies.
5. Manage inspections, tasks, files, and schedules.
6. Monitor commission-related data where available.

Evaluation focus:

- Agents see only role-appropriate operational pages.
- Assigned property, tenant, lease, and commission information loads correctly.
- Agent-specific workflows do not expose admin-only controls.

### Owner Workflow

Route: `/owner-dashboard/*`

Allowed role:

- `owner`

The owner dashboard is a portal for property owners to monitor their properties, financial performance, maintenance, and reports.

Primary owner route:

- `/owner-dashboard` - owner overview and portal tabs.
- `/owner-dashboard/property/:propertyId` - owner-facing property details.

Expected owner workflow:

1. Review owned property portfolio.
2. Check occupancy, rent collection, arrears, and financial summaries.
3. Open property-level detail pages.
4. Review maintenance requests.
5. Approve or reject maintenance where owner approval is required.
6. Review charts, reports, and property performance.

Evaluation focus:

- Owners only see their own property data.
- Financial summaries and maintenance statuses are clear.
- Owner maintenance approval and rejection actions update the request status.

### Accountant Workflow

Route: `/accountant-dashboard/*`

Allowed roles:

- `admin`
- `accountant`
- `principal`
- `prea`

The accountant dashboard centralizes payments, revenue, ledgers, property accounts, agent accounts, commissions, tax, invoices, levies, reports, trust-account reports, tasks, and data sync.

Primary accountant routes:

- `/accountant-dashboard` - financial overview.
- `/accountant-dashboard/payments` - rental and general payments.
- `/accountant-dashboard/sales` - sales payments.
- `/accountant-dashboard/revenue` - revenue reporting.
- `/accountant-dashboard/ledger` - ledger drilldown.
- `/accountant-dashboard/property-accounts` - property account list.
- `/accountant-dashboard/property-accounts/:propertyId` - property account detail.
- `/accountant-dashboard/property-accounts/:propertyId/deposits` - property deposit ledger.
- `/accountant-dashboard/agent-accounts` - agent accounts.
- `/accountant-dashboard/agent-accounts/:agentId` - agent account detail.
- `/accountant-dashboard/commissions` - commission tracking.
- `/accountant-dashboard/tax` - tax accounts.
- `/accountant-dashboard/written-invoices` - written invoices.
- `/accountant-dashboard/settings` - accountant settings.
- `/accountant-dashboard/levies` - levy payments.
- `/accountant-dashboard/reports` - financial reports.
- `/accountant-dashboard/trust-account-reports` - trust account reports.
- `/accountant-dashboard/trust-account-reports/:propertyId` - property-level trust report.
- `/accountant-dashboard/tasks` - accounting tasks.
- `/accountant-dashboard/data-sync` - admin-only database sync inside accountant tools.

Expected accountant workflow:

1. Review financial overview.
2. Inspect payments and revenue.
3. Drill into ledgers and property accounts.
4. Track deposits, owner payouts, expenses, commissions, levies, and tax.
5. Produce reports and trust-account reports.
6. Resolve accounting tasks and sync data when authorized.

Evaluation focus:

- Payment activity flows into property accounts and ledgers.
- Property account balances reflect income, expenses, repairs, maintenance, and owner payouts.
- Trust-account reports and exports are suitable for audit review.

### Sales Workflow

Route: `/sales-dashboard/*`

Allowed role:

- `sales`

The sales dashboard is a CRM for property sales workflows, including leads, viewings, buyers, owners, listings, deals, valuations, developments, files, notifications, and sales settings.

Primary sales routes:

- `/sales-dashboard` - sales overview.
- `/sales-dashboard/leads` - lead management.
- `/sales-dashboard/viewings` - property viewing management.
- `/sales-dashboard/buyers` - buyer records.
- `/sales-dashboard/owners` - sales owner records.
- `/sales-dashboard/properties` - sales listings.
- `/sales-dashboard/deals` - deal pipeline.
- `/sales-dashboard/valuations` - valuation workflow.
- `/sales-dashboard/developments` - development projects.
- `/sales-dashboard/files` and `/sales-dashboard/files/:propertyId` - sales document management.
- `/sales-dashboard/notifications` - sales notifications.
- `/sales-dashboard/settings` - sales settings.

Expected sales workflow:

1. Capture or import leads.
2. Qualify buyers and owners.
3. Add or update sales listings.
4. Schedule viewings.
5. Move deals through the pipeline.
6. Store sales documents such as mandates, KYC forms, title deeds, offers, and agreements of sale.
7. Track valuations and developments.

Evaluation focus:

- Leads, buyers, owners, listings, viewings, and deals form a coherent CRM flow.
- Sales files attach to the correct property.
- Sales role remains separate from rental/admin workflows.

### System Admin Workflow

Route: `/system-admin/*`

Allowed role:

- `system_admin`

System admins manage the platform rather than a single property company.

Primary system-admin routes:

- `/system-admin` - platform dashboard.
- `/system-admin/status` - platform health/status.
- `/system-admin/backups-maintenance` - backup and maintenance tools.
- `/system-admin/users` - platform user management.
- `/system-admin/subscriptions` - subscription management.
- `/system-admin/cash-subscriptions` - cash-code subscription workflows.

Expected system-admin workflow:

1. Review platform health.
2. Manage users and subscriptions.
3. Issue or administer cash subscription codes.
4. Monitor backup and maintenance operations.

Evaluation focus:

- System-admin pages are not accessible to tenant users.
- Subscription management supports online and offline payment workflows.
- Platform-level actions are clearly separated from company-level admin actions.

## Cross-Cutting Workflows

### Authentication and Authorization

Protected routes check:

- Whether authentication is still loading.
- Whether the user is authenticated.
- Whether the user has one of the required roles.
- Whether admin users have completed company and workspace setup.

Unauthenticated users are redirected to `/login` with a `next` parameter. Unauthorized authenticated users are sent to `/choose-dashboard` when they have another valid role.

### Password Reset

Password reset starts at `/forgot-password` and completes at `/reset-password`.

Expected flow:

1. User enters an email address.
2. Backend returns a generic success response to avoid account enumeration.
3. User receives a reset link containing a token and email.
4. User sets a new password.
5. Token is invalidated after successful reset or expiry.

### Data and API Flow

The client uses API services in `client/src/api` and role-specific service modules. The backend exposes Express routes under `/api`.

Important backend API areas:

- `/api/auth` - login, signup, refresh, logout, password reset, impersonation.
- `/api/onboarding` - SaaS onboarding sessions.
- `/api/companies` - company and workspace data.
- `/api/properties` - property records.
- `/api/property-owners` and `/api/sales-owners` - owner records.
- `/api/tenants` - tenants.
- `/api/leases` - leases.
- `/api/payments` and `/api/payment-requests` - payments and payment requests.
- `/api/maintenance` - maintenance requests and maintenance operations.
- `/api/files` and `/api/sales-files` - document management.
- `/api/accountants`, `/api/accounting`, and `/api/trust-accounts` - accounting, ledgers, and trust accounting.
- `/api/leads`, `/api/viewings`, `/api/buyers`, `/api/deals`, `/api/valuations`, `/api/developments` - sales CRM.
- `/api/billing`, `/api/subscription`, `/api/paynow`, and `/api/webhooks` - subscription and payment processing.
- `/api/system-admin` - platform administration.
- `/api/reports` and `/api/public/reports` - reports.
- `/api/health` - health and readiness checks.

### Logout and Session End

Logout calls the auth logout endpoint, clears local user/session data, resets impersonation state if present, broadcasts a logout event to other tabs, and redirects to `/login`.

## Evaluation Scenarios

Use these scenarios to validate the complete app workflow.

### Scenario 1: New Workspace Onboarding

1. Open `/`.
2. Choose a plan and start signup.
3. Complete `/signup`.
4. Complete checkout using Paynow or a cash code.
5. Complete company setup or workspace setup.
6. Land on `/admin-dashboard`.
7. Add property owner, property, tenant, lease, and payment records.
8. Confirm dashboard KPIs and reports update.

Expected result: A new customer can move from public landing page to active admin workspace without manual database setup.

### Scenario 2: Existing Admin Operations

1. Log in as an admin.
2. Open `/admin-dashboard`.
3. Add or review properties, owners, tenants, leases, payments, files, reports, and approvals.
4. Visit settings and verify company-specific configuration.

Expected result: The admin can manage the full rental property lifecycle inside one tenant workspace.

### Scenario 3: Agent Daily Workflow

1. Log in as an agent.
2. Open `/agent-dashboard`.
3. Review assigned properties, tenants, leases, inspections, tasks, schedules, files, and commissions.

Expected result: The agent can complete operational work without admin-only access.

### Scenario 4: Owner Portal Review

1. Log in as an owner.
2. Open `/owner-dashboard`.
3. Review owned properties, financial summaries, charts, maintenance requests, and property details.
4. Approve or reject a maintenance request if one is pending owner approval.

Expected result: Owners can monitor their portfolio and participate in approval workflows.

### Scenario 5: Accountant Review

1. Log in as an accountant.
2. Open `/accountant-dashboard`.
3. Review payments, revenue, ledger, property accounts, commissions, taxes, levies, invoices, reports, and trust-account reports.

Expected result: Financial activity is traceable from payment records through ledgers and reports.

### Scenario 6: Sales CRM Flow

1. Log in as a sales user.
2. Open `/sales-dashboard`.
3. Create or review leads, buyers, owners, properties, viewings, deals, valuations, developments, and files.

Expected result: Sales users can move prospects and listings through a complete CRM pipeline.

### Scenario 7: Platform Administration

1. Log in as a system admin.
2. Open `/system-admin`.
3. Review platform status, users, subscriptions, cash subscriptions, and maintenance tools.

Expected result: Platform operations are available only to system administrators.

## Success Criteria

The application is evaluation-ready when:

- Public pages load without requiring authentication.
- Signup, checkout, company setup, and workspace setup lead to an active admin dashboard.
- Login routes each role to the correct workspace.
- Multi-role users are sent to the dashboard chooser.
- Protected routes block unauthenticated and unauthorized users.
- Admin users can complete the property-owner-property-tenant-lease-payment lifecycle.
- Agent, owner, accountant, sales, and system-admin roles expose only appropriate workflows.
- Financial and reporting pages reflect payment, lease, account, and trust-account data accurately.
- Errors from login, checkout, setup, and API failures are visible and understandable to users.
