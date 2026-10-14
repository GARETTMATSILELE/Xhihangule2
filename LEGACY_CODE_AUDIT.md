# Legacy Code Audit

**Date:** 8 September 2026  
**Scope:** Production property-management application (`Xhihangule2`)  
**Method:** Static inspection of application source (not `node_modules`), route registration, caller tracing, and deployment wiring. No code was deleted. No production data was modified. No migration or repair script was executed.

**Inspection scale:**

| Area | Files inspected |
|------|-----------------|
| Client TypeScript/TSX (`client/src`) | 392 |
| Server TypeScript (`server/src`) | 331 |
| Deployment / CI / Docker / package manifests | 20+ |
| **Total application files in scope** | **~743** |

Deep tracing concentrated on payments, accounting projection, reconciliation, scheduled jobs, APIs that write financial data, frontend routing, and deployment.

---

## Executive Summary

The live production architecture is a Node/Express API (`server/src/index.ts`) plus a Create React App frontend (`client/src/index.tsx` → `App.tsx`), deployed as a Docker image to Azure App Service (API + worker). Accounting has largely moved to:

```
Payment (source of truth)
  → deterministic projection
  → Property / Agent / Company accounts, Journal, VAT, Rental Deposit
  → read-only reconciliation
  → accountingComplete = true | false
```

The integrity job (`payment_accounting_integrity`, every 2 minutes) is detection-only. GET payment and GET property-account endpoints do not post accounting. Deposit-only classification in the current policy is `depositAmount > 0 AND amount <= 0`. The old `amount <= deposit` rule was **not found**.

The main remaining conflicts with the current architecture **were** still-registered write paths that could automatically create or repair accounting. Those paths were locked down in **Financial Write-Path Lockdown — Phase 2** (see that section). Current status:

1. Daily/monthly full sync is **detection-only** for payment accounting (no `recordIncomeFromPayment`).
2. `POST /api/sync/reconcile/payment/:id` is **read-only / deprecated**.
3. `POST /api/accountants/property-accounts/sync` is an **explicit admin/system_admin historical backfill** (confirm + reason + audit).
4. Trust reconciliation job is **detection-only**.
5. `POST /api/accounting/migrations/backfill-balances` is **system_admin + confirm + reason + audit**.

Those must be **deprecated or restricted**, not deleted blindly.

A second class of findings is **clearly dead UI and unused entry points** (orphan pages, unused hooks, unused `app.ts` server, empty route stubs, unused PayPal mount). Those are the safest cleanup candidates.

A third class is **legacy-but-referenced** code (large `propertyAccountService`, dual Express apps, duplicate dashboards, leftover Payment retry fields). Keep until reviewed.

---

## Current Architecture

### Frontend

- **Bootstrap:** `client/public/index.html` → `client/src/index.tsx` → `client/src/router.tsx` → `client/src/App.tsx`
- **Stack:** React 18, TypeScript, Material UI, Create React App (`react-scripts`). Vite exists only for Vitest; `client/src/main.tsx` is not the CRA entry.
- **Dashboards:** Admin (`/admin-dashboard`), Individual (`/individual-dashboard`), Agent, Accountant, Sales, Owner, System Admin.
- **Accountant shell in production:** `client/src/pages/AccountantDashboard.tsx` (Outlet). Child routes are registered in `App.tsx`.

### Backend

- **Production HTTP entry:** `server/src/index.ts` (`npm start` → `node dist/index.js`)
- **Background worker:** `server/src/worker.ts` (`APP_ROLE=worker`)
- **Legacy slim Express app:** `server/src/app.ts` (`package.json` `"main": "dist/app.js"` but **not** used by `npm start`)
- **Database:** MongoDB-compatible via `server/src/config/database.ts` (main + accounting connections). Azure Cosmos Mongo API in production.
- **Auth:** JWT in `server/src/middleware/auth.ts` + role gates in `server/src/middleware/roles.ts`. Routes: `server/src/routes/auth.ts`.

### Accounting pipeline (authoritative)

| Layer | File | Role |
|-------|------|------|
| Policy | `server/src/services/accountingPostingPolicy.ts` | Deposit-only, provisional, suspense, completed-only gates |
| Compute at payment save | `propertyCommissionCalculator.ts` via `commissionService.ts` | Commission/VAT stored on Payment |
| Projection | `paymentAccountingProjection.ts` | Expected records from stored Payment values |
| Write orchestrator | `paymentAccountingOrchestrator.ts` | Single post/reverse entry |
| Reconciliation | `paymentAccountingReconciliation.ts` | Read-only compare; persist `accountingComplete` |
| Integrity | `paymentAccountingIntegrity.ts` | Detection/flag only |
| Explicit repair | `repairPaymentAccounting` + `POST /accountants/payments/:id/accounting/repair` | Targeted, authorised write |

### Runtime roles

`APP_ROLE=api|worker|all` with `ENABLE_SYNC_SCHEDULES`, `ENABLE_TRUST_BACKGROUND`, `ENABLE_STARTUP_MAINTENANCE`.

---

## High-Risk Legacy Code

These items conflict with “Payments = source of truth, accounting = deterministic projection, reconciliation = detection only”. They are **still reachable**. Do not delete until the write behaviour is explicitly decided.

### 1. Daily / monthly full sync still posts owner income

```
File: server/src/services/databaseSyncService.ts
Function: syncAllPayments / performFullSync
Category: E Obsolete Architecture + C Automatic repair (still referenced)
Current usage: Called by scheduled daily_sync, monthly_deep_sync, POST /api/sync/full, system-admin full sync
Callers:
  scheduledSyncService.executeDailySync (cron 0 2 * * *)
  scheduledSyncService.executeMonthlyDeepSync (cron 0 4 1 * *)
  syncController.performFullSync → POST /api/sync/full
  systemAdminController (full sync)
Writes financial data: YES — recordIncomeFromPayment for every completed rental/sale/introduction payment
Risk: CRITICAL
Evidence: databaseSyncService.ts ~737–760 loops completed payments and calls propertyAccountService.recordIncomeFromPayment, then verifyAndReconcilePaymentPosting. That is automatic historical posting, not detection-only.
Recommendation: Keep the job process, but disable or gate owner-income posting. Align with integrity-job policy. Do not delete the file.
```

### 2. Admin payment reconcile endpoint still backfills accounting

```
File: server/src/services/databaseSyncService.ts
Function: verifyAndReconcilePaymentPosting / reconcilePaymentPosting
Category: E Obsolete Architecture (hidden repair API)
Current usage: POST /api/sync/reconcile/payment/:paymentId (admin)
Callers: syncRoutes.ts → syncController.reconcilePaymentPosting
Writes financial data: YES — recordIncomeFromPayment + postCompanyCommission; enqueues LedgerEvent on failure
Risk: CRITICAL
Evidence: databaseSyncService.ts ~1274–1298. Comment says “Ensures property/development ledger income exists”. This is a second repair path besides POST /accountants/payments/:id/accounting/repair.
Recommendation: Deprecate. Route accountants to the explicit repair endpoint. Restrict or remove this admin shortcut after review.
```

### 3. Property-account sync still backfills from payments

```
File: server/src/services/propertyAccountService.ts
Function: syncPropertyAccountsWithPayments
Category: B Legacy but still referenced / F Migration tool exposed as API
Current usage: POST /api/accountants/property-accounts/sync
Callers:
  propertyAccountController.syncPropertyAccounts
  maintenanceJobQueueService (job type sync_property_accounts)
Writes financial data: YES — recordIncomeFromPayment per eligible payment
Risk: HIGH
Evidence: propertyAccountService.ts ~2447–2481. Accountant route accountantRoutes.ts ~263. Default path queues a maintenance job; ?wait=true runs inline.
Recommendation: Keep as explicit admin tool for now. Label as authorised backfill, not “sync”. Do not call from GET or from the integrity job (currently it is not).
```

### 4. Accounting journal backfill from existing payments

```
File: server/src/services/accountingIntegrationService.ts
Function: backfillFromExistingData
Category: F Migration / Historical tool
Current usage: POST /api/accounting/migrations/backfill-balances?replayExisting=true
Callers: accountingController.backfillBalances → accountingRoutes.ts
Writes financial data: YES — replays completed payments into journal/VAT; then backfillCompanyBalances
Risk: CRITICAL
Evidence: accountingController.ts ~253–262; accountingRoutes.ts line 57.
Recommendation: Keep for emergency authorised use. Do not expose in normal accountant UI. Add stronger auth/audit if not already present. Do not auto-call.
```

### 5. Trust reconciliation auto-repairs missing postings

```
File: server/src/jobs/trustReconciliationJob.ts
Function: runCompanyReconciliation
Category: E Obsolete vs current “detection only” rule (trust domain)
Current usage: Daily cron 15 2 * * * when ENABLE_TRUST_BACKGROUND
Callers: index.ts / worker.ts → startTrustReconciliationJob()
Writes financial data: YES — emitEvent('payment.confirmed') for missing TrustTransaction; updates TrustAccount.runningBalance
Risk: HIGH
Evidence: trustReconciliationJob.ts ~13–40 increments autoRepairs and emits payment.confirmed for sale payments with no trust transaction.
Recommendation: Convert to detection-only, or keep auto-repair only if trust posting is an explicit exception. Do not delete; trust accounting is production.
```

### 6. Weekly consistency job auto-creates property account shells

```
File: server/src/services/scheduledSyncService.ts
Function: executeWeeklyConsistencyCheck / attemptConsistencyFixes / fixMissingPropertyAccounts
Category: B Legacy but still referenced
Current usage: Cron weekly_consistency_check (0 3 * * 0)
Callers: ScheduledSyncService.startAllSchedules
Writes financial data: PARTIAL — archives orphaned PropertyAccount docs; creates missing account shells via syncPropertyToAccounting; does not appear to post income in this function
Risk: HIGH (schema/account creation), MEDIUM (not payment posting)
Evidence: scheduledSyncService.ts ~459–474 calls attemptConsistencyFixes when inconsistent; ~613–621 iterates all properties and syncs them to accounting.
Recommendation: Detection-only for weekly check. Move creates/archives to an explicit admin action.
```

### 7. LedgerEvent retry can still create owner income

```
File: server/src/services/ledgerEventService.ts
Function: processPending / execute
Category: A Current (async posting) with B retry side-effect
Current usage: databaseSyncService real-time sync interval (15s) when real-time sync is started; also enqueue from syncAllPayments on failure
Callers: databaseSyncService.startRealTimeSync (NOT auto-started at boot; POST /api/sync/real-time/start)
Writes financial data: YES when processing owner_income events
Risk: HIGH if real-time sync is enabled in production; LOW if it remains off
Evidence: index.ts comments real-time sync as not auto-started. syncAllPayments still enqueues owner_income on failure during daily sync.
Recommendation: Confirm production APP_ROLE and whether real-time sync is enabled. Keep LedgerEvent for payment-completion posting; stop enqueueing from full-sync failure paths.
```

### 8. Development ledger backfill API

```
File: server/src/services/propertyAccountService.ts
Function: ensureDevelopmentLedgersAndBackfillPayments
Category: F Migration tool
Current usage: POST accountant development-ledger ensure endpoint
Callers: propertyAccountController; accountantRoutes comment “Ensure development ledgers and backfill sales payments”
Writes financial data: YES — recordIncomeFromPayment
Risk: HIGH
Evidence: propertyAccountService.ts ~1794–1856.
Recommendation: Keep as explicit, idempotent admin tool. Do not run from GET or integrity job.
```

---

## Definitely Unused

High-confidence dead code: no production route mount, no CRA import, no worker registration. Safe to remove **after a second human pass**, not during this audit.

### Frontend pages / shells

```
File: client/src/main.tsx
Function/Class: alternate React bootstrap
Category: C Unused
Current usage: None. CRA uses index.tsx.
Callers: none from package.json scripts
Risk: LOW
Evidence: client/package.json start/build use react-scripts; index.tsx is the documented CRA entry.
Recommendation: Remove after confirming no Vite production build is planned.
```

```
File: client/src/pages/AccountantDashboard/AccountantDashboard.tsx
Function/Class: alternate accountant shell with its own <Routes>
Category: C Unused (duplicate of pages/AccountantDashboard.tsx)
Current usage: Not imported by App.tsx. App uses pages/AccountantDashboard.tsx + Outlet.
Callers: none
Risk: LOW for deletion; MEDIUM if someone assumes this file is live (it contains the only Route for accounting-integrity)
Evidence: App.tsx line 39 imports ./pages/AccountantDashboard (root file). Folder file is never imported. Grep shows AccountingIntegrityPage routed only here.
Recommendation: Do not delete until accounting-integrity is added to App.tsx. Then delete this duplicate shell.
```

```
File: client/src/pages/App.tsx
Category: C Unused stub
Usage: none
Risk: LOW
Evidence: No imports. App lives at client/src/App.tsx.
Recommendation: Delete.
```

```
File: client/src/pages/FinanceDashboard/index.tsx
File: client/src/pages/InventoryDashboard/index.tsx
File: client/src/pages/CompanyRegister.tsx
File: client/src/pages/TestAuth.tsx
File: client/src/pages/BillingUpgrade/index.tsx
File: client/src/pages/PropertiesPage.tsx
File: client/src/pages/TenantsPage.tsx
File: client/src/pages/Landing/LandingPage.tsx
File: client/src/pages/About/About.tsx
File: client/src/pages/Home/Home.tsx
File: client/src/pages/Register/Register.tsx
File: client/src/pages/NotFound/NotFound.tsx
File: client/src/pages/Unauthorized/Unauthorized.tsx
File: client/src/pages/PropertyOwners/PropertyOwnersPage.tsx
File: client/src/pages/owner/OwnerReports.tsx
File: client/src/pages/owner/OwnerPayments.tsx
File: client/src/pages/owner/OwnerProperties.tsx
File: client/src/pages/payments/Payments.tsx
File: client/src/pages/payments/PaymentList.tsx
File: client/src/pages/Communications/Communications.tsx
Category: C Unused
Current usage: Not registered in App.tsx; no imports found in client/src
Callers: none
Risk: LOW
Evidence: App.tsx route table uses LandingPage/index, Signup, BillingSetup, Tenants/Tenants.tsx, components/owner/OwnerDashboard, CommunicationsPage, components/payments/PaymentList.
Recommendation: Remove as a batch after confirming no dynamic import strings (none found).
```

```
File: client/src/components/Layout/Layout.tsx
File: client/src/components/Layout/Sidebar.tsx
Category: C Unused
Current usage: Layout.tsx imports Sidebar; nothing imports Layout.
Callers: none outside the pair
Risk: LOW
Evidence: Dashboards use AdminSidebar, AccountantSidebar, AgentSidebar, SalesSidebar, Individual sidebar.
Recommendation: Delete the unused generic layout pair. Keep Header.tsx (NotificationProvider is used).
```

```
File: client/src/hooks/useApi.ts
File: client/src/hooks/useApiRequest.ts
File: client/src/hooks/useCachedRequest.ts
Category: C Unused
Current usage: Exported but never imported
Callers: none
Risk: LOW
Evidence: Grep across client/src found only the defining files.
Recommendation: Delete.
```

### Backend unused modules

```
File: server/src/database.ts
Function: connectDatabase (legacy)
Category: C Unused
Current usage: Not imported by index.ts, worker.ts, or scripts
Callers: none (scripts use config/database.ts)
Risk: LOW
Evidence: Production uses server/src/config/database.ts. No from './database' imports in server/src.
Recommendation: Delete after confirming no ops runbook points at it.
```

```
File: server/src/config/authDatabase.ts
Function: connectAuthDatabase
Category: C Unused / G Potentially required indirectly
Current usage: Never called from index.ts or worker.ts
Callers: none found
Risk: LOW (code) / MEDIUM (if a forgotten env AUTH_MONGODB_URI is still documented)
Evidence: AUTH_MONGODB_URI is only read in this file. Production auth uses the main Mongo connection via AuthService.
Recommendation: Treat as obsolete split-auth-DB architecture. Do not remove env var until ops confirms it is unused in Azure.
```

```
File: server/src/routes/authRoutes.ts
Category: C Unused (superseded by routes/auth.ts)
Current usage: Not mounted. index.ts and app.ts import ./routes/auth
Callers: none
Risk: LOW
Evidence: index.ts line 15 import authRoutes from './routes/auth'
Recommendation: Delete after a diff against auth.ts to ensure no unique endpoint is lost.
```

```
File: server/src/routes/companies.ts
File: server/src/routes/settings.ts
Category: C Unused stubs
Current usage: Empty routers, not mounted
Callers: none
Risk: LOW
Evidence: File comments: “All company/settings routes temporarily removed for server startup”. Live routes are companyRoutes.ts.
Recommendation: Delete.
```

