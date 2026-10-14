# MANTIS ECOSYSTEM — HARDENING PLAN

**Date:** 18 September 2026  
**Mode:** Verify, fix, harden, document. No redesign of the PMS.

---

## Existing implementation

Additive overlay in `server/src/ecosystem/` plus tenant/contractor portals and extra agent/owner/admin routes.

Canonical finance remains `Payment` → `createPayment` → `postPaymentAccounting`. Ecosystem online pay stops at a verified **intent**.

Feature flags exist on `Company.featureFlags` (default false) with env overrides. `requireFlag()` exists but is **not applied to routes**.

---

## Known risks (from implementation review)

1. Browser E2E never run.
2. Client production build never run.
3. SMS/WhatsApp are SKIPPED stubs.
4. Online payments do not post canonical Payments (intentional).
5. Tenant lease/receipts require a linked occupant `Tenant` record.
6. Full server `tsc` has tax-service errors claimed as pre-existing (must be re-verified, not assumed).

---

## Test coverage

Current: `npm run test:ecosystem` — 9 static/unit checks (state machines, flags default off, listing DTO strip, no `await postPaymentAccounting`).

**Missing:** isolation, feature-flag enforcement, quote competition, change orders, ratings auth, notification SKIPPED/FAILED, concurrent transitions, inspection immutability, broadcast audience, UI/E2E.

---

## Untested areas

- Tenant/contractor registration against a live API
- Route loading in the browser
- Direct API IDOR (tenant A → tenant B)
- Contractor quote isolation
- Owner approving a non-selected quote
- Change-order owner approval (no API for agent/owner change-order review)
- Feature flags OFF rejecting APIs
- Mobile viewports
- Client lint/build

---

## Security-sensitive areas

| Issue | Severity | Plan |
|---|---|---|
| `requireFlag` unused; tenant/contractor flags always `next()` | High | Enforce flags server-side without bypass |
| Tenant list endpoints return `agentNotes` | High | Sanitize tenant-facing DTOs |
| `GET /agency/references` returns `privateNotes` to any agency staff (OK) but tenant could theoretically hit it (role-gated) | Med | Keep agency-only; never return privateNotes to tenants |
| Ratings: no check that rater participated in the job | High | Scope rater to tenant/owner/agent of that job |
| `assertWorkMayStart` treats `job.status === 'AUTHORISED'` as ownerApproved | High | Require `ownerApprovalId` when owner approval is required |
| Online init accepts `req.body.companyId` from tenant | Med | Derive company from lease/property, not client body |
| Public listings ignore `propertyMarketplaceEnabled` | Med | Gate search when company context exists; unpublished properties stay hidden via `publicListingEnabled` |
| Inspection acknowledgement overwrites freely | Med | Lock after both acknowledgements |
| Quote select / owner decision not conditional on current status | Med | Atomic `findOneAndUpdate` with expected status |

---

## Financial-sensitive areas

- Payment method enum extended (`online_payment`, `other`) — additive, keep
- Ecosystem must not call `postPaymentAccounting`
- Change-order extra cost must not mutate original quote amount
- Tenant payment/receipt reads only own `tenantId` Payments

---

## Browser/E2E gaps

No Playwright/Cypress in repo. Plan: if app is running, use browser tools; otherwise API-level workflow tests + client build. Document if live login against Mongo is unavailable.

---

## Notification gaps

- Viewing request notifies the **tenant**, not agency staff
- Reschedule/decline do not notify tenant
- Owner decision does not notify agent
- SMS/WhatsApp SKIPPED path exists but untested
- Provider failure path exists; retryCount set to 1 with no retry worker

---

## Build gaps

- Client `npm run build` in progress at hardening time (CRA, large graph)
- Server `tsc --noEmit` confirmed EXIT:0 in this pass
- No client `lint` script; `npx eslint` on ecosystem paths

---

## Environment variables

See `.env.example`. Production notes:

| Variable | Purpose | Required? | Default | Production notes |
| --- | --- | --- | --- | --- |
| ECOSYSTEM_ENABLED | Process-wide overlay unlock | no | unset/false | Internal test only |
| TENANT_PORTAL_ENABLED | Env override | no | company flag (false) | Prefer company flags |
| CONTRACTOR_PORTAL_ENABLED | Env override | no | false | Prefer company flags |
| PROPERTY_MARKETPLACE_ENABLED | Env override | no | false | Also requires `publicListingEnabled` per property |
| MAINTENANCE_QUOTES_ENABLED | Env override | no | false | Keep off until quote workflow is piloted |
| ONLINE_PAYMENTS_ENABLED | Env override | no | false | Keep off |
| MULTICHANNEL_NOTIFICATIONS_ENABLED | Env override | no | false | In-app still used for operational events |
| TENANT_REFERENCES_ENABLED | Env override | no | false | After tenancy end only |
| CONTRACTOR_RATINGS_ENABLED | Env override | no | false | After completed jobs |
| EMAIL_ENABLED / SMTP_* | Existing email | no | SKIPPED if unset | Reuse current mailer |
| SMS_ENABLED / SMS_PROVIDER | Official SMS | no | SKIPPED | Do not invent a vendor |
| WHATSAPP_ENABLED / WHATSAPP_PROVIDER | Official WhatsApp | no | SKIPPED | No unofficial automation |
| RENT_PAYMENT_PROVIDER | Intent stub | no | stub | Must not post accounting |

Rollout: Development → internal test company → pilot agency → small production group → broader. Do not enable all flags globally because unit tests pass.

---

## Proposed verification sequence

1. Write this plan (this file).
2. Run `npm run test:ecosystem`.
3. Run server `tsc --noEmit` → `MANTIS_TYPECHECK_REVIEW.md`.
4. Run client production `npm run build`.
5. Lint ecosystem frontend.
6. Expand automated workflow/security tests (no Mongo if possible: unit + source assertions; with Mongo if available).
7. Fix defects found (flags, DTO leak, work-start guard, ratings scope, notifications, change-order APIs, UI empty/error/mobile).
8. Re-run ecosystem tests.
9. Attempt browser E2E if servers are up.
10. Document state machines, E2E matrix, env example, production readiness.

**Not in scope:** rewriting tax engines, accounting orchestrator, existing maintenance UI, or enabling flags globally.
