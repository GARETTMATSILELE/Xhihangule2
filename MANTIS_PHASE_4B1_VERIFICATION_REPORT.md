# MANTIS PHASE 4B.1 VERIFICATION REPORT

Date: 11 October 2026

## A. Final status

**PASS WITH DOCUMENTED RISKS**

Phase 4B.1 closed the live-acceptance gaps on a disposable local database. The canonical rental payment, owner statement, CSV, financial trace, notification scenarios, cross-company denial, browser walkthrough, maintenance and levy smoke tests, and the available regression suites all have evidence.

The illustrative owner figure of $784.50 was not the figure the live pipeline stored. The persisted, internally consistent result is $796.05. That difference is explained in section C and was not forced.

## B. Build verification

Database identity before any writes: `NODE_ENV=development`, no Mongo or Azure URI variables set, main database name `property-management` on localhost, accounting database name `accounting` on localhost. Credentials are not recorded.

| Check | Command | Started (UTC) | Ended (UTC) | Exit |
| --- | --- | --- | --- | --- |
| Server TypeScript, current source after the acceptance-script type fix and the company-scope edits | `npx tsc --noEmit --pretty false` in `server` | 2026-10-11 09:26:34 | 2026-10-11 09:30:31 | 0 |
| Client production build of current client source | `npm run build` in `client` | 2026-10-11 08:58:21 | 2026-10-11 09:14:19 | 0 |

The client build completed with existing warnings and printed "The build folder is ready to be deployed." No client source was changed after that build started. The 10 October build artifact was not used as evidence.

An earlier `tsc` at 09:01:20 also exited 0, but that run finished before the owner-notification lookup fix and the company-scope checks. The 09:30:31 run is the one that covers the current server source.

The development API used for acceptance was `npx ts-node --transpile-only src/index.ts` with `PORT=5000`, `NODE_ENV=development`, and `MANTIS_TEST_SEAM=1`. It logged `nodeEnv: development` and connected to local MongoDB. That process was stopped after verification so the test seam was not left running. The client dev server on port 3000 served current source for the browser walkthrough.

## C. Borrowdale acceptance

Disposable company `PHASE4B1_TEST_COMPANY` (`6acb5413271b8f101123fd6a`).

| Record | Id |
| --- | --- |
| Property `PHASE4B1_TEST_PROPERTY` | `6acb5426271b8f101123fdfb` |
| Owner `PHASE4B1_TEST_OWNER` | `6acb5428271b8f101123fe12` |
| Tenant | `6acb5428271b8f101123fe19` |
| Lease | `6acb5428271b8f101123fe1c` |
| Agent | `6acb5415271b8f101123fdb7` |
| Acceptance payment | `6acb542a271b8f101124040b` |

Setup, labelled as setup and not as the acceptance operation: company VAT profile set through `PUT /api/companies/:id` (`vatRegistered` true, effective 2020-01-01); VAT rate 15.5 set through `POST /api/accounting/tax-rates`; property settings set through the property API (rent 1000, commission 10 percent, management, exclusive VAT on commission, levy 100). The payment itself was created only through `POST /api/accountants/payments`.

Persisted payment, read back through `GET /api/accountants/payments/:id`:

| Field | Value |
| --- | --- |
| Status | completed |
| Currency | USD |
| Transaction domain | RENTAL |
| Payment type | rental |
| Gross amount | 1000 |
| Rent allocated | 900 |
| Levy allocated | 100 |
| Commission net | 90 |
| VAT on commission | 13.95 |
| Snapshot owner amount | 896.05 |
| Accounting complete | true |
| Accounting status | posted |
| Active property accounts | 1, ledger type rental |
| Journal rows for this payment | 1, source module payment |

Owner statement `GET /api/reporting/owner/:propertyId?ledger=rental&includeAllTransactions=true` returned 200.

CSV `GET /api/reporting/owner/:propertyId/csv?ledger=rental&includeAllTransactions=true` returned 200. Inspected content:

```text
Date,Type,Description,Rent Amount,Less Commission,Less VAT on Commission,Less Levies,Owner Amount,Balance
2026-10-11T00:00:00.000Z,Income,October 2026 Rent,1000,90,13.95,100,796.05,796.05
```

The CSV uses the stored commission, levy, VAT, and owner figures. It does not contain a payment-id column. That column is not part of the current owner-statement CSV header, so a payment-id match inside the file is not applicable. The row identifies the October 2026 rent on this property.