```
File: server/src/routes/testReportRoutes.ts
Category: C Unused in production
Current usage: Mounted only in app.ts at /api/test-reports
Callers: app.ts only
Risk: LOW
Evidence: index.ts does not import it. File is a ping/health stub.
Recommendation: Delete with app.ts or leave until app.ts is retired.
```

```
File: server/src/index.ts (import only)
Symbol: paypalRoutes
Category: C Dead import (route not mounted in production)
Current usage: imported in index.ts line 46; never app.use('/api/paypal', ...)
Callers: mounted only in unused app.ts
Risk: MEDIUM if someone later mounts it without review; LOW as currently unwired
Evidence: Grep of index.ts shows import but no app.use for paypal. Frontend checkout uses /paynow/web/create, not PayPal SDK.
Recommendation: Remove unused import. Keep paypalRoutes.ts/controller until billing product decision. Do not mount in production without review.
```

---

## Legacy But Still Referenced

Do **not** auto-delete.

```
File: server/src/app.ts
Category: B Legacy Express app
Usage: package.json "main": "dist/app.js"; not used by npm start
Callers: none from production start scripts
Risk: MEDIUM — subset of routes, includes PayPal and test-report mounts, no sync/accounting/trust
Evidence: start script is node dist/index.js. app.ts lacks /api/sync, /api/accounting, webhooks, admin backfill.
Recommendation: Stop compiling it as “main”. Archive or delete only after confirming no test harness imports it.
```

```
File: server/src/services/propertyAccountService.ts
Function: recordIncomeFromPayment (and ~3000-line service)
Category: A Current write path + B legacy sync helpers in the same file
Usage: Called by paymentAccountingOrchestrator (current) AND sync/backfill (legacy)
Callers: orchestrator, syncAllPayments, syncPropertyAccountsWithPayments, development backfill, ledger event processor
Risk: HIGH to modify; KEEP
Evidence: Dual role is the core consolidation problem. Idempotency keys exist; still a second writer besides “projection”.
Recommendation: Keep. Future work: all writes go only through orchestrator.
```

```
File: server/src/services/accountingService.ts
Function: dashboard aggregations, backfillCompanyBalances
Category: A Active reporting + F backfill
Usage: /api/accounting dashboard, P&L, VAT, ledger
Callers: accountingController
Risk: MEDIUM — reporting can diverge from Payment if it aggregates ledgers independently
Evidence: Comment at accountingService.ts ~455: persisted payment commission totals as source of truth for company revenue (good). Other report methods still read ledgers.
Recommendation: Keep. Do not treat as dead. Review report formulas separately.
```

```
File: server/src/services/reconciliationService.ts
Function: reconcileDuplicates
Category: B Legacy ledger dedupe
Usage: CLI reconcile.ts; maintenanceController; systemAdminController
Callers: those three
Risk: MEDIUM — archives duplicate ledger rows (writes)
Evidence: Not the payment-accounting integrity module. Different “reconciliation” meaning (dedupe).
Recommendation: Keep. Rename conceptually to “ledger dedupe” in docs to avoid confusion.
```

```
File: client/src/pages/Checkout/PaypalCheckout.tsx
Category: B Name is legacy; implementation is Paynow
Usage: Routed at /checkout and /checkout/paypal
Callers: App.tsx
Risk: LOW
Evidence: Uses api.post('/paynow/web/create'); method state is paynow|cash.
Recommendation: Rename later. Do not delete.
```

```
File: client/src/pages/AccountantDashboard/AccountingIntegrityPage.tsx
Category: B Implemented but not registered in live App.tsx
Usage: Sidebar and DashboardOverview navigate to /accountant-dashboard/accounting-integrity
Callers: AccountantSidebar, DashboardOverview; routed only in unused folder shell
Risk: MEDIUM (broken UX, not financial write)
Evidence: App.tsx accountant child routes (lines 240–265) omit accounting-integrity. Backend GET /accountants/accounting-integrity/* exists.
Recommendation: Add the route to App.tsx. This is a wiring fix, not deletion. Out of scope for this audit unless approved.
```

```
File: server/src/config/databaseConfig.ts
Category: B Alternate DB wrapper used by DatabaseService
Usage: DatabaseService / circuit breaker
Callers: databaseService.ts
Risk: LOW
Evidence: Parallel to config/database.ts. Production connect is config/database.ts.
Recommendation: Keep until DatabaseService is inlined or unified.
```

---

## Duplicate Implementations

### Commission / VAT / owner amount

| Calculator | File | Authoritative? | Who calls it | Can it diverge? |
|------------|------|----------------|--------------|-----------------|
| Payment-time commission | `propertyCommissionCalculator.ts` via `commissionService.ts` | **Yes for stored Payment.commissionDetails** | paymentController, paymentService, agentController | This is the write-time formula |
| Lane projection | `commissionProjection.ts` | **Yes for posting/recon** — reads stored details | agentAccountService, paymentAccountingProjection | Should not recompute rates |
| Expected owner income | `paymentAccountingCompleteness.computeOwnerIncomeAmount` | **Yes for recon** | projection + propertyAccountService | Must stay aligned with recordIncomeFromPayment |
| Trust/sale tax engine | `taxEngine/index.ts` | **Separate domain** (CGT/sale VAT) | trustAccountService.generateTaxSummary | **Yes** — default vatOnCommissionRate 0.155 independent of Payment.vatOnCommissionRate |
| Combined allocation | `combinedPaymentService.ts` | Payment creation | payment create paths | Deposit-only uses amount<=0 && deposit>0 (aligned) |
| Reporting | `accountingService.ts`, `reporting/*` | Read models | accountant reports | **Yes if they recompute instead of reading Payment** |

```
File: server/src/services/taxEngine/index.ts
Function: calculateCommissionVAT / generateTaxSummary
Category: D Duplicate financial calculator (trust/sale)
Usage: Trust settlement summaries
Callers: trustAccountService.ts ~584
Risk: HIGH if used to post rental VAT; MEDIUM for sale trust display
Evidence: DEFAULT_CONFIG.vatOnCommissionRate = 0.155. Payment VAT is stored on the payment at save time via propertyCommissionCalculator.
Recommendation: Keep for sale/trust. Do not use for rental payment accounting. Document that Payment.commissionDetails is authoritative for rental VAT.
```

### Frontend duplicates (role-specific copies — keep)

- `LevyPaymentsPage`: admin / agent / accountant (three UIs)
- `ReportsPage`: admin / accountant / individual
- Settings pages per role
- Two PaymentList files: `components/payments/PaymentList.tsx` (**used**) vs `pages/payments/PaymentList.tsx` (**unused**)

### Backend duplicate auth

- `routes/auth.ts` — **live**
- `routes/authRoutes.ts` — **dead**

### Duplicate Express apps

- `index.ts` — **live production**
- `app.ts` — **legacy subset**

### Duplicate API namespaces (both live)

| API | Used by frontend | Writes? | Verdict |
|-----|------------------|---------|---------|
| `/api/payments` | paymentService, PaymentsPage | Yes | Current operational API |
| `/api/accountants/payments` | AccountantPaymentsPage | Yes | Current accountant API |
| `/api/admin/payments` (frontend route `/admin/payments`) | PaymentsPage | Yes (same backend payments) | Legacy URL, still routed |
| `/api/accounting/*` | accountingService | Some POSTs | Current reporting + dangerous backfill |
| `/api/accountants/accounting-integrity/*` | accountingService | GET only | Current |
| `/api/sync/*` | DatabaseSyncDashboard | Yes (admin) | Legacy sync control still live |
| `/api/accountants/property-accounts/sync` | propertyAccountService | Yes | Legacy backfill still live |

---

## Obsolete Accounting Logic

### Deposit-only classification

**Canonical rule (current):**

```66:70:server/src/services/accountingPostingPolicy.ts
export function isDepositOnlyPayment(payment: any): boolean {
  const deposit = Number(payment?.depositAmount || 0);
  const amount = Number(payment?.amount || 0);
  return deposit > 0 && amount <= 0;
}
```

Inline equivalents (same semantics) exist in `paymentController.ts`, `agentController.ts`, `combinedPaymentService.ts`: `amount <= 0 && deposit > 0`.

**Old rule `amount <= deposit`:** not found in `server/src`. Phase 5B/2C tests explicitly assert combined rent+deposit is not deposit-only.

```
Category: A Current (policy) — no HIGH RISK conflicting classifier found
Risk: none for the old formula (absent)
Recommendation: Keep using isDepositOnlyPayment everywhere; optionally replace inline duplicates with the policy helper (refactor, not this audit).
```

### postingStatus vs accountingComplete

```
File: server/src/models/Payment.ts
Fields: postingStatus, accountingComplete, accountingStatus
Category: A Current, with H leftover retry fields
Usage:
  postingStatus = payment lifecycle (draft/posted/reversed/voided), synced from status in Payment schema hooks
  accountingComplete = binary projection truth
  accountingStatus = diagnostic only
Risk: MEDIUM if future code treats postingStatus or accountingStatus=partial as complete
Evidence: Payment.ts comments ~83–92. Tests in runPhase2cAccountingIntegrityTests.ts assert they are distinct.
Recommendation: Keep fields. Do not remove. Document for future sessions.
```

```
File: server/src/models/Payment.ts
Fields: accountingRetryCount, accountingNextAttemptAt
Category: H Deprecated / leftover automatic-retry architecture
Usage: Schema + index exist. persistAccountingIntegrityFromRecon unsets accountingNextAttemptAt. No job found that retries posting by accountingNextAttemptAt.
Callers: model only (no scheduler reads nextAttemptAt)
Risk: LOW leftover; MEDIUM if someone reintroduces auto-retry using these fields
Evidence: Grep shows writes/unset in paymentAccountingReconciliation.ts and schema; no cron selects by accountingNextAttemptAt.
Recommendation: Do not remove columns. Stop writing them if unused. Do not build a new retry job on them.
```

### User.balance

```
File: server/src/services/accountingPostingPolicy.ts
Constant: USER_BALANCE_INTENDED_MEANING
Category: H Deprecated field meaning
Usage: Comment documents User.balance is leftover wallet, not owner income
Risk: MEDIUM if UI still displays it as owner money
Evidence: paymentController.ts ~745 comment: Company.revenue / User.balance are not accounting ledgers
Recommendation: Keep field for historical user docs. Do not use in accounting. Frontend display audit is a follow-up.
```

### CompanyAccount / Journal comments vs Payment SOT

```
File: server/src/services/accountingIntegrationService.ts
Comment: “CompanyAccount is the commission-revenue source of truth.”
Category: H Misleading documentation vs current architecture
Usage: Live writer still posts company commission into CompanyAccount
Risk: MEDIUM — future work may treat CompanyAccount as SOT instead of Payment
Evidence: accountingPostingPolicy.ts also exports COMPANY_REVENUE_SOURCE_OF_TRUTH pointing at CompanyAccount.transactions
Recommendation: Update comments: Payment is SOT; CompanyAccount is a projection. Do not change writers in this audit.
```

---

## Automatic Repair / Backfill Candidates

| Item | Trigger | Writes? | Auto? | Risk | Keep? |
|------|---------|---------|-------|------|-------|
| `payment_accounting_integrity` cron | every 2 min | Payment flags + AccountingException only | Yes | LOW (detection) | **KEEP** |
| `ledger_reconciliation` cron | every 5 min | Dedupe/archive duplicate ledger rows; **does not create income** | Yes | MEDIUM | KEEP; 48h window is leftover logging |
| `daily_sync` / `monthly_deep_sync` | 02:00 / monthly | `recordIncomeFromPayment` | Yes | **CRITICAL** | Restrict |
| `sync_failure_reprocessor` | every 5 min | Retries SyncFailure → may post company commission | Yes | HIGH | Review |
| `trustReconciliationJob` | 02:15 daily | Auto-create missing trust tx | Yes | HIGH | Review |
| `trustEventRetryService` | 60s interval | Retry failed trust events | Yes | HIGH | Current for trust; not payment accounting |
| `maintenanceJobQueueService` | 5s poll | Runs queued `sync_property_accounts` | Only if job queued | HIGH | KEEP queue; don’t auto-enqueue from GET |
| `POST .../accounting/repair` | accountant | Targeted post missing projection | No (explicit) | HIGH if misused; **correct architecture** | KEEP |
| `POST /accounting/migrations/backfill-balances` | accountant | Journal replay + balances | No (explicit API) | CRITICAL | Restrict |
| `POST /admin/backfill-trust-accounts` | admin | Trust backfill | No | HIGH | KEEP as migration |
| `POST /accountants/property-accounts/sync` | accountant | Owner income backfill | No (explicit) | HIGH | Deprecate |
| `POST /api/sync/reconcile/payment/:id` | admin | Owner income + commission | No (explicit) | CRITICAL | Deprecate |
| `POST /api/sync/full` | admin | Full payment sync | No | CRITICAL | Restrict |
| GET payment / GET property account | — | **No posting** | — | — | Confirmed clean |
| Integrity GET | — | **No posting** | — | — | Confirmed clean |
| CLI `reconcile.ts` | npm script | Ledger dedupe | Manual | HIGH | KEEP; never auto-run |
| `backfillIdempotencyKeys.ts` | npm script | PropertyAccount keys | Manual | MEDIUM | KEEP |
| `trustBackfillService.ts` | admin API | Trust postings | Manual | HIGH | KEEP |
| `accountingIntegrationService.backfillFromExistingData` | via backfill-balances | Journals | Manual API | CRITICAL | Restrict |
| `agentAccountService.backfillMissingForAgent` | POST sync-commissions only | Agent commissions | No | MEDIUM | KEEP; GET does not call it |
| `ensureDevelopmentLedgersAndBackfillPayments` | POST | Sale income | No | HIGH | KEEP explicit |
| Startup `runPropertyLedgerMaintenance` | worker once | Ledger maintenance | Yes (gated SystemSetting) | MEDIUM | KEEP; confirm it does not post income |

**GET-path accounting creation:** not found on property-account GET or payment GET. Phase 2c tests assert GET handlers do not call `recordIncomeFromPayment` / `repairPaymentAccounting`.

**48-hour job:** `ledger_reconciliation` still uses a 48-hour `since` window for **dedupe**, and logs that owner-income backfill is disabled. The old auto-create behaviour is gone; the window remains.

---

## Deprecated APIs

Still exposed. Treat as live until removed.

```
File: server/src/routes/syncRoutes.ts
APIs: POST /api/sync/full, POST /api/sync/reconcile/payment/:paymentId, POST /api/sync/fix/orphaned-accounts, real-time start/stop, schedule enable/disable
Category: H Deprecated relative to Payment→Accounting architecture
Frontend: client/src/components/admin/DatabaseSyncDashboard.tsx (admin accountant route /accountant-dashboard/data-sync and /admin-dashboard/sync)
Writes: YES
Risk: CRITICAL
Recommendation: Restrict to system_admin; disable payment posting inside full sync; keep read-only status/health.
```

```
File: server/src/routes/accountingRoutes.ts
API: POST /api/accounting/migrations/backfill-balances
Category: F Migration API still on accountant role
Writes: YES
Risk: CRITICAL
Recommendation: system_admin only + audit log. Do not put in normal accountant nav.
```

```
File: server/src/routes/accountantRoutes.ts
API: POST /property-accounts/sync
Category: H Should become explicit “authorised backfill”
Writes: YES
Risk: HIGH
Recommendation: Rename/document; require reason; do not call from integrity UI automatically.
```

```
File: server/src/routes/adminRoutes.ts
API: POST /api/admin/backfill-trust-accounts
Category: F Migration — keep
Writes: YES
Risk: HIGH
Recommendation: Keep. One-time migration tool.
```

```
File: server/src/routes/paypalRoutes.ts
API: /api/paypal/* (create-order, capture-order)
Category: C Unused in production index.ts
Frontend: PaypalCheckout does not call it
Risk: MEDIUM if mounted later
Recommendation: Do not mount. Review before any PayPal product launch.
```

```
File: frontend /admin/payments, /leases, /settings
Category: B Legacy top-level routes still in App.tsx
Usage: Still registered
Risk: LOW
Recommendation: Redirect to dashboard-scoped URLs later.
```

**Keep:** `POST /api/accountants/payments/:id/accounting/repair` — this is the authorised manual repair path.

---

## Unused Frontend Code

See Definitely Unused. Additional notes:

| Item | Category | Risk | Recommendation |
|------|----------|------|----------------|
| Accounting Integrity nav without App route | B broken wiring | MEDIUM | Add route; do not delete page |
| Revenue page routed, not in AccountantSidebar | G | LOW | Add nav or leave deep-link only |
| Agent sidebar “Reports” → inspections | H misleading | LOW | Fix label |
| `client/src/pages/Inspections/Inspections.tsx` | A used by Individual dashboard | — | KEEP |
| Feature flags in FeatureFlags.tsx | A | — | KEEP; no dead flag found that disables accounting integrity |
| `VITE_*` env reads | H leftover Vite migration | LOW | Inactive under CRA |

