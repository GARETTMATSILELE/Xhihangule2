# Mantis first-adoption open items

Updated after the priority security remediation. Completed code fixes are in `MANTIS_PRIORITY_SECURITY_REMEDIATION.md` and the earlier `MANTIS_FIRST_ADOPTION_REMEDIATION_REPORT.md`.

## 1. Rotate the old bootstrap account

- Severity: critical if that user exists in the target database.
- Evidence: commit `d7aca1e3` (2026-01-19) still contains the former startup credential. The current startup path does not create, re-password, or reactivate an administrator in production, even if `ALLOW_SYSTEM_ADMIN_BOOTSTRAP=true`.
- Why it remains open: this pass did not connect to production and did not change any user.
- Next action: on each database that ran the old startup, confirm the account, rotate or deactivate it, confirm the old password fails, restart, and confirm the account is not recreated.
- Blocks controlled adoption: yes, where that password still works. No, for a database that never ran the old path.

## 2. Production host secrets

- Severity: high for a production boot.
- Evidence: startup now uses `productionStartupProblems`. Production exits when `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing or shorter than 32 characters, or when `MONGODB_URI` is missing. The error names the variables and does not print values. Isolated tests passed.
- Why it remains open: the host still has to provide the values. They were not added to source or `.env`.
- Next action: set the three values in the production secret store. Leave `ALLOW_SYSTEM_ADMIN_BOOTSTRAP` unset. It is ignored in production.
- Blocks controlled adoption: yes, until the host has them. The process will not stay up without them.

## 3. Dependency advisories that were not safely patched

- Severity: one critical, nine high in production dependencies after the compatible upgrades.
- Before: 3 critical, 21 high, 27 moderate, 1 low.
- After `npm audit --omit=dev`: 1 critical (`fast-xml-parser` 4.4.1 under the pinned `@aws-sdk/client-s3` 3.826.0), 9 high (Puppeteer 24.31.0 download chain, including `basic-ftp` 5.3.1, and `nodemailer` 7.0.13), 18 moderate.
- Why it remains open: the patched S3 stack, Puppeteer 25, and Nodemailer 10 are major or broad upgrades. They were not applied. `basic-ftp` was moved from 5.0.5 to 5.3.1 only.
- Next action: schedule an S3 client upgrade with upload and backup-upload tests, a Puppeteer 25 PDF test, and a Nodemailer 10 send test.
- Blocks controlled adoption: no for a pilot that keeps the current S3 client, does not download browsers over FTP, and accepts the mail advisory. Yes before those advisories are described as closed.

## 4. Payment reference collisions

- Severity: high for the uniqueness control. Not a posting defect.
- Evidence: local index `companyId_1_referenceNumber_1` is not active. Diagnostic on `127.0.0.1` found 15 groups in company `683403ccf652d8cd543c6932`: 13 separate payments sharing a reference, and 2 possible-duplicate groups (`REF-1757412254775-893`, four rental rows of 900 on 2025-09-09; `9 Amby Drive Msasa Harare 9 Amby Drive Msasa Harare`, two sale rows of 250000 on 2026-05-10). Production was not inspected.
- Why it remains open: enforcing uniqueness now would reject installment-style repeats that the application currently stores. Rows were not edited. The unique declaration remains in the payment schema.
- Next action: an operator classifies the two possible-duplicate groups and decides whether repeated property-label references are allowed. Only then build the index, on a copy first. Re-run `npm run diagnose:payment-references` with `NODE_ENV=development`.
- Blocks controlled adoption: no for today's behavior. Yes before claiming the unique index is active. Production index status is unverified.

## 5. Public signup outside production

- Severity: medium.
- Evidence: production signup stays closed unless `ALLOW_PUBLIC_SIGNUP=true`. Development signup remains available. Covered by the security suite.
- Why it remains open: local onboarding and existing phase scripts use signup.
- Blocks controlled adoption: no for production when the flag is unset.

## 6. Phase 2.6–2.8 HTTP harnesses

- Severity: medium as a coverage gap.
- Evidence: those scripts are still not in `server/src/scripts`. They were not recreated and did not pass.
- Focused replacements that did pass: `runSecurityRemediationTests.ts` 22/22 and `runFirstAdoptionReadinessTests.ts` 30/30.
- Blocks controlled adoption: no. It blocks any claim that those historical harnesses passed.

## 7. Browser acceptance and external notification delivery

- Severity: medium for go-live evidence.
- Why it remains open: the operator is doing frontend acceptance separately. This pass did not send email or SMS.
- Blocks controlled adoption: yes if the pilot requires proven delivery or signed-off screens. No for the code fixes in this pass.

## 8. Uploads are validated, not malware-scanned

- Severity: low relative to the allow-lists that exist.
- Evidence: file and sales-file regression passed, including HTML rejection. Tax receipt upload allows PDF, JPEG, and PNG only. No scanner is configured.
- Blocks controlled adoption: no, unless policy requires scanning.

## 9. Tax working papers are not a statutory filing

- Severity: informational for the software.
- Why it remains open: certification is not a code change.
- Blocks controlled adoption: no for internal working papers. Yes for statutory filing.

## Closed in this pass

- Company profile updates can no longer apply `PLAN_CONFIG` or change the subscription plan. Billing activation still can. Tests passed.
- Production startup validation for the three required settings is implemented and tested.
- Compatible dependency upgrades landed. The audit is improved and is not clean.
- Payment-reference collisions were listed read-only. The local unique index is not active.
- Azure backup restore is not an open code item. The operator confirmed existing backups work. No backup code was changed and no restore was run.