Financial trace `GET /api/accountants/payments/:id/financial-trace` returned 200 and linked payment `6acb542a271b8f101124040b`. Trace allocation: gross 1000, commission 90, levy 100, VAT 13.95, net owner 796.05, recorded owner 796.05, difference 0, `reviewRequired` false. Posting flags: owner income, agent commission, company commission, journal, and tax complete. Trust not applicable. Domain RENTAL.

Owner collection created from that payment through `POST /api/accountants/owner-collections` stored operational amount 796.05, source `OWNER_WATERFALL`, `financialPosting` false.

### Why this is not $784.50

The acceptance inputs were rent 1000, commission rate 10 percent, levy 100, and VAT 15.5 percent exclusive. The live combined-payment allocator is levy-first. From the 1000 cash receipt it allocated levy 100 and rent 900. Commission is 10 percent of the rent allocation, which is 90, and exclusive VAT is 15.5 percent of 90, which is 13.95.

```text
1000.00 received
- 90.00 commission
- 100.00 levy
- 13.95 VAT on commission
= 796.05 owner amount
```

The $784.50 illustration assumes commission of 100 on the full 1000 while also deducting the 100 levy from that same 1000. The stored calculator does not do that. The snapshot field `ownerAmount` of 896.05 is the levy-pass-through figure (owner payable plus levy). The statement, CSV, trace, and owner collection all use 796.05. Those layers agree with each other. The records were not edited to force 784.50.

A historical payment outside the test companies, `687e370b1a13203601cb3d91`, kept the same status, amount, and accounting-complete flag after the run.

## D. Notification verification

Owner emails used `phase4b1.test` addresses only. Mailtrap SMTP is configured on the API. The notice status `SENT` means `sendMail` returned without throwing. The inbox was not read back, so provider delivery is **NOT VERIFIED**.

The notification lookup now uses `property.propertyOwnerId` when that link exists, because property create stores the creating user on `ownerId` and the landlord record on `propertyOwnerId`. Without that lookup the live trigger returned before creating a notice.

| Scenario | Result |
| --- | --- |
| Successful accounting, payment `6acb542a271b8f101124040b` | Notice key `owner-rent-payment:{paymentId}` reached `SENT`. Email body fields are owner name, property name, USD 1000.00, 11 October 2026, and the test company name. The body does not contain the tenant id or bank details. |
| Idempotency | A second call of `notifyOwnerOfRentPayment` after `SENT` left one notice, status `SENT`, and the same `updatedAt`. |
| Opt-out, payment `6acb5437271b8f101124062b` | Preference set through `POST /api/property-owners/:id/preferences` with `rentPaymentEmails: false`. Notice status `SKIPPED_OPT_OUT`. Payment stayed completed and `accountingComplete` true. |
| Accounting incomplete, payment `6acb5438271b8f101124072b` | Notes contained `PHASE26_FAIL_JOURNAL` with the existing development seam. Payment stayed completed, `accountingComplete` false, and no notice row was created. |
| Mail failure, payment `6acb5432271b8f1011240536` | Development seam `PHASE4B1_FAIL_MAIL` threw once inside the real notification send. The same key later reached `SENT` on retry. One notice row. Payment status and `accountingComplete` were unchanged (`completed` / true). The failure reason remained on the row after the successful retry. The failure itself is a test seam, not a Mailtrap rejection. |

## E. Cross-company API matrix

Caller company for the "A" rows is `PHASE4B1_TEST_COMPANY`. Target company is `PHASE4B1_COMPANY_B` (`6acb5414271b8f101123fd88`) unless noted. `PHASE4B1_COMPANY_A` (`6acb5413271b8f101123fd79`) was also created and could list only its own properties.

The first pass found two holes. `GET /api/leases/:id` returned another company's lease. `POST /api/accountants/payments` accepted another company's property and created payment `6acb543e271b8f1011240e3f` for $10 with `accountingComplete` true. That disposable payment is retained because journal entries are immutable. Both holes were then closed: lease reads require the caller's company, and accountant payment create requires the property, tenant, and lease to belong to the caller's company. The retest did not create another payment.

