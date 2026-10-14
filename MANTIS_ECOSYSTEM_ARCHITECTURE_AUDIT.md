# MANTIS ECOSYSTEM — ARCHITECTURE AUDIT

**Date:** 18 September 2026  
**Status:** COMPLETE — additive overlay design. No large-scale rewrite.  
**Principle:** Extend, adapt, integrate, isolate, feature-flag, test. Do not rewrite, replace, migrate, or delete core PMS behaviour.

---

## 1. Current architecture

Mantis is a production property-management SaaS with two packages:

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, MUI, React Router 6, Axios (cookie JWT), CRA |
| Backend | Express, TypeScript, Mongoose/MongoDB, JWT cookies, Socket.IO |
| Storage | File records + Azure/S3-style uploads (`@aws-sdk/client-s3`, multer) |
| Email | `emailService.ts` via nodemailer/SMTP; graceful console fallback |
| Online payments (SaaS billing) | Paynow + PayPal for **subscriptions**, not tenant rent |
| Accounting | Canonical write path: `Payment` → `postPaymentAccounting()` |

Entry points:

- Backend: `server/src/index.ts` (HTTP) and `server/src/worker.ts` (jobs)
- Frontend: `client/src/App.tsx` (all role dashboards)
- Role dashboards: Admin, Individual landlord, Agent, Owner, Accountant, Sales, System Admin

Multi-tenancy is **company-scoped**. Almost every operational record carries `companyId`. JWT may include `role`, `roles[]`, and `companyId`. Users can hold multiple roles.

---

## 2. Existing entities (canonical sources of truth)

Do **not** create parallel copies of these.

| Entity | Model | Canonical for | Notes |
|---|---|---|---|
| User | `User.ts` | Login identity, RBAC | Roles: `admin`, `agent`, `accountant`, `owner`, `sales`, `principal`, `prea`, `system_admin`. **No tenant or contractor role today.** |
| Company | `Company.ts` | Agency / individual workspace | Plan + `featureFlags` (commission, accounts, trust, `maintenanceApprovals`, etc.) |
| Property | `Property.ts` | Property master | `status` includes `available`; `propertyOperationalStatus`; `propertyUse`; images/amenities/rent. **No public-listing flag.** |
| PropertyOwner | `PropertyOwner.ts` | Landlord party + owner login | Separate collection with its own password/tokens. Also linked from `User` role `owner`. |
| Tenant | `Tenant.ts` | Occupant record | Agency-managed. Email unique per company. **Not a login user.** Fields: name, email, phone, idNumber, emergencyContact, status. |
| Lease | `Lease.ts` | Tenancy contract + billing summary | Documents, deposit settlement, financial summary. |
| Payment | `Payment.ts` | Rent/sale/introduction money | Immutable once completed. Methods: `cash`, `bank_transfer`, `credit_card`, `mobile_money`. |
| PropertyAccount / AgentAccount / Trust* / Tax* | various | Financial ledgers | **Do not write from ecosystem modules except via `postPaymentAccounting`.** |
| MaintenanceRequest | `MaintenanceRequest.ts` | Maintenance ticket | Status machine in `utils/maintenanceStatus.ts`. |
| MaintenanceQuote | `MaintenanceQuote.ts` | Simple quote | amount, description, file. **No versioning, line items, or owner-approval states.** |
| MaintenanceContractor | `MaintenanceContractor.ts` | Vendor contact | Agency-managed. rating 0–5. **No login, skills list, or verification workflow.** |
| MaintenanceWorkOrder | `MaintenanceWorkOrder.ts` | Job assignment | Assigned / In Progress / Completed / Cancelled. |
| MaintenanceJob | `MaintenanceJob.ts` | **Background job queue** | NOT a contractor job. Name collision — do not reuse. |
| Inspection | `Inspection.ts` | Move-in/routine/move-out/follow-up | Checklist, photos, tenant/agent signatures. Types include `move_in`, `routine`, `move_out`, `emergency`. **No `maintenance` type yet.** |
| Viewing | `Viewing.ts` | **Sales** viewings | Links `buyerId` / `leadId`. Not tenant rental viewings. |
| Notification | `Notification.ts` | In-app + email side-effect | post-save sends email via `sendMail`. No SMS/WhatsApp, no delivery log. |
| File | `File.ts` | Property files | Requires `propertyId`. |
| OwnerDocument | `OwnerDocument.ts` | Owner KYC docs | Owner-scoped. |
| AuditLog | `AuditLog.ts` | Immutable audit | `recordAuditEvent()`. |
| Invoice | `Invoice.ts` | Fiscal invoices | Accounting DB connection. |
| PaymentSession | `PaymentSession.ts` | SaaS Paynow sessions | Plan billing only. |
| PaymentRequest | `PaymentRequest.ts` | Owner/agency disbursement requests | Maintenance funding / pay-outs, not tenant rent. |
| Plan | `Plan.ts` / `types/plan.ts` | SaaS feature matrix | Includes unused `whatsappIntegration` on Plan model. |