Potentially unused files not proven (dynamic import / string path): **none additional found** for the orphan list above. `reportWebVitals` dynamically imports `web-vitals` — **used**.

---

## Unused Backend Code

| Item | Category | Risk | Recommendation |
|------|----------|------|----------------|
| `database.ts` | C | LOW | Delete after review |
| `authDatabase.ts` | C/G | LOW | Confirm Azure env first |
| `authRoutes.ts` | C | LOW | Diff vs auth.ts then delete |
| `companies.ts` / `settings.ts` stubs | C | LOW | Delete |
| `testReportRoutes.ts` | C | LOW | Delete with app.ts |
| `paypalRoutes` unmounted | C/H | MEDIUM | Do not mount; keep files |
| `app.ts` | B | MEDIUM | Retire after tests |
| Empty `paypalRoutes` trailing whitespace | — | — | Cosmetic |
| Repositories (`leaseRepository` only) | A small pattern | LOW | KEEP |
| `paymentAccountingCompleteness.ts` | A | — | KEEP (used by projection + property accounts) |

Functions with zero callers outside tests were not exhaustively enumerated for every service (propertyAccountService alone exceeds 3000 lines). Financial functions traced above **do** have callers.

---

## Unused Dependencies

Classified by import search in `client/src` and `server/src` (not lockfile transitives).

### Definitely unused (direct)

| Package | Location | Evidence | Risk of removal |
|---------|----------|----------|-----------------|
| `save` | server/package.json | No imports | LOW |
| `morgan` | server | No imports; winston is used | LOW |
| `@paypal/react-paypal-js` | client | No imports; checkout uses Paynow | LOW |
| Root `react`, `@mui/*`, `@emotion/*`, `react-big-calendar`, `date-fns`, `uuid`, `zod` | root package.json | No root `src/` app | LOW (root orchestrates only) |

### Likely unused (direct)

| Package | Location | Evidence |
|---------|----------|----------|
| `d3-array`, `d3-color`, `d3-format`, `d3-interpolate`, `d3-scale`, `d3-shape`, `d3-time`, `d3-time-format` | client | No direct imports; recharts may pull them transitively |
| `ajv`, `ajv-keywords` | client | No app imports (CRA/webpack) |
| `@types/puppeteer` | server | puppeteer v24 ships types; extra types package may be stale |
| `@types/socket.io` | server | socket.io v4 ships types |
| `@types/winston` | server | winston ships types |

### Required indirectly / used

puppeteer, paynow, pdf-lib, archiver, @aws-sdk/client-s3, leaflet, fullcalendar, fortawesome, recharts, react-big-calendar, jspdf, xlsx, web-vitals, socket.io — **imported**.

### Uncertain

| Package | Why |
|---------|-----|
| `vite`, `webpack-cli`, babel/webpack loaders in client devDependencies | Vitest / leftover CRA eject tooling. Production build is `react-scripts`. |
| `tailwindcss` | Configured via postcss/tailwind.config; `@tailwindcss/forms` is a dep. Not listed as direct `tailwindcss` in dependencies (plugin is). |
| Root `@testing-library/*`, `vitest` | Tests may run from root; client has its own. |

**Do not uninstall during this audit.**

---

## Legacy Deployment Code

### Current (KEEP)

```
File: Dockerfile
Category: A
Usage: Multi-stage Node 20; builds CRA client + server; serves client from server/dist/public; PORT 8080; CMD node server/dist/index.js
Evidence: Matches .github/workflows/azure-deploy.yml docker build
```

```
File: .github/workflows/azure-deploy.yml
Category: A
Usage: Push to main/master → ACR → Azure App Service API + Worker, WEBSITES_PORT=8080
```

```
File: .github/workflows/node-build.yml
Category: A
Usage: CI build on PR/push
```

### Legacy / conflicting (DO NOT delete until Azure inventory confirms)

```
File: .github/workflows/azure-static-web-apps-brave-island-06cea4703.yml
Category: E Obsolete architecture (client-only Static Web App)
Usage: Still runs on push/PR to main; deploys client/build separately
Risk: HIGH if it overwrites a live SWA hostname that users still hit (API not bundled)
Evidence: skip_app_build after client npm run build; no server
Recommendation: Confirm whether brave-island SWA is still DNS-live. If not, disable workflow. Do not delete until confirmed.
```

```
File: .github/workflows/main_xihangulepm.yml
Category: E Obsolete (.NET App Service)
Usage: Jobs hard-disabled (`if: ${{ false }}`)
Risk: LOW
Evidence: ASP.NET Core 8, app name XihangulePM
Recommendation: Safe to archive/remove after team confirmation. Wrong stack.
```

```
File: .github/workflows/main_mantisafrica.yml
Category: B Manual duplicate container deploy
Usage: workflow_dispatch only; comment says duplicate of azure-deploy.yml
Risk: MEDIUM if dispatched against old ACR
Evidence: Hardcoded ACR xhihangule-awh3hparcbdpcnbw.azurecr.io, app mantisafrica
Recommendation: Keep as emergency manual until Azure confirms app is decommissioned.
```

```
File: azure-deploy.yml (repo root, not .github)
Category: E Older single-app workflow
Usage: Node 18, empty AZURE_ACR_NAME, single app Xhihangule-Property-Management
Risk: MEDIUM if GitHub still picks it up — it is NOT under .github/workflows so GitHub Actions will ignore it
Evidence: Root file, not in workflows folder
Recommendation: Move to docs/archive or delete as leftover template.
```

```
Folder: infrastructure/
Category: E Obsolete mirrored scaffold + committed nested node_modules
Usage: Not referenced by Dockerfile or GitHub Actions
Risk: LOW runtime; HIGH repo bloat / confusing “second app”
Evidence: Nested client/server copies; no .csproj; node_modules copies appeared in git status as lint.log deletions
Recommendation: Do not delete in this audit. Candidate for a dedicated “remove nested copies” PR after confirming nothing deploys from it.
```

No docker-compose, bicep, or ARM templates found at repo root (excluding node_modules).

---

## Legacy Environment Variables

No `.env.example` files exist. Classification from code references only. **Do not remove Azure settings from this audit.**

### Active (referenced by live index/worker/client CRA)

`NODE_ENV`, `PORT`, `ENV_FILE`, `APP_ROLE`, `ENABLE_SYNC_SCHEDULES`, `ENABLE_TRUST_BACKGROUND`, `ENABLE_STARTUP_MAINTENANCE`, `MONGODB_URI` / `MONGO_URI` / Cosmos variants, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `ALLOWED_ORIGINS`, `AWS_*`, `S3_BUCKET`, `SMTP_*`, `MAILTRAP_*`, `PAYNOW_*`, `WEBHOOK_SHARED_SECRET`, `REACT_APP_WS_URL`, `REACT_APP_SITE_URL`, `REACT_APP_SAAS_ONBOARDING_V2`, plus the accounting/sync tuning vars listed in `scheduledSyncService`, `paymentReconciliationQuery`, `jobLeaseService`.

### Legacy / unused in production boot

| Variable | File | Class | Notes |
|----------|------|-------|-------|
| `AUTH_MONGODB_URI` | authDatabase.ts | legacy | Split auth DB never started |
| `VITE_API_URL`, `VITE_PAYPAL_CLIENT_ID`, `VITE_DEBUG_PUBLIC_API` | client axios/publicApi | legacy under CRA | `import.meta` guards; CRA uses proxy / REACT_APP |
| `PAYPAL_CLIENT_ID` / secrets | paypalController | uncertain | Controller exists; route not mounted in index.ts |
| `APP_BASE_URL_MANTIS`, `SMTP_*_MANTIS` | email helpers | active or brand-specific | Do not remove |

### Uncertain

All Cosmos/Azure connection aliases, `FORCE_DB_URI`, `EXPOSE_DIAGNOSTICS`, `ALLOW_PUBLIC_SIGNUP`, `ACCOUNTING_PERIOD_LOCK_BEFORE`, `ALLOW_ACCOUNTING_INDEX_MIGRATION`.

---

## Legacy Database Fields

**Do not drop columns.** Historical documents and reports may still contain them.

| Field / model | Who writes | Who reads | Class | Risk |
|---------------|------------|-----------|-------|------|
| `Payment.accountingComplete` | reconciliation persist | integrity job, UI, tests | A Current | — |
| `Payment.accountingStatus` | reconciliation persist | integrity candidate filter | A Diagnostic | Do not treat as complete |
| `Payment.postingStatus` | Payment hooks / controllers | policy, immutability | A Lifecycle | Not accountingComplete |
| `Payment.accountingRetryCount` / `accountingNextAttemptAt` | mostly unset | index exists; no job reader | H Leftover retry | LOW |
| `User.balance` | unclear leftover | documented as not owner ledger | H | MEDIUM if displayed |
| `Company.revenue` | called out as not a ledger | reporting may still show | H | MEDIUM |
| PropertyAccount transactions | recordIncomeFromPayment | reports, recon | A Projection | Not SOT |
| JournalEntry / VatRecord | accountingIntegrationService | reports, recon | A Projection | Not SOT |
| RentalDeposit | ensureDepositLedgerFromPayment | recon | A Projection | Not SOT |
| AccountingException | integrity/recon | integrity UI | A Current | — |
| LedgerEvent | orchestrator, levy, sync failure | processor | A Current async | — |
| MigrationState | trust backfill etc. | admin backfill state | F | KEEP |
| ChartData | chartController | charts | A or G | KEEP until chart routes unused |

No unused **models** were proven with zero imports. Flagging a model as unused requires a dedicated pass; this audit did not delete-candidate any schema files.

---

## Migration / Recovery Scripts

**None of these were executed.**

| Script | npm / trigger | Modifies data? | Class | Recommendation |
|--------|---------------|----------------|-------|----------------|
| `server/src/scripts/reconcile.ts` | `reconcile:dry` / `reconcile:apply` | Yes on --apply (dedupe) | F | KEEP |
| `ledgerMaintenance.ts` | `ledger:maintain`; also startup once | Yes | F | KEEP |
| `backfillIdempotencyKeys.ts` | `ledger:backfill-keys` | Yes | F | KEEP |
| `backfillInspectionCompliance.ts` | inspections:backfill:* | Yes | F | KEEP |
| `migrateCompanyWorkspaceType.ts` | companies:workspace-type:* | Yes on --apply | F | KEEP |
| `migrateMaintenanceStatuses.ts` | manual | Yes | F | KEEP |
| `migrateOwnerOrmCollections.ts` | manual | Indexes | F | KEEP |
| `saasSafeIndexes.ts` | `saas:indexes` | Indexes | F | KEEP |
| `server/scripts/fix-agent-commission-duplicates.ts` | ad-hoc | Yes | F | DO NOT TOUCH / KEEP |
| `server/scripts/backfillLevyPeriods.ts` | ad-hoc | Yes | F | KEEP |
| `server/scripts/fix-payment-requests.js` | ad-hoc | Yes | F | KEEP |
| `server/scripts/setup-property-accounts.js` | ad-hoc | Yes | F | DO NOT TOUCH |
| `server/scripts/inspect-agent-account.ts` | read? | Uncertain | G | KEEP |
| `trustBackfillService.ts` | admin API | Yes | F | KEEP |
| Phase test scripts `runPhase2a/2b/2c/5b` | npm test:phase* | No (invariants) | A | KEEP — they protect current architecture |

---

## Test Cleanup Candidates

| Test | Protects current invariant? | Recommendation |
|------|-----------------------------|----------------|
| `runPhase2aSafetyTests.ts` | Job lease + deposit-only vs combined | KEEP |
| `runPhase2bCompletenessTests.ts` | Completeness / early exits | KEEP |
| `runPhase2cAccountingIntegrityTests.ts` | Integrity detection-only, GET no repair, combined payments | KEEP |
| `runPhase5bAccountingTests.ts` | Deposit-only, no GET backfill, webhook posting | KEEP |
| `runVatOnCommissionTests.ts` | VAT-on-commission | KEEP |
| `reporting/tests/*` | Statement/reporting | KEEP |
| `client/src/utils/paymentsChanged.test.ts` | UI change detection | KEEP |
| Disabled/skipped tests | No `.skip` / `xit` found in server phase scripts | — |

Do **not** delete “old phase” tests. They encode the current architecture rules.

---

## Documentation Cleanup

Misleading or stale comments (production risk if future sessions follow them):

| Location | Issue | Risk |
|----------|-------|------|
| `accountingIntegrationService.ts` “CompanyAccount is the commission-revenue source of truth” | Conflicts with Payment SOT | MEDIUM |
| `accountingPostingPolicy.ts` `COMPANY_REVENUE_SOURCE_OF_TRUTH` / `OWNER_INCOME_SOURCE_OF_TRUTH` constants | Name ledgers as SOT; they are projections | MEDIUM |
| `scheduledSyncService.ts` hourly_sync description “Hourly synchronization of payments and properties” | Implementation only `validateDataConsistency` | LOW |
| `hourly_sync` comments “This would be implemented” | Dead design notes | LOW |
| `PaypalCheckout.tsx` filename | Paynow, not PayPal | LOW |
| `package.json` server `"main": "dist/app.js"` | Production starts `dist/index.js` | MEDIUM |
| Root `azure-deploy.yml` | Looks like live CI; it is not under `.github/workflows` | LOW |
| `infrastructure/` tree | Looks like a second application | MEDIUM |
| Missing `.env.example` | New sessions guess env architecture | MEDIUM |

`audit-output/phase-5b5/PHASE_5B5_VERIFICATION_REPORT.md` is historical verification — keep as history, not current ops runbook.

---

## Recommended Cleanup Order

1. **Do not touch financial writers, models, or migration scripts.**
2. Wire or hide Accounting Integrity in `App.tsx` (product fix, not deletion).
3. Restrict automatic posting in `daily_sync` / `monthly_deep_sync` / `POST /api/sync/full` / `POST /api/sync/reconcile/payment/:id` after explicit approval.
4. Restrict `POST /api/accounting/migrations/backfill-balances` to system_admin.
5. Convert trust reconciliation to detection-only **or** document it as an approved exception.
6. Remove unused frontend pages/hooks listed as Definitely Unused.
7. Remove unused backend stubs (`companies.ts`, `settings.ts`, `database.ts`, unused paypal import).
8. Retire `app.ts` + `authRoutes.ts` after a diff.
9. Disable obsolete GitHub workflows after Azure DNS/app inventory.
10. Dependency uninstall last, one PR at a time, with build verification.
11. `infrastructure/` nested copies last (large, easy to get wrong).

---

## Recommended deletions

None in this pass. Candidates for a later **SAFE TO REMOVE** PR are listed below.

## Recommended deprecations

- Admin full sync posting accounting
- Admin `reconcile/payment/:id` as a second repair API
- Accountant property-account sync as silent backfill
- Accounting migrations/backfill-balances on accountant role
- PayPal routes (unmounted)
- Duplicate accountant dashboard shell
- postingStatus-as-accountingComplete (already documented; keep enforcing)

---

# Answers to the 14 required questions

### 1. What code is definitely dead?

Unused CRA-orphaned pages (Finance/Inventory dashboards, CompanyRegister, TestAuth, BillingUpgrade, root PropertiesPage/TenantsPage, duplicate Landing/About/Home/Register/NotFound/Unauthorized, old PropertyOwners page, unwired owner pages, `pages/payments/*`, old Communications.tsx), unused `Layout`/`Sidebar` pair, unused hooks `useApi` / `useApiRequest` / `useCachedRequest`, `client/src/main.tsx`, `pages/App.tsx`, server `database.ts`, unused `authRoutes.ts`, empty `companies.ts`/`settings.ts`, `testReportRoutes.ts` in production, and the unused `paypalRoutes` import in `index.ts`. Duplicate accountant folder shell is unused **as a router**, but it is the only file that currently registers Accounting Integrity.

### 2. What code is legacy?

`server/src/app.ts`; `databaseSyncService` full-sync posting; property-account sync/backfill; accounting journal backfill API; trust auto-repair job; weekly consistency auto-fixes; `authDatabase.ts`; root `azure-deploy.yml`; Static Web Apps workflow; disabled .NET workflow; `infrastructure/`; `PaypalCheckout` name; leftover Payment retry fields; `User.balance` meaning.

### 3. What code is duplicated?

Commission: calculator vs projection vs taxEngine. Two Express apps. Two auth route files. Two accountant dashboard shells. Two PaymentList components (one live). Three levy/report/settings UIs by role (intentional). `/payments` vs `/accountants/payments` vs `/admin/payments`. `/api/sync` vs `/accountants/property-accounts/sync` vs `/accountants/payments/:id/accounting/repair`.

