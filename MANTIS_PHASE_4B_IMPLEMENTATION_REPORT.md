# MANTIS Phase 4B Implementation Report

## 1. Status

**FAIL**

The agency workflow code is now connected, and the available unit and source suites passed. Phase 4B does not move to PASS WITH DOCUMENTED RISKS. The Borrowdale payment was not posted through the live accounting pipeline, cross-company API calls were not executed, and the new screens were not clicked through in a browser.

## 2. Executive summary

Phase 4B extended the existing agency, ecosystem, payment, and owner-statement code. It did not add a second accounting engine.

Owner rent email now waits until `accountingComplete === true`. Incomplete accounting returns `NOT_READY` and does not send. Opt-out, the key `owner-rent-payment:{paymentId}`, and mail failure behaviour from Phase 4 remain.

New operational records cover assessment, mandate, and listing references. Applications can move `UNDER_REVIEW → SHORTLISTED → SENT_TO_OWNER → OWNER_APPROVED / OWNER_DECLINED` without removing the older statuses. An agent cannot set the owner decision on the agency status route. Lease activation for the new path checks owner approval, both signatures, and deposit cash already stored on completed payments. Rent collection status is derived on the server. Maintenance payment requests and levy receipt filing do not post journals. Owner collection amounts prefer the Phase 3 waterfall and require a reason when overridden.

## 3. Harare workflow coverage

| Workflow stage | Status | Evidence |
| --- | --- | --- |
| Assessment | IMPLEMENTED | `PropertyAssessment`, `POST /api/agents/letting/assessments` |
| Owner approval | IMPLEMENTED | `OWNER_APPROVED` / `OWNER_REJECTED` limited to senior, accountant, or owner roles |
| Mandate | IMPLEMENTED | `RentalMandate`; blocked until an assessment is `OWNER_APPROVED` |
| Listing | IMPLEMENTED | `ListingReference`; `ACTIVE` blocked until assessment is approved and mandate is `SIGNED` |
| Viewing | REUSED | Existing `ViewingRequest` rows are loaded on the property workspace. No second viewing model |
| Applications | IMPLEMENTED | Status enum, workflow machine, and mongoose schema now include the shortlist states. Older statuses remain valid |
| Shortlist | IMPLEMENTED | `POST /api/agents/letting/applications/:id/status`. Side-by-side comparison UI was not built |
| Owner applicant approval | IMPLEMENTED | Separate `owner-decision` route. Agency staff status route returns 403 for `OWNER_APPROVED` and `OWNER_DECLINED` |
| Lease draft | IMPLEMENTED | `POST /api/agents/letting/leases` creates `status: draft` only after `OWNER_APPROVED` |
| Tenant signature | IMPLEMENTED | `POST /api/agents/letting/leases/:id/signature` with `party: tenant` |
| Deposit | IMPLEMENTED as a gate | Activation sums `depositAmount` on completed payments. It does not create a payment |
| Owner signature | IMPLEMENTED | Same signature route with `party: owner` |
| Lease activation | IMPLEMENTED | `POST /api/agents/letting/leases/:id/activate` returns 403 while any gate is open |
| Rent collection | IMPLEMENTED | `GET /api/agents/letting/rent-board` derives `DUE`, `OVERDUE`, `PARTIALLY_PAID`, `PAID` |
| Owner notification | IMPLEMENTED | Sent only after canonical accounting reports complete |
| Owner collection | IMPLEMENTED | Existing queue kept. Amount comes from `explainOwnerWaterfall` unless an override reason is stored. No accounting write |
| Maintenance | IMPLEMENTED as a request queue | `POST /api/agents/letting/maintenance-payment-requests` checks owner-approved quote, agent authorisation, company, property, and amount. Response sets `financialPosting: false` |
| Levy | IMPLEMENTED as receipt filing | `POST /api/agents/letting/levies/:id/receipt` stores receipt fields on the existing levy. It does not post a new levy engine |

## 4. Financial integrity

Payment posting still goes through `ensurePaymentAccountingPosted`. The letting controller does not call `postPaymentAccounting`. Maintenance requests create a `PaymentRequest` with `readyForAccounting: true`. Levy receipt filing updates the existing levy document. Owner collection still does not create a payment, journal, or property-account line.

The Borrowdale figures were checked by calling `explainOwnerWaterfall` with gross 1000, commission 100, levy 100, and VAT 15.50. The function returned net owner 784.50 and `reviewRequired: false`. That is the Phase 3 calculator. It is not a posted payment, owner statement, financial trace, or CSV export from a live rental.

## 5. Notification integrity

- Timing: agent and accountant create paths call `notifyOwnerOfRentPayment` only when `accountingComplete === true`.
- The service returns immediately unless that flag is true.
- `deliverOwnerRentNotice` returns `NOT_READY` when accounting is incomplete, and the test asserts it does not save or send.
- Opt-out still stores `SKIPPED_OPT_OUT` and does not send.
- A second delivery with the same key does not send again after `SENT`.
- Mail failure returns `FAILED` and does not throw.
- Retry of `FAILED` uses the same idempotency key. `PENDING` is written before send and is not terminal.
- A live payment plus a real mailbox was not exercised.

