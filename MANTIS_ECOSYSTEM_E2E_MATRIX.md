# MANTIS ECOSYSTEM — E2E MATRIX

Date: 18 September 2026

Evidence legend:

- `PASS` = executed successfully
- `FAIL` = executed and failed
- `BLOCKED` = environment prevented execution
- `NOT RUN` = not executed
- `CODE` = source-guard only (not runtime)

| Area | Test | Result | Evidence |
| --- | --- | --- | --- |
| Auth | Tenant registration UI stays public | PASS | `/tenant-register` did not bounce to `/login` |
| Auth | Tenant registration UI submit (no companyId, env unset) | PASS | HTTP 403 “Tenant registration is not enabled”; page stayed on register |
| Auth | Tenant registration API with companyId | PASS | Live `POST /api/ecosystem/auth/register` HTTP 201 |
| Auth | Register then session hydration | PASS | Contractor register → `login()` → `/contractor-dashboard`, no bounce |
| Auth | Refresh after register/login | PASS | Contractor dashboard survived reload |
| Auth | Logout then login again | PASS | `/api/auth/logout` then tenant A login reached `/tenant-dashboard` |
| Auth | Contractor registration UI | PASS | Form with company ID; created `@mantis-e2e.test` contractor |
| Tenant | Profile / overview | PASS | Browser welcome: E2E Property A, rent due $0.00, lease active |
| Tenant | Listings | PASS | Live public listings HTTP 200, 2 E2E properties |
| Tenant | Viewing | PASS | Live `POST /viewings` HTTP 201 |
| Tenant | Application | PASS | Live `POST /applications` HTTP 201 |
| Tenant | Lease | PASS | Live `GET /me/leases` HTTP 200 |
| Tenant | Payments | PASS | Browser showed seed receipt and canonical `RCPT-…-2026-10` $500 |
| Tenant | Receipts | PASS | Live own receipt 200; cross-tenant 404; tenant read canonical receipt 200 |
| Tenant | Documents | PASS | Allowlist + 403 on tax file and Property B file |
| Maintenance | Request | PASS | Live HTTP 201; browser submitted “Browser tap leak” (API listed it) |
| Maintenance | Quotes | PASS | Live $100/$120/$95; agent saw 3; contractor A did not see competitors |
| Maintenance | Owner approval | PASS | Owner A 200; Owner B 403 |
| Maintenance | Owner decline | PASS | Live DECLINE HTTP 200 |
| Maintenance | Owner request-changes | PASS | Live REQUEST_CHANGES HTTP 200; quote amount unchanged; start-work 403 |
| Maintenance | Agent authorisation | PASS | Live authorise HTTP 200 |
| Maintenance | Start work before approvals | PASS | Live 403; contractor browser session POST also 403 |
| Maintenance | Completion | PASS | Accept → start → complete → tenant confirm HTTP 200 |
| Maintenance | Reopen from COMPLETED | PASS | `confirm:false` → REOPENED (not from CLOSED) |
| Maintenance | Change order | PASS | API +50; original quote remained 100 |
| Maintenance | Change order UI | NOT RUN | No change-order control on contractor job cards |
| Maintenance | Full browser quote cycle | PARTIAL | Tenant/agent/owner/contractor pages exercised; invite→complete not finished in UI |
| Contractor | Portal / quote / job | PASS | Browser invitations, quotes ($40/$88/$80/$100), completed jobs |
| Owner | Approval / isolation | PASS | Live Owner B 403; browser quotes page has Approve/Decline/Request changes |
| Notifications | In-app | PASS | 23 SENT in workflow; 1 SENT in failure test |
| Notifications | SMS skipped | PASS | 8 SKIPPED when unset |
| Notifications | WhatsApp skipped | PASS | 8 SKIPPED when unset |
| Notifications | SMS failure + idempotency | PASS | SMS FAILED, in-app SENT, single in-app row for duplicate key |
| Security | Tenant isolation | PASS | Receipt 404, maintenance 403, document 403 |
| Security | Contractor isolation | PASS | Competitor quotes hidden; agency quote list 403 |
| Security | Owner isolation | PASS | Owner B cannot approve/read Owner A quote |
| Security | Company isolation | PASS | Agent B review 404; Company B jobs isolated |
| Security | Document authorization | PASS | Live 403 on tax + cross-property files |
| Security | System-admin bootstrap | FAIL for prod enablement | Reviewed; still hardcoded; not deleted — see bootstrap review |
| Financial | Overlay does not post | PASS | Unit: no `await postPaymentAccounting`; `posted: false` |
| Financial | Quote workflow journals | PASS | 0→0 journals; payments 1→1 |
| Financial | Live PMS `createPayment` | PASS | POST `/api/payments` 201; payments 1→2; journals 0→2; intents 0 |
| Financial | Online payment intent | PASS | Flag off → HTTP 403 |
| Flags | Default off | PASS | Unit |
| Flags | Route enforcement | PASS | Unit + live online-payments 403 |
| Flags | Per-company only (no env override) | PASS | Env unset; Company B flags off → 403; Company A → 200 |
| Build | Server typecheck | PASS | `npx tsc --noEmit` EXIT 0 |
| Build | Ecosystem tests | PASS | `npm run test:ecosystem` 13/13 |
| Build | Client lint | PASS | Ecosystem eslint 0 errors / 7 warnings |
| Build | Client production | PASS | After AuthContext/PortalRegister: EXIT 0, 2611574 ms, main 181.47 kB gzip, lazy chunks |
| UI | Existing login page | PASS | Browser |
| UI | Existing agent dashboard | PASS | E2E Agency A workspace loaded |
| UI | Existing owner dashboard | PASS | Owner money summary + activity feed; no overlay mutations of PMS finance |
| UI | Mobile 375/390/430 | PASS | Menu drawer; no horizontal overflow on contractor dashboard; register/login render |
| DB | Integrity jobs | PASS | Detection-only; no DROP/DELETE/TRUNCATE; incomplete ownerIncome flagged on E2E payment only |