### Duplicate / legacy watch-outs

- `MaintenanceJob` = worker queue. Contractor work must be a **new** entity (`ContractorJobRecord`) or reuse `MaintenanceWorkOrder`.
- `Viewing` = sales pipeline. Tenant rental viewings must be a **new** `ViewingRequest`.
- Two maintenance routers mount on `/api/maintenance`: `maintenanceRequestRoutes` and `maintenanceRoutes`.
- Tenant “public” APIs now require company auth (PII).
- Receipts exist (`GET /api/payments/:id/receipt`) but require `canManagePayments` — tenants cannot use them today.

---

## 3. Existing flows (must keep working)

### Authentication

- `POST /api/auth/login|signup|logout|me|forgot-password|reset-password`
- Signup **always** creates `admin` + company. Do not change this.
- JWT cookies (`accessToken`, `refreshToken`). `AuthService` issues tokens for any `User`.
- Owner property routes also use `propertyOwnerAuth` against `PropertyOwner`.

### Property / tenant / lease (agency)

Admin and agent dashboards CRUD properties, tenants, leases. Individual landlord workspace (`/individual-dashboard`) is a separate UI on the same models.

### Payments / accounting (authoritative)

1. Agent/accountant creates `Payment` via `paymentController.createPayment`.
2. `postPaymentAccounting(paymentId)` posts owner income, commission, journal, trust, tax metadata.
3. Completed payments are financially immutable (`paymentFinancialImmutability`).
4. Receipt HTML/PDF generated from the Payment record.

**Ecosystem rule:** never create a second ledger. Online tenant payments, once verified, must create a canonical `Payment` and call `postPaymentAccounting`. Quotes and owner approvals are **not** payments.

### Maintenance (current)

Statuses: `draft → awaiting_approval → approved → awaiting_payment → funded → assigned → in_progress → completed → verified → closed` (plus legacy aliases).

Owner approval already exists (`approveOwnerMaintenanceRequest`, company flag `maintenanceApprovals`). Quotes can be uploaded; a contractor can be assigned; a work order can be created.

This is **not** the multi-contractor competitive quote → owner decision → agent authorise workflow. Historical requests must keep this behaviour. New workflow is overlay + feature flag.

### Inspections

Full compliance centre (agent/admin). Move-in/out snapshots already exist. Extend type enum additively if a `maintenance` inspection is needed.

### Notifications

In-app `Notification` documents. Email fired in model post-save. No channel preferences, no delivery tracking, no SMS/WhatsApp providers. Plan model has `whatsappIntegration` boolean only.

### Communications

Admin `/admin-dashboard/communications` is internal chat (tenants/owners/contractors as contacts), not a portal or broadcast engine.

---

## 4. Existing APIs (selected)

Mounted in `server/src/index.ts` (and mirrored under `/api/s/:sessionId`):

```
/api/auth                /api/properties          /api/tenants
/api/leases              /api/payments            /api/owners
/api/property-owners     /api/maintenance         /api/inspections
/api/viewings            /api/notifications       /api/files
/api/invoices            /api/accounting          /api/trust-accounts
/api/paynow              /api/payment-requests    /api/agency-operations
```

New ecosystem resources will live under `/api/ecosystem/*` (and thin aliases where the prompt suggested `/api/listings`, etc.) so existing routers are untouched.

---

## 5. Existing frontend routes

| Path | Roles | Notes |
|---|---|---|
| `/` `/login` `/signup` | public | Agency signup, not tenant signup |
| `/admin-dashboard/*` | admin, principal, prea | Agency ops including vacancies, viewings, maintenance, communications |
| `/individual-dashboard/*` | admin (individual plan) | Landlord workspace |
| `/agent-dashboard/*` | agent | Properties, tenants, leases, maintenance, vendors, inspections |
| `/owner-dashboard/*` | owner | Properties, income, maintenance approve/reject |
| `/accountant-dashboard/*` | accountant, admin | Canonical finance UI — **do not duplicate** |
| `/sales-dashboard/*` | sales | Leads, **sales** viewings, buyers |
| `/system-admin/*` | system_admin | Platform |