| Method | Endpoint | Caller | Target | Status | Data exposed | Mutation |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/properties/:id` | A admin | B | 404 | no | no |
| GET | `/api/properties/:id` | A admin | A | 200 | no | no |
| GET | `/api/properties/:id` | B admin | B | 200 | no | no |
| GET | `/api/property-owners/:id` | A admin | B | 404 | no | no |
| GET | `/api/property-owners/:id` | A admin | A | 200 | no | no |
| POST | `/api/ecosystem/agency/applications/:id/status` | A agent | B | 404 | no | no |
| GET | `/api/ecosystem/agency/applications` | A admin | A list | 200 | no | no |
| GET | `/api/leases/:id` | A admin | B | 404 after fix | no | no |
| GET | `/api/leases/:id` | A admin | A | 200 | no | no |
| POST | `/api/accountants/payments` | A admin | B property and tenant | 404 after fix | no | no on retest |
| GET | `/api/accountants/payments/:id` | B admin | A | 403 | no | no |
| GET | `/api/accountants/payments/:id` | A admin | A | 200 | no | no |
| POST | `/api/agents/letting/maintenance-payment-requests` | A agent | B property | 409 | no | no |
| GET | `/api/levy-payments/:id/receipt` | A admin | B | 404 | no | no |
| POST | `/api/agents/letting/levies/:id/receipt` | A agent | B | 404 | no | no |
| GET | `/api/levy-payments/:id/receipt` | A admin | A | 200 | no | no |
| POST | `/api/accountants/owner-collections` | A accountant | B | 404 | no | no |
| GET | `/api/accountants/owner-collections` | A accountant | A | 200 | no | no |
| GET | `/api/properties` | unauthenticated | any | 401 | no | no |
| GET | `/api/accountants/payments/:id` | A owner role | A | 403 | no | no |
| GET | `/api/properties/:id` | A owner role | B | 404 | no | no |
| GET | `/api/agents/letting/properties/:id/workspace` | A agent | B | 404 | no | no |
| GET | `/api/agents/letting/properties/:id/workspace` | A agent | A | 200 | no | no |
| GET | `/api/properties` | Company A admin | A | 200 | B property absent | no |
| GET | `/api/properties` | Company B admin | B | 200 | own property present | no |

No tokens are stored in this report.

## F. Browser verification

Client dev server: `npm start` in `client`, current source, `http://localhost:3000`, proxying API calls to port 5000. Pages were opened in the browser and the rendered text was read. Direct loads of some client routes returned 404 to a plain HTTP client; in-browser navigation and the React history API rendered the screens.

Agent (`PHASE4B1_TEST_AGENT`, roles agent and principal):

- `/agent-dashboard` loaded. Sidebar groups: Overview, My work, Rentals, Owners, Operations, Finance, Reporting, Settings, plus Search.
- `/agent-dashboard/properties` loaded. The list empty state did not show the test property. Search did.
- `/agent-dashboard/properties/6acb5426271b8f101123fdfb` rendered "Property not found". The agent property-details fetch is limited to properties whose `ownerId` is that user, and this property's `ownerId` is the creating admin. Assessment, mandate, and listing were therefore not painted on that screen. They were exercised through the letting API: assessment created and owner-approved by the senior agent, a junior agent was denied the owner decision with 403, and an ACTIVE listing before a signed mandate returned 409.
- Applications: "No applications." Viewings: "No viewing requests."
- Leases page loaded. Search returned `PHASE4B1_TEST_PROPERTY` and "lease: Lease active".
- Rent collection showed `PAID`, rent 1000, received 1000, outstanding 0.
- Owner collections showed USD 796.05. "Mark ready for collection" changed the visible status to READY FOR COLLECTION. The page states that this does not post money.
- Maintenance loaded with one open request on `PHASE4B1_TEST_PROPERTY` and $0 spend.
- Levy payments table on the agent page showed no rows. The accountant levy page did show the test levy rows.
- Search loaded and returned the test property.

Accountant (`PHASE4B1_TEST_ACCOUNTANT`):

- `/accountant-dashboard` loaded with groups Daily finance, Revenue, Reporting, Tax, Trust, Control, Sales, and Admin. Data Sync was not shown for this accountant, which matches the admin-only rule.
- Payments listed the disposable rentals, including the October $1000 completed receipt. Total income shown was $4010.00 across 5 payments, which includes the four $1000 rental receipts and the retained $10 cross-company artifact.
- Owner collections showed 796.05 and READY FOR COLLECTION, with the non-posting explanation.
- Property accounts showed `PHASE4B1_TEST_PROPERTY`, rental ledger, balance $3,184.20. That equals four times $796.05.
- Work queue showed the $80 maintenance quote and the text that creating a request does not post accounting.
- Levies showed the linked levy rows for the test property, including the October cash levy of $100.
- Accounting integrity loaded: 5 checked, 4 complete, 1 incomplete, 0 mismatched.
- Reports loaded, including Export CSV. Agency revenue shown was $34.92 and client/trust collections $1,000.00 for the report period.

