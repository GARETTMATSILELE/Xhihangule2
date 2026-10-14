# MANTIS PHASE 4C — IMPLEMENTATION REPORT

## 1. Final status

**PASS WITH DOCUMENTED RISKS**

The confirmed agent/property relationship is now the same on the property, levy, lease, maintenance, search, and owner paths that Phase 4B.1 showed were inconsistent. Cross-company reads and writes exercised by the new HTTP suite were denied, and the denied writes left the database counts unchanged. Browser login against a running API, inbox delivery, and the Phase 2.6–2.8 HTTP harnesses were not verified. Those gaps are recorded below. They are not a known failure of the controls that were tested.

Phase 5 was not started.

## 2. Executive summary

`Property.ownerId` is the user who created the property. `Property.propertyOwnerId` is the landlord (`PropertyOwner`). `Property.agentId` is the formal assignment. An agent sees a property in their company when they created it or are assigned to it. The same landlord does not grant a second agent that property. Accountants, admins, principals, and PREAs keep company-wide visibility inside their own company.

The Phase 4B.1 “Property not found” screen and the empty agent levy table came from that split: search treated a principal as company-wide, while property details and agent levies required `ownerId` to equal the agent. The disposable property had been created by an admin, so `ownerId` was the admin and `agentId` was empty.

Agent levy queries now use the same portfolio rule. Company isolation was tightened on leases, payments, levies, maintenance, owner statements, agency applications, property-owner records, and company update/delete. The financial waterfall, posting pipeline, and the Phase 4B.1 payment were not rewritten.

## 3. Phase 4B.1 findings reviewed

`MANTIS_PHASE_4B1_VERIFICATION_REPORT.md` recorded **PASS WITH DOCUMENTED RISKS**:

- A property appeared in agent search and the letting API, then property details returned “Property not found.”
- The accountant levy page showed rows. The agent levy table did not.
- The posted owner amount for the disposable receipt was **$796.05** (receipt $1,000.00, rent allocation $900.00, levy $100.00, commission $90.00, VAT on commission $13.95). The illustrative $784.50 figure belongs to the unit calculator, not that posted payment.
- Owner rent notification reached application `SENT`. Inbox delivery was not verified.
- Lease read and payment-create company checks from 4B.1 were already present and were extended, not removed.
- Phase 2.6–2.8 HTTP harnesses were not in the repository. That is still true.

## 4. Priority 1 — confirmed field meanings

Evidence is the Mongoose schema, the create/update controllers, and the owner-notification lookup. The prompt’s expected history matches the code for the two main fields, with one extra field the prompt asked to confirm.

| Field or relationship | Confirmed meaning | Written by | Used by | Authorization significance |
| --- | --- | --- | --- | --- |
| `Property.ownerId` | Required, immutable `User` ref. The creating user. When an agent creates the property this is also the responsible agent. When an admin creates it, this is the admin, not the landlord and not the assigned agent. | `createProperty`, `createAgentProperty`, `createSalesProperty` stamp `req.user.userId`. Updates no longer rewrite it. | Historical agent lists filtered on this field alone. Owner-notification lookup uses it only if `propertyOwnerId` is absent, and that lookup is a `PropertyOwner` id, so a user id does not resolve a landlord. | Portfolio membership for the person who saved the property. Not a landlord grant. |
| `Property.propertyOwnerId` | Optional `PropertyOwner` ref. The landlord. | Owner-link and property update paths. Phase 4C tests set it explicitly. | Owner dashboard context, owner rent notification (preferred), `GET /api/property-owners/by-property/:propertyId`. | Owner visibility. It does not authorize an agent. |
| `Property.agentId` | Optional `User` ref. Formal assignment. | `createSalesProperty` already set it. Standard create and agent create now set `body.agentId` or the creator, after an in-company user check. | Portfolio membership together with `ownerId`. | An assigned agent can open a property they did not create. Another agent in the company cannot. |
| `Property.companyId` | Required, immutable company boundary. | Session `req.user.companyId` on create. Client `companyId` is not authorization. | Every scoped query in this phase. | Cross-company denial. |
| `Lease.ownerId` | Creating user, not the landlord. | Lease create stamps the session user. | Not used as the agent portfolio key. Lease visibility follows the property. | A lease is visible when its property is visible in the same company. |
| `MaintenanceRequest.ownerId` | `PropertyOwner` ref on the request. | Maintenance create. | Owner maintenance screens. | Property access is still required before the request is returned. |

