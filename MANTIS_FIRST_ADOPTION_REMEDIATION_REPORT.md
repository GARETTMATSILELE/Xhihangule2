# Mantis first-adoption remediation report

Date: 12 October 2026

Code changes below were executed and then checked with the commands in the test section. A change is not described as verified unless that command exited 0.

The accounting pipeline was not replaced. Historical payments, journals, tax snapshots, and owner balances were not rewritten. No production migration was run.

## Fix 1 — Remove the hardcoded administrator bootstrap

Root cause: `initializeDatabaseBackedServices` in `server/src/index.ts` always ensured one user from a source password, including resetting that password and forcing `system_admin`.

Change:

- New `server/src/services/systemAdminBootstrap.ts`.
- Startup calls `provisionBreakGlassSystemAdmin`.
- Production always skips it.
- Other environments skip it unless `ALLOW_SYSTEM_ADMIN_BOOTSTRAP=true`.
- Email and password come from `SYSTEM_ADMIN_BOOTSTRAP_EMAIL` and `SYSTEM_ADMIN_BOOTSTRAP_PASSWORD` (minimum 12 characters). They are not in source.
- If the user already exists, the function returns without changing password, roles, or `isActive`.
- A new user gets one audit row, `system_admin:bootstrap_create`, with the user id only. The password and email are not written to that audit payload or to the startup log line.
- `.env.example` documents the flags without sample secrets.

Before: every database startup could create or repair a known administrator.  
After: startup does not know a password. An operator who rotates a password will not have it restored on the next boot.

The existing account, if one was already created, was not deleted. Rotation is an operator action. See open items.

## Fix 2 — Block platform roles on company user administration

Root cause: `server/src/controllers/userController.ts` trusted `role` on update and spread create payloads.

Change:

- `server/src/utils/companyUserRoles.ts` allows only `admin`, `agent`, `accountant`, `owner`, `sales`, `principal`, and `prea`.
- `system_admin`, `tenant`, and `contractor` are rejected with HTTP 403 before `User.create` or `user.save`.
- Create accepts email, password, name, company id, and those roles. It does not copy arbitrary body fields.
- Update requires the target user's `companyId` to equal the caller company. A user with no company, including a platform administrator, is rejected and not saved.
- A user who already has `system_admin` cannot be edited on this route.
- Password-bearing request logs were removed.

Before: a company admin could set `role` to `system_admin` or edit a user who had no company.  
After: those writes return 403 and leave the stored password, role, and `updatedAt` unchanged. An ordinary role change to `accountant` still returns 200.

## Fix 3 — Whitelist public signup company fields

Root cause: signup spread the client company object.

Change: `server/src/utils/publicSignupCompany.ts` keeps name, trading name, address, phone, email, website, registration number, TIN, VAT number, description, and country. Both the transaction path and the non-transaction fallback in `authController.ts` use it.

Before: a signup body could set `subscriptionStatus`, `subscriptionOverride`, `tenantStatus`, or `fiscalConfig`.  
After: those keys are dropped. Plan, property limit, and feature flags are still taken from `PLAN_CONFIG`.

## Fix 4 — Suspension cannot be cleared by the company, and it is enforced on the next request

Root cause: company update copied workspace control fields, and `authWithCompany` did not read `tenantStatus`. Company context is also cached for 60 seconds, so a cached status would hide a fresh suspension.

Change:

- `pickWorkspaceFields` ignores `tenantStatus`, `onboardingStatus`, and `onboardingCompleted` when the stored status is `suspended` or `archived`. A company admin also cannot set `suspended` or `archived` themselves. Pending workspace completion can still mark a non-suspended company active, which `client/src/pages/WorkspaceSetup/index.tsx` sends.
- `authWithCompany` reads `tenantStatus` from the database on the request, not from the 60-second cache. `suspended` and `archived` receive HTTP 403 `TENANT_INACTIVE`.
- `pending` and `active` continue. `/api/billing`, `/api/paynow`, and `/api/subscriptions` stay available so a suspended company can still reach billing.
- System-admin suspend and reactivate in `systemAdminController.ts` were not changed.

Before: a suspended company could put itself back to `active` and keep calling company routes.  
After: the update is 403, the stored status stays `suspended`, and a file download by that company is 403 without deleting the file. After the status is set back to `active` in the database, the same agent download returns 200.

## Fix 5 — Documents follow the property portfolio

Root cause: file and sales-file queries used `companyId` only, and filenames were copied into headers.

Change:

- `fileController.ts` and `salesFileController.ts` use `propertyIdsForCaller` and `callerCanAccessProperty`.
- A sales upload whose `dealId` belongs to a different property returns 404 and does not insert a file.
- `safeAttachmentFilename` strips path segments, quotes, and CR/LF.
- File, agent, sales, generic upload, and tax-receipt routes require an allowed extension as well as an allowed MIME type. HTML is rejected.
- Invalid file uploads on `POST /api/files/upload` return HTTP 400 and do not insert a row. The raw exception is not returned to the client from the file or agent upload handlers.