**Missing:** `/tenant-dashboard`, `/contractor-dashboard`. Owner dashboard has no quote-comparison routes. Agent dashboard has vendors but no quote-selection / viewing-request / rental-application queues.

Visual language: Mantis green `#084734` (`IndividualDashboard/theme.ts`). App shell theme is still MUI blue; new portals should use the green brand.

---

## 6. Existing authentication / RBAC model

```
User.role + User.roles[]
authorize(allowedRoles) / hasAnyRole()
ProtectedRoute requiredRoles
getDashboardPath(role)
```

Current roles do **not** include `tenant` or `contractor`. Adding them is backward-compatible if:

- Existing signup still creates `admin` only
- Existing `authorize([...])` lists are unchanged
- New roles only appear on new users
- `requireActiveSubscription` is **not** applied to tenant/contractor portal routes (tenants may have no `companyId`; contractors use the inviting company without being billed as a company)

Owner access is dual: `User` role `owner` **and** `PropertyOwner` collection. Quote approval must resolve the owner against properties they own, not “any owner role”.

---

## 7. Existing notification capabilities

| Channel | Status |
|---|---|
| In-app | Yes — `Notification` model + `/api/notifications` |
| Email | Yes — SMTP, skippable, fails open |
| SMS | No provider. OwnerPreferences has `smsNotifications` boolean only |
| WhatsApp | Plan flag only; no API |

Centralisation is required: do not add more `sendMail` calls in controllers. New `NotificationService` will write in-app records (reusing `Notification`) and fan out to provider interfaces.

---

## 8. Existing maintenance flow (protected)

```
Agent/owner/admin creates request
  → optional owner approval (featureFlags.maintenanceApprovals)
  → optional quotation upload
  → assign contractor (MaintenanceContractor contact)
  → work order
  → complete / verify / close
  → optional payment request for funding
```

**Must remain.** New requests may enter the quote marketplace workflow only when `MAINTENANCE_QUOTES_ENABLED` is on **and** the request is created through the tenant/agent ecosystem path. Legacy records without quote/approval/job documents must still render.

Default for the new workflow: **owner approval required = true**, unless company already has `maintenanceApprovals: false` (individual plan). Integrate with that flag; do not invent a $100 threshold.

---

## 9. Existing accounting integration points

**Write (do not bypass):**

- `paymentController.createPayment` / `createPaymentAccountant`
- `postPaymentAccounting` in `paymentAccountingOrchestrator.ts`
- Property/agent/trust/tax services called from that orchestrator

**Read (safe for tenant portal):**

- `Payment` by `tenantId`
- `Lease.financialSummary`
- Existing receipt generators (call internally after tenant-ownership check)

**Never:**

- Mutate historical payments, tax snapshots, property accounts
- Post journals because a quote was submitted or approved
- Treat owner approval as payment
- Backfill financial history for new tenant users

---

## 10. Existing payment integration points

| Integration | Purpose | Reuse? |
|---|---|---|
| Manual Payment create | Canonical rent posting | Yes — target of online/cash recording |
| Paynow `/api/paynow` | SaaS subscription | **Do not mix with rent.** New `PaymentProvider` abstraction for tenant rent. |
| PayPal checkout | SaaS | Same — leave alone |
| PaymentSession | Subscription idempotency | Pattern to copy, new collection for rent intents |
| WebhookEventReceipt / EventDedupRecord | Idempotency | Reuse pattern for provider webhooks |

Zimbabwe cash-first: portal must work with `Online Payments = OFF`. Methods already on Payment: cash, bank_transfer, mobile_money. Add `online_payment` / `other` **additively** to the Payment enum only if posting requires it; otherwise map online success onto `mobile_money`/`bank_transfer` via metadata without changing the enum until necessary.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Changing `UserRole` enum breaks exhaustive switches | Add values; keep default branches; do not change existing authorize lists |
| New maintenance statuses break old UI/queries | Overlay statuses on new fields (`ecosystemStatus`); keep `status` compatible; map for display |
| `Viewing` collision | New `ViewingRequest` collection |
| `MaintenanceJob` name collision | New `ContractorJobRecord` collection |
| Tenant login without companyId fails subscription middleware | Ecosystem routes use `auth` + resource scoping, not `requireActiveSubscription` |
| Receipt auth blocks tenants | New tenant-scoped receipt proxy; do not loosen `canManagePayments` |
| Quote edit after owner approval | Immutable approved revision; changes create a new version |
| Duplicate accounting from online pay + webhook retry | Idempotency keys + EventDedup; post Payment only after provider verify |
| Exposing private financials on listings | Public DTO strips owner, commission, tax, accounts |
| Historical maintenance forced through new workflow | Feature flag + only new requests; old records display as-is |
| SMS/WhatsApp without providers | Interfaces + SKIPPED status; never crash |
| File model requires propertyId | New `EcosystemDocument` for application/ID docs; reuse upload pipeline |

