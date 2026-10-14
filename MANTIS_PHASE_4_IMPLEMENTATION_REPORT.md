# MANTIS Phase 4 Implementation Report

**Status: FAIL**

Phase 4 did not complete the Harare agency operating cycle. The work that landed is a navigation and notification slice on top of existing agency, ecosystem, and accounting code. An agent still cannot run property acquisition through listing, shortlist, lease activation, rent collection, maintenance payment, and levy receipt as one connected workflow.

## Executive summary

The forensic audit found that agency viewings, applications, maintenance quotes, levies, owner preferences, owner statements, and the Phase 3 owner waterfall already exist. Accounting Integrity is already registered at `/accountant-dashboard/accounting-integrity`. The agent sidebar item labelled Reports pointed at inspections.

This phase fixed that navigation, grouped the existing agent and accountant menus, added an operational owner-collection queue, and added an owner rent email that runs after payment accounting. It did not add assessment, mandate, or listing records. It did not change lease activation, the rent collection view, maintenance payment requests, or levy receipt filing. It did not recalculate owner amounts.

## Harare rental workflow mapped to Mantis

| Step | Status |
| --- | --- |
| Existing properties, tenants, leases, payments, levies, files, inspections, tasks, schedule | REUSED |
| Viewings and applications (ecosystem models and agent pages) | REUSED, not extended to the requested shortlist/owner-approval chain |
| Maintenance quotes, owner approval, and agent authorisation | REUSED, not extended with a new payment-request queue |
| Owner statement and stored waterfall | REUSED from Phase 3. No new calculator |
| Assessment, agreed price, mandate, listing portals | NOT IMPLEMENTED |
| Side-by-side application shortlist and owner applicant approval | NOT IMPLEMENTED. A workflow machine already names SHORTLISTED and SENT_TO_OWNER; the stored application enum does not include those states and was left unchanged |
| Lease activation gated on tenant signature, deposit, and owner signature | NOT IMPLEMENTED |
| Rent collection board (due, overdue, partial, paid) | NOT IMPLEMENTED |
| Owner rent email with opt-out and idempotency | IMPLEMENTED |
| Owner collection request, ready, collected, acknowledged | IMPLEMENTED as an operational record only |
| Maintenance expense and levy reflected through accounting | NOT CHANGED. Existing accounting remains the only path |
| Senior-agent portfolio and global search | NOT IMPLEMENTED |

## Existing features reused

- Agent routes for properties, tenants, leases, owners, payments, levies, files, maintenance, quotes, contractors, viewings, applications, inspections, tasks, and schedule.
- Ecosystem viewing requests and rental applications.
- Ecosystem maintenance workflow, including owner quote approval before work.
- `OwnerPreferences` for owner communication settings.
- `sendMail` and the existing agent payment email. Owner email is a separate downstream call.
- Phase 3 `explainOwnerWaterfall`, owner statements, and the financial trace. Phase 4 does not calculate a second owner amount.
- Canonical payment create and `ensurePaymentAccountingPosted`.

## New features implemented

- `ownerRentNotificationPolicy.ts` decides send versus skip, builds the owner email, and delivers it through an injected store.
- `OwnerRentNotice` stores one row per `owner-rent-payment:{paymentId}`. A SENT or SKIPPED_OPT_OUT row is not sent again.
- `notifyOwnerOfRentPayment` runs after accounting is posted on the accountant create path, and after the agent payment is saved on the agent create path. The function catches its own errors.
- `OwnerPreferences.rentPaymentEmails` defaults to enabled. `false` suppresses the email. Missing preferences stay enabled.
- `OwnerCollection` records an operational amount and status. Advancing a status does not create a payment, journal, or property-account line.
- Agent and accountant pages at `owner-collections`.

## Agent navigation changes

IMPLEMENTED. The sidebar is grouped into Overview, My work, Rentals, Owners, Operations, Finance, Reporting, and Settings. Inspections is labelled Inspections and opens `/agent-dashboard/inspections`. Agent Reports opens the existing property-details report. Action Centre opens the existing workflow page. Collections opens the new operational queue. No existing route was removed.

## Accountant navigation changes

IMPLEMENTED. Daily finance, revenue, reporting, tax, trust, control, sales, and admin are grouped. Accounting Integrity, Financial Controls, Revenue, Ledger, Levies, and Data Sync remain. Data Sync stays under Admin and is still limited to admin users. Owner Collections was added.

## Owner workflow changes

IMPLEMENTED for rent email preference and collection status only. The owner portal was not given new approval screens. Owners still use the existing owner dashboard.

## Payment notification implementation

IMPLEMENTED.

Sequence:

1. Payment is created through the existing payment API.
2. On the accountant path, accounting is posted first.
3. `notifyOwnerOfRentPayment` loads the property owner in the same company.
4. The email states the owner name, property name, amount received, payment date, and agency name.
5. The body does not include a tenant identifier or bank details.

Rental and introduction payments with a positive amount are eligible. Sale payments and non-positive amounts are ignored. Introduction remains a rental-domain payment type; this notification does not reclassify it.

## Owner notification preference and opt-out

IMPLEMENTED. `rentPaymentEmails: false` on `owner_preferences` records SKIPPED_OPT_OUT and does not call the mailer. The payment function does not read that preference before saving the payment.

## Maintenance workflow integration

NOT IMPLEMENTED as a new request queue. The existing ecosystem maintenance and quote workflow was not weakened and was not extended.

## Levy workflow

NOT IMPLEMENTED. Existing levy pages remain in both sidebars.

## Owner collection workflow

IMPLEMENTED as operations only.

Allowed moves:

`OWNER_REQUESTED` → `READY_FOR_COLLECTION` → `COLLECTED` → `ACKNOWLEDGED`

A jump returns 409. The API response sets `financialPosting: false`. The amount stored is the operational amount entered for the request. It is not an owner-statement balance and it does not post to the ledger.

## Security and authorization

Agent collection routes sit behind the existing agent auth middleware. Accountant collection routes use `canViewAccountantDashboard`. Queries filter by the signed-in company. A property without an owner in that company cannot start a collection.

Direct tests for Agent A versus Company B, owner versus owner, tenant, and contractor were NOT IMPLEMENTED in this phase.

## Individual dashboard isolation

The individual sidebar file was not edited. The Phase 4 test reads that file and checks that it does not contain `owner-collections` or `Action Centre`. That check passed. An individual login was not exercised in the browser.

## Tests executed

`server/src/scripts/runPhase4AgencyWorkflowTests.ts` passed:

- opt-out decision
- email content without tenant or bank details
- a second delivery with the same key does not send again
- opted-out delivery sends nothing
- a mailer exception returns FAILED and does not throw
- collection status cannot skip ahead
- the notification and collection services do not reference `postPaymentAccounting`
- the individual sidebar does not contain the new agency labels

These tests use an in-memory notice store. They do not insert a payment or send a real email.

## Build results

- Server `tsc --noEmit`: PASS (exit 0) after the notice status type import was corrected.
- Client production build: PASS (exit 0). The build folder was produced. It was not deployed onto the port 5000 development server.

## Regression results

NOT RE-RUN in this session:

- Phase 2 hardening
- Phase 2.6, 2.7, and 2.8 HTTP matrices (those harnesses are not in the repository)
- Phase 3 waterfall and reporting tests
- Jest and Vitest
- Ecosystem tests

Payment posting, reversal, duplicate cleanup, tax, and the owner waterfall formula were not edited. The new call sits after `ensurePaymentAccountingPosted` on the accountant path. That is not a substitute for rerunning those suites.

## Known limitations

- Browser verification was not performed. The development server on port 5000 was not restarted and was not used for these tests.
- The Borrowdale Example acceptance payment (1,000 − 100 − 100 − 15.50 = 784.50, then email SENT, then collection, then a 100 maintenance expense) was not executed. No disposable company was created.
- Owner email on the agent create path is fired when the payment document is saved, which can be earlier than the accountant path's post-commit accounting step. A failure still cannot roll the payment back because the call is `void` and the function catches errors.
- There is no badge count API. Sidebar badges were not added.
- Collection amount is operator-entered. It is not read from the property-account balance.
- No retry worker was added. A FAILED notice can be delivered again because FAILED is not treated as terminal. SENT is terminal.

## Remaining risks

- A payment retry after a failed email depends on the notice row. If the first attempt failed before the row was saved, a later attempt can send. If the row is SENT, it will not send again.
- Notification and accounting were not proven together against a live payment.
- Application status names in `workflowMachine.ts` and the mongoose enum differ. Changing one without the other would reject valid transitions. They were left as they are.

## Recommended Phase 5 work

Continue the agency workflow that this phase did not build: assessment and mandate, manual listing references, application shortlist aligned with the existing workflow machine, lease gates, a server-side rent collection summary, maintenance and levy accounting requests that stay outside the ledger, and senior-agent portfolio counts. Keep using Phase 3 statements for owner money. Do not add a second posting path.

## Final status

**FAIL**

The required operating cycle is not available. The implemented notification, opt-out, collection state machine, and navigation regrouping are in the tree and covered by the Phase 4 unit test. Server typecheck passed.