Before: another agent in the company could download a lease or sales file.  
After: that download is 404, the row count stays 1, and the body does not contain the file bytes. The owning agent and the company accountant still receive the file. Another company receives 404.

## Tests added

`server/src/scripts/runFirstAdoptionReadinessTests.ts`  
Script: `npm run test:first-adoption` from `server/`.

Static checks do not use a database. HTTP checks create disposable `FIRSTADOPT` companies, users, properties, files, and one deal, then delete those fixtures. They do not post accounting.

Final run: **30/30 passed, exit 0.**  
Working directory: `server`. `NODE_ENV=development`. Local MongoDB. Not a production connection.

Covered: production bootstrap skip, no password reset in source, `system_admin` rejection with unchanged password hash and `updatedAt`, cross-company user update, ordinary role update, suspension 403 with unchanged tenant status, suspended download 403, unauthenticated download 401, cross-agent and cross-company file and sales-file denial with unchanged counts, owner and accountant download 200, deal substitution 404 with unchanged sales-file count, HTML upload 400 with unchanged file count.

## Tests executed

All server commands were run from `server/` with `NODE_ENV=development` unless noted. That points at local MongoDB because `MONGODB_URI` is unset. Disposable fixtures only, except the suites that only read source.

| Command | Exit | Result |
| --- | --- | --- |
| `npx tsc --noEmit --pretty false` | 0 | After the suspension read was added. An earlier run also exited 0. |
| `npm run build` (`tsc` emit) | 0 | About 503 seconds. |
| `npx ts-node --transpile-only src/scripts/runFirstAdoptionReadinessTests.ts` | 0 | 30/30. |
| `npx ts-node --transpile-only src/scripts/runPhase21AgentCommissionAndStartupTests.ts` | 0 | Startup still does not run ledger maintenance. |
| `runPhase2aSafetyTests.ts` | 0 | |
| `runPhase2bCompletenessTests.ts` | 0 | |
| `runPhase2cAccountingIntegrityTests.ts` | 0 | |
| `runPhase2dWritePathLockdownTests.ts` | 0 | |
| `runPhase2FinancialHardeningTests.ts` | 0 | |
| `runPhase3AccountingTrustTests.ts` | 0 | |
| `runPhase3cDuplicateConsolidationTests.ts` | 0 | |
| `runPhase4FinancialIntegrityTests.ts` | 0 | |
| `runPhase4AgencyWorkflowTests.ts` | 0 | |
| `runPhase4bAgencyWorkflowTests.ts` | 0 | |
| `runPhase4cAccessControlTests.ts` | 0 | 40/40, re-run after the suspension gate. |
| `runPhase5AgencyWorkflowTests.ts` | 0 | 65/65. Re-run was before the final suspension-cache read. Active companies are not blocked by that read. |
| `runEcosystemTests.ts` | 0 | 13 checks. |
| `runPhase9FinancialControlsTests.ts` | 0 | |
| `runVatOnCommissionTests.ts` | 0 | |
| `runIndividualAccountingPhaseBTests.ts` through `PhaseITests.ts` | 0 | Each script printed ALL PASS. |
| Client `npm run build` with `CI=false` | 0 | Compiled with existing ESLint warnings. "The build folder is ready to be deployed." About 1025 seconds. |
| Client `npm test` (`vitest`) | not a clean process exit | 5 files, 25 tests passed, then Vitest waited for file changes because the script is watch mode. The process was stopped. |
| `npm audit --omit=dev` in `server/` | 1 | 3 critical, 21 high, 27 moderate, 1 low. Not upgraded. |

Phase 2.6, 2.7, and 2.8 HTTP harnesses are not in the repository. They were not run and are not counted as passed.

There is no server ESLint script. Client ESLint ran inside the production build and reported existing unused-variable and hook warnings. Those warnings were not introduced by this change. Client source was not edited.

`npm run build` on the server was the emit build. It exited 0 before the last auth cache comment and query. `tsc --noEmit` was run again after that query and exited 0.

## Regressions

The first suspension-gate version used the 60-second company cache. The readiness suite then failed four checks because a cached `active` status allowed the unsuspend request, and a cached `suspended` status blocked the agent after the database was set back to `active`. The gate now reads `tenantStatus` on the request. The suite was re-run and passed 30/30. Phase 4C was re-run and passed 40/40.

No previously passing financial suite failed.

## Index and migration changes

None. The payments unique index on `companyId` and `referenceNumber` still fails to build on the local database because existing rows share a reference. Those rows were not modified.

## Actions that need the owner

1. Treat the old bootstrap password as compromised. In every database where that startup block has run, rotate or disable the account. Startup will no longer put the password back.
2. Do not set `ALLOW_SYSTEM_ADMIN_BOOTSTRAP` in production. Provision platform administrators through an existing system administrator, or a one-off out-of-band create, then rotate.
3. Decide whether a company admin may still change `plan` on company update.
4. Review the `npm audit` critical and high advisories before an upgrade. This pass did not upgrade them.
5. Run a backup restore in an isolated environment. The code path was not executed against production.
6. Click through the frontend workflows listed in the final summary. Browser acceptance was not done.