---

## 12. Proposed additive architecture

```
                         EXISTING MANTIS PMS
                    (properties, leases, payments,
                     accounting, tax, maintenance)
                              ▲
                              │ read / canonical write
                              │
                    ECOSYSTEM OVERLAY (feature-flagged)
          ┌─────────────┬─────────────┬──────────────────┐
          │ Tenant      │ Contractor  │ Agency/Owner     │
          │ Portal      │ Portal      │ queues           │
          └──────┬──────┴──────┬──────┴────────┬─────────┘
                 │             │               │
        ViewingRequest   ContractorJob   MaintenanceQuote+
        RentalApplication  Ratings        OwnerQuoteDecision
        TenantProfile      ChangeOrder    Broadcasts
                 │
        NotificationService → IN_APP | EMAIL | SMS | WHATSAPP
        PaymentProvider     → verify → Payment + postPaymentAccounting
```

### New collections (only where no equivalent exists)

| Collection | Why new |
|---|---|
| `viewing_requests` | Sales `Viewing` is a different domain |
| `rental_applications` | No application entity |
| `tenant_profiles` | Portal profile + completion %; links `User` ↔ `Tenant` |
| `maintenance_quote_revisions` / extend quote | Versioned quotes, line items, statuses |
| `quote_invitations` | Multi-contractor invite without leaking competitors |
| `owner_quote_decisions` | Immutable owner decision against a quote version |
| `contractor_job_records` | Distinct from worker `MaintenanceJob` |
| `maintenance_change_orders` | Additional cost approval |
| `ecosystem_documents` | Generic docs with ACL |
| `ratings` | Isolated from job records |
| `tenant_references` | Factual post-tenancy records |
| `broadcasts` + `broadcast_deliveries` | Audience fan-out |
| `notification_deliveries` | Per-channel tracking |
| `notification_templates` | Variable templates |
| `communication_preferences` | Channel availability vs marketing |
| `ecosystem_payment_intents` | Online rent; posts into Payment only after verify |
| `ecosystem_settings` | Per-company flags (or Company.featureFlags additive keys) |

### Safe extensions (optional fields, defaults preserve old behaviour)

- `UserRole`: add `tenant`, `contractor`
- `Tenant.userId` (sparse unique)
- `MaintenanceContractor.userId`, skills[], serviceAreas[], verificationStatus
- `Property.publicListingEnabled` default **false**; `listingPublishedAt`; `availableFrom`; `deposit`; `leaseRequirements`; `videos[]`
- `Company.featureFlags` additive keys default **false** except where they only enable new routes
- `MaintenanceQuote`: status, lineItems, version, validUntil, parentQuoteId — all optional
- `MaintenanceRequest.ecosystemWorkflow` optional object; legacy requests omit it
- `Inspection.type`: add `maintenance` to enum
- `Payment.paymentMethod`: add `online_payment`, `other` only if needed for new posts

### Feature flags (company + env)

```
TENANT_PORTAL_ENABLED
CONTRACTOR_PORTAL_ENABLED
PROPERTY_MARKETPLACE_ENABLED
MAINTENANCE_QUOTES_ENABLED
ONLINE_PAYMENTS_ENABLED
MULTICHANNEL_NOTIFICATIONS_ENABLED
TENANT_REFERENCES_ENABLED
CONTRACTOR_RATINGS_ENABLED
OWNER_APPROVAL_REQUIRED_FOR_MAINTENANCE   → maps to existing maintenanceApprovals
```

Env: `EMAIL_ENABLED`, `SMS_ENABLED`, `WHATSAPP_ENABLED`, `EMAIL_PROVIDER`, `SMS_PROVIDER`, `WHATSAPP_PROVIDER`. Missing provider ⇒ channel SKIPPED.

### RBAC overlay

