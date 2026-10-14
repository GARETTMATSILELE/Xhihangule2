# MANTIS ECOSYSTEM IMPLEMENTATION

Additive overlay around the existing Mantis PMS. Canonical finance, leases, properties, and legacy maintenance are unchanged.

## Architecture

New code lives in `server/src/ecosystem/` and `client/src/pages/TenantDashboard`, `ContractorDashboard`, `ecosystem/`. Existing dashboards gained extra routes only.

```
Tenant / Contractor / Owner / Agent UI
        ↓
/api/ecosystem  (RBAC + state machines)
        ↓
Existing models: User, Tenant, Property, Lease, Payment, MaintenanceRequest,
MaintenanceQuote, MaintenanceContractor, Inspection, Notification, AuditLog
        ↓
postPaymentAccounting  ← not called by quotes or owner approval
```

## Feature flags

Company `featureFlags` (default **false**):

- tenantPortalEnabled
- contractorPortalEnabled
- propertyMarketplaceEnabled
- maintenanceQuotesEnabled
- onlinePaymentsEnabled
- multichannelNotificationsEnabled
- tenantReferencesEnabled
- contractorRatingsEnabled

Env overrides: `TENANT_PORTAL_ENABLED`, `MAINTENANCE_QUOTES_ENABLED`, `ONLINE_PAYMENTS_ENABLED`, `ECOSYSTEM_ENABLED`, `EMAIL_ENABLED`, `SMS_ENABLED`, `WHATSAPP_ENABLED`, plus `EMAIL_PROVIDER` / `SMS_PROVIDER` / `WHATSAPP_PROVIDER`.

Owner approval for the new quote workflow uses existing `featureFlags.maintenanceApprovals` (default required). No dollar threshold was introduced.

## New entities

ViewingRequest, RentalApplication, TenantProfile, QuoteInvitation, OwnerQuoteDecision, ContractorJobRecord, MaintenanceChangeOrder, EcosystemDocument, Rating, TenantReference, Broadcast, BroadcastDelivery, NotificationDelivery, CommunicationPreference, EcosystemPaymentIntent.

Extended (optional fields only): User roles, Tenant.userId, Property listing fields, MaintenanceQuote versioning, MaintenanceRequest.ecosystemWorkflow, MaintenanceContractor portal fields, Inspection type `maintenance`, Payment methods `online_payment` / `other`.

## API

Base: `/api/ecosystem`

Public: `POST /auth/register`, `GET /listings`, `GET /listings/:id`

Tenant: `/me/*`, viewings, applications, maintenance, receipts, broadcasts, online payment initialize/verify

Agency: `/agency/viewings|applications|maintenance|quotes|broadcasts|contractors|settings`

Owner: `/owner/maintenance`, `/owner/maintenance/:id/decision`

Contractor: `/contractor/*`

## Frontend routes

- `/tenant-register`, `/tenant-dashboard/*`
- `/contractor-register`, `/contractor-dashboard/*`
- `/agent-dashboard/quotes|viewings|applications|broadcasts`
- `/owner-dashboard/maintenance|quotes`
- `/admin-dashboard/rental-applications|quote-workflow|broadcasts`

Existing `/admin-dashboard/viewings` remains the **sales** viewing board.

## Maintenance workflow

New requests with `maintenanceQuotesEnabled` set `ecosystemWorkflow.enabled=true`. Legacy requests omit that object and keep the old status machine.

Work cannot enter AUTHORISED / SCHEDULED / WORK_IN_PROGRESS unless owner approved (when required) **and** the agent authorised. Owner-approved quotes cannot be edited in place; contractors submit a new version.

Additional costs create a change order; they are never auto-approved.

Quotes and owner approval do **not** create accounting entries.

## Notifications

`NotificationService.notifyEvent` fans out IN_APP / EMAIL / SMS / WhatsApp. Missing providers are SKIPPED. Channel failure does not fail the request. Idempotency keys prevent duplicate deliveries.

## Payments

Tenant portal **reads** canonical `Payment` records and existing receipt numbers.

Online payments use `PaymentProvider` (`initializePayment`, `verifyPayment`, `handleWebhook`, `refundPayment`). A verified intent is **not** a posted Payment. Agents record rent through the existing payment screen so commission, allocation, and tax stay on `createPayment` → `postPaymentAccounting`.

Cash, bank transfer, and mobile money continue to work with online payments off.

## RBAC

Roles `tenant` and `contractor` added to the existing JWT/user enum. Signup of agencies is still admin-only. Tenants cannot see other tenants’ leases/payments. Contractors cannot see competing quotes.

## Migrations

Additive indexes only. No DROP/DELETE/TRUNCATE. Historical financial records are not backfilled.

## Testing

`cd server && npm run test:ecosystem`

## Known limitations

- SMS and WhatsApp providers are interfaces; they SKIP until env is configured with an official API.
- Online rent does not auto-post a Payment (by design, to protect the canonical write path).
- Tenant users without a linked `Tenant` record can browse/apply/request viewings but will not see lease/payment history until the agency links the occupant record (email match on register when `companyId` is supplied).