Company-wide property roles, already used by public property search and property reports, are `admin`, `accountant`, `principal`, and `prea`. A plain `agent` is not in that list. The Phase 4B.1 test user also had `principal`, which is why search showed an admin-created property while details, filtered by `ownerId`, did not.

## 5. Property-agent access model and changes

Canonical rule in `server/src/utils/propertyAccess.ts`:

- Company-wide roles see properties in their authenticated company.
- A pure `owner` (not also agent or sales) sees properties linked to their `PropertyOwner` in that company.
- Everyone else sees properties in their company where `ownerId` or `agentId` is their user id.
- The same `propertyOwnerId` is not a grant.

Applied on:

- `GET /api/properties`, `GET /api/properties/:id`, vacant, admin-dashboard, and the previously unauthenticated debug/public dumps (`server/src/routes/propertyRoutes.ts`, `propertyController.ts`). `getUserContext` now uses only `req.user`.
- `GET /api/agents/properties`, tenants, leases, files, payments, levy payments, and property-owner lists (`agentController.ts`).
- Letting workspace, assessments, mandates, listings, rent board, and `GET /api/agents/letting/search` (`lettingController.ts`).
- `GET/POST /api/leases` and lease mutations (`leaseController.ts`).
- Maintenance list and `GET /api/maintenance/property/:propertyId` (`maintenanceRequestController.ts`).
- Property-details report scope (`agentPropertyReportController.ts`). Non-company-wide users cannot request company scope.
- `GET /api/ecosystem/agency/applications` and viewings, plus their status posts and listing update (`ecosystem/routes.ts`).
- Property-owner reads are limited to landlords linked to a visible property. Mutation of a landlord is allowed only when every linked property is already in the caller’s portfolio, so one agent cannot rename a landlord shared with another agent (`propertyOwnerController.ts`, `propertyOwnerRoutes.ts`).
- Agent property details now resolve the landlord from `propertyOwnerId` (`client/src/pages/agent/PropertyDetailsPage.tsx`). The page still loads `getProperty` and shows “Property not found” only when that request does not return a property.

HTTP evidence from `server/src/scripts/runPhase4cAccessControlTests.ts` (40/40, exit 0):

- Agent A reads the property they saved: 200.
- Agent A reads a property whose `ownerId` is an admin and whose `agentId` is Agent A: 200.
- Agent A reads Agent B’s property with the same landlord: 404.
- `GET /api/agents/properties` contains Agent A’s properties and not Agent B’s.
- Search returns Agent A’s property and not Agent B’s.

## 6. Owner dashboard across multiple agents

`getPropertyOwnerContext` in `ownerController.ts` resolves the landlord inside the caller’s company, then unions `propertyOwnerId` and `PropertyOwner.properties`. The email fallback also requires the user’s company. It does not match a landlord in another company by email alone.

HTTP evidence:

- `GET /api/owners/properties` as the owner user returned the property saved by Agent A, the property saved by Agent B, and the property assigned to Agent A. All three share one `PropertyOwner`.
- The Company B property was not in that payload.

No second owner account or dashboard was created.

## 7. Accountant company-wide visibility

`accountant` remains in `COMPANY_WIDE_PROPERTY_ROLES`. The agent portfolio filter is not applied to that role.

HTTP evidence:

- `GET /api/properties` as the Company A accountant returned all three Company A properties and not the Company B property.
- `GET /api/levy-payments` returned Company A levy references `PHASE4C…-LEVY-A` and `PHASE4C…-LEVY-B`, and not the Company B levy.
- `GET /api/properties/:companyBPropertyId` as that accountant returned 404.

## 8. Priority 2 — levy visibility

**Root cause.** `LevyPayment` stores `propertyId` and `companyId`. It does not store an agent id. `getAgentLevyPayments` previously found properties with `ownerId === agent`, then levies for those property ids. The accountant page uses `GET /api/levy-payments`, which was company-wide. The Phase 4B.1 property was created by an admin, so the agent query matched nothing.

**Fix.** Agent levy queries, `GET /api/levy-payments`, levy create, receipt, download, and payout acknowledgement use `propertyIdsForCaller` / `callerCanAccessProperty`. No levy rows were copied and no second levy engine was added.