Individual (`PHASE4B1_INDIVIDUAL`, workspace individual):

- `/individual-dashboard` loaded.
- Sidebar items were Dashboard, Properties, Tenants, Leases, Inspections, Maintenance, Files, Rent Collection, Expenses, Bills & Levies, Accounting, VAT, Rental Tax, Income Tax, Tax Compliance, Reports, and Settings.
- Agency workflow links (applications, viewings, owner collections, work queue, mandates, agent search) were absent.
- Portfolio counts were zero and no agency payment data was shown.

## G. Maintenance and levy

Maintenance fixture records (the request, owner-approved quote version 3 for $80, and an authorised contractor job) were inserted as setup. The acceptance step was `POST /api/agents/letting/maintenance-payment-requests`.

- A request for $500 was rejected with 409, "Requested amount exceeds the approved quote", `financialPosting` false.
- A request for $80 was accepted with 201.
- Journal count for the test company was unchanged by those requests (6 before and 6 after).
- The accountant work queue returned 200 and showed the quote.

Levy receipt: a levy was created through `POST /api/levy-payments` (`6acb543c271b8f10112407df`). Filing the receipt through `POST /api/agents/letting/levies/:id/receipt` returned 200. The levy count and the journal count were unchanged by the receipt filing. The owning company could read the receipt (200). The other company received 404 for both receipt read and receipt filing.

## H. Regression tests

All commands were `npx ts-node --transpile-only` in `server` on 11 October 2026. Each exited 0.

| Suite | Exit |
| --- | --- |
| `runPhase4AgencyWorkflowTests.ts` | 0 |
| `runPhase4bAgencyWorkflowTests.ts` | 0 |
| `runPhase2FinancialHardeningTests.ts` | 0 |
| `runPhase2bCompletenessTests.ts` | 0 |
| `runPhase2cAccountingIntegrityTests.ts` | 0 |
| `runPhase2dWritePathLockdownTests.ts` | 0 |
| `runPhase3AccountingTrustTests.ts` | 0 |
| `runEcosystemTests.ts` | 0 |
| `tsc --noEmit` | 0 |
| client `npm run build` | 0 |

Phase 2.6, Phase 2.7, and Phase 2.8 HTTP harnesses:

```text
NOT AVAILABLE — EXISTING HTTP HARNESS NOT PRESENT IN REPOSITORY
```

## I. Known limitations

- The live owner amount is $796.05, not the illustrative $784.50, because commission is calculated after the levy-first split.
- Owner-statement CSV has no payment-id column.
- Mailtrap accepted the sends that reached `SENT`. Inbox delivery was not confirmed.
- The mail-failure case used the development seam `PHASE4B1_FAIL_MAIL`, then the real send on retry. It is not evidence of a provider outage.
- One $10 payment (`6acb543e271b8f1011240e3f`) was created against the other company's property before the company check existed. It completed accounting. It was retained.
- The agent property-details screen showed "Property not found" for this property. Search, the letting workspace API, rent collection, and collections did show it.
- The agent levy table showed no rows; the accountant levy table showed the test levies.
- Disposable `PHASE4B1` companies and their financial rows were retained. Journal entries cannot be hard-deleted, so cleanup would have left broken references.
- The client dev server was still the process used for the browser. The seam-enabled API was stopped.

## J. Final decision

The evidence is enough to move Phase 4B from FAIL to **PASS WITH DOCUMENTED RISKS**.

A real disposable rental receipt went through `POST /api/accountants/payments`, posted one rental property account and one journal, and was read back from the payment, owner statement, CSV, and financial trace. Those reads agree on $796.05. Notification timing, opt-out, incomplete accounting, and same-key retry were observed. Cross-company reads and the payment create that leaked on the first pass were denied on the retest, with positive controls still succeeding. Agent, accountant, and individual screens were opened. Maintenance requests did not add journals. Levy receipt filing did not add a levy or a journal. The available regression suites passed. No historical payment sentinel was rewritten.

Phase 5 was not started.