### 4. What code could conflict with Payment → Accounting?

`syncAllPayments` / `verifyAndReconcilePaymentPosting`; `syncPropertyAccountsWithPayments`; `backfillFromExistingData`; trust job auto-post; comments treating CompanyAccount/PropertyAccount as source of truth; `taxEngine` independent VAT rate; any future use of `postingStatus` or `accountingStatus=partial` as complete. Integrity job itself does **not** conflict (detection-only).

### 5. What code can automatically modify financial records?

Daily/monthly sync; sync-failure reprocessor; trust reconciliation cron; trust event retry interval; LedgerEvent processor when real-time sync is on; weekly job archival/create of property account shells; maintenance queue when a sync job was enqueued. Integrity cron does **not** create ledger rows.

### 6. What code can backfill historical records?

`syncAllPayments`; `syncPropertyAccountsWithPayments`; `ensureDevelopmentLedgersAndBackfillPayments`; `backfillFromExistingData` + `backfillCompanyBalances`; `backfillMissingForAgent`; `trustBackfillService`; CLI/scripts listed above; admin reconcile-payment endpoint. Integrity job explicitly skips historical payments that never had `accountingComplete`/`accountingStatus`.

### 7. What code can create duplicate accounting?

Idempotency exists inside `recordIncomeFromPayment` and commission sync (tests assert second call does not add a second income row). Remaining duplicate risk: **two repair/sync entry points** posting the same payment (orchestrator vs `syncAllPayments` vs admin reconcile) if idempotency keys are missing on old rows — that is why `backfillIdempotencyKeys.ts` exists. `ledger_reconciliation` dedupes rather than creates.

### 8. What old APIs are still exposed?

`/api/sync/*` mutating routes; `/api/accounting/migrations/backfill-balances`; `/api/accountants/property-accounts/sync`; `/api/admin/backfill-trust-accounts`; development ledger ensure/backfill; frontend `/admin/payments`. PayPal `/api/paypal` is **not** mounted on production `index.ts`. Explicit repair `POST /accountants/payments/:id/accounting/repair` is current, not old.

### 9. What scheduled jobs are still active?

Registered in `scheduledSyncService` when `ENABLE_SYNC_SCHEDULES` is on (worker/all):

| Name | Schedule | Writes financial ledgers? | Required? |
|------|----------|---------------------------|-----------|
| daily_sync | `0 2 * * *` | YES (full payment sync) | Review — posting is not required for detection-only |
| hourly_sync | `0 * * * *` | NO (validation only) | Optional |
| ledger_reconciliation | `*/5 * * * *` | Dedupe only | Yes for duplicate cleanup |
| payment_accounting_integrity | `*/2 * * * *` | Flags only | **Yes** |
| weekly_consistency_check | `0 3 * * 0` | Account shells/archive | Review auto-fix |
| monthly_deep_sync | `0 4 1 * *` | YES (full sync) | Review |
| sync_failure_reprocessor | `*/5 * * * *` | Maybe | Review |
| trust reconciliation | `15 2 * * *` | YES (trust) | If trust is in production |
| maintenance queue | 5s | Only queued jobs | Yes as a queue |
| trust event retry | 60s | YES (trust) | If trust listener on |
| LedgerEvent 15s | only if real-time sync started | YES | Off by default |

### 10. What dependencies appear unused?

Server: `save`, `morgan`. Client: `@paypal/react-paypal-js`; likely unused direct `d3-*`. Root: React/MUI copies. Do not uninstall yet.

### 11. What Docker/Azure configuration appears obsolete?

Live: root `Dockerfile` + `.github/workflows/azure-deploy.yml` (API+worker). Obsolete/conflicting: Static Web Apps workflow, disabled .NET `main_xihangulepm.yml`, root `azure-deploy.yml` template, `infrastructure/` mirror, possibly manual `main_mantisafrica.yml`. No docker-compose in repo.

### 12. What should we safely remove first?

Non-financial orphans: unused pages list, unused hooks, empty route stubs, unused `paypalRoutes` import, `testReportRoutes` if `app.ts` is unused. Then unused `database.ts` / `authRoutes.ts` after a diff. Never start with accounting services.

### 13. What should absolutely NOT be removed?

Payment/accounting models and services (`paymentAccounting*`, orchestrator, policy, projection, propertyAccountService writers, agent/company account services, integrity job, explicit repair endpoint, LedgerEvent, AccountingException, migration/backfill scripts, Docker production file, `.github/workflows/azure-deploy.yml`, phase tests, trust services until product decision).

### 14. What should be deprecated before removal?

Admin full sync and reconcile-payment posting; accountant property-account sync as a silent repair; journal backfill-balances on accountant role; trust auto-repair (or document exception); PayPal API; duplicate accountant shell; Static Web App deploy; comments that call ledgers the source of truth.

---

# Cleanup plan buckets

### SAFE TO REMOVE

Clearly dead UI/hooks/stubs listed in Definitely Unused. Accounting Integrity is now routed in live `App.tsx`; the unused alternate accountant shell can be removed in a later cleanup PR. Empty `companies.ts` / `settings.ts`. Unused paypal import. `pages/App.tsx`. Unused hooks.

### REMOVE AFTER REVIEW

`app.ts`, `authRoutes.ts`, `database.ts`, `authDatabase.ts` (after Azure env check), unused frontend pages batch, root React dependencies, `save`/`morgan`/`@paypal/react-paypal-js`, disabled .NET workflow, root `azure-deploy.yml`, `infrastructure/` nested copies, Static Web Apps workflow (after DNS check).

### KEEP

Current payment completion posting via `ensurePaymentAccountingPosted` → orchestrator. Integrity job. Explicit repair API. Projection/reconciliation modules. Models. Phase tests (including Phase 2D). Production Dockerfile and azure-deploy workflow. Trust posting on live sale payment confirmation (`payment.confirmed` event + `trustEventRetryService`). Commission calculator at payment save.

### DEPRECATE

`POST /api/sync/full` payment posting; `POST /api/sync/reconcile/payment/:id`; `POST /property-accounts/sync` as general repair; `POST /accounting/migrations/backfill-balances` for accountants; nightly `daily_sync` owner-income loop; weekly auto-create accounts; PayPal routes; duplicate dashboard shell; ledger-as-SOT comments.

### DO NOT TOUCH

Any migration/repair/backfill script execution; schema field removal; Cosmos/Azure env vars; `propertyAccountService.recordIncomeFromPayment` itself (still the writer); journal/VAT/deposit models; production Docker/App Service pairing until inventory is complete; financial tests.

---

**End of original audit. No deletions were performed in the audit pass.**

# Financial Write-Path Lockdown — Phase 2

**Date:** 8 September 2026  
**Scope:** Disable automatic historical accounting reconstruction. Wire live Accounting Integrity route. Fix Phase 2B TEST 10 without weakening the duplicate pass-through invariant.  
**Not in scope:** Deleting unused files, uninstalling packages, running migrations, modifying production data.

## Decision summary

| Path class | Status after Phase 2 |
|------------|----------------------|
| CURRENT AUTHORITATIVE POSTING | Payment completion → `ensurePaymentAccountingPosted` / `postPaymentAccounting` → projection writers → `reconcilePayment` → `accountingComplete` |
| DETECTION-ONLY RECONCILIATION | Integrity job; daily/monthly payment sync; `/api/sync/reconcile/payment/:id`; weekly consistency; trust nightly job |
| EXPLICIT MIGRATION TOOL | Property-account sync; development ledger ensure; journal backfill-balances; CLI/scripts; admin trust backfill API |
| TRUST-SPECIFIC EXCEPTION | Live `payment.confirmed` posting + `trustEventRetryService` retry of **failed original events**. Nightly historical scan does **not** auto-repair. |

## Financial write paths found

| Entry point | Trigger | Writes financial records? | Automatic? | Historical? | Authoritative pipeline? | After Phase 2 |
|-------------|---------|---------------------------|------------|-------------|-------------------------|---------------|
| `paymentController` / `paymentService` / webhooks / `agentController` | Payment create/complete | Yes | On live completion | No | Yes — `ensurePaymentAccountingPosted` | KEEP |
| `paymentAccountingOrchestrator.postPaymentAccounting` | Called by completion + repair + LedgerEvent | Yes | Only as retry of live completion | No | **Yes — single writer** | KEEP |
| `propertyAccountService.recordIncomeFromPayment` | Orchestrator; explicit migration helpers | Yes | No (after lockdown) | Only if migration API used | Writer used by orchestrator | KEEP writer |
| `agentAccountService.syncCommissionForPayment` | Orchestrator | Yes | Live completion / LedgerEvent | No | Yes | KEEP |
| `accountingIntegrationService.postCompanyCommission` | Orchestrator only | Yes | Live completion / LedgerEvent | No | Yes | KEEP |
| `accountingIntegrationService.syncPaymentReceived` | Orchestrator | Yes | Live completion | No | Yes | KEEP |
| `ensureDepositLedgerFromPayment` | Completion + explicit repair | Yes | Live completion | No | Yes | KEEP |
| `ledgerEventService.processPending` | 15s when real-time sync started; orchestrator enqueue | Yes | Retry of live completion | No | Yes — calls orchestrator | KEEP |
| Change stream `handlePaymentChange` | Insert or status/postingStatus update to completed | Yes | If real-time sync enabled | Historical untracked skipped | Yes — orchestrator | KEEP (live only) |
| `pollPaymentChanges` | Real-time polling fallback | No posting | Observes only | No | No | Disabled posting |
| `syncAllPayments` / `performFullSync` / daily_sync / monthly_deep_sync | Cron 02:00 / monthly / POST `/api/sync/full` | Flags only (`accountingComplete`, `AccountingException`) | Yes | Tracked incomplete only | Detection | **Disabled posting** |
| `verifyAndReconcilePaymentPosting` / `POST /api/sync/reconcile/payment/:id` | Admin UI | Flags only | No | Per payment | Detection | **Deprecated read-only** |
| `sync_failure_reprocessor` payment type | Cron every 5 min | No accounting | Yes | Could be old failures | No | **Payment retries skip posting** |
| `POST /accountants/property-accounts/sync` | Admin/system_admin + confirm + reason | Yes | No | Yes | Migration | **Restricted** |
| `syncPropertyAccountsWithPayments` | Maintenance queue after explicit POST | Yes | Only if queued | Yes | Migration | KEEP explicit |
| `POST .../developments/ensure-ledgers` | Admin/system_admin + confirm + reason | Yes | No | Yes | Migration | **Restricted** |
| `POST /accounting/migrations/backfill-balances` | system_admin + confirm + reason | Yes (journal/VAT/balances) | No | Yes | Migration | **Restricted** |
| `backfillFromExistingData` | That API only | Yes | No | Yes | Migration | KEEP service |
| `POST /accountants/payments/:id/accounting/repair` | Accountant, confirm + reason | Yes, missing only | No | One payment | **Authorised repair** | KEEP |
| Integrity `runPaymentAccountingIntegrityPass` | Cron every 2 min | Payment flags + exceptions only | Yes | Tracked incomplete | Detection | KEEP |
| Weekly `executeWeeklyConsistencyCheck` | Cron Sunday 03:00 | No | Yes | N/A | Detection | **No auto-fix** |
| `attemptConsistencyFixes` / `fixMissingPropertyAccounts` | Unused by weekly; archival still on admin POST `/api/sync/fix/*` | Shells/archive | Only explicit admin POST | N/A | Operational maintenance | KEEP functions; not auto |
| Trust `runCompanyReconciliation` | Cron 02:15 | Result row only | Yes | Sale payments | Detection | **No emitEvent / no balance write** |
| `trustEventRetryService` | 60s | TrustTransaction | Retry of failed live event | No | Trust domain | KEEP — not rental accounting |
| `trustPaymentPostingService` | `payment.confirmed` from live sale completion | TrustTransaction | On live sale payment | No | Trust domain | KEEP |
| GET payment / GET property account / GET integrity | HTTP GET | No | N/A | N/A | Read-only | KEEP |

`recordIncomeFromPayment` remaining callers: orchestrator, `syncPropertyAccountsWithPayments` (explicit API), `ensureDevelopmentLedgersAndBackfillPayments` (explicit API).  
`postCompanyCommission` remaining caller: orchestrator only.

## What was disabled

- Daily/monthly/`performFullSync` owner-income posting, company-commission posting, and LedgerEvent enqueue from historical payment scans.
- `/api/sync/reconcile/payment/:id` ledger writes.
- Payment-type `SyncFailure` automatic accounting retry.
- Polling fallback posting of accounting for recently updated completed payments (prevents integrity flag writes from triggering repair).
- Change-stream posting except live insert or status/postingStatus completion; historical untracked payments skipped.
- Weekly automatic create/archive of property accounts.
- Trust nightly auto-emit of `payment.confirmed` and auto-update of `runningBalance`.
- Accountant UI auto-sync of property accounts on empty list.

## What was restricted

- Property-account sync: `admin` or `system_admin`, `confirm=true`, non-empty `reason`, `AdminAuditLog`.
- Development ledger backfill: same.
- Journal/VAT `backfill-balances`: `system_admin`, confirm, reason, audit.
- Accountant Property Accounts empty-state now links to Accounting Integrity instead of syncing.

## What remains (and why)

- **Orchestrator + LedgerEvent:** live completion must still post exactly-once projections. Retries mean “ensure Payment X projections exist”, not “create another transaction” (idempotency keys).
- **Explicit repair:** `POST /api/accountants/payments/:id/accounting/repair` with `confirm=true`, `dryRun=false`, non-empty `reason`.
- **Explicit migration APIs:** remain for authorised historical operations; they are not reconciliation.
- **Trust live posting + event retry:** Trust is a separate legal-deposit domain. Failed live `payment.confirmed` events may retry. Nightly scan does not reconstruct missing trust from all historical sales.
- **Admin `/api/sync/fix/orphaned-accounts`:** still archives orphaned shells when an admin POSTs. Not scheduled.
- **Daily `syncAllProperties`:** still updates property-account **metadata/shells** (not payment projections). Remaining operational risk; not payment reconstruction.

## Accounting Integrity UI

Live route added in `client/src/App.tsx`:

`/accountant-dashboard/accounting-integrity` → `AccountingIntegrityPage`

Sidebar and DashboardOverview already navigated there. The unused folder shell `AccountantDashboard/AccountantDashboard.tsx` was not deleted.

## Phase 2B TEST 10

`recordPassThroughCollection` no longer uses `if (!inserted)`. It uses atomic `pushPassThroughTransactionAtomic` and `if (pushed === 'duplicate') { return account; }`.

That is the same invariant: a duplicate collection returns the already-loaded account and does not call `getPropertyAccount`. Production behaviour was correct; the test regex was obsolete. The test now accepts the current `pushed === 'duplicate'` contract (and still rejects a `getPropertyAccount` reload).

## Tests added

`server/src/scripts/runPhase2dWritePathLockdownTests.ts` (`npm run test:phase2d`) locks the forbidden automatic writers.

## Remaining risks (future decisions)

1. Daily/monthly full sync still runs `syncAllProperties` / `syncPropertyMetadata` (account shells, not payment lines).
2. Explicit migration APIs can still mass-post if an admin confirms — by design.
3. `POST /api/sync/full` still exists; payment side is detection-only, property metadata still writes.
4. Agent `POST /agent-accounts/:id/sync-commissions` was not changed in this pass (not identified as a scheduled historical scanner).
5. Real-time sync, if enabled in production, still posts via orchestrator on live completion.
6. Unused files, Docker/Azure cleanup, and dependency uninstalls remain separate tasks.

---

## Phase 3A — Dead Code Cleanup

**Date:** 9 September 2026  
**Scope:** Confirmed dead-code deletion only. No accounting redesign, no migrations, no production data changes, no dependency uninstalls, no deployment changes.

### Files removed

