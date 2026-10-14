# MANTIS ECOSYSTEM — FINAL REVIEW

**STATUS: PASS WITH DOCUMENTED RISKS**

Date: 18 September 2026

## Implemented

- Architecture audit (`MANTIS_ECOSYSTEM_ARCHITECTURE_AUDIT.md`)
- Isolated overlay module `server/src/ecosystem/`
- Tenant and contractor roles on the existing JWT/User model
- Feature flags on Company (default off)
- Tenant registration, profile completion %, listings, viewing requests, applications
- Tenant lease/payment/receipt **read** of canonical records
- Tenant maintenance reporting with optional quote workflow overlay
- Multi-contractor invitations, quote comparison, owner decision, agent authorisation
- Backend enforcement: no work before owner approval + agent authorisation
- Quote versioning (owner-approved quotes cannot be edited in place)
- Change orders for additional costs
- Contractor portal (profile, invitations, quotes, jobs)
- Inspection type `maintenance` + acknowledgement
- Contractor ratings with duplicate/self-rate guards
- Tenant references after tenancy end
- Broadcasts with delivery records
- Central `NotificationService` with IN_APP / EMAIL / SMS / WhatsApp abstractions
- Online `PaymentProvider` abstraction (stub); verified intents are **not** posted Payments
- Tenant, contractor, agent, owner, and admin overlay UIs
- Ecosystem tests (`npm run test:ecosystem` in `server`)

## Existing functionality verified

- Canonical `postPaymentAccounting` was **not** imported or called by ecosystem payment code
- Existing auth signup remains admin/company only
- Existing `/admin-dashboard/viewings` remains sales viewings
- Existing maintenance status machine remains; new workflow stores `ecosystemWorkflow` and maps to legacy statuses for display
- No DROP/DELETE/TRUNCATE migrations
- No historical payment, tax snapshot, or property-account rewrites

Full `server` `tsc` still reports **pre-existing** tax-service errors outside this work (`individualRentalTaxService`, `individualTaxComplianceService`, `taxAmountAggregation`). Ecosystem sources produced no `src/ecosystem` diagnostics after import fixes.

## Database changes

Additive only:

- Optional fields on User, Company, Tenant, Property, Payment, MaintenanceRequest, MaintenanceQuote, MaintenanceContractor, Inspection
- New collections: viewing_requests, rental_applications, tenant_profiles, quote_invitations, owner_quote_decisions, contractor_job_records, maintenance_change_orders, ecosystem_documents, ecosystem_ratings, tenant_references, broadcasts, broadcast_deliveries, notification_deliveries, communication_preferences, ecosystem_payment_intents

## Financial impact

**None on the write path.**

- Quotes, owner approval, and contractor authorisation do not create journals
- Tenant payment history reads `Payment`
- Online payment intents stop at provider verification; agencies still record rent via existing `createPayment`
- Payment method enum gained `online_payment` and `other` (backward compatible)

## Notification integrations

- In-app: existing `Notification` collection
- Email: existing `emailService` when SMTP is configured
- SMS / WhatsApp: provider interfaces; SKIPPED unless env enables an official provider
- Delivery rows + idempotency keys

## Known limitations

- SMS/WhatsApp are not wired to a live vendor (official API only, when configured)
- Online rent does not auto-post a canonical Payment (intentional financial safety)
- New workflow applies only when `maintenanceQuotesEnabled` (or env) is on **and** the request is created through the tenant ecosystem path
- Historical maintenance records display with the old lifecycle
- Tenant lease/receipts require a linked occupant `Tenant` record
- Public listings require `publicListingEnabled` on the property (default false)
- Browser E2E of dashboards was not run in this pass (no guaranteed running client/server)

## Remaining work

- Official SMS and WhatsApp provider adapters
- Optional agent-confirm step that records a verified online intent through existing `createPayment`
- Threshold-based owner approval (explicitly not implemented)
- Richer mobile photo capture for maintenance
- Enable flags per company in production gradually

## Tests

`cd server && npm run test:ecosystem`

```
PASS  Online payments do not bypass canonical posting
PASS  Ecosystem is mounted additively
PASS  Happy-path state machines
PASS  Authorization guards
PASS  Profile completion is not a quality score
PASS  Listings strip private financials
PASS  Feature flags default off
PASS  Legacy maintenance status mapping preserved
PASS  RBAC extended additively
All 9 checks passed.
```

## Build / typecheck / lint

- Ecosystem TypeScript: no `src/ecosystem` errors
- Full server `tsc`: fails on **pre-existing** tax files not touched by this overlay
- Client lint on new/edited dashboard files: no diagnostics from the IDE linter
- Full client production build not run in this pass (large CRA build)

## Files deleted

None (legacy code left in place).