The agent page `client/src/pages/agent/LevyPaymentsPage.tsx` already requests `GET /api/agents/levy-payments`, keeps the array, and renders it in a MUI DataGrid with search, status, method, date filters, pagination (page size 15), a loading flag, and an error message. Empty results use the grid’s empty state. The page was not given a separate authorization rule.

HTTP evidence:

- Agent A’s levy payload included the saved-property levy and the assigned-property levy.
- It did not include Agent B’s levy or the Company B levy.
- Agent B `GET /api/levy-payments/:agentALevyId/receipt` returned 404 and did not include Agent A’s reference.
- Unauthenticated `GET /api/levy-payments` returned 401.
- The owner token on `GET /api/agents/levy-payments` returned 403.
- The accountant saw both Company A levies and not the Company B levy.
- `POST /api/levy-payments` with Company B’s property id returned 404. The levy count did not change.

## 9. Priority 3 — company isolation

The company id used for authorization is the company on the authenticated user record (`resolveCompanyContext`). A body or query `companyId` is not treated as proof.

Fixes in this phase:

- Lease list, stats, get, create, update, and lifecycle routes require the session company and property access. Create ignores a client `companyId`.
- `POST /api/payments` loads the lease in the caller’s company and checks property access before commission calculation or `payment.save`. The stored `companyId` is the session company. The same gate is on `POST /api/payments/public` and on accountant `performCreate`, which also rejects a lease whose property or tenant does not match the payment.
- Payment detail, reconciliation, repair, and status update check company and property access before a side effect. Repair keeps the existing cross-company **403** so the Phase 2D lockdown assertion still sees that denial. Portfolio denial is 404. Repair does not run after either denial.
- Owner statement and CSV (`GET /api/reporting/owner/:propertyId` and the format route) call `callerCanAccessProperty` before the report factory.
- Company `PUT /api/companies/:id` and `DELETE /api/companies/:id` throw 404 before update or delete when the id is not the caller’s company. `system_admin` is unchanged.
- Unauthenticated property debug/public/admin-dashboard routes now require auth and company scope. Ecosystem public listing search stays gated by `publicListingEnabled` and did not return the private fixtures.

## 10. Cross-company read/write security test matrix

Command:

`npx ts-node --transpile-only src/scripts/runPhase4cAccessControlTests.ts`

Working directory: `server`. `NODE_ENV=development`. Exit **0**. **40/40 passed.**

The script signs real JWTs (`issuer` `property-management-app`, `audience` `property-management-users`), mounts the real routers, and sends HTTP to that process. It does not post accounting.

| Scenario | Result |
| --- | --- |
| Company A agent reads a Company A property they saved or are assigned to | 200 |
| Company A agent reads another Company A agent’s property with the same landlord | 404 |
| Company A owner reads properties managed by both agents | 200, all three names |
| Company A agent reads another agent’s lease | 404 |
| Company A accountant reads all Company A properties and levies | 200 |
| Company A accountant reads a Company B property or levy receipt | 404 |
| Company A agent reads a Company B property | 404 |
| Company A user reads a Company B lease | 404 |
| Company A user reads Company B maintenance | 404 |
| Agent search and owner-statement export for Company B | search 200 with no Company B name; export 404 |
| Agency application queue | 200, Company B applicant note absent |
| Public listing search | 200, private names absent |
| Individual workspace property list | 200, agency names absent |
| Unauthenticated property and levy requests | 401 |
| Owner token on the agent levy route | 403 |
| Company A user creates a lease on a Company B property | 404 |
| Company A property combined with a Company B tenant | 404 |
| Company A user creates a levy on a Company B property | 404 |
| Company A user posts a payment against a Company B lease | 404 |
| Company A property combined with a Company B lease on accountant payment create | 404 |
| Agent A posts a payment on Agent B’s lease | 404 |
| Company A user updates or deletes Company B | 404, Company B name unchanged |

## 11. Database side-effect assertions for rejected requests

Before the denied writes, the script counted payments, leases, levies, maintenance requests, notifications, and `journalentries` for the three disposable companies. After the denied lease, levy, and payment posts, the counts were identical. The check name is “Rejected writes created no payments, leases, levies, maintenance, notifications, or journals.”

Company B’s name was read before and after the denied update and delete. It stayed `PHASE4C… Agency B`.