| File | Why definitely unused | Evidence |
|------|------------------------|----------|
| `client/src/pages/AccountantDashboard/AccountantDashboard.tsx` | Alternate nested accountant shell with its own `<Routes>` | Live shell is `pages/AccountantDashboard.tsx` (imported by `App.tsx`). No import of the nested file. Accounting Integrity is registered in live `App.tsx`. |
| `client/src/pages/App.tsx` | Stub; not the CRA app | `router.tsx` / `index.tsx` import `./App` (`src/App.tsx`). Zero imports of `pages/App`. |
| `client/src/main.tsx` | Alternate Vite bootstrap | CRA entry is `src/index.tsx`. No filename/import references. `vite.config.ts` is empty. |
| `client/src/pages/FinanceDashboard/index.tsx` | Orphan page | Not in `App.tsx`; no imports/routes/nav. |
| `client/src/pages/InventoryDashboard/index.tsx` | Orphan page | Same. |
| `client/src/pages/CompanyRegister.tsx` | Orphan page | Same. Live signup is `pages/Signup`. |
| `client/src/pages/TestAuth.tsx` | Orphan page | Same. |
| `client/src/pages/BillingUpgrade/index.tsx` | Orphan page | Same. Live billing is `pages/Billing/BillingSetup`. |
| `client/src/pages/PropertiesPage.tsx` | Duplicate unused root page | Live: `IndividualDashboard/pages/PropertiesPage` and `SalesDashboard/PropertiesPage`. |
| `client/src/pages/TenantsPage.tsx` | Duplicate unused root page | Live: `pages/Tenants/Tenants`. |
| `client/src/pages/Landing/LandingPage.tsx` | Duplicate unused landing | Live: `pages/LandingPage/index.tsx` via `import('./pages/LandingPage')`. |
| `client/src/pages/About/About.tsx` (+ `.css`) | Orphan | No route/import. |
| `client/src/pages/Home/Home.tsx` (+ `.css`) | Orphan | No route/import. |
| `client/src/pages/Register/Register.tsx` (+ `.css`) | Orphan | Live: `/signup` → `Signup`. |
| `client/src/pages/NotFound/NotFound.tsx` (+ `.css`) | Orphan | No route/import. |
| `client/src/pages/Unauthorized/Unauthorized.tsx` | Orphan | No route/import. |
| `client/src/pages/PropertyOwners/PropertyOwnersPage.tsx` | Duplicate unused | Live: `admin/AdminPropertyOwnersPage`, `agent/AgentPropertyOwnersPage`. |
| `client/src/pages/owner/OwnerReports.tsx` | Unwired owner pages | Live owner UI is `components/owner/OwnerDashboard`. No imports of these files. |
| `client/src/pages/owner/OwnerPayments.tsx` | Same | Same. |
| `client/src/pages/owner/OwnerProperties.tsx` | Same | Same. |
| `client/src/pages/payments/Payments.tsx` | Duplicate unused | Live: `pages/PaymentsPage.tsx` + `components/payments/PaymentList`. |
| `client/src/pages/payments/PaymentList.tsx` | Duplicate unused | Same. |
| `client/src/pages/Communications/Communications.tsx` | Unused stub | Live: `Communications/CommunicationsPage.tsx` (AdminDashboard). Components kept. |
| `client/src/components/Layout/Layout.tsx` | Unused generic layout | Dashboards use Admin/Accountant/Agent/Sales sidebars. Barrel `Layout/index.ts` only exported this. |
| `client/src/components/Layout/Sidebar.tsx` | Only imported by unused Layout | Same. |
| `client/src/components/Layout/index.ts` | Barrel for unused Layout | No `from '.../components/Layout'` imports (Header/sidebars imported by path). |
| `client/src/components/Layout/Layout.css` | Orphan CSS | Zero references. |
| `client/src/hooks/useApi.ts` | Exported, never imported | Grep only hit the defining file. |
| `client/src/hooks/useApiRequest.ts` | Same | Same. |
| `client/src/hooks/useCachedRequest.ts` | Same | Same. |
| `server/src/routes/companies.ts` | Empty unmounted stub | Not imported by `index.ts`/`app.ts`/tests. Live: `companyRoutes.ts`. |
| `server/src/routes/settings.ts` | Empty unmounted stub | Same. |
| `server/src/index.ts` (import only) | Dead `paypalRoutes` import | Imported, never `app.use`. File `paypalRoutes.ts` **kept**. |

### Tests / builds

**Baseline (before deletion):** server `tsc` PASS; Phase 2A/2B/2C/2D/2.1/5B/reporting/VAT all passed.

**After deletion:** server `tsc` PASS; `npx tsc --noEmit` (client) PASS; Phase 2A/2B/2C/2D/2.1/5B/reporting/VAT all passed; `paymentsChanged` 7/7 passed.

### Deliberately left untouched

- Live `client/src/pages/AccountantDashboard.tsx` and all `AccountantDashboard/*` feature pages
- `CommunicationsPage` and chat/contractor components
- `Header.tsx` and role sidebars
- `pages/LandingPage/` (live landing)
- `server/src/app.ts`, `authRoutes.ts`, `database.ts`, `authDatabase.ts`, `testReportRoutes.ts`, `paypalRoutes.ts`
- All accounting writers, migration/repair endpoints, Docker/Azure, package.json dependencies

### Phase 3B candidates (duplicate / unused-but-not-proven-or-still-referenced)

- Duplicate Express app `server/src/app.ts` (`package.json` `"main"` only)
- Duplicate auth router `server/src/routes/authRoutes.ts` vs `auth.ts`
- Legacy `server/src/database.ts` / `config/authDatabase.ts`
- `testReportRoutes.ts` (mounted only in unused `app.ts`)
- `paypalRoutes.ts` / PayPal product (unmounted in production)
- `client/src/pages/AccountantDashboard/index.tsx` barrel (named re-exports; App imports subpaths)
- `client/src/hooks/useSocket.ts` (no imports found; not in original definitely-unused list)
- Duplicate commission/VAT calculators, overlapping payment APIs — **do not consolidate yet**
- Unused npm packages (`save`, `morgan`, `@paypal/react-paypal-js`, root React copies)
- Azure/Docker/Static Web Apps leftovers

## Phase 3B — Duplicate Runtime & Backend Surface Consolidation

**Date:** 9 September 2026
**Status:** PASS WITH DOCUMENTED RISKS

Phase 3B established one production HTTP runtime (`server/src/index.ts`) and removed only surfaces proven unused. Accounting writers were not modified. Auth behavior of the live router (`server/src/routes/auth.ts`) was not changed. PayPal packages were not uninstalled.

### Production bootstrap verification

Traced from `package.json`, `Dockerfile`, `.github/workflows/azure-deploy.yml`, `.github/workflows/node-build.yml`, `server/src/index.ts`, `server/src/worker.ts`. No `docker-compose` file at the repository root.

| Surface | Entry point | Used in production? | Used in tests? | Used by Docker? | Used by Azure? | Status |
| ------- | ----------- | ------------------: | -------------: | --------------: | -------------: | ------ |
| HTTP | `server/src/index.ts` → `node dist/index.js` | Yes (`npm start`, `start:prod`) | Phase scripts import services, not this HTTP listener | **CMD `node server/dist/index.js`** | Same image deployed to API App Service | **AUTHORITATIVE** |
| Worker dedicated | `server/src/worker.ts` → `npm run start:worker` / `start:prod:worker` | Intended worker | No | Same image; default CMD is still `index.js` | Worker App Service gets the same image; **startup command is not in the repo** (may use `APP_ROLE=worker` on `index.ts` or an App Setting override) | **KEEP** |
| Development | `server` `npm run dev` → `ts-node-dev … src/index.ts`; root `npm start` concurrently server+client | No | — | — | — | `index.ts` |
| Tests / CLI | `server/package.json` scripts (`ledger:maintain`, phase tests, reconcile, etc.) | Manual | Yes | No | No | KEEP |
| Legacy Express | `server/src/app.ts` | **No process executed it** | **No** | **No** (CMD is `index.js`; `tsc` no longer emits `app.js`) | **No** | **DELETED** |
| Root `"main"` | `"index.js"` | Metadata only | — | — | — | Irrelevant |
| Server `"main"` | was `"dist/app.js"`; now `"dist/index.js"` | Does **not** affect `npm start` or Docker CMD | — | — | — | Retargeted because `"main"` would otherwise point at a file no longer produced from source |

`index.ts` is the only source that `listen()`s (`httpServer.listen` when `runtimeFeatures.runHttpServer`). `app.ts` exported an Express app and never listened. `app.ts` imported `connectDatabase` from `./config/database` but never called it.

Azure: `.github/workflows/azure-deploy.yml` builds the Dockerfile image, sets `WEBSITES_PORT=8080`, deploys the same image to API and Worker. It does not reference `app.ts` / `dist/app.js`. Worker command is **not** set in YAML.

### `app.ts` conclusion

**Dead.** Deleted after proving:

- no importer (`from './app'`, `require('./app')`, `node dist/app`, tests, scripts, Docker, GitHub Actions);
- production and development start `index.ts` / `dist/index.js`;
- `"main": "dist/app.js"` was npm metadata, not the process entry.

Unique mounts that existed **only** on `app.ts` (not on `index.ts`):

| Route/service/middleware | Mounted by `app.ts` | Also mounted by `index.ts`? | Required by production? | Action |
| ------------------------ | ------------------: | --------------------------: | ----------------------: | ------ |
| `GET /api/reports/test` (inline ping) | Yes | No (`index.ts` has `GET /api/test` instead) | No | Deleted with `app.ts` |
| `/api/test-reports` → `testReportRoutes` | Yes | No | No | Deleted with `testReportRoutes.ts` |
| `/api/paypal` → `paypalRoutes` | Yes | No (3A already removed the unused import from `index.ts`) | Not mounted on production HTTP | **File kept** (product decision out of scope) |
| `/api/auth` via `./routes/auth` | Yes | Yes (`/api/auth` and session `/auth`) | Yes, via `index.ts` | Live router kept |
| Remaining route set (accountants, payments, owners, etc.) | Subset of `index.ts` | Yes, and `index.ts` mounts additional accounting/sync/trust/webhooks/admin | Via `index.ts` | Kept on `index.ts` |
| CORS / JSON / cookieParser / request-id | Yes | `index.ts` has CORS + helmet + compression + body limits + rate limits | Via `index.ts` | Kept on `index.ts` |
| `checkDatabaseConnection` middleware | Yes | `index.ts` uses `databaseReadinessGate` + `connectDatabase()` | Via `index.ts` | Kept on `index.ts` |
| `errorHandler` | Yes | Yes | Via `index.ts` | Kept |
| `connectDatabase` import | Imported, **never called** | Called at startup | Via `index.ts` | Kept `config/database.ts` |

### Auth router conclusion

| Auth surface | Mounted by | Used by production? | Used by tests? | Endpoints | Status |
| ------------ | ---------- | ------------------: | -------------: | --------- | ------ |
| `server/src/routes/auth.ts` | `index.ts` at `/api/auth` and session router `/auth`; previously also `app.ts` | **Yes** | No dedicated HTTP auth suite; frontend static callers match these paths | `POST /login`, `/signup`, `/refresh-token`, `/forgot-password`, `/reset-password`, `/logout`; `GET /me`; `GET /test` (404 in production) | **CANONICAL — kept** |
| `server/src/routes/authRoutes.ts` | **Nobody** (zero imports) | No | No | `/me`, `/login`, `/logout`, `/refresh-token`, `/verify-token` (no signup/forgot/reset). Cookie `domain: '.xhihangule.com'` | **DELETED as unreachable duplicate.** Not merged: behavior differed. |

Frontend (`AuthContext`, `axios`, Forgot/Reset password) calls `/auth/login|signup|me|refresh-token|logout|forgot-password|reset-password` with `baseURL` ending in `/api` → `/api/auth/*` on the canonical router. No caller of `/verify-token`. `AuthService` remains live via `authController`, `onboardingController`, and `middleware/auth`.

Consolidation: **deleted the unmounted router only.** Live `auth.ts` / `authController` behavior unchanged.

### Database wrapper conclusion

| File | Callers | Runtime effect | Production use | Test use | Safe to delete? |
| ---- | ------- | -------------- | -------------: | -------: | --------------: |
| `server/src/config/database.ts` | `index.ts`, `worker.ts`, scripts, models, `authService`, health | Canonical Mongo/Mongoose connect | **Yes** | Scripts | **KEEP** |
| `server/src/config/databaseConfig.ts` | `databaseService.ts` (used by payment/sync/repos) | Pool/config helper | Yes (indirect) | Indirect | **KEEP** |
| `server/src/database.ts` | **None** in `server/src` | Would `dotenv.config()` and connect a **different** URI helper (`xhihangule` local DB); `process.exit(1)` on max reconnect — never imported so never ran | No | No | **DELETED** |
| `server/src/config/authDatabase.ts` | **No callers** of `connectAuthDatabase` | Separate URI `AUTH_MONGODB_URI` | Unknown in Azure App Settings (not inspectable from repo) | No | **KEEP for 3C** |

### `testReportRoutes` conclusion

Mounted only by unused `app.ts`. Ping/health stubs only. No tests, CI, frontend, or scripts. **Deleted** after `app.ts`.

### PayPal conclusion

**UNMOUNTED**

Evidence:

- Production `index.ts` does not `app.use` `paypalRoutes` (3A removed the unused import).
- After deleting `app.ts`, **no remaining mount**.
- Frontend `PaypalCheckout.tsx` uses Paynow (`/paynow/web/create`) and cash, not `/api/paypal`.
- `index.ts` CSP still allowlists `paypal.com` / `paypalobjects.com`.
- `paypalController.ts` still reads `PAYPAL_*` env vars; `systemAdminExpansionController` treats `PAYPAL_CLIENT_ID` as a payment-config signal.
- `paypalRoutes.ts` and PayPal npm packages **kept**. No product decision. No uninstall.

### AccountantDashboard barrel conclusion

`client/src/pages/AccountantDashboard/index.tsx` re-exported Levy/Deposit pages and imported `AccountantPaymentsPage` without exporting it.

`App.tsx` uses `import('./pages/AccountantDashboard')`, which resolves to the **file** `client/src/pages/AccountantDashboard.tsx` (live layout), and child pages via **subpaths**. No import of the barrel.

**Deleted the barrel only.** Live `AccountantDashboard.tsx` and feature pages were not modified.

### Files deleted

| File | Proof of zero required references |
| ---- | --------------------------------- |
| `server/src/app.ts` | No importer; not Docker/Azure/npm start/dev; never `listen()` |
| `server/dist/app.js` | Tracked compile of deleted source; Docker `COPY server/` would have kept a stale executable; CMD does not run it |
| `server/src/routes/testReportRoutes.ts` | Only importer was `app.ts` |
| `server/dist/routes/testReportRoutes.js` | Compile of deleted source |
| `server/src/routes/authRoutes.ts` | Zero imports; frontend does not call its unique `/verify-token` |
| `server/dist/routes/authRoutes.js` | Compile of deleted source |
| `server/src/database.ts` | Zero imports; side effects never ran |
| `server/dist/database.js` | Compile of deleted source |
| `client/src/pages/AccountantDashboard/index.tsx` | No imports; App uses `AccountantDashboard.tsx` + subpaths |

`server/package.json` `"main"` retargeted `dist/app.js` → `dist/index.js` (not cosmetic: after deleting `app.ts`, `"main"` would name a missing compile output). `"main"` still does not select the Azure/Docker process.

### Files deliberately retained

- `server/src/index.ts` / `worker.ts` — production HTTP and dedicated worker
- `server/src/routes/auth.ts` + `authController` + `AuthService` — canonical auth
- `server/src/config/database.ts`, `databaseConfig.ts`, `databaseService.ts` — live DB path
- `server/src/config/authDatabase.ts` — uncalled, but `AUTH_MONGODB_URI` may exist in Azure; uncertain → keep
- `server/src/routes/paypalRoutes.ts` + `paypalController.ts` + PayPal packages — UNMOUNTED, not a product kill
- Nested `client/src/pages/AccountantDashboard/*` feature pages and live `AccountantDashboard.tsx`
- All accounting writers listed in §1 of this phase

### Tests

Baseline (before deletion): server `tsc` PASS; Phase 2A/2B/2C/2D/2.1/5B/reporting/VAT passed; `paymentsChanged` 7/7.

After deletion: server `tsc` PASS; same phase scripts passed; client `npx tsc --noEmit` PASS; `paymentsChanged` 7/7. Client production `react-scripts build` **completed**: “Compiled with warnings” (pre-existing unused-var ESLint / `import.meta`); “The build folder is ready to be deployed.” Elapsed ~22 minutes. Not a timeout.

No automated register/login HTTP tests exist. Auth regression was static: frontend `/api/auth/*` → `routes/auth.ts` only.

### Accounting impact

Authoritative accounting path unchanged.
No accounting writer removed.
No new accounting writer introduced.
No accounting calculation changed.

Post-change caller scan of `recordIncomeFromPayment`, `postCompanyCommission`, `syncCommissionForPayment`, `syncPaymentReceived`, `ensureDepositLedgerFromPayment`, `postPaymentAccounting`, `ensurePaymentAccountingPosted`, `reconcilePayment`, `repairPaymentAccounting` matches the Phase 2.1 orchestrator path.

### Remaining Phase 3C candidates

