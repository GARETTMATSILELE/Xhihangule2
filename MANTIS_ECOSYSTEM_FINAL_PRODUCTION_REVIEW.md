# MANTIS ECOSYSTEM — FINAL PRODUCTION REVIEW

Date: 18 September 2026

## Overall Status

**PASS WITH DOCUMENTED RISKS**

This is a controlled-pilot gate, not an unrestricted production enablement. Live API, company-flag-only enablement, canonical `createPayment`, a fresh CRA build after AuthContext/PortalRegister, and a browser multi-actor pass all ran. The hardcoded system-admin bootstrap was reviewed and left in place; that remains a **codebase production-enablement blocker**, not an overlay ledger defect.

PASS is not available: bootstrap is not remediaged, tenant UI register has no company ID field, and the quote UI does not complete a full supervised cycle without API help.

## Ecosystem Tests

13/13: PASS (`npm run test:ecosystem`, EXIT 0)

Live API harness: **73 PASS / 0 FAIL / 0 BLOCKED / 73 total** (`npx ts-node --transpile-only src/scripts/runEcosystemLiveE2E.ts`, EXIT 0)

API process for that run: `npm run dev` with `ECOSYSTEM_ENABLED`, `TENANT_PORTAL_ENABLED`, `CONTRACTOR_PORTAL_ENABLED`, `PROPERTY_MARKETPLACE_ENABLED`, `MAINTENANCE_QUOTES_ENABLED`, `ONLINE_PAYMENTS_ENABLED`, `SMS_ENABLED`, and `WHATSAPP_ENABLED` **unset**. Company A was enabled only via `Company.featureFlags`. Company B flags were then turned off: tenant B overview **403**, tenant A overview **200**.

## Server Typecheck

EXIT CODE: 0 (`npx tsc --noEmit`)

## Client Lint

RESULT: PASS for ecosystem files — **0 errors**

Warnings (7): unused vars in `AuthContext.tsx`; `TenantDashboard` `useEffect` dependency list is a variable so exhaustive-deps cannot be verified. `App.tsx` unused `lazy` is gone. No eslint-disable was added.

## Client Production Build

RESULT: **BUILD PASSED** after AuthContext / PortalRegister

- BUILD_START=2026-09-18T14:26:35
- BUILD_END=2026-09-18T15:10:07
- BUILD_DURATION_MS=2611574 (~43.5 minutes)
- BUILD_EXIT=0
- Compiled with warnings (pre-existing unused vars / hook deps across the large CRA graph, not compile errors)

File sizes after gzip: `main.a3656115.js` **181.47 kB**. Many additional hashed chunks (largest `2810.d208841c.chunk.js` 120.56 kB). Tenant/Contractor/Owner/Agent dashboards and PortalRegister remain `lazyWithRetry` in `App.tsx`. Classification: A (slow) + F (large existing CRA graph) + G (OneDrive). Not hung. Not an ecosystem-only compile.

## Browser E2E

RESULT: **PARTIAL PASS** (executed, not inferred)

- `/tenant-register` stays public (no bounce to `/login` with an expired/empty session)
- Tenant UI register without company ID: **403** “Tenant registration is not enabled” when process env flags are off (server requires a company flag or env override)
- Contractor register → `AuthContext.login()` → `/contractor-dashboard` with **no bounce to `/login`**
- Refresh `/contractor-dashboard`: session survived
- Logout via `/api/auth/logout` (portal shell has **no logout control**) then login again as tenant A: `/tenant-dashboard` showed E2E Property A, rent due $0.00, lease active, open maintenance
- Tenant submitted **Browser tap leak** from the maintenance form (overview API then listed it; the form does not reload the card list)
- Tenant payments: seed receipt plus canonical `RCPT-…-2026-10` $500 bank_transfer
- Agent A: existing agent dashboard still loads (E2E Agency A). `/agent-dashboard/quotes` listed Browser tap leak / Reopen / Request-changes / Declined / Closed with Review, Quotes, Send to owner, Authorise work. Quotes panel opened Invite contractor
- Owner A: existing owner dashboard still loads (activity feed included Browser tap leak). `/owner-dashboard/quotes` rendered Approve / Decline / Request changes. Clicking Request changes on UNDER_REVIEW did not change status (workflow machine). Live API already proved DECLINE and REQUEST_CHANGES from valid states
- Contractor A: invitations, quotes ($40 / $88 / $80 / $100 with OWNER_APPROVED / UNDER_REVIEW / OWNER_DECLINED), completed jobs. Active jobs empty (filtered to WORK_IN_PROGRESS). From this session, start-work on a SELECTED job returned **HTTP 403** “Contractor cannot start work until the owner has approved the quote and the agent has authorised the job”
- Change-order **UI**: NOT RUN — no change-order control on contractor job cards. Live API change order PASS
- Mobile 375 / 390 / 430: PASS — contractor dashboard uses a Menu drawer, no horizontal overflow; tenant-register and login render

## Tenant Isolation

PASS (live API: receipts 404, maintenance 403, documents 403, lease list)

## Owner Isolation

PASS (live API: Owner B HTTP 403 on Owner A quote and decision)

## Contractor Isolation

PASS (live API: competitor quotes hidden; agency quote list 403)

## Company Isolation

PASS (live API: Agent B 404 on Company A review; Company B contractor jobs isolated; company-flag-only: B 403 / A 200 with env unset)

## Document Authorization

PASS

Deny-by-default File policy. Live: Tenant A GET own lease file 200, tax/owner file 403, Property B lease file 403. List payload has no `fileUrl`.

## Maintenance Workflow

