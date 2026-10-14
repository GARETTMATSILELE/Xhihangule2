# Mantis priority security remediation

Code remediation after `MANTIS_FIRST_ADOPTION_OPEN_ITEMS.md`. This does not replace the earlier readiness report.

Overall result: **PASS WITH DOCUMENTED RISKS**.

No production database records were changed. No historical accounting entries were rewritten. No Azure backup, backup schedule, or deployment configuration was modified.

## A. Changes implemented

### Dependency patches

- Finding: production `npm audit --omit=dev` reported 3 critical, 21 high, 27 moderate, and 1 low.
- Root cause: direct packages were behind patched releases, and several transitive packages were still on vulnerable versions inside an otherwise compatible range.
- Files: `server/package.json`, `server/package-lock.json`.
- Fix: upgraded compatible releases only. Express 4.22.3, axios 1.20.0, mongoose 7.8.12, multer 2.4.0, compression 1.8.2, jsonwebtoken 9.0.3, socket.io 4.8.4. Overrides: `proxy-addr` 2.0.8, `jws` 3.2.3, `ws` 8.22.0, `basic-ftp` 5.3.1. The S3 client stays on the previously installed 3.826.0.
- Why it is safe: no `npm audit fix --force`, no Express 5, no Puppeteer 25, and no Nodemailer 10. The S3 client was pinned back to 3.826.0 so this task would not replace the working storage client.
- Verification: `npm audit --omit=dev` after the pin. `npx tsc --noEmit` exit 0. `npm run build` exit 0.
- Result: production audit is now 1 critical, 9 high, 18 moderate, 0 low, 28 total. The previous critical findings in `proxy-addr` and the older `basic-ftp` 5.0.5 advisories are no longer the reported critical set. See unresolved items below. This is not a clean audit.

### Company plan authority

- Finding: `updateCompany`, `updateCurrentCompany`, and `PUT /api/companies/:id/plan` applied `PLAN_CONFIG` from the request body. `POST /api/billing/subscriptions/change-plan` upserted a subscription plan with no payment.
- Root cause: profile updates and the subscription shortcut wrote plan, property limit, and feature flags. Billing activation is the path that records a paid session.
- Files: `server/src/controllers/companyController.ts`, `server/src/routes/companyRoutes.ts`, `server/src/controllers/billingController.ts`.
- Fix: profile updates ignore `plan`, `propertyLimit`, `featureFlags`, `subscriptionStatus`, and `subscriptionEndDate`. `PUT /api/companies/:id/plan` returns 403 `PLAN_CHANGE_REQUIRES_BILLING`. `change-plan` returns the current subscription unchanged when the requested plan and cycle already match, and returns 403 when they would change. It does not create a subscription.
- Why it is safe: name, phone, tax profile, and other profile fields still save. Checkout, voucher redemption, and `activateSubscriptionFromPayment` are unchanged. Existing company rows were not edited except disposable test fixtures, which were deleted.
- Migration note: the accountant settings screen sends `changeSubscriptionPlan` before `updateCompany`. Saving details while leaving the current plan selected still succeeds. Choosing a different plan or cycle stops that save with 403, and the profile update in the same click does not run. Initial company creation and signup can still set the plan chosen at creation. That is not a later self-upgrade.
- Verification: `runSecurityRemediationTests.ts`, 22/22, exit 0. Includes profile save, rejected enterprise escalation, rejected direct plan route, unchanged current plan, rejected plan change, and billing activation of a disposable payment session.

### Production configuration validation

- Finding: production startup needed a single check that fails closed without printing secret values.
- Files: `server/src/config/productionConfig.ts`, `server/src/index.ts`, `server/src/utils/publicSignupCompany.ts`, `server/src/controllers/authController.ts`.
- Fix: `productionStartupProblems` requires `JWT_SECRET` and `JWT_REFRESH_SECRET` of at least 32 characters and a non-empty `MONGODB_URI` when `NODE_ENV=production`. Startup prints only the variable names. `isPublicSignupAllowed` keeps public signup closed in production unless `ALLOW_PUBLIC_SIGNUP=true`.
- Why it is safe: development and test processes are not required to have those secrets. No real secrets were added to source or `.env`.
- Verification: the security suite covers a complete production env, each missing variable, short secrets, and development exemption. Exit 0.

### Administrator bootstrap

- Finding: an older startup path could create or repair a platform administrator.
- Current code: production startup never takes the create path, including when `ALLOW_SYSTEM_ADMIN_BOOTSTRAP=true`. Non-production bootstrap remains opt-in, create-only, and does not update an existing user. Startup does not compare or reset a password, and does not force an account active.
- Files already present from the prior remediation: `server/src/services/systemAdminBootstrap.ts`, `server/src/index.ts`. This pass added the production log that the flag is ignored, and retested the decision.
- Verification: security suite and first-adoption suite. No live administrator was read, disabled, or re-passworded.

### Payment-reference diagnostic

