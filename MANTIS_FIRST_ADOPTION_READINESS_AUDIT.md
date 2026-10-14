# Mantis first-adoption readiness audit

Date: 12 October 2026  
Branch inspected: `main` (tracking `origin/main`)  
Working tree: large pre-existing uncommitted work was left in place. This audit did not discard or overwrite it.

This document records the initial findings. Remediation results are in `MANTIS_FIRST_ADOPTION_REMEDIATION_REPORT.md`. The status matrix is in `MANTIS_FIRST_ADOPTION_READINESS_MATRIX.md`. Only open issues are in `MANTIS_FIRST_ADOPTION_OPEN_ITEMS.md`.

## Repository state

- Backend: `server/` (Express, Mongoose, TypeScript). Frontend: `client/` (Create React App).
- Root scripts start both. Server tests are `ts-node` scripts under `server/src/scripts/`, not a Jest suite. `server/package.json` still has `"test": "jest"`, and Jest is not the harness used by the phase reports.
- Server `npm run build` is `tsc`. Client `npm run build` is `react-scripts build`.
- Deployment: `Dockerfile`, `azure-deploy.yml`, `.github/workflows`.
- Local `server/.env` sets `NODE_ENV=production` and does not set `JWT_SECRET`, `JWT_REFRESH_SECRET`, or `MONGODB_URI`. Production startup is written to exit when those secrets are missing. Regression commands in this audit set `NODE_ENV=development` so they used the local MongoDB database `property-management`, not a production connection string.

## Architecture inspected

Authoritative rental payment path, unchanged by this work:

Payment completion → `ensurePaymentAccountingPosted` / `postPaymentAccounting` → projection writers → `reconcilePayment` → `accountingComplete`.

`reconcilePayment` in `server/src/services/paymentAccountingReconciliation.ts` loads the payment and projections and returns a result. It does not save the payment.

Property access remains `server/src/utils/propertyAccess.ts`:

- `companyId` is the company boundary.
- `ownerId` is the user who created the property.
- `propertyOwnerId` is the landlord.
- `agentId` is the formal assignment.
- The same landlord does not grant a second agent the property.
- Company-wide property roles are admin, accountant, principal, and prea.

## Reports reviewed

- `MANTIS_PHASE_4_IMPLEMENTATION_REPORT.md` (FAIL on live workflow acceptance)
- `MANTIS_PHASE_4B_IMPLEMENTATION_REPORT.md` (there is no separate `MANTIS_PHASE_4B_VERIFICATION_REPORT.md`)
- `MANTIS_PHASE_4B1_VERIFICATION_REPORT.md`
- `MANTIS_PHASE_4C_IMPLEMENTATION_REPORT.md`
- `MANTIS_PHASE_5_IMPLEMENTATION_REPORT.md`
- `PHASE9_FINANCIAL_CONTROLS_AUDIT.md` (the Phase 9 filename in the repository)
- `PHASE_I_PRODUCTION_READINESS_AUDIT.md` and the Phase B–I implementation reports
- `LEGACY_CODE_AUDIT.md`
- `MANTIS_SYSTEM_ADMIN_BOOTSTRAP_SECURITY_REVIEW.md`
- `MANTIS_PHASE2_8_RESIDUAL_RISK_REPORT.md`

Phase 2.6, 2.7, and 2.8 HTTP harnesses are not in `server/src/scripts`. They were not executed. That absence was already recorded in the Phase 4C and Phase 5 reports.

## Initial findings

### F1 — Hardcoded privileged bootstrap. Critical. Remediated in code.

`server/src/index.ts` `initializeDatabaseBackedServices` created or repaired a platform administrator on every database startup, in every environment. The email and password were literals in source. An existing user was forced to `admin` plus `system_admin`, forced active, and had the password reset when it differed.

Impact: anyone with the repository or an old build knew a standing administrator password. Disabling the account or rotating the password did not stick past the next process start.

The password is not repeated here. It remains in git history until history is rewritten, which this audit did not do.

### F2 — Company administrator can assign `system_admin`. Critical. Remediated.