PASS (live API, including start-work 403 before approvals, owner decline, REQUEST_CHANGES leaving quote amount intact, reopen from COMPLETED → REOPENED). Browser: tenant submit + agent quotes UI + owner decision buttons + contractor 403. Full UI quote cycle (invite → quote → select → owner approve → authorise → complete with photos) was **not** finished in the browser; the API equivalent was.

## Quote Versioning

PASS — owner-approved quote edit HTTP 409; stored amount remained 100

## Change Orders

PASS (API) — requested +50; original quote amount 100 unchanged after owner approval. Browser UI absent.

## Notifications

PASS

- In-app SENT (23 in the quote workflow; plus 1 SENT in the failure test)
- SMS/WhatsApp SKIPPED when those env flags are unset (8+8 in the workflow)
- Forced SMS failure: `UnconfiguredSmsProvider` → SMS FAILED, in-app still SENT, duplicate idempotency key kept a **single** in-app SENT
- Email uses the existing Mantis SMTP path when configured; this API process verified SMTP at boot. Do not treat that as a live tenant email proof for every event

## Financial Integrity

PASS for overlay side-effects **and** live canonical `createPayment`

- Quote/approval/authorise/complete: journals **0→0**, payments **1→1**, posted intents **0**
- Online initialize: **403** while `onlinePaymentsEnabled` is false (company flag + no env)
- `POST /api/payments` as agent A: **HTTP 201**, payments **1→2**, journals **0→2**, tenant could read the new receipt, ecosystem intents stayed **0**
- First createPayment attempt failed HTTP 500 `agentId: Path agentId is required` because the E2E property seed omitted `property.agentId`. Harness-only fix. PMS validator was not rewritten
- Detection-only integrity job later flagged that E2E payment as **incomplete** (`missing: ownerIncome`). Read-only. No automatic repair. Thin E2E company, not a second ledger

## Existing PMS Regression

PASS for this run: API boot, Mongo connected, existing agent dashboard, existing owner dashboard, accountant-path not mutated. Isolated identities remain `@mantis-e2e.test`. Scheduled ledger/payment integrity jobs stayed detection-only.

## System-admin bootstrap

Reviewed in `MANTIS_SYSTEM_ADMIN_BOOTSTRAP_SECURITY_REVIEW.md`. Still runs on every boot, all environments, hardcoded email+password, forces `admin`+`system_admin`, resets password if rotated. **Not deleted. Not rewritten.** BLOCKER for production enablement of this codebase.

## Remaining Risks

1. Hardcoded system-admin bootstrap in `server/src/index.ts`
2. Tenant portal register UI has no company ID field, so company-flag-only self-register 403s
3. PortalShell has no logout
4. Quote/maintenance UI often does not reload after mutating actions
5. Owner decision buttons are shown for every status; the machine rejects invalid transitions
6. Contractor active-jobs lists only `WORK_IN_PROGRESS`, so start-work before approval is not a visible button (API still 403s)
7. No change-order form in the UI
8. SMS/WhatsApp remain stubs. Online payments remain OFF / intent-only
9. E2E seed companies are not a full chart-of-accounts; canonical journals posted but owner-income completeness was incomplete
10. JWT_SECRET was ephemeral on this local process (dev warning). Production must set a long secret

## Features Safe for Controlled Pilot

1. Tenant portal — **one named company**, `featureFlags.tenantPortalEnabled` only, **no** `ECOSYSTEM_ENABLED`
2. Contractor portal — same company, after the tenant pilot
3. Public listings — same company, marketplace flag only

## Features That Must Remain Disabled

1. `maintenanceQuotesEnabled` until a supervised UI quote cycle at that company
2. `onlinePaymentsEnabled`
3. SMS / WhatsApp live providers
4. Global `ECOSYSTEM_ENABLED`

## Build Investigation

Cause: CRA production compile of the existing large client on OneDrive is slow (~43.5 min this run, previously ~72 min) but completes with EXIT 0. Ecosystem routes were already lazy-loaded.

Resolution: Keep `lazyWithRetry`. Do not disable webpack optimizations. Do not strip ecosystem features. Server boot remains the lazy `createIndexes` fix in `database.ts`.

## Files Changed This Gate

- `server/src/scripts/runEcosystemLiveE2E.ts`: canonical `createPayment`, REQUEST_CHANGES, COMPLETED reopen, company-flag isolation, notification failure+idempotency; property seed `agentId` (harness only)
- Client: AuthContext public paths, PortalRegister `login()`, `fnRef` loaders (already in tree before this gate’s build)
- `MANTIS_SYSTEM_ADMIN_BOOTSTRAP_SECURITY_REVIEW.md`
- This review, E2E matrix, production readiness
- Accounting posting/tax/lease engines **untouched**

## Final Recommendation

Do **not** set `ECOSYSTEM_ENABLED` or `onlinePaymentsEnabled` in production.

Do **not** enable `maintenanceQuotesEnabled` until a named company completes a supervised UI quote cycle.

Do **not** deploy this `src/index.ts` bootstrap as-is into a production control plane.

The overlay is additive, flag-gated, did not write journals during the live quote workflow, and did not intercept canonical `createPayment`. Introduce tenant/contractor/listings **company-by-company** with process env flags unset.

Recommended defaults remain:

- Tenant Portal: OFF by default
- Contractor Portal: OFF by default
- Public Listings: OFF by default
- Maintenance Quotes: OFF
- Online Payments: OFF
- In-App Notifications: AVAILABLE
- Email Notifications: AVAILABLE when SMTP is configured
- SMS: OFF / SKIPPED
- WhatsApp: OFF / SKIPPED