- Finding: `companyId_1_referenceNumber_1` is declared unique for non-empty references, but index creation hits `E11000` on existing rows.
- Files: `server/src/scripts/diagnosePaymentReferenceCollisions.ts`, `server/src/services/paymentReferenceDiagnostics.ts`, `server/package.json` script `diagnose:payment-references`.
- Fix: read-only diagnostic. It refuses `NODE_ENV=production` and any non-local host. It lists indexes and collision groups. It does not update payments or build indexes.
- Why enforcement was not added: 13 of 15 local groups are separate payments that reuse one reference, mostly sale installments with different amounts. Rejecting a repeated reference would block that working entry path. The unique declaration was left in place.
- Verification: diagnostic exit 0 against `127.0.0.1`. Security suite confirms the schema still declares the unique index, classifies same-day same-amount groups as possible duplicates, classifies different amounts as separate transactions, and still allows a repeated reference on disposable rows. Those disposable rows were deleted.

### File upload and access regression

- No rewrite. `runFirstAdoptionReadinessTests.ts` 30/30, exit 0. Covered another agent's portfolio denial, cross-company file denial, sales-file deal mismatch, and HTML upload rejection with nothing stored.
- Tax receipt upload in `server/src/routes/accountingRoutes.ts` already allows only PDF, JPEG, and PNG, with a matching extension check. The security suite asserts that allow-list. Uploads are not malware-scanned. No scanner is configured.

### Test command

- `server/package.json` `test` no longer invokes Jest. Jest is not installed and is not the project runner. The script tells the operator to use `test:security-remediation`, `test:first-adoption`, or a `test:phase*` script, then exits 1.
- Phase 2.6, 2.7, and 2.8 HTTP harnesses are still absent. They were not recreated and are not reported as passed.

## B. Findings requiring operator action

### Legacy bootstrap credential

Git history still contains the old startup credential. Commit `d7aca1e3` (2026-01-19, message "Paynow config") introduces it in `server/src/index.ts`. The value is not repeated here. Removing it from the current source does not remove it from history. History was not rewritten.

This task did not connect to production and did not check whether that user exists. An authorized operator should, on every database that booted the old process:

1. Find the account created by that startup path.
2. Confirm whether it is still an authorized platform administrator.
3. Rotate its password or deactivate it if it is not authorized.
4. Confirm the old password no longer authenticates.
5. Restart the API and confirm the account is not recreated or reactivated.

### Production host configuration

`server/.env` is labeled production and does not contain usable JWT or Mongo settings. Lengths were empty at the earlier audit. Values were not printed. The process will exit in production until the host provides `JWT_SECRET`, `JWT_REFRESH_SECRET` (each at least 32 characters), and `MONGODB_URI`. Do not commit those values. Do not set `ALLOW_SYSTEM_ADMIN_BOOTSTRAP` in production. It is ignored there.

### Payment-reference review

Local database only (`127.0.0.1`, database `property-management`). The unique index `companyId_1_referenceNumber_1` is **not active** there. Production was not inspected, so the production index is **unverified**.

15 collision groups, all in company `683403ccf652d8cd543c6932`. 13 groups are separate transactions sharing a reference (different amounts and/or dates). Two groups match amount, type, and day and need human review. Rows were not merged, renumbered, or deleted.

Possible duplicates:

| Reference | Count | Records |
| --- | --- | --- |
| `REF-1757412254775-893` | 4 rental, completed, amount 900, payment date 2025-09-09 | `68bffbc3d13cffb480d482c9`, `68bffbc6d13cffb480d482d2`, `68bffbc9d13cffb480d482db`, `68bffbcdd13cffb480d482e4` |
| `9 Amby Drive Msasa Harare 9 Amby Drive Msasa Harare` | 2 sale, completed, amount 250000, payment date 2026-05-10 | `6a0075f9f014e44fb3ad68c5`, `6a007620f014e44fb3ad697d` |

Re-run locally with `npm run diagnose:payment-references` from `server/` and `NODE_ENV=development`. Do not build the unique index until an operator decides which repeats are legitimate installments and which are duplicates. Do not point the diagnostic at production.

### Unresolved dependency advisories

Production `npm audit --omit=dev` after the compatible upgrades:

| Package | Installed | Severity | Why it was not upgraded | Reach | Next step | Blocks this deployment? |
| --- | --- | --- | --- | --- | --- | --- |
| `fast-xml-parser` | 4.4.1 via `@aws-sdk/core` 3.826.0 | critical | Advisory range is `<=5.6.0`, so no 4.x release is patched. The S3 client was kept at 3.826.0. | S3 XML response parsing over the AWS client. Not used as an application XML parser for user uploads. | Upgrade `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` together to a 3.x release that no longer depends on a vulnerable parser, then retest object upload, download, and backup upload. | No for a pilot that already uses this S3 client. Yes before calling the XML advisory closed. |
| `basic-ftp` | 5.3.1, overridden from 5.0.5 | high | Remaining fix is `basic-ftp` > 6.2.0 through Puppeteer 25.13.0, a major bump. 5.3.1 stays on the 5.x API `get-uri` calls. | Puppeteer browser download through an `ftp:` URI. Request handlers do not call FTP. | Stay off FTP proxy URLs for browser install. Take Puppeteer 25 only with a PDF render regression. | No for normal PDF rendering. |
| `extract-zip`, `@puppeteer/browsers`, `proxy-agent`, `pac-proxy-agent`, `get-uri`, `puppeteer`, `puppeteer-core` | Puppeteer 24.31.0 | high | Fix is Puppeteer 25.13.0. Puppeteer was pinned at 24.31.0, the previously installed release. | Browser download and archive extraction during Puppeteer install, not payment posting. | Same Puppeteer 25 regression window. | No for the API process if the browser is already installed. |
| `nodemailer` | 7.0.13 | high | Patched release is 10.1.0, a major bump. Mail send/receive was not retested against 10.x. | SMTP send path. Several advisories are header, address-parser, and TLS-validation issues. | Upgrade to 10.1.0 in a mail-focused pass and send one real message per configured transport. | No for a pilot that does not rely on new email delivery. Yes before treating outbound mail as fully patched. |