`createUser` copied the request body through. `updateUserById` assigned `updates.role` without the company role allow-list. A company admin `POST /api/users` or `PUT /api/users/:id` with `role: "system_admin"` could create or elevate a platform administrator.

Users with no `companyId` failed the company check only when both sides had a company id, so a company admin could edit a platform user who had no company.

`createUser` also logged the request body, which includes the password.

### F3 — Public signup copied privileged company fields. High. Remediated.

`signup` spread the client `company` object into `Company.create`. Explicit plan and feature-flag fields were overwritten afterwards. `subscriptionStatus`, `subscriptionOverride`, `tenantStatus`, and `fiscalConfig` were not. Production signup is already refused unless `ALLOW_PUBLIC_SIGNUP=true`. Non-production signup remains open, which is how the existing live-acceptance script creates companies.

### F4 — Company admin could clear a platform suspension. High. Remediated.

`pickWorkspaceFields` accepted `tenantStatus`, `onboardingStatus`, and `onboardingCompleted` from the company update body. `authWithCompany` did not enforce `tenantStatus`. A suspended company could set itself back to `active`. The dedicated system-admin suspend and reactivate routes were already the supported control.

### F5 — Portfolio documents were company-wide. High. Remediated.

`GET/POST /api/files` and download/delete loaded files by `companyId` only. An agent in the same company could list and download another agent's lease file. Sales file list, download, delete, and upload had the same gap. A sales upload could name one property and a deal that belonged to another property. Stored filenames were written into `Content-Disposition` without stripping quotes or newlines. Upload filters trusted the client MIME type, so `shell.html` sent as `text/plain` was accepted. Tax receipt upload had a size limit and no type filter.

Agent file create (`createAgentFile`) already used `callerCanAccessProperty`.

### F6 — Financial pipeline. No new calculation defect found. Not changed.

Phase 4, Phase 2A–2D, financial hardening, Phase 3, Phase 3C, Phase 9, VAT-on-commission, and individual accounting Phases B–I passed on the current source. This audit did not change `postPaymentAccounting`, `explainOwnerWaterfall`, tax snapshots, or reversal logic.

`reconcilePayment` remains read-only. Startup still does not call `runPropertyLedgerMaintenance`.

### F7 — Duplicate payment reference index is not in force. Open. Data, not a new code path.

Connecting to the local development database logs:

`E11000 duplicate key` on `payments` index `companyId_1_referenceNumber_1` for an existing reference. The index build is non-fatal and does not complete. Existing rows were not merged or rewritten. A unique index must not be forced onto data that already violates it.

### F8 — Dependency advisories. Open. Not upgraded.

`npm audit --omit=dev` in `server/` exited 1. Metadata: 3 critical, 21 high, 27 moderate, 1 low, 52 total. Critical package names reported: `basic-ftp`, `fast-xml-parser`, `proxy-addr`. No broad upgrade was applied.

### F9 — Previously published bootstrap account may still exist. Open. Environment.

Removing the startup reset does not delete or re-password a user already created by the old code. Until an operator rotates or disables that account, the old password may still work. This audit did not connect to production and did not modify that user.

### F10 — Items inspected and left as they are

- Signup always creates an `admin` for a new company. Client-supplied `role` is not used. That is company onboarding, not platform escalation.
- Company admin can still send `plan` on company update and receive that plan's feature flags. The route comment says this can be restricted later. Changing it would alter onboarding. It is an owner decision.
- Public signup stays available when `NODE_ENV` is not `production`. Production stays closed unless `ALLOW_PUBLIC_SIGNUP=true`.
- Owner rent notification key `owner-rent-payment:{paymentId}` and `accountingComplete` gating were re-read from the Phase 4C report and were not edited. Inbox delivery was not tested.
- Backup code (`runDatabaseBackup`) can spawn `mongodump` and optionally upload to S3. No restore was performed.
- Malware scanning of uploads is not implemented.
- Browser acceptance of the dashboards was not performed.
- The application is not evidenced as ZIMRA-certified, fiscal-device certified, or IFRS-certified. Phase I states tax figures are working papers.

## What was not claimed

Manual frontend acceptance, email or WhatsApp delivery, a restorable production backup, production data reconciliation, and legal or tax certification were not performed.