| Actor | Scope |
|---|---|
| Tenant | Own profile, applications, viewings, leases, payments, maintenance they reported, broadcasts to them |
| Contractor | Own profile, invitations, own quotes, authorised jobs |
| Owner | Own properties’ quotes/maintenance; cannot see other owners |
| Agent/Admin | Company portfolio only |
| Accountant | Unchanged accounting permissions |

Backend enforces all transitions. Frontend buttons are not sufficient.

---

## 13. Files that will be changed (existing — minimal)

### Backend (additive only)

- `server/src/types/auth.ts` — add roles
- `server/src/models/User.ts` — enum values
- `server/src/models/Company.ts` — optional featureFlags keys
- `server/src/types/plan.ts` — new flags default false
- `server/src/models/Tenant.ts` — optional `userId` + portal fields
- `server/src/models/Property.ts` — listing fields default off
- `server/src/models/MaintenanceContractor.ts` — portal fields
- `server/src/models/MaintenanceQuote.ts` — optional workflow fields
- `server/src/models/MaintenanceRequest.ts` — optional ecosystemWorkflow
- `server/src/models/Inspection.ts` — add type `maintenance` if missing
- `server/src/models/Payment.ts` — optional method values if posting requires them
- `server/src/index.ts` — mount `/api/ecosystem`
- `server/package.json` — test script for ecosystem

**Will not change:** `paymentAccountingOrchestrator.ts`, tax engines, propertyAccountService write paths, existing maintenance status machine semantics, auth signup (admin-only).

### Frontend

- `client/src/types/auth.ts` — roles
- `client/src/utils/registrationUtils.ts` — dashboard paths
- `client/src/App.tsx` — tenant/contractor routes
- `client/src/pages/AgentDashboard.tsx` — additive routes/nav
- `client/src/components/Layout/AgentSidebar.tsx` — nav items
- `client/src/pages/AdminDashboard.tsx` — additive queues
- `client/src/components/owner/OwnerDashboard.tsx` — quote approval routes
- `client/src/components/Layout/AccountantSidebar.tsx` — **no finance rewrite**; optional maintenance visibility only if already present

### Docs created

- `MANTIS_ECOSYSTEM_ARCHITECTURE_AUDIT.md` (this file)
- `MANTIS_ECOSYSTEM_IMPLEMENTATION.md`
- `MANTIS_ECOSYSTEM_FINAL_REVIEW.md`

---

## 14. Files that will be created

### Backend module `server/src/ecosystem/`

Isolated overlay. Existing controllers are not rewritten.

```
constants.ts
flags.ts
middleware.ts
models/*          (new collections listed above)
services/notificationService.ts
services/providers/{email,sms,whatsapp,payment}.ts
services/tenantPortalService.ts
services/listingService.ts
services/viewingService.ts
services/applicationService.ts
services/leasePortalService.ts
services/tenantPaymentService.ts   (READ + intent; posts via orchestrator)
services/maintenanceWorkflowService.ts
services/quoteService.ts
services/contractorService.ts
services/inspectionPortalService.ts
services/ratingService.ts
services/referenceService.ts
services/broadcastService.ts
controllers + routes
scripts/runEcosystemTests.ts
```

### Frontend

```
client/src/pages/TenantDashboard/**
client/src/pages/ContractorDashboard/**
client/src/pages/ecosystem/**          (agent/owner/admin overlay pages)
client/src/services/ecosystemService.ts
```

---

## 15. Implementation order (locked)

1. Audit (this document)  
2. Flags, RBAC, new models  
3. Tenant portal foundation + registration  
4. Listings  
5. Viewing requests  
6. Applications  
7. Lease/documents (read existing Lease/File)  
8. Payments/receipts (read canonical Payment)  
9. Tenant maintenance report  
10–15. Quote workflow, owner approval, contractor portal, jobs, completion/change-orders  
16–18. Inspections (extend existing), ratings, references  
19–23. Broadcasts + NotificationService + providers  
24. PaymentProvider abstraction  
25. Dashboards  
26. Regression  

---

## 16. Audit conclusion

The PMS already contains the operational core (properties, tenants, leases, payments, accounting, tax, maintenance, inspections, sales viewings, in-app notifications). What is missing is **self-serve tenant/contractor identity**, a **public listing marketplace**, **rental applications**, a **competitive quote + owner-authorise workflow**, **multi-channel delivery**, and **portals**.

Those gaps can be filled as an overlay that **reads** canonical records and **writes** financial events only through `postPaymentAccounting`. Existing dashboards, payment posting, tax snapshots, and maintenance history stay in place.