Moderate findings were not all cleared. They are not listed as adoption blockers.

### Subscription policy that remains

New company creation and signup still store the plan selected at creation, including the existing default to Enterprise when a plan is omitted on `createCompany`. This pass did not change that creation behavior. Later profile edits cannot raise it. If creation itself must wait for a paid session, that is a separate product decision.

## C. Findings not changed

- Azure backup implementation, schedules, storage configuration, and backup scripts. No restore was run. The operator has confirmed existing backups work.
- Production environment settings and Azure deployment resources.
- Production and local financial records, other than disposable test fixtures that were deleted.
- The payment-to-accounting pipeline, reversal rules, owner waterfall, and tax projection calculations.
- Frontend layouts. Browser acceptance remains the operator's later pass.
- External email and SMS delivery acceptance.
- Phase 2.6, 2.7, and 2.8 HTTP harnesses. They are still missing.
- Public signup outside production. Production stays closed unless `ALLOW_PUBLIC_SIGNUP=true`.
- Malware scanning. Uploads are extension- and MIME-validated only.
- Tax or statutory certification.

## D. Remaining risks

| Risk | Severity | Evidence | Impact | Mitigation | Blocks controlled adoption? |
| --- | --- | --- | --- | --- | --- |
| Old bootstrap password may still work in a database that ran the old startup | Critical if that account exists | Commit `d7aca1e3` still in history. Current startup will not repair it. The database was not queried. | Someone who has the old password could authenticate until it is rotated. | Operator rotation steps in section B. | Yes, for any database that still accepts that password. No, for a new database that never ran the old path. |
| Production host secrets | High | Fail-closed check is in startup and tested. The local production-labelled env file is still empty. | Production process exits until secrets are set. | Set secrets on the host. Do not commit them. | Yes, until the host configuration is present. The code will not boot without it. |
| `fast-xml-parser` 4.4.1 | Critical advisory, limited reach | Production audit, one critical. Package is under the pinned S3 client. | A hostile XML payload in an S3 response could hit the parser. | Keep TLS to AWS. Plan a paired S3 SDK upgrade and retest. | No for the current pilot if S3 usage stays on the existing client. |
| Puppeteer download chain and Nodemailer 7 | High | Nine production high findings. Majors were not taken. | Browser-install path and outbound mail. | Do not use FTP browser downloads. Schedule Nodemailer 10 and Puppeteer 25 with their own regression. | No for a pilot that does not depend on those upgrades. |
| Payment reference uniqueness is not enforced | High for the control, not a posting defect | Local index absent. 15 groups. Application save still accepts a repeat, by decision. | Two payments in one company can share a reference. Some may be installments. Two groups look like duplicates. | Operator review. Do not build the index until the repeats are classified. | No for continued operation matching today's behavior. Yes before claiming the unique index is active. |
| Browser and provider acceptance | Medium | Not run in this pass. | Screens and real email/SMS delivery are unproven here. | Operator acceptance pass. | Yes if the pilot requires those proofs. No for the code defects fixed here. |
| Missing Phase 2.6–2.8 harnesses | Medium as coverage | Scripts are not in `server/src/scripts`. | Those exact scenarios cannot be quoted as passed. | Related suites that do exist were run. | No. It does block any claim that those harnesses passed. |

## Verification log

| Command | Exit | Result |
| --- | --- | --- |
| `npx tsc --noEmit --pretty false` | 0 | Completed |
| `npm run build` | 0 | Completed |
| `npx ts-node --transpile-only src/scripts/runSecurityRemediationTests.ts` with `NODE_ENV=development` | 0 | 22/22 |
| `npx ts-node --transpile-only src/scripts/runFirstAdoptionReadinessTests.ts` with `NODE_ENV=development` | 0 | 30/30 |
| `npx ts-node --transpile-only src/scripts/runPhase2FinancialHardeningTests.ts` with `NODE_ENV=development` | 0 | Passed |
| `npx ts-node --transpile-only src/scripts/diagnosePaymentReferenceCollisions.ts` with `NODE_ENV=development` | 0 | Read-only. 15 groups. Index not active locally. |
| `npm audit --omit=dev` | 1 | Expected while advisories remain. 1 critical, 9 high, 18 moderate. |

Phase 2.6, 2.7, and 2.8 harnesses were not run because they are not in the repository.