The Phase 4B.1 payment `6acb543e271b8f1011240e3f` still matched one document. It was not updated or deleted. Disposable Phase 4C fixtures were deleted in the test `finally` block. Journals were not deleted.

## 12. Owner notification evidence and delivery limitations

No notification code was changed. Re-read of `ownerRentNotificationPolicy.ts` and `ownerRentNotificationService.ts`:

1. **Application attempted to send.** `notifyOwnerOfRentPayment` returns immediately unless `accountingComplete === true`. `deliverOwnerRentNotice` returns `NOT_READY` unless that flag is true. Opt-out is `rentPaymentEmails === false`, which saves `SKIPPED_OPT_OUT` and does not send. The idempotency key is `owner-rent-payment:${paymentId}`. An existing `SENT` or `SKIPPED_OPT_OUT` row is returned without another send.
2. **Provider accepted the message.** `SENT` is stored only after `sendMail` resolves. Phase 4B.1 recorded that application result. This phase did not call the provider.
3. **Provider reported delivery.** Not available.
4. **Message verified in a test inbox.** Not verified.

A send failure is caught inside `deliverOwnerRentNotice`, saved as `FAILED`, and then caught again by `notifyOwnerOfRentPayment`, which logs and does not throw. The payment save is earlier and is not rolled back by that catch. The landlord lookup prefers `propertyOwnerId` and adds the payment’s `companyId`.

Phase 4 and Phase 4B unit checks that cover opt-out, retry, and “email failure does not throw” passed again. See section 16.

## 13. Financial integrity

No change was made to `explainOwnerWaterfall`, `ensurePaymentAccountingPosted`, `postPaymentAccounting`, `reconcilePayment`, commission math, VAT, tax, trust posting, or historical journals.

Phase 4 financial integrity tests passed and still report the calculator cases, including the illustrative owner amount 784.5 on a $1,000 / $100 commission / $100 levy / $15.50 VAT input. That is the unit helper. It is not the posted Phase 4B.1 payment, which remains $796.05 and was not selected for update.

`runPhase2dWritePathLockdownTests.ts` failed once because manual accounting repair no longer contained the literal `403`. The company mismatch on that route was restored to 403 before `repairPaymentAccounting` runs. The suite then passed. Portfolio access was added beside that check. The financial repair function itself was not changed.

## 14. Individual dashboard regression

Individual dashboard routes, tax services, and accounting posting were not edited for this phase.

`runPhase4AgencyWorkflowTests.ts` includes “Accounting path and individual dashboard stay separate”: PASS.

The HTTP suite created an `individual` workspace company and called `GET /api/properties` with that company’s admin token. The response did not contain the agency property names.

## 15. Files changed and why

| File | Why |
| --- | --- |
| `server/src/utils/propertyAccess.ts` | Shared company, portfolio, landlord, and property-owner checks. |
| `server/src/controllers/propertyController.ts` | Details, lists, create, and update use the portfolio rule. Session company only. |
| `server/src/routes/propertyRoutes.ts` | Debug, public, and admin-dashboard property routes require auth and company scope. |
| `server/src/controllers/agentController.ts` | Agent lists, levies, and property writes use the portfolio rule. Assignment must be in-company. |
| `server/src/controllers/agentPropertyReportController.ts` | A non-company-wide user cannot request company report scope. |
| `server/src/controllers/levyPaymentController.ts` | Levy list, create, receipt, and payout follow property access. |
| `server/src/controllers/leaseController.ts` | Lease reads and writes are company- and property-scoped. |
| `server/src/agency/lettingController.ts` | Workspace, search, and workflow mutations require property access. |
| `server/src/controllers/ownerController.ts` | Owner context is company-scoped and unions the landlord’s properties. |
| `server/src/controllers/maintenanceRequestController.ts` | Maintenance list and property maintenance follow property access and return HTTP errors. |
| `server/src/controllers/paymentController.ts` | Payment create, read, and status changes check company and property access before side effects. |
| `server/src/controllers/propertyOwnerController.ts` | Landlord reads and writes follow the portfolio link. |
| `server/src/routes/propertyOwnerRoutes.ts` | Owner-by-property uses `propertyOwnerId` and property access. |
| `server/src/controllers/companyController.ts` | Update and delete refuse another company’s id before writing. |
| `server/src/reporting/api/index.ts` | Owner statement and CSV check property access first. |
| `server/src/ecosystem/routes.ts` | Agency applications, viewings, and listing update follow property access. |
| `client/src/pages/agent/PropertyDetailsPage.tsx` | Landlord fallback uses `propertyOwnerId`. |
| `server/src/scripts/runPhase4cAccessControlTests.ts` | Permanent HTTP regression suite. |
| `MANTIS_PHASE_4C_IMPLEMENTATION_REPORT.md` | This report. |