## 6. Security

New agent routes sit behind the existing agent auth middleware. Accountant work-queue and portfolio routes use `canViewAccountantDashboard`. Queries include `companyId`. Owner applicant approval is rejected for a normal agent. Listing and lease routes return 409 or 403 when gates fail.

These checks were not executed as Company A versus Company B HTTP calls. Direct API denial for a second company, an unrelated owner, and an unauthenticated caller was not run in this phase.

## 7. Individual dashboard isolation

`client/src/pages/IndividualDashboard/components/Sidebar.tsx` was not edited. The Phase 4B test reads that file and asserts it does not contain `letting/portfolio`. That assertion passed. An individual login was not performed.

## 8. Test results

```text
server tsc --noEmit: PASS (exit 0, 11 Oct re-check of the audit edits was not repeated; the 10 Oct run after those edits exited 0)
client production build: PASS on 10 Oct 2026 (client/build/index.html written 10:13, after the new client files). App.tsx was saved again on 11 Oct and that later save was not rebuilt.
Phase 4 tests: PASS
Phase 4B tests: PASS
Phase 2 financial hardening: PASS
Phase 2B completeness: PASS
Phase 2C accounting integrity: PASS
Phase 2D write-path lockdown: PASS
Phase 3 accounting trust: PASS
Ecosystem tests: PASS (13 checks)
Phase 2.6 HTTP harness: NOT AVAILABLE
Phase 2.7 HTTP harness: NOT AVAILABLE
Phase 2.8 HTTP harness: NOT AVAILABLE
```

Phase 4B assertions covered the waterfall function, notification withholding, listing gates, lease gates, rent states, maintenance request gates, application transitions, next-action text, and the absence of `postPaymentAccounting` in the letting controller.

## 9. Browser verification

Not performed. The development server on port 5000 was not restarted, and the new agent and accountant screens were not clicked through. The production client build was not loaded onto that server.

## 10. Borrowdale acceptance

Not executed as a posted rental.

Unit evidence only:

```text
explainOwnerWaterfall({
  grossAmount: 1000,
  commissionAmount: 100,
  levyAmount: 100,
  vatOnCommission: 15.5,
  recordedOwnerAmount: 784.5
})
netOwnerAmount = 784.5
reviewRequired = false
```

No disposable company, payment, owner statement, CSV, owner email, collection, or maintenance expense was created for Borrowdale Example.

## 11. Known limitations

- Search covers property name and a short lease list. It does not search owners, tenants, applications, or maintenance jobs.
- The property workspace shows the next action, assessment, mandate, listings, applications, viewings, and audit events. It is not a full tabbed replacement of the existing property page.
- Application shortlist is an API transition, not a side-by-side applicant table.
- Senior portfolio counts are company-wide for admin, principal, PREA, and accountant. A dedicated senior-agent screen was not added to the agent sidebar.
- Owner decision can be recorded by a senior agency role, not only by the owner logging into the owner portal.
- Existing lease creation outside `/api/agents/letting/leases` can still default to `active`. The new activation route is the gated path.
- Collection amount uses the latest completed rental snapshot. If that snapshot is empty, the waterfall can treat the payment amount as the gross with zero deductions.

## 12. Remaining risks

- Notification timing is guarded in code and unit tests. It was not proven against a committed payment whose accounting later fails or completes on retry.
- Company isolation is in the queries. It was not proven with a second company's token.
- Historical application rows keep their old statuses. No data migration was run.
- The client build on disk predates a later `App.tsx` save on 11 Oct. That save was not rebuilt or opened in a browser.

## Final decision

**PHASE 4B RESULT: FAIL**

Implemented:
Assessment, owner price approval, mandate, listing references, application shortlist states, owner applicant decision, draft lease, signature and deposit gates, rent board, post-accounting owner email, waterfall-based owner collection, maintenance payment requests, and levy receipt filing. Existing viewings, quotes, payments, and the Phase 3 waterfall were reused.

Verified:
Phase 4, Phase 4B, Phase 2, Phase 2B, Phase 2C, Phase 2D, Phase 3, and ecosystem unit/source suites. Server `tsc --noEmit` on 10 Oct. Client production build artifact dated 10 Oct 10:13.

Not verified:
Browser click-through. Live Borrowdale payment, statement, CSV, and email. Cross-company HTTP denial. Phase 2.6, 2.7, and 2.8 HTTP harnesses (not in the repository).

Known risks:
Notification and company isolation are implemented but not proven on a running API. Search and the property workspace are thinner than the full Harare screen set.

Recommended next phase:
Stay on Phase 4B. Do not start Phase 5. The next pass should post the disposable Borrowdale rental through the canonical pipeline, run the cross-company API checks, restart the local API with the new server build, and click the agent and accountant screens.
