# MANTIS PHASE 5 — IMPLEMENTATION REPORT

## 1. Final status

**PASS WITH DOCUMENTED RISKS**

The rental operating sequence is connected on the existing letting, application, lease, payment, maintenance, and levy records. Backend gates were exercised over HTTP. The listening API on this machine is `node dist/index.js` from before these source edits, so the new screens were not clicked through in a browser. Inbox delivery was not verified. Phase 6 was not started.

## 2. Executive summary

Phase 5 extends the Phase 4B letting module instead of adding a second application, lease, levy, or accounting engine. Landlord price approval and applicant selection now require the authenticated owner role and the landlord linked to that property. A signed mandate requires a stored document reference. Listing activation stays blocked until an approved assessment and a signed mandate exist. Lease activation checks signatures and completed deposit payments on the server, and a repeated activation does not write a second audit. The rent board classifies each lease from completed rental payments for the current period. Maintenance payment requests and levy receipt filing remain operational records: the Phase 5 HTTP run created no journals.

## 3. Phase 4–4C findings reviewed

- `MANTIS_PHASE_4_IMPLEMENTATION_REPORT.md`: **FAIL**. The agency navigation and notification policy existed, but the live workflow was not accepted.
- `MANTIS_PHASE_4B_IMPLEMENTATION_REPORT.md`: **FAIL**. Assessment, mandate, listing, application, lease, rent board, maintenance request, and levy receipt code existed and the unit checks passed. Live HTTP, browser, and the real payment posting were not done. There is no separate `MANTIS_PHASE_4B_VERIFICATION_REPORT.md`.
- `MANTIS_PHASE_4B1_VERIFICATION_REPORT.md`: **PASS WITH DOCUMENTED RISKS**. The disposable owner amount is $796.05. Notification status `SENT` means `sendMail` returned. The inbox was not verified.
- `MANTIS_PHASE_4C_IMPLEMENTATION_REPORT.md`: **PASS WITH DOCUMENTED RISKS**. `Property.ownerId` is the creating user, `propertyOwnerId` is the landlord, `agentId` is the assignment, and `companyId` is the boundary. Portfolio access stays in `server/src/utils/propertyAccess.ts`. That helper was not widened.

The historical payment `6acb543e271b8f1011240e3f` still had count 1 after the Phase 5 run. Phase 5 did not recalculate the owner waterfall.

## 4. Initial workflow gap analysis

The Phase 4B routes under `/api/agents/letting` already stored assessments, mandates, listings, lease drafts, rent-board rows, maintenance payment requests, and levy receipts. The gaps that Phase 5 closed:

- Owner approval and applicant selection were reachable by a senior role on the agent router. A pure owner could not call those routes because `isAgent` blocks the owner role.
- `RentalMandate.ownerId` was filled from `Property.ownerId` (the creating user) while the schema references `PropertyOwner`.
- A mandate could be marked `SIGNED` with no document.
- Listing references could not be marked inactive, and there was no last-verified date.
- Lease preparation did not prove the tenant belonged to the same company. An agent could set `ownerSignedAt`. Activation wrote another audit when the lease was already active. Deposit totals included a completed payment even after a reversal document pointed at it.
- The rent board summed every completed rental payment on the property for the month, across leases and currencies.
- Maintenance requests trusted `req.body.changeOrderApproved`.
- Filing the same levy receipt saved and audited again.
- Senior portfolio counts were company-wide for senior roles, which matches those roles, but ordinary agents already received 403. The counts were not split into the operational indicators the workflow needs.
- Owner and agent screens did not expose the decision steps that the routes already had.

`OWNER_REJECTED` remains the stored state for a landlord asking for changes. A new status was not added. `SENT_TO_OWNER` can move to `OWNER_APPROVED`, `OWNER_DECLINED`, or back to `UNDER_REVIEW` when the landlord asks for further consideration.

## 5. Existing features reused