## 16. Build, lint, and test commands

All commands were run on 12 October 2026. Server commands used `NODE_ENV=development` from `server/`. Client build used `CI=false` so pre-existing ESLint warnings did not fail the production compile.

| Command | Exit |
| --- | --- |
| `npx tsc --noEmit --pretty false` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase4cAccessControlTests.ts` | 0 (40/40) |
| `npx ts-node --transpile-only src/scripts/runPhase4FinancialIntegrityTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase4AgencyWorkflowTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase4bAgencyWorkflowTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2aSafetyTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2bCompletenessTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2cAccountingIntegrityTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2dWritePathLockdownTests.ts` | 0 after the repair 403 restoration. The first run in this session exited 1. |
| `npx ts-node --transpile-only src/scripts/runPhase2FinancialHardeningTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase3AccountingTrustTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runPhase3cDuplicateConsolidationTests.ts` | 0 |
| `npx ts-node --transpile-only src/scripts/runEcosystemTests.ts` | 0 (13/13) |
| `npm run build` in `client/` | 0. “Compiled with warnings.” “The build folder is ready to be deployed.” Warnings are existing unused-vars and hook-deps findings, plus an `import.meta` critical-dependency warning. Elapsed about 877 seconds. |

There is no separate server lint script. The client production build runs ESLint and completed.

Phase 2.6, 2.7, and 2.8 HTTP harnesses are still not in `server/src/scripts`. They were not run and are not reported as passed.

`phase4b1LiveAcceptance.ts` was not re-run. It posts a real rental payment through a live API, and nothing was listening on port 5000. Re-running it would create another financial document. The existing Phase 4B.1 payment document was only counted.

## 17. Browser acceptance results

The client dev server was already listening on port 3000. The browser opened `http://localhost:3000/login`. The sign-in form rendered (email, password, Sign in).

No API was listening on port 5000, and no Phase 4C test account was signed in. The disposable HTTP users are deleted at the end of the suite. Authenticated clicks for agent details, the levy grid, the owner dashboard, and the accountant screens were therefore not performed.

What was verified instead, against the updated routers:

- The property-details request an agent makes (`GET /api/properties/:id`) returns 200 for a saved property and for an assigned property, and 404 for another agent’s property.
- The levy request the agent page makes (`GET /api/agents/levy-payments`) returns that agent’s levies only.
- Owner and accountant list requests return the company scope described above.

Those are API results, not a clicked browser session.

## 18. Remaining risks, blocked checks, and follow-up

1. **Browser session not completed.** The login page loads. The agent, owner, and accountant screens were not clicked with a live API running this code.
2. **Inbox delivery not verified.** Application send policy was re-read and the existing unit tests passed. Provider acceptance, provider delivery, and a test inbox were not observed in this phase.
3. **Phase 2.6–2.8 HTTP harnesses are absent.** Their absence is unchanged.
4. **Phase 4B.1 live acceptance was not repeated**, because it posts accounting and the API port was closed.
5. **Coverage is the audited routes plus the HTTP matrix**, not every sales, buyer, notification, and export handler in the repository. Public listing search remains limited to `publicListingEnabled` properties. A later pass should add the same property helper anywhere a new route takes a raw id.
6. **Company-wide roles still see every property in their company.** That includes `principal` and `prea`. A user who is both agent and principal is company-wide on purpose. That is the existing search rule, not a new grant.
7. **Shared-landlord edits** are denied to an agent who does not already manage every property linked to that landlord. An accountant in the company can still edit the landlord record.
8. **Client build warnings** are pre-existing and did not fail the build.

## 19. Final go/no-go recommendation for Phase 5

**Phase 5 is not blocked by a failing access-control test.** The three Phase 4C priorities pass on the HTTP evidence above, and the financial engine was left unchanged.

Phase 5 should still treat the unverified browser session and inbox delivery as open verification items, not as completed checks. Phase 5 was not started in this work.