- Duplicate commission/VAT calculators; overlapping payment APIs
- `authDatabase.ts` / `AUTH_MONGODB_URI` (no in-repo caller; Azure env unknown)
- PayPal UNMOUNTED routes, CSP allowlist, `paypalController`, `@paypal/react-paypal-js`
- Azure worker **startup command** not in repo (same image as API)
- Root `azure-deploy.yml`; Static Web Apps workflow; disabled .NET workflow; `infrastructure/`
- Unused npm packages (`save`, `morgan`)
- `client/src/hooks/useSocket.ts`
- Nested `client/src/pages/AccountantDashboard/AccountantDashboard.tsx` (App uses the sibling **file** `pages/AccountantDashboard.tsx`; do not touch without a dedicated unused-page proof)
- Property duplicate reconcile POSTs without Case B confirm (from Phase 2.1)

### Production safety

No production data modified. No migration executed. No accounting repair executed. No financial records deleted. No deployment performed.

## Phase 3C — Duplicate Accounting & Payment Implementation Consolidation

**Date:** 9 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

No financial formulas, Payment schema, accounting semantics, production data, migrations, deployments, or package uninstalls were changed. Disagreeing calculators were **not** merged. Only a proven-unused client hook was deleted.

Frozen architecture remained:

```text
Payment
   ↓
ensurePaymentAccountingPosted
   ↓
postPaymentAccounting
   ↓
projection writers
   ↓
reconcilePayment
   ↓
accountingComplete
```

### Duplicate inventory

| Capability | Implementation | Callers | Production reachable? | Historical capable? | Canonical? | Action |
| ---------- | -------------- | ------- | --------------------: | ------------------: | ---------: | ------ |
| Rental commission/VAT snapshot | `calculatePropertyCommission` via `CommissionService.calculateForProperty` | `paymentController` lease create, accountant create, public create, finalize; unmounted `services/paymentService.createPayment` | Yes (accountant/lease/public) | No (payment-time only) | **Yes — live rental** | KEEP |
| Rental commission without VAT | `CommissionService.calculate` (`vatOnCommission: false`) | `agentController.createAgentPayment`; `createSalesPaymentAccountant`; `buildSaleCommissionDetails` | Yes (agent rental + sales) | No | Wrapper over canonical, VAT forced off | KEEP; discrepancy vs VAT-on rental path |
| Unrounded split fallback | `computeCommissionFallback` | sales create catch path only | Yes (error fallback) | No | No | KEEP; disagrees on rounding |
| Inline agent update split | `updateAgentPayment` arithmetic | agent PUT, only if amount changes | Yes for non-completed/provisional | No | No | KEEP; gated by immutability for completed |
| Sale commission + sale VAT overlay | `buildSaleCommissionDetails` / sales create | sales create, draft update, correction draft | Yes | No | **Yes — live sale** (separate domain) | KEEP |
| Agent lane projection | `commissionProjection.projectCommissionLanes` | `syncCommissionForPayment` | Yes | Yes (reads Payment snapshot) | **Yes — posting lanes** | KEEP; does not recalculate |
| Trust/sale tax | `taxEngine` (`calculateVATOnSale`, `calculateCommissionVAT`, CGT) | `trustAccountService` only | Yes (trust) | Trust settlement | **Yes — trust/sale tax** | KEEP separate |
| Invoice line tax | `calculateTaxBreakdown` | `invoiceController` | Yes (invoices) | No | Invoice domain | KEEP; not rental VAT |
| Unmounted payment writes | `server/src/services/paymentService.ts` | **None** | No | Would reverse accounting on fail | Duplicate of controller path | KEEP (DEAD/UNMOUNTED) |
| Live accounting orchestrator | `ensurePaymentAccountingPosted` → `postPaymentAccounting` | all live Payment completions + webhook + unmounted service | Yes | Repair reuses it | **Yes** | KEEP |
| Historical agent commission catch-up | `syncCommissionTransactions` → `syncCommissionForPayment` | POST agent-accounts sync endpoints | Yes (explicit confirm+reason) | Yes | Same writer as live | KEEP; not a second engine |
| Auth split DB | `authDatabase.ts` / `AUTH_MONGODB_URI` | **No in-repo callers** | Unknown (Azure App Settings not inspectable) | N/A | No | KEEP (POTENTIALLY EXTERNAL) |
| PayPal HTTP | `paypalRoutes` / `paypalController` | Unmounted | Frontend checkout is Paynow/cash | N/A | No | KEEP (UNMOUNTED) |
| Socket hook | `client/src/hooks/useSocket.ts` | Zero | No | N/A | No | **DELETED** |
| Socket runtime | `client/src/config/socket.ts` | Header, `usePropertyAccountLiveRefresh`, server `getIo()` | Yes | N/A | Yes | KEEP |

### Commission architecture

Canonical **new/live rental** calculator:

`propertyCommissionCalculator.calculatePropertyCommission` → `CommissionService.calculateForProperty` → `toPaymentCommissionSnapshot` / `applyLevyPassThroughToSnapshot` → `Payment.commissionDetails`.

Formula (unchanged): commission on `grossRent - levy`; optional exclusive/inclusive VAT on that commission; PREA then agent/agency split of **net** commission; `roundMoney` at each step.

| Implementation | Input | VAT | PREA | Agent split | Rental/sale | Caller |
| -------------- | ----- | --- | ---- | ----------- | ----------- | ------ |
| `calculateForProperty` | property rent/VAT flags, company splits, tax-rate lookup | Property `vatOnCommission` + treatment + dated rate | Company config (default 3%) | Company 60/40 remaining | Rental live | Accountant, lease, public, finalize |
| `CommissionService.calculate` | amount + percent + companyId | **Always off** | Company config | Company 60/40 | Agent rental; sale base | Agent POST; sales |
| `computeCommissionFallback` | amount + 15% | None | Default 3% | Default 60/40 | Sale catch | Unrounded |
| Inline `updateAgentPayment` | new amount × property % | None | Company config | Company 60/40 | Agent PUT | Unrounded; completed blocked |
| `buildSaleCommissionDetails` | sale gross, optional sale VAT inclusive | Sale VAT stripped first; commission VAT exclusive overlay | Via `.calculate` | Then development `agentSplit` | Sale | Draft/correction |
| `projectCommissionLanes` | `Payment.commissionDetails` | None (read) | None | Sale owner/collaborator lanes | Posting | Orchestrator |

**Formulas are not identical.** Documented numeric disagreement (not merged):

- Canonical `roundMoney((333.33 * 15) / 100) = 50`; `computeCommissionFallback` yields `49.9995`.
- Agent live create uses `.calculate()` so rental VAT-on-commission properties get **zero VAT** on that path; accountant/lease/public use `calculateForProperty` and persist VAT. Same Payment type, different snapshots if `Property.vatOnCommission` is true.
- Webhook **create** stores zeroed `commissionDetails` then calls `ensurePaymentAccountingPosted` (no calculator).

STOP condition honoured: no calculator was chosen or rewritten.

Canonical for **new accountant/lease/public rental Payments:** `calculateForProperty`. Canonical for **posting** remains `Payment.commissionDetails` (never recalculated by `syncCommissionForPayment`).

### VAT architecture

| VAT calculation | Source | Used by | Domain | Canonical |
| --------------- | ------ | ------- | ------ | --------- |
| Rental commission VAT (exclusive/inclusive) | `calculatePropertyCommission` `vatAmount` stored as `commissionDetails.vatOnCommission` | Live rental creates that use `calculateForProperty` | Rental commission | **Yes** |
| Rental commission VAT skipped | `CommissionService.calculate` | Agent rental create | Same domain, different path | Discrepancy; KEEP |
| Sale VAT on sale price | `vatIncluded` / `vatAmount` on Payment (`gross - gross/(1+rate)`) | Sales create / `buildSaleCommissionDetails` | Trust/sale tax | Sale-price VAT |
| VAT on sale commission | exclusive `totalCommission * rate` overlay | Sales create | Sale commission | Sale-path overlay |
| Trust CGT / VAT on sale / VAT on commission | `taxEngine` | `trustAccountService.generateTaxSummary` | Trust/sale | **Yes — trust** (must stay separate) |
| Combined VatRecord | `commissionDetails.vatOnCommission + payment.vatAmount` | `accountingIntegrationService.upsertPaymentVatRecord` via orchestrator journal | Projection | Writer, not calculator |
| Invoice tax | `calculateTaxBreakdown` default 15% | Invoices | Invoicing | Separate |
| Company VAT rate table | `taxRateService.getVatRateForDate` | Commission VAT lookup | Rate source | KEEP |
| Dashboard VAT status | `accountingService.getVatStatus` | GET `/api/accounting/vat-status` | Reporting | Read |

Trust/sale tax engine was **not** merged with rental commission VAT.

### Payment creation/completion

| Route | Controller | Service | Financial writes | Frontend | Backend | Status |
| ----- | ---------- | ------- | ---------------- | -------- | ------- | ------ |
| `POST /api/payments` | `paymentController.createPayment` | CommissionService + orchestrator | Payment + `ensurePaymentAccountingPosted` | `paymentService.createPayment` (PaymentsPage non-agent) | — | LIVE AUTHORITATIVE (lease) |
| `POST /api/payments/public` | `createPaymentPublic` | same | same | unused/low | — | LIVE (auth required) |
| `PATCH /api/payments/:id/status` | `updatePaymentStatus` | orchestrator on complete | status + post | yes | — | LIVE; completed cannot un-complete |
| `POST /api/accountants/payments` | `createPaymentAccountant` | `calculateForProperty` + orchestrator | Payment + deposit + post | Accountant/admin/individual | — | **LIVE AUTHORITATIVE rental** |
| `POST /api/accountants/sales-payments` | `createSalesPaymentAccountant` | `.calculate` + sale VAT overlay + orchestrator | Payment + post | SalesPaymentsPage | — | LIVE AUTHORITATIVE sale |
| `PUT /api/accountants/payments/:id/status` | same `updatePaymentStatus` | orchestrator | complete → post | yes | — | LIVE |
| `POST /api/accountants/payments/:id/finalize` | `finalizeProvisionalPayment` | `calculateForProperty` + orchestrator | mutate provisional then post | yes | bulk finalize | LIVE (provisional exception) |
| `POST /api/accountants/payments/:id/reverse` | `reversePayment` | reverse orchestrator | reversal Payment + reverse projections | yes | — | LIVE AUTHORITATIVE |
| `POST /api/accountants/payments/:id/accounting/repair` | `repairPaymentAccountingExplicit` | `postPaymentAccounting` | explicit repair | Accounting Integrity UI | — | EXPLICIT REPAIR |
| `GET /api/accountants/payments/:id/accounting` | `getPaymentAccountingReconciliation` | `reconcilePayment` only | none | yes | — | detection-only |
| `POST /api/agents/payments` | `createAgentPayment` | `.calculate` (VAT off) + orchestrator | Payment + deposit + post | `agentService.createPayment` | — | LIVE; VAT discrepancy |
| `PUT /api/agents/payments/:id` | `updateAgentPayment` | inline calc if amount changes | update if not completed | yes | — | LIVE; immutability gated |
| `POST /api/webhooks/payment-confirmation` | `handlePaymentConfirmationWebhook` | zeros commission if create | Payment + post | — | webhook | LIVE; calculator bypass on create |
| `POST /api/sync/reconcile/payment/:paymentId` | `reconcilePaymentPosting` | detection-only | none | — | admin | deprecated detection |
| `server/src/services/paymentService.ts` `createPayment` | unimported | `calculateForProperty` + orchestrator | would write | none | none | DEAD/UNMOUNTED |
| Levy/municipal/billing/cash/Paynow | other controllers | not Payment rental engine | other collections | yes | — | out of Payment SSOT |

Call chains for live completion (all use orchestrator):

```text
createPaymentAccountant / createPayment / createPaymentPublic / createAgentPayment
 / createSalesPaymentAccountant / finalizeProvisionalPayment / updatePaymentStatus(completed)
 / webhook completed
   → ensurePaymentAccountingPosted
     → postPaymentAccounting
       → recordIncomeFromPayment
       → syncCommissionForPayment
       → postCompanyCommission
       → syncPaymentReceived (journal + VatRecord)
     → reconcilePayment → persist integrity flags
```

**No live Payment completion bypasses `ensurePaymentAccountingPosted`.** Webhook create bypasses the **commission calculator** (zeros), not the orchestrator. Flagged, not rewritten.

Idempotency: accountant/agent/public/lease accept `Idempotency-Key`; sales generate client-side keys; webhook uses `WebhookEventReceipt`; commission writer skips existing lanes (`isCommissionLaneAlreadyPosted`). Not identical across paths; not changed.

### Payment immutability

Intact on live mounted paths:

- `assertCompletedPaymentFinanciallyImmutable` / `isCompletedFinancialPayment` on agent update, accountant update, status update.
- Payment `pre('save')` blocks `PAYMENT_FINANCIAL_FIELDS` on completed non-provisional documents.
- Reverse → reversal Payment → correction draft remains the correction workflow.

Documented inconsistency (**not fixed**): query-update middleware allows `vatIncluded` / `vatRate` / `vatAmount` keys through, while `pre('save')` treats them as financial. Unmounted `services/paymentService.updatePaymentStatus` can mark completed → failed and call `reversePaymentAccounting` without the 409 immutability guard.

### GET financial writes

Payment/property/agent GET handlers do not call `recordIncomeFromPayment`, `syncCommissionForPayment`, `postCompanyCommission`, `ensureDepositLedgerFromPayment`, `postPaymentAccounting`, or `ensurePaymentAccountingPosted`.

`GET /api/accountants/payments/:id/accounting` calls detection-only `reconcilePayment`.

Documented GET side-effect (**not payment reconstruction**): `GET /api/accounting/dashboard-summary` calls `initializeForCompany`, which upserts default chart-of-accounts / company balance (`$setOnInsert`). Operational seed, not historical Payment posting.

### Accounting write API classification

| Endpoint | Class |
| -------- | ----- |
| Live Payment creates/completes above | LIVE AUTHORITATIVE |
| `POST /api/accountants/payments/:id/accounting/repair` | EXPLICIT REPAIR |
| `POST /api/accountants/agent-accounts/sync` | EXPLICIT MIGRATION (confirm+reason; `syncCommissionForPayment`) |
| `POST /api/accountants/agent-accounts/:agentId/sync-commissions` | EXPLICIT MIGRATION |
| `POST /api/accountants/property-accounts/sync` | EXPLICIT MIGRATION / maintenance |
| `POST /api/accountants/property-accounts/migrate-legacy-ledgers` | EXPLICIT MIGRATION |
| `POST /api/accountants/property-accounts/developments/ensure-ledgers` | EXPLICIT MIGRATION |
| `POST /api/accountants/property-accounts/:propertyId/reconcile-duplicates` | OPERATIONAL MAINTENANCE (Case B still without confirm from 2.1) |
| `POST /api/accountants/property-accounts/:propertyId/merge-duplicates` | OPERATIONAL MAINTENANCE |
| `POST /api/accounting/journal/manual` | LIVE AUTHORITATIVE (manual journal) |
| `POST /api/accounting/migrations/backfill-balances` | EXPLICIT MIGRATION (`replayExisting` can `backfillFromExistingData`) |
| `POST /api/accounting/tax-rates` | OPERATIONAL MAINTENANCE (rate table) |
| Trust buyer-payment / settlement / tax-deduction / transfer / close | TRUST-SPECIFIC |
| `POST /api/sync/full`, schedule mutations | OPERATIONAL MAINTENANCE (detection-oriented after 2.D) |
| `POST /api/sync/reconcile/payment/:id` | detection-only (deprecated) |
| Property expense / payout / opening balance; agent penalty / payout | LIVE AUTHORITATIVE (non-Payment) |
| `GET /api/accounting/dashboard-summary` COA seed | OPERATIONAL MAINTENANCE (GET side-effect) |

No new historical reconstruction engine was added. Agent sync still uses `syncCommissionForPayment`, not a separate commission writer.

### Auth database

**KEEP.** Class: **POTENTIALLY EXTERNAL / UNKNOWN.**

`connectAuthDatabase` / `AUTH_MONGODB_URI` have **zero in-repo callers** (controllers, index, worker, Docker, GitHub workflows, azure-deploy.yml). Azure App Settings still cannot be inspected. Deleting would risk an external URI that this repo cannot rule out.

### PayPal

**UNMOUNTED** (Phase 3D candidate). Not deleted.

- `index.ts` does not import or `app.use` `paypalRoutes`.
- `paypalController.ts` still reads `PAYPAL_*`.
- CSP still allowlists paypal.com / paypalobjects.com.
- Frontend `PaypalCheckout` is Paynow + cash (`/paynow/web/create`); no `@paypal/react-paypal-js` import.
- Package `@paypal/react-paypal-js` retained. Env `VITE_PAYPAL_CLIENT_ID` / `REACT_APP_PAYPAL_CLIENT_ID` still present. `PAYPAL_CLIENT_ID` still a system-admin payment-config signal.