- `PropertyAssessment`, `RentalMandate`, `ListingReference`, and `AgencyWorkflowEvent` in `server/src/agency/lettingModels.ts`
- Transition helpers in `server/src/agency/lettingWorkflow.ts` and `server/src/ecosystem/workflowMachine.ts`
- `RentalApplication` statuses already stored by the schema
- `Lease` fields `agencyWorkflow`, `applicationId`, `tenantSignedAt`, `ownerSignedAt`, `depositAmount`
- `Payment` completed status, `depositAmount`, `reversalOfPaymentId`, and `currency`
- `PaymentRequest.readyForAccounting` and `MaintenanceChangeOrder`
- `LevyPayment` receipt fields
- `callerCanAccessProperty` and `propertyIdsForCaller`
- `Notification` with `payload.skipEmail`, so the existing mail hook does not run
- Agent property workflow card, applications page, rent board, search, accountant work queue, and owner property details

## 6. New features implemented

- Owner routes for assessment decision, shortlist decision, owner signature, and the owner letting workspace
- Listing status update, including inactive (`REMOVED`) and optional `lastVerifiedAt`
- Server rent-board rows scoped to the lease, currency, and current rental period
- Senior portfolio indicators on the agent dashboard for senior roles and on the accountant dashboard
- Accountant rent board at `GET /api/accountants/letting/rent-board`
- In-app notices for the workflow transitions listed in section 15
- Permanent HTTP suite `server/src/scripts/runPhase5AgencyWorkflowTests.ts`

No second accounting, levy, lease, or application model was added.

## 7. Property assessment and mandate workflow

**Implemented and tested over HTTP.**

An agent in the property portfolio creates a draft and submits `ASSESSMENT_SUBMITTED`. The landlord, matched by the owner login email to `Property.propertyOwnerId` or the owner `properties` list, approves or rejects on `POST /api/owners/letting/assessments/:id/decision`. The stored decision keeps `approvedRent`, `decidedBy`, `decidedAt`, and `decisionComment`. `OWNER_APPROVED` has no outgoing transition, so a later reject does not overwrite it. A new assessment row is a later version; listing gates still accept an existing `OWNER_APPROVED` row.

An agent cannot approve. A user whose role is `agent` and whose roles include `admin` cannot approve. Another owner in the same company receives 404. A user from another company receives 403 on the owner router.

The mandate stores `ownerId` as the `PropertyOwner` id. `SIGNED` requires a document URL already on the row or in the request. The response does not claim electronic-signature verification.

## 8. External listing-reference workflow

**Implemented and tested over HTTP.**

`POST /api/agents/letting/listings` records a manual reference (`PRE_LISTING` unless `ACTIVE` is requested). `ACTIVE` is rejected until the assessment is `OWNER_APPROVED` and a mandate is `SIGNED`. The response includes `publishedExternally: false`. No PropertyBook or Property.co.zw API is called.

`POST /api/agents/letting/listings/:id/status` updates the same `ListingReference`. Another agent and another company receive 404. The property record is not duplicated.

## 9. Application state-machine reconciliation and shortlist

**Implemented and tested over HTTP.**

The stored enum was already the workflow enum. No parallel status list was added. The agent applications page now offers the shortlist path through the existing ecosystem status route: `UNDER_REVIEW`, `SHORTLISTED`, `SENT_TO_OWNER`, then the landlord decision. `SUBMITTED` to `SHORTLISTED` returns 400. Agent `OWNER_APPROVED` still returns 403 with `Owner approval is a separate gate`.

The landlord workspace returns shortlisted applications without agent notes. `APPROVED` selects the applicant, `DECLINED` stores `OWNER_DECLINED`, and `FURTHER` returns the application to `UNDER_REVIEW`. Another landlord receives 404. Another agent's application queue does not include the applicant. Status history remains on the application, and `AgencyWorkflowEvent` records the owner decision.

## 10. Lease activation gates

**Implemented and tested over HTTP.**

`POST /api/agents/letting/leases` requires `OWNER_APPROVED`, a tenant in the same company, and a property the caller can access. A second call returns the existing lease. A tenant from another company returns 404 and does not create a lease.

