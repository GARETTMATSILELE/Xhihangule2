# MANTIS ECOSYSTEM — PRODUCTION READINESS

Date: 18 September 2026

## Status

**PASS WITH DOCUMENTED RISKS**

Live API isolation, document authorization, maintenance workflow, company-flag-only enablement, and canonical `createPayment` have runtime evidence. A fresh CRA production build after AuthContext/PortalRegister completed EXIT 0. Browser coverage is multi-actor **partial** (register session, dashboards, quotes UI, owner buttons, contractor 403) plus mobile 375/390/430. The system-admin bootstrap is reviewed and still a production-enablement blocker for this codebase.

## Automated Tests

Ecosystem: PASS — `npm run test:ecosystem` — **13/13**
Live API harness: PASS — `src/scripts/runEcosystemLiveE2E.ts` — **73/73**, EXIT 0, **no process-wide ecosystem env overrides**
Server: PASS — `npx tsc --noEmit` EXIT 0
Client lint: PASS — ecosystem eslint **0 errors** (7 warnings)

## Browser E2E

Status: PARTIAL PASS (executed)

- `/tenant-register` does not bounce to `/login`
- Tenant UI register without companyId: 403 under company-flag-only
- Contractor register → `login()` → `/contractor-dashboard` without bounce; refresh kept the session
- Tenant A dashboard / maintenance submit / payments (canonical + seed receipts)
- Agent quotes UI, owner quotes UI (Approve/Decline/Request changes), contractor invitations/quotes/completed jobs
- Start-work before approvals: HTTP 403 from the contractor browser session
- Change-order UI: NOT RUN
- Mobile 375/390/430: PASS (Menu drawer, no horizontal overflow)

## Build

Server: PASS (`tsc --noEmit` EXIT 0)
Client: PASS — `react-scripts build` BUILD_EXIT=0, 2611574 ms (~43.5 min), after AuthContext/PortalRegister. `main.a3656115.js` 181.47 kB gzip. Lazy route chunks present. Cause: CRA + large existing graph + OneDrive, not hung.

Boot: `npm run dev` listens with ecosystem env vars unset. `ECOSYSTEM_ENABLED` is off. Company flags only.

## Security

Status: HARDENED WITH LIVE EVIDENCE
Flags enforced server-side. Listings marketplace-gated. Payment company derived from property. Tenant DTOs strip `agentNotes`. Tenant File access deny-by-default. Direct tax file GET **403**. Owner B cannot approve Owner A quotes. Agent B cannot review Company A maintenance. Company B blocked when its flags are off and env is unset.

System-admin bootstrap: see `MANTIS_SYSTEM_ADMIN_BOOTSTRAP_SECURITY_REVIEW.md`. Still unsafe for production control-plane deploy.

## Authorization

Status: LIVE PASS for API IDOR cases in `runEcosystemLiveE2E.ts`
Work-start before owner+agent approval: HTTP 403 (API and contractor browser session). Owner-approved quote edit: HTTP 409. Original amount remains 100 after +50 change order.

## Financial Integrity

Status: INTACT BY RUNTIME COUNT
Quote workflow: journals **0→0**, payments **1→1**, posted intents **0**. Online initialize **403**. Live `POST /api/payments` **201**, payments **1→2**, journals **0→2**, tenant receipt 200, no ecosystem intent. Detection-only integrity later flagged missing `ownerIncome` on that thinly seeded E2E payment — no automatic repair.

## Notifications

Status: IMPLEMENTED WITH STUBS
In-app SENT. SMS/WhatsApp SKIPPED when unset. Forced unconfigured SMS: FAILED without blocking in-app; idempotency kept one in-app SENT.

## Maintenance Workflow

Status: LIVE API PASS / BROWSER PARTIAL
Full API path including decline, REQUEST_CHANGES, reopen from COMPLETED. Browser covered tenant submit, agent quote queue, owner decision buttons, contractor 403. Supervised UI quote cycle still required before enabling `maintenanceQuotesEnabled`.

## Mobile

Status: PASS — 375, 390, 430. Contractor dashboard collapses to Menu. Tenant register and login render. No horizontal overflow measured.

## Existing PMS Regression

Status: PASS for boot + existing agent/owner dashboards. Isolated `@mantis-e2e.test` only. No historical journal rewrite.

## Known Risks

1. Hardcoded system-admin bootstrap still in `server/src/index.ts`
2. Tenant register UI cannot attach to a company (no company ID field)
3. PortalShell has no logout
4. Quote UI does not always refresh after mutations; owner buttons ignore current state
5. No change-order UI; active-jobs omits AUTHORISED/SELECTED jobs
6. SMS/WhatsApp stubs; online payments OFF
7. Thin E2E company COA — canonical post can be “incomplete” under detection-only integrity
8. Local JWT_SECRET was ephemeral on this process

## Recommended Before Production

1. Gate or remove the system-admin bootstrap. Rotate the credential. Do not delete the user blindly.
2. Pilot one internal company with `tenantPortalEnabled` only (no env master override).
3. Keep `maintenanceQuotesEnabled` and `onlinePaymentsEnabled` off until a supervised UI pilot.
4. Leave SMS/WhatsApp skipped until official providers exist.
5. Add a company ID field on tenant register before inviting public self-signup under company flags.

## Safe to Enable

Tenant Portal: company-by-company pilot only, flags on that company, env unset
Contractor Portal: company-by-company pilot only
Public Listings: company-by-company pilot only
Maintenance Quotes: OFF until UI pilot
Online Payments: OFF
Notifications: in-app ready; email depends on SMTP; SMS/WhatsApp SKIPPED

## Explicitly Not Implemented

1. Overlay posting into `createPayment` / journals
2. Official SMS or WhatsApp vendor adapters
3. Automated Playwright/Cypress suite
4. Historical financial backfill or a second ledger
5. Global enablement of ecosystem flags