### Socket infrastructure

`client/src/hooks/useSocket.ts` had zero imports, dynamic imports, or tests. **Deleted.**

`client/src/config/socket.ts` remains in use (`Header.tsx`, `usePropertyAccountLiveRefresh.ts`). Server socket.io remains. Not removed.

### Files deleted

| File | Evidence |
| ---- | -------- |
| `client/src/hooks/useSocket.ts` | Repo search: only the file itself. Socket runtime used via `config/socket.ts`. After delete: no remaining `useSocket` references. Server+client typecheck and Phase 3C test assert the file is absent. |

### Files retained (selected)

- All commission/VAT calculators (disagree; STOP)
- `server/src/services/paymentService.ts` (zero importers; financial write path; DEAD but KEEP)
- `authDatabase.ts` (Azure unknown)
- PayPal routes/controller/packages/CSP
- Agent VAT-off create path (live)
- Webhook zero-commission create (live)
- Trust taxEngine
- Socket config/server

### Discrepancies discovered (not fixed)

1. Agent rental create omits rental commission VAT; accountant/lease/public include it.
2. `computeCommissionFallback` does not `roundMoney`; canonical does.
3. Agent update inline split is unrounded and VAT-free (completed payments blocked).
4. Webhook may create Payments with zero commission then post accounting.
5. Query-update vs `pre('save')` VAT field immutability mismatch.
6. Unmounted `paymentService.updatePaymentStatus` lacks the 409 completed guard.
7. GET dashboard seeds COA.
8. Idempotency key handling differs by payment path.

### Tests

New: `server/src/scripts/runPhase3cDuplicateConsolidationTests.ts` (live path → orchestrator; GET no payment writers; historical sync uses `syncCommissionForPayment`; immutability; idempotent commission lanes; calculator disagreement locked; PayPal/auth unmounted; `useSocket` absent).

| Test | Result |
| ---- | ------ |
| Server build (`tsc`) | PASS |
| Client TypeScript (`npx tsc --noEmit`) | PASS |
| Client build (`react-scripts build`) | PASS (compiled with pre-existing warnings: unused-var ESLint / `import.meta`) |
| Phase 2A | PASS |
| Phase 2B | PASS |
| Phase 2C | PASS |
| Phase 2D | PASS |
| Phase 2.1 | PASS |
| Phase 5B | PASS |
| Reporting | PASS |
| VAT | PASS |
| paymentsChanged | PASS (7/7) |
| Phase 3C | PASS |

### Phase 3D candidates

- PayPal cleanup (routes, controller, CSP, npm, env, checkout filename)
- Unused deps: `save`, `morgan`, `@paypal/react-paypal-js` if product-killed
- Unmounted `server/src/services/paymentService.ts` after confirming no dynamic loader
- `authDatabase.ts` after Azure App Settings confirmation
- Azure workflows, `azure-deploy.yml`, Static Web Apps, `infrastructure/`, Dockerfile leftovers
- Nested unused AccountantDashboard page
- Property duplicate reconcile POSTs without Case B confirm
- Optional later: align agent VAT path with `calculateForProperty` **only as an explicit financial-behaviour change**, not cleanup

### Production safety

No production data modified. No migrations executed. No accounting repair executed. No financial records deleted. No deployment performed.

## Phase 3D — Legacy Financial Path Cleanup & Maintenance Hardening

**Date:** 9 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

Financial formulas, Payment schema, accounting semantics, commission/VAT discrepancies, webhook zero-commission create, and Azure resources were not changed. Only proven-dead unmounted Payment write code was deleted. Property ledger maintenance was hardened with existing Case B confirm/reason/audit.

### 3D-A — Unmounted `paymentService.ts`

**Deleted.**

| File | Reason | Evidence | Runtime |
| ---- | ------ | -------- | ------- |
| `server/src/services/paymentService.ts` | Duplicate unmounted Payment write path (create + unsafe status update) | Zero imports in `index.ts`, `worker.ts`, controllers, routes, jobs, scripts (except tests that read the file). No `import()`, `require()`, or string loader. Client `services/paymentService.ts` is a different frontend API client. Docker `CMD` is `node server/dist/index.js`. | Not loaded by production HTTP or worker |
| `server/dist/services/paymentService.js` | Compile of deleted source; Docker `COPY server/` would otherwise keep a stale executable | Tracked compile output of the unmounted module | CMD does not run it |

After deletion: no remaining `services/paymentService` imports in `server/src`. Phase 3C/3D tests assert the source file is absent and mounted completion still calls `ensurePaymentAccountingPosted`.

### 3D-B — Property duplicate reconcile/merge

Endpoints unchanged in path; mutation now blocked without Case B:

```text
POST /api/accountants/property-accounts/:propertyId/reconcile-duplicates
POST /api/accountants/property-accounts/:propertyId/merge-duplicates
```

| Control | Implementation |
| ------- | -------------- |
| Auth | Existing `router.use(auth)` + `canViewCommissions` (admin, accountant, principal, prea). Not narrowed to `isAdminOrSystemAdmin` because accountants operate the live merge UI. |
| confirm + reason | `requireExplicitMigrationConfirmation` (same helper as property/agent sync). Missing confirm or empty reason → 400, no mutation. |
| Audit | `startMigrationAudit` / `finishMigrationAudit` → `AdminAuditLog` (`maintenance:property_reconcile_duplicates`, `maintenance:property_merge_duplicates`) with actor, propertyId, reason, confirm, result. |
| GET | Routes remain POST-only. |
| Algorithm | `reconcilePropertyLedgerDuplicates` / `mergeDuplicateAccounts` unchanged. |

Frontend: `mergeDuplicatesForProperty` now requires `{ confirm: true, reason }`. Property account detail merge button uses `window.confirm` + `window.prompt` (same pattern as agent commission sync). Cancel/empty reason does not call the API.

### 3D-C — Auth database

**Retained.** Class: POTENTIALLY EXTERNAL / UNKNOWN.

`AUTH_MONGODB_URI` / `connectAuthDatabase` appear only in `server/src/config/authDatabase.ts` (and its dist compile). Absent from Dockerfile, GitHub workflows, `azure-deploy.yml`. Azure App Settings still not inspectable. No dynamic invocation found. Not deleted.

### 3D-D — PayPal

**Retained.** Class: UNMOUNTED / LEGACY BUT SUPPORTED.

Not conclusively abandoned: `paypalRoutes`/`paypalController` exist; CSP still allowlists PayPal; `PAYPAL_*` / `VITE_PAYPAL_CLIENT_ID` / `REACT_APP_PAYPAL_CLIENT_ID` remain; checkout route `/checkout/paypal` still exists (Paynow/cash UI). `@paypal/react-paypal-js` has no frontend import. HTTP routes remain unmounted. No uninstall.

### 3D-E — Azure / Docker / workflows

**No deletions.** Topology from repo:

```text
API image CMD: node server/dist/index.js  (Dockerfile)
API + Worker App Services receive the same ACR image (azure-deploy.yml)
Worker startup command is NOT in workflow YAML (Azure App Setting / portal)
```

Kept: Dockerfile, `.github/workflows/*` (including disabled .NET workflow and Static Web Apps), `infrastructure/`. Worker `APP_ROLE` is not set in YAML.

### 3D-F — Dependencies

| Package | Source usage | Action |
| ------- | ------------ | ------ |
| `morgan` | No `server/src` import | KEEP (uninstall would rewrite lockfile) |
| `save` | No import | KEEP (lockfile) |
| `@paypal/react-paypal-js` | No frontend import; PayPal surface retained | KEEP |

### 3D-G — Nested AccountantDashboard

No additional dead nested files. Live layout is `client/src/pages/AccountantDashboard.tsx`. Folder pages are all lazy-imported from `App.tsx`. Nested `AccountantDashboard/AccountantDashboard.tsx` was already removed in Phase 3B (working tree).

### Accounting safety

Payment remains SSOT. `ensurePaymentAccountingPosted` remains authoritative. No second accounting engine. No automatic historical repair. `accountingComplete` unchanged. Payment immutability unchanged.

### Financial behaviour

No commission/VAT/rounding/owner/split/deposit/trust formula changes. Agent VAT discrepancy, fallback rounding, webhook zeros, query-update VAT immutability, and idempotency differences left for Phase 4.

### Tests

New: `server/src/scripts/runPhase3dLegacyCleanupTests.ts`.

| Test | Result |
| ---- | ------ |
| Server build | PASS |
| Client TypeScript | PASS |
| Client production build | PASS (compiled with pre-existing warnings) |
| Phase 2A | PASS |
| Phase 2B | PASS |
| Phase 2C | PASS |
| Phase 2D | PASS |
| Phase 2.1 | PASS |
| Phase 5B | PASS |
| Reporting | PASS |
| VAT | PASS |
| paymentsChanged | PASS (7/7) |
| Phase 3C | PASS |
| Phase 3D | PASS |

### Remaining risks

- Azure App Settings not inspectable (`AUTH_MONGODB_URI`, worker startup command).
- PayPal product status unresolved (unmounted HTTP, residual CSP/env/packages).
- Same Docker image for API and Worker; worker `APP_ROLE` not in YAML.
- `morgan` / `save` unused in source but still installed.
- Reconcile/merge still authorized via `canViewCommissions` (accountant dashboard roles), not `isAdminOrSystemAdmin`.
- Phase 3C financial-behaviour discrepancies unchanged.

### Phase 4 candidates (not implemented)

These items were implemented in **Phase 4 — Financial Behaviour Alignment & Integrity Hardening** below. Remaining optional item:

- Optional: narrow reconcile/merge roles if product decides accountants should not run ledger merge

### Production safety

No production data modified. No migration executed. No accounting repair executed. No financial records deleted. No deployment performed. No Azure resources modified.

## Phase 4 — Financial Behaviour Alignment & Integrity Hardening

**Date:** 9 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

This phase intentionally changed live financial behaviour in five scoped workstreams. Payment remains the source of truth. `Payment.commissionDetails` remains the posting snapshot. The posting layer was not given a calculator. No historical Payments were repaired. No production indexes, migrations, or deployments were performed.

```text
Payment
   ↓
ensurePaymentAccountingPosted
   ↓
postPaymentAccounting
   ↓
projection writers
   ↓
reconcilePayment
   ↓
accountingComplete
```

### Workstream results

| Workstream | Result | Financial change |
| ---------- | ------ | ---------------- |
| 4A Rental commission VAT | PASS | Agent **rental** create now uses `calculateForProperty` with Property VAT flags |
| 4B Commission rounding | PASS | `computeCommissionFallback` now uses `roundMoney` at the same split stages as the canonical calculator |
| 4C Webhook commission | PASS WITH DOCUMENTED EXCEPTION | Rental properties (`management` / `introduction`) snapshot canonical commission on create; sale/unknown remain zero-commission sale receipts |
| 4D Payment immutability | PASS | Query-update rejects `PAYMENT_FINANCIAL_FIELDS` on completed non-provisional Payments; `paymentMethod` added to that list |
| 4E Idempotency | PASS | Sales create now honours `Idempotency-Key` / body key and persists it; webhook `WebhookEventReceipt` unchanged |

### Exact financial changes

#### 4A — Rental commission VAT

Canonical rule confirmed from `propertyCommissionCalculator`, `CommissionService.calculateForProperty`, Property VAT fields, `taxRateService.getVatRateForDate`, and existing VAT tests:

> A rental Payment's commission VAT treatment depends on the property/company VAT configuration and effective tax rate, not on which UI/API route created it.

`CommissionService.calculate` remains the VAT-off wrapper for **sale** paths. Agent `POST /api/agents/payments` now branches: rental → `calculateForProperty`; sale → existing `.calculate()`.

Evidence (15% commission, default 3/60/40 split):

| Scenario | Base | Commission | VAT | Agent | Agency | Owner |
| -------- | ---: | ---------: | --: | ----: | -----: | ----: |
| Rent 1,000 VAT off | 1,000 | 150 | 0 | 87.3 | 58.2 | 850 |
| Rent 1,000 exclusive VAT 15.5% | 1,000 | 150 | 23.25 | 87.3 | 58.2 | 826.75 |
| Rent 1,000 inclusive VAT 15.5% | 1,000 | net 129.87 | 20.13 | — | — | 850 |
| Gross 1,100 levy 100 VAT off | 1,000 | 150 | 0 | 87.3 | 58.2 | 950 |

Before: agent rental path stored VAT-on-commission as 0. After: same snapshot as accountant/lease/public/finalize for identical property inputs.

#### 4B — Commission rounding

| Scenario | Before | After | Expected |
| -------- | -----: | ----: | -------: |
| 333.33 × 15% | 49.9995 fallback | 50.00 | 50.00 |
| PREA 3% of 50 | unrounded | 1.50 | 1.50 |
| Agent 60% remaining | unrounded | 29.10 | 29.10 |
| Agency 40% remaining | unrounded | 19.40 | 19.40 |
| Owner | unrounded | 283.33 | 283.33 |

Sale calculator and sale VAT overlay were not merged into the rental calculator.

#### 4C — Webhook commission snapshot

Webhook payload has company, property, and amount, but not sale VAT flags or development splits. If `Property.rentalType` is `management` or `introduction`, create uses `calculateForProperty` and does not emit trust. Sale/unknown properties keep the previous zero-commission sale receipt. Duplicate events still return `Duplicate webhook ignored` via `WebhookEventReceipt`.

#### 4D — Completed-payment immutability

Query-update (`updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`) now rejects `PAYMENT_FINANCIAL_FIELDS` (including `vatIncluded` / `vatRate` / `vatAmount` / `commissionDetails`) on completed non-provisional Payments. `paymentMethod` was added to `PAYMENT_FINANCIAL_FIELDS` so `save()` matches the existing query-update protected key. Notes, accounting flags, and reverse → correction remain allowed.

#### 4E — Idempotency

Sales create now reads `Idempotency-Key` / body `idempotencyKey`, short-circuits on an existing Payment, persists the key, and replays on duplicate-key (E11000). Other authenticated routes already did this. Webhook still uses `WebhookEventReceipt`. No new production index was created.

### Remaining risks

- Webhook sale/unknown creates still persist a zero commission snapshot and may post owner income of the full receipt. Sale commission was not guessed.
- Agent `PUT` amount recalc remains unrounded and VAT-off; completed Payments are blocked, and query-update already rejects `amount` on all Payments.
- Agent rental create still does not apply the accountant introduction “commission once” rule.
- Historical agent VAT-off Payments were not repaired.

### Phase 5 candidates (not implemented)

- Product decision for webhook sale receipts (provisional vs explicit sale commission flags on the payload).
- Align agent update commission recalc if non-completed amount edits are restored via `save()`.
- Optional: apply introduction commission-once on the agent rental path if product confirms it should match accountant.

### Production safety

No production data modified. No migration executed. No historical repair executed. No financial records deleted. No production index created. No deployment performed. No Azure resources modified.

## Phase 5 — Financial Transaction Rules & Production Readiness

**Date:** 9 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

Phase 5 implemented sale Payment completeness, one-time Introduction commission, provisional agent update alignment, and production-readiness tests. 5D historical discrepancy detection was not implemented. No historical Payments were repaired. No production indexes, migrations, or deployments were performed.

```text
Payment
   ↓
ensurePaymentAccountingPosted
   ↓
postPaymentAccounting
   ↓
projection writers
   ↓
reconcilePayment
   ↓
accountingComplete
```

`postPaymentAccounting` still does not calculate commission. Introduction allocation is applied when the Payment snapshot is built, then posted from that snapshot.

### 5A — Sale Payment completeness

Authoritative fields (existing schema, no new fields):

| Concept | Field |
| ------- | ----- |
| Sale price | `Payment.amount` (error key `salePrice`) |
| Commission | `commissionDetails.totalCommission` (must be > 0) |
| Required splits | `commissionDetails.agentShare`, `commissionDetails.agencyShare` |
| Development splits | `commissionDetails.agentSplit.ownerAgentShare` / `collaboratorAgentShare` only when `agentSplit` is present |

Validator: `server/src/services/salePaymentCompleteness.ts` (`validateSalePaymentCompleteness`, HTTP 400 `SALE_PAYMENT_INCOMPLETE` with `missing[]`).

Protected routes:

- `POST /api/accountants/sales-payments`
- Accountant create when `paymentType === 'sale'`
- `PUT /api/accountants/sales-payments/:id` when completing a sale
- Agent sale create
- Webhook create when `Property.rentalType` is `sale` / `sales`

Before: a sale webhook or zero-commission payload could persist `commissionDetails.totalCommission = 0` as a completed sale. After: incomplete sales are rejected before `new Payment()`; the webhook receipt is `failed`, not `processed`.