Activation in `activateAgencyLease` checks, in order: application `OWNER_APPROVED`, `tenantSignedAt`, completed `depositAmount` on that lease after excluding reversed payments, and `ownerSignedAt`. Pending and failed payments do not qualify. The agent cannot set the owner signature. The owner route records `ownerSignedAt` and returns `financialPosting: false`. A timestamp is not a cryptographic signature. An already active lease returns `duplicate: true` and does not add another `LEASE_ACTIVATED` audit. Rejected activation does not change the lease status. The deposit fixture did not create a journal.

## 11. Rent collection calculations and data sources

**Implemented and tested over HTTP.**

`buildRentBoardRows` in `server/src/agency/lettingController.ts` reads active leases in the caller portfolio and completed `Payment` rows with `paymentType` `rental` or `introduction`, `rentalPeriodMonth`, and `rentalPeriodYear` equal to the current month. Payments are matched by `leaseId`, or by property and tenant when `leaseId` is absent. Reversal documents and their originals are excluded. A levy-typed payment inserted beside an overdue lease was not counted. A payment dated to the next period was not counted as this month's receipt.

Status comes from `classifyRentCollection`: `PAID`, `PARTIALLY_PAID`, `OVERDUE`, or `DUE`. Two currencies on one lease set `mixedCurrency` and leave `outstanding` null. Amounts are not converted. The HTTP fixtures matched: overdue with 0 received, due for a later day in the month, partial 150, paid 400 from two payments, reversed received 0. Agents see their own leases. The accountant route sees both agents in the company and not the other company.

Payments with no rental period are not allocated. The board does not invent a balance for them.

## 12. Maintenance payment-request workflow

**Implemented and tested over HTTP. Financial posting was not performed.**

`requestMaintenancePayment` loads the quote, requires `OWNER_APPROVED`, requires a contractor job in an authorised status, and adds `OWNER_APPROVED` change-order amounts from `MaintenanceChangeOrder`. The client flag `changeOrderApproved` is ignored. A request above that total is rejected. A valid request creates one `PaymentRequest` with `readyForAccounting: true` and `financialPosting: false`. A second pending request for the same quote is rejected. The accountant work queue lists it. Journal count stayed 0. Another agent receives 404.

The request is not turned into a payment or a journal. Paying it remains the existing accountant payment path, which this phase did not call.

## 13. Levy workflow

**Implemented and tested over HTTP. No journal was created.**

Agents file a receipt on the existing `LevyPayment` through `POST /api/agents/letting/levies/:id/receipt`. The same receipt number and file return `duplicate: true` and do not add a second levy or a second audit. Another agent cannot replace the receipt. The accountant and the landlord can read the levy through the existing levy list. A caller from another company receives 404 on the receipt route. Receipt filing does not post accounting. Owner statements were not recalculated.

## 14. Senior-agent portfolio and search

**Implemented and tested over HTTP.**

`isSenior` remains admin, principal, prea, and accountant. An ordinary agent receives 403 on `GET /api/agents/letting/portfolio` even if the query includes another company id. A principal reading `GET /api/accountants/letting/portfolio` received a property count equal to the two properties in that company, not the other company. Counts are operational: assessments, mandates, listings, applications, draft leases missing a signature, rent rows that are due, overdue, or partial, pending maintenance requests, and levies with no receipt number.

Search uses the portfolio helper and ignores a client-supplied company id. It returns property names and lease status, not applicant documents. The individual dashboard sidebar was not edited. The Phase 4B source check still asserts that sidebar does not link to `letting/portfolio`.

## 15. Notification behavior and delivery evidence

**In-app records were tested. Delivery was not.**

`server/src/agency/workflowNotify.ts` writes one `Notification` per idempotency key. `payload.skipEmail` is true, so the model does not call `sendMail`. A notification error is logged and does not throw, so it cannot roll back the business save. The HTTP test observed one owner notice for `assessment-submitted:{id}`.

Notices are attempted for assessment submission, the owner price decision, a signed mandate, a shortlist sent to the owner, the owner applicant decision, lease activation, and a maintenance request waiting for an accountant. This is an application record only. It is not evidence that an email, SMS, or inbox message arrived.

`AgencyWorkflowEvent` stores actor, entity, previous state, new state, reason, and timestamp. Passwords, bank details, and applicant document contents are not written into those events.