Unknown `rentalType` is not classified as a sale (`WEBHOOK_PAYMENT_TYPE_UNKNOWN`).

### 5B — Introduction commission once

State is derived from completed Payment snapshots: sum of `commissionDetails.commissionBase` where `totalCommission > 0`. Deposit-only Payments are ignored.

VAT-off numerical examples (one month rent = 1,000):

| Scenario | Commission | Owner rent | Levy / trust |
| -------- | ---------: | ---------: | ------------ |
| Deposit 1,000 + rent 1,000 | 1,000 | 0 | Deposit → trust |
| Second month rent 1,000 | 0 | 1,000 | — |
| Advance 3,000 | 1,000 | 2,000 | — |
| Deposit 1,000 + rent 3,000 | 1,000 | 2,000 | Deposit → trust |
| Partial 600 then 400 | 600 then 400 | 0 then 0 | Satisfied after 1,000 |
| Rent 1,000 + levy 100 | 1,000 | 0 | Levy 100 pass-through (`ownerAmount` 100; owner-income projection 0) |

Introduction uses `calculateForProperty` with `commissionPercentage: 100` on the consumed rent only, then leftover rent is added to `ownerAmount`. Management percentage is unchanged.

Outstanding rent/levy: `computeOutstandingForLease` in `outstandingLeaseCalculation.ts`. While Introduction remaining > 0, only the remaining Introduction amount is outstanding (first month). After satisfied, later unpaid months are ordinary owner/levy arrears. Advance-covered months are not unpaid. Management range logic is unchanged.

### 5C — Agent non-completed update

Provisional / non-completed amount edits now regenerate `commissionDetails` via `calculateForProperty` (rental, including Introduction) or `CommissionService.calculate` (sale), then `payment.save()`. Completed Payments remain blocked. Provisional posting remains `not_applicable`, so the snapshot is recalculated without projection reconstruction.

### Production safety

No production data modified. No historical Payments repaired. No migration executed. No production index created. No accounting repair executed. No financial records deleted. No Azure resources modified. No deployment performed.

### Documented risks

- Historical Introduction Payments still used property commission % on the first payment; they are not repaired. Future payments consume remaining `commissionBase` toward one month's rent.
- Webhook Introduction tracking is per `tenantId`/`payerId`. A new payer id on the same property will not see prior Introduction consumption.
- Sale webhook completeness is built from `amount` + `Property.commission` + company splits (VAT-off, same as default sales create). Sale VAT / development collaborator splits are still not on the webhook payload; if those are required for a specific sale, the webhook is rejected rather than guessed.

## Phase 6 — Introduction Lifecycle, VAT-inclusive Commission & Financial Integrity Hardening

**Date:** 10 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

Phase 6 scopes Introduction to `tenantId + propertyId + leaseId` and extracts VAT from one month's rent when Introduction VAT is enabled. Management commission and Sale completeness are unchanged. No historical Payments were rewritten.

```text
Introduction:
- one-time commission
- one month's rent
- tenant + property + lease scoped
- deposit excluded from Introduction
- levy excluded from Introduction
- advance rent consumes Introduction first
- remaining advance rent belongs to owner
- subsequent rental is 100% owner rental
- VAT, when enabled, is included within the one-month Introduction amount
- VAT is extracted from the gross Introduction amount
- VAT is not added on top
```

Canonical path is unchanged:

```text
Payment completion
→ ensurePaymentAccountingPosted
→ postPaymentAccounting
→ projection writers
→ reconcilePayment
→ applyReconciliationOutcome
→ accountingComplete
```

### 6A — Lease-specific identity

Live Introduction Payments resolve context via `resolveIntroductionLeaseContext` (`introductionLeaseContext.ts`). Consumption is loaded only from completed Payments with the same `companyId + tenantId + propertyId + leaseId`.

- Missing tenant/property → `INTRODUCTION_CONTEXT_INCOMPLETE` with `missing[]`
- Missing or ambiguous lease → `INTRODUCTION_LEASE_REQUIRED` with `missing: ["leaseId"]`
- Tenant/property do not match the selected lease → `INTRODUCTION_CONTEXT_MISMATCH` with `mismatches[]`
- Terminated/expired/inapplicable lease → `INTRODUCTION_LEASE_NOT_APPLICABLE`
- Unique applicable lease for tenant+property may be used; multiple applicable leases are never auto-picked
- `payerId` is not the Introduction identity
- Historical Payments without `leaseId` are not counted toward a new lease and are not backfilled

Target rent is `lease.rentAmount || lease.monthlyRent`, else `property.rent`. Deposit, levy, payment amount, and payer ID are not used as the target.

### 6B — VAT-inclusive Introduction

`calculatePropertyCommission({ commissionType: 'introduction' })` forces inclusive VAT when VAT is enabled:

```text
gross = Introduction amount consumed this Payment (max remaining of one month's rent)
net  = roundMoney(gross / (1 + vatRate))
vat  = roundMoney(gross - net)
totalCommission = gross
```

Example: rent 1,000, VAT 15.5% → net `roundMoney(1000 / 1.155)`, VAT `roundMoney(1000 - net)`, total 1,000. Not 1,155.

Management exclusive VAT is unchanged (`totalCommission` remains net; VAT is added on top of management commission).

### Allocation

| Scenario | Introduction | Owner rental | Other |
| -------- | ------------ | ------------ | ----- |
| Deposit 1,000 + rent 1,000 | 1,000 | 0 | Deposit → trust |
| Second month rent 1,000 | 0 | 1,000 | — |
| Advance 3,000 | 1,000 | 2,000 | Future months follow existing advance rules |
| Partial 600 then 400 | 600 then 400 | 0 | Remaining 400 then 0 |
| Rent 1,000 + levy 100 | 1,000 | 0 | Levy 100 pass-through |

### Outstanding rental

KPI remaining key is `propertyId:tenantId:leaseId`. Payments without `leaseId` are treated as legacy and do not consume a lease's Introduction remaining. After remaining is 0, later unpaid months are ordinary rental arrears.

### Historical safety

No historical Payments modified. No Introduction lease-id backfill. No automatic repair. No production data changed. No production index created. Detection of projection mismatch still sets `accountingComplete = false` without rewriting financial fields.

### Tests

`npm run test:phase6` — `server/src/scripts/runPhase6IntroductionLifecycleTests.ts`

## Phase 7 — Financial Integrity & Production Readiness Hardening

**Date:** 10 September 2026

**Status:** PASS WITH DOCUMENTED RISKS

Phase 7 is audit + detect + harden + test. It does not migrate, backfill, or automatically repair historical financial data.

```text
PAYMENT
   ↓
CANONICAL ACCOUNTING ORCHESTRATOR
   (ensurePaymentAccountingPosted → postPaymentAccounting)
   ↓
ACCOUNTING PROJECTIONS
   ↓
REPORTS / DASHBOARDS

Payment              = authoritative transaction snapshot
Accounting collections = deterministic projections linked to Payment._id
Reports              = derived views
Reconciliation       = detection
Repair               = explicit / manual only
```

`accountingComplete` remains binary accounting truth. `accountingStatus` remains diagnostic. `postingStatus` remains lifecycle state. They are not interchangeable.

### 7A — Live financial write paths

| Path | Source | Orchestrator | Projection | Status |
| ---- | ------ | ------------ | ---------- | ------ |
| Rental (accountant / agent / lease / public / finalize / status) | Payment | `ensurePaymentAccountingPosted` | yes | LIVE_CANONICAL |
| Introduction | Payment (same rental create paths + lease context) | canonical | yes | LIVE_CANONICAL |
| Management commission | Payment `commissionDetails` → projection writers | canonical | yes | LIVE_CANONICAL |
| Sale | Payment | canonical after `SALE_PAYMENT_INCOMPLETE` gate | yes | LIVE_CANONICAL |
| Webhook | Payment | canonical on completed | yes | LIVE_CANONICAL |
| Trust / deposit | Payment / `payment.confirmed` + `ensureDepositLedgerFromPayment` | existing approved trust path | yes | LIVE_CANONICAL (trust domain) |
| LedgerEvent retry | failed live completion | `postPaymentAccounting` | yes | LIVE_CANONICAL retry |
| Change stream `handlePaymentChange` | completed insert/status | `postPaymentAccounting` (idempotent) | yes | LIVE_CANONICAL if real-time sync enabled |
| Property-account sync / development ensure-ledgers | explicit admin POST | `recordIncomeFromPayment` | yes | EXPLICIT_MAINTENANCE |
| Per-Payment repair | POST `.../payments/:id/accounting/repair` | `repairPaymentAccounting` | missing only | EXPLICIT_MAINTENANCE |
| Journal `JournalEntry.create` | `accountingService.postTransaction` | orchestrator journal lane | yes | LIVE_CANONICAL |
| `new PropertyAccount` | `getOrCreatePropertyAccount` | ledger ensure for projection writers | yes | LIVE_CANONICAL / EXPLICIT_MAINTENANCE |
| GET `/api/accounting/dashboard-summary` | COA + CompanyBalance seed | `initializeForCompany` only | n/a | Approved GET seed exception (not expanded) |

No live endpoint creates a Payment and then writes owner / commission / income ledgers outside the orchestrator.

### Suspicious / classified writers

| File | Function | Endpoint | Classification | Action |
| ---- | -------- | -------- | -------------- | ------ |
| `propertyAccountService.ts` | `recordIncomeFromPayment` | not a public endpoint | LIVE_CANONICAL writer | Kept; controllers must not call it |
| `propertyAccountService.ts` | `syncPropertyAccountsWithPayments` | POST `/accountants/property-accounts/sync` | EXPLICIT_MAINTENANCE | Kept; confirm+reason |
| `propertyAccountService.ts` | `ensureDevelopmentLedgersAndBackfillPayments` | POST `.../developments/ensure-ledgers` | EXPLICIT_MAINTENANCE | Kept |
| `accountingService.ts` | `getDashboardSummary` CompanyBalance `$set` of `totalRevenue`/`netProfit` | GET dashboard-summary | SUSPICIOUS GET mutation | **Removed** (read-only GET). COA/`ensureCompanyBalance` `$setOnInsert` seed remains the approved exception |
| `databaseSyncService.ts` | `handlePaymentChange` | real-time sync | LIVE_CANONICAL (orchestrator) | Kept; historical untracked skipped |
| `paymentService.ts` | n/a | n/a | LEGACY_UNMOUNTED | Remains deleted |
| Reporting `new OwnerStatementBuilder` | tests + report factory | reports | READ_ONLY / TEST_ONLY | Kept |

### GET safety

Financial GET handlers remain read-only except the existing COA seed on `GET /api/accounting/dashboard-summary`.

- `GET /accountants/payments/:id/accounting` runs `reconcilePayment` only (no `applyReconciliationOutcome`, no repair, no post). Additive read-only `diagnostic` includes recon, legacy Introduction risk, and currency flags.
- `GET` property-account listing does not post income. Ledger-type display mend is in-memory.
- Integrity summary/inconsistencies GETs flag only.

### 7B — Payment / projection invariants

Projections must reference exact `Payment._id`. Same tenant/property/month/amount with different `_id` values cannot reconcile as complete.

Duplicate `postPaymentAccounting` uses application idempotency (`payment:${paymentId}` / `already_applied`). Partial writer failure leaves `accountingComplete = false`, enqueues LedgerEvent retry, and does not mark complete. Retry calls the same orchestrator.

`accountingComplete = true` only when required projections exist, match Payment identity, and match snapshot amounts (including commission, VAT, owner, levy, trust). Missing, wrong `paymentId`, wrong amount, duplicate projections, or unexpected owner income → false. Existing `evaluateAccountingReconciliation` is the comparator; Phase 7 does not duplicate that engine.

### 7C — Reporting sources

| Report / dashboard | AUTHORITATIVE SOURCE | PROJECTION SOURCE | DERIVED METRIC | Double-count |
| ------------------ | -------------------- | ----------------- | -------------- | ------------ |
| Owner statement `GET /reports/owner-statement` | Payment (via posted property-account rows) | PropertyAccount | period totals / pass-through | No: does not add Payment.amount on top of ledger rows |
| Owner statement DTO builder | Canonical ledger entries | reporting read models | KPIs / running balance | No |
| Dashboard `totalRevenue` | Payment `commissionDetails.agencyShare` | CompanyBalance.totalRevenue fallback if no completed Payments | company commission income | No: Payment **or** ledger fallback, not both |
| Dashboard outstanding rent/levy | Payment + Lease (+ LevyPayment) | none | `computeOutstandingForLease` | No |
| Dashboard pass-through | — | PropertyAccount pass-through | collected/paid/outstanding | Levy/pass-through is not counted as rent |
| VAT report | VatRecord / journals | journal/VAT projections | pending VAT | No |
| Agent/company commission views | Payment snapshot + agent/company account projections | AgentAccount / CompanyAccount | balances | Projection is not a second transaction |
| Integrity pages | Payment + recon | exceptions | flags | Detection only |

Payment snapshot `ownerAmount` and final owner payout are distinct. Introduction month-1 snapshot `ownerAmount` may be levy pass-through only; later rental `ownerAmount` is owner rent. Owner statement payouts may apply subsequent legitimate deductions (expenses, payouts) after the Payment snapshot. Those concepts are not collapsed.

### 7D — Introduction legacy risk (detection only)

`legacyIntroductionRisk.ts` reports `LEGACY_INTRODUCTION_CONTEXT_RISK` when a current `tenantId + propertyId + leaseId` context exists and completed Payments for the same tenant+property have **missing `leaseId`** that consumed Introduction.

```json
{
  "code": "LEGACY_INTRODUCTION_CONTEXT_RISK",
  "action": "MANUAL_REVIEW_REQUIRED"
}
```

Detection never assigns `leaseId`, never subtracts legacy amounts, and never blocks Introduction calculation. Historical Introduction Payments are unchanged.

Identity remains `tenantId + propertyId + leaseId`. Lifetime Introduction allocation cannot exceed one month's rent. Levy and deposit are excluded. VAT-inclusive Introduction extracts VAT from gross (`roundMoney(gross / (1 + rate))`); gross is never monthly rent + VAT.

### 7E / 7F — Idempotency, immutability, failure semantics

- Accountant, agent, public, and sales Payment creates accept `Idempotency-Key` / `idempotencyKey` (existing unique partial index).
- Webhooks persist event receipts; duplicate event → ignored; failed event observable; retry uses same Payment identity.
- Completed non-provisional Payments remain immutable for `PAYMENT_FINANCIAL_FIELDS` (now includes `leaseId`). Corrections remain Original → Reversal → Correction draft.
- `postingStatus` / `accountingStatus` / `accountingComplete` unchanged.
- Scheduled `payment_accounting_integrity` remains detection-only. Orphans are `FLAG` / `ORPHAN_PROJECTION_DETECTED`, never deleted. Duplicates are `DUPLICATE_PROJECTION_DETECTED` and keep `accountingComplete = false`.
- Currency: Payment enum `USD` | `ZWL`. No conversion. Mismatch is flagged. Missing currency on schema defaults to USD.
- Read-only diagnostic: `buildPaymentIntegrityDiagnostic` on GET accounting + existing integrity summary. Never repair/sync/backfill/delete/merge.

### Production safety

No production data modified. No historical Payments modified. No automatic repair added. No historical backfill added. No production index created. No Azure changes. No deployment changes.

### Tests

`npm run test:phase7` — `server/src/scripts/runPhase7FinancialIntegrityTests.ts`

---

## Phase 9 addendum (16 September 2026)

Financial-control layer added without deleting legacy code or rewriting history.

- `JournalLine` now has the same immutability hooks as `JournalEntry` (no update/delete).
- Mongo `PaymentAllocation` collection remains unused; canonical split is `allocateRentalReceipt()`.
- Explicit admin backfill/repair APIs remain gated (not automatic).
- Trust posting remains event-parallel (`trustEventListener`); not moved into the orchestrator in Phase 9.
- `Payment.status: refunded` remains unused; corrections stay reverse → reversal → draft.

## First-adoption addendum (12 October 2026)

The startup block in `server/src/index.ts` that created or repaired a privileged user from a password stored in source has been replaced. `provisionBreakGlassSystemAdmin` runs only outside production, only when `ALLOW_SYSTEM_ADMIN_BOOTSTRAP=true`, and only when the email and a password of at least 12 characters are supplied by the environment. It creates a missing user. It does not reset a password, reactivate an account, or add roles to a user that already exists. The old bootstrap function was not deleted as a separate file; it lived inline in `index.ts` and is gone from the working tree. Git history may still contain the previous secret. No production user was deleted or re-passworded by this change.

`reconcilePayment` remains a read of the payment and its projections. It does not save the payment. Historical ledger maintenance is still not invoked at startup.