## 16. Company and agent access-control results

**Tested over HTTP. 65/65 Phase 5 checks passed. Phase 4C 40/40 passed.**

Covered in `runPhase5AgencyWorkflowTests.ts`: unauthenticated rent board 401; agent versus senior versus owner on assessment approval; another owner; another company; shared-landlord workspace 404; listing changes by another agent; application queue isolation; lease tenant mismatch; maintenance request by another agent; levy receipt by another agent; portfolio query company id ignored; search company id ignored. Denied writes were checked by stored status, duplicate counts, and a journal count that stayed 0.

Phase 4C was re-run after these edits: `Phase 4C access-control checks: 40/40 passed`, exit 0.

## 17. Database migrations

No migration was added. Two optional fields were added to existing collections: `PropertyAssessment.decisionComment` and `ListingReference.lastVerifiedAt`. Existing documents remain valid because neither field is required. No backfill, rename, or unique-index change was made. Historical payments, journals, and ownership fields were not rewritten.

## 18. Files changed and reasons

- `server/src/agency/lettingController.ts` — landlord decisions, mandate document gate, listing update, lease gates, rent board, maintenance amount check, levy idempotency, portfolio counts
- `server/src/agency/lettingModels.ts` — optional decision comment and last-verified date
- `server/src/agency/workflowNotify.ts` — idempotent in-app notices
- `server/src/routes/agentRoutes.ts` — listing status route
- `server/src/routes/ownerRoutes.ts` — owner decision and signature routes
- `server/src/routes/accountantRoutes.ts` — accountant rent board
- `server/src/ecosystem/routes.ts` — maintenance list uses the portfolio helper
- `server/src/ecosystem/services/tenantPortalService.ts` — shortlist notice on the existing status route
- `server/src/scripts/runPhase5AgencyWorkflowTests.ts` — permanent HTTP suite
- `client/src/pages/agency/AgencyPropertyWorkflow.tsx` — submit, mandate document, listing reference
- `client/src/pages/agency/AgencyOperationsPages.tsx` — rent board, search errors, senior portfolio
- `client/src/pages/agency/AccountantWorkQueuePage.tsx` — loading and error states
- `client/src/pages/ecosystem/AgencyEcosystemPages.tsx` — shortlist actions and server error text
- `client/src/components/owner/OwnerLettingDecisions.tsx` — landlord price and applicant decisions
- `client/src/components/owner/PropertyDetails.tsx` — hosts the decision panel on the existing owner property page
- `client/src/pages/AgentDashboard.tsx` — portfolio route
- `client/src/components/Layout/AgentSidebar.tsx` — portfolio link for senior roles only
- `client/src/App.tsx` — accountant portfolio and rent-board routes
- `client/src/components/Layout/AccountantSidebar.tsx` — links to those routes
- `MANTIS_PHASE_5_IMPLEMENTATION_REPORT.md` — this report

`explainOwnerWaterfall`, payment posting, tax projection, trust accounting, and reversal logic were not edited.

## 19. Tests, commands, and actual exit codes

Commands were run from `server` with `NODE_ENV=development` unless noted. Client commands were run from `client`.

| Command | Result |
| --- | --- |
| `npx ts-node --transpile-only src/scripts/runPhase5AgencyWorkflowTests.ts` | **65/65 passed, exit 0** |
| `npx ts-node --transpile-only src/scripts/runPhase4cAccessControlTests.ts` | **40/40 passed, exit 0** |
| `npx ts-node --transpile-only src/scripts/runPhase4AgencyWorkflowTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase4bAgencyWorkflowTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2aSafetyTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2bCompletenessTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2cAccountingIntegrityTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2dWritePathLockdownTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase2FinancialHardeningTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase3AccountingTrustTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runPhase3cDuplicateConsolidationTests.ts` | exit 0 |
| `npx ts-node --transpile-only src/scripts/runEcosystemTests.ts` | 13 checks passed, exit 0 |
| `npx tsc --noEmit --pretty false` | exit 0 |

Not run, and not counted as passed:

- Phase 2.6, 2.7, and 2.8 HTTP harnesses are not in `server/src/scripts`.
- `phase4b1LiveAcceptance.ts` posts a live payment and was not repeated.
- `phase4b1SecurityRetest.ts` calls the API on port 5000 and re-sends the owner notice for the existing 4B.1 payment. It was not repeated.

## 20. Build and lint results

Server `tsc --noEmit`: exit 0.

Client `npm run build` on the final source: **exit 0**. The build compiled with the repository's existing ESLint warnings. `AgencyPropertyWorkflow.tsx` was not in that warning list. `OwnerLettingDecisions.tsx` line 23 was still reported as a `react-hooks/exhaustive-deps` warning even though the effect depends on the load callback. The warning does not fail the build.

There is no separate server lint script. Client lint is the ESLint pass inside `react-scripts build`.

## 21. Browser acceptance results

**Not verified in the browser.**

`server` `npm start` is `node dist/index.js`. That process was already running and was not rebuilt or restarted, so it is not serving this Phase 5 source. Phase 5 fixtures are deleted at the end of the HTTP suite. No disposable login was clicked through the assessment, shortlist, lease, rent board, maintenance, or levy screens. HTTP coverage is not a browser pass.

## 22. Financial integrity checks

The Phase 5 suite's journal count for the disposable companies stayed 0 across assessment, mandate, listing, lease activation, deposit fixtures, maintenance requests, and levy receipt filing. Deposit rows were inserted as `Payment` documents and were not sent through `ensurePaymentAccountingPosted`. Maintenance approval did not create a `Payment`. Levy receipt filing did not create a second levy or a journal.

Phase 2A, 2B, 2C, 2D, financial hardening, Phase 3 accounting/trust, and Phase 3C duplicate consolidation all exited 0. The owner waterfall calculator was not changed. The historical payment count for `6acb543e271b8f1011240e3f` was 1.

## 23. Individual dashboard regression results

No individual dashboard route, sidebar, tax page, or accounting page was edited. `runPhase4bAgencyWorkflowTests.ts` still asserts that `client/src/pages/IndividualDashboard/components/Sidebar.tsx` does not reference `letting/portfolio`, and that suite exited 0. The individual dashboard was not opened in a browser in this phase.

## 24. Remaining risks and unverified items

- Browser clicks against a server built from this source were not done.
- Notification rows are in-app only. Email delivery was intentionally not attempted, and no inbox was checked.
- A signed mandate or lease signature is a recorded timestamp and document reference, not a signature-verification provider.
- External listing rows are manual. Nothing was published to PropertyBook or Property.co.zw.
- Rent status ignores payments that have no rental period month and year. Mixed currencies are shown separately and are not converted.
- A maintenance payment request still has to be paid through the existing accountant payment flow. That flow was not executed.
- A levy receipt does not mean the levy was financially posted.
- Phase 2.6–2.8 harnesses are absent.
- Phase 4B.1 live payment acceptance was not repeated.
- The dev database logs an existing duplicate-key warning while ensuring a payment index on `companyId` and `referenceNumber`. Phase 5 did not change that index.

## 25. Recommended next steps

1. Rebuild and restart the API from this source, then click the agent property workflow, owner decision panel, rent board, and accountant work queue with disposable users.
2. If email notices are required, send them through the existing notification service and record provider acceptance separately from the business save.
3. Keep Phase 6 unstarted until that browser pass is recorded.
4. Do not backfill historical payments or assessments as part of a later phase without a separate plan.

## Evidence labels

| Item | Label |
| --- | --- |
| Assessment, mandate, listing, application, lease gates, rent board, maintenance request, levy receipt, portfolio, search | Implemented and tested over HTTP |
| In-app notification row for assessment submission | Tested over HTTP |
| Email, SMS, or inbox delivery | Not tested |
| Browser screens | Not tested |
| External portal publishing | Not implemented |
| Electronic signature verification | Not implemented |
| Maintenance request converted to a journal or payment | Not implemented, and the HTTP test showed it did not happen |
| Phase 2.6–2.8 | Not present |
| Phase 4B.1 live acceptance | Not re-run |
