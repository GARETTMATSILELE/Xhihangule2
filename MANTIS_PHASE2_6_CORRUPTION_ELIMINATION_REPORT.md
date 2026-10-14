# MANTIS Phase 2.6 — Corruption Elimination Report

## Executive Summary

The current supported write paths do not reproduce the Phase 1 corruption mechanisms. New rental and introduction payments stay on the rental ledger and out of buyer trust. New sale payments stay on the sale ledger and use sales commission. Contradictions are rejected before a payment row is saved. A completed payment with missing owner income or a missing journal is not marked `accountingComplete`.

Phase 2.6 status is **PASS WITH DOCUMENTED RISKS**. The remaining gap is reversal of company commission: the company ledger refuses in-place archive, and the reversal caller reports journal and company commission as failed. Owner-income reversal still uses the payment's stored domain and the matching ledger. Historical rows were not repaired.

## Scope

- Development database on localhost only (`property-management` and `accounting`).
- No production database access and no Azure lookup.
- Historical financial documents were not updated, deleted, relabelled, or replayed.
- Disposable companies, properties, tenants, leases, and payments were created through authenticated HTTP and removed afterward. A leftover count after cleanup was 0 Phase 2.6 companies, 0 `P26-` payments, 0 disposable race accounts, and 0 phase26 webhook receipts.
- No second accounting engine was added.

## Historical Findings

These counts are forensic. They are not evidence that today's write path still does the same thing.

- Payments in the development database were created before `transactionDomain` existed, so stored domain is absent on those rows.
- Active duplicate `(propertyId, ledgerType)` groups were already zero, with the partial unique index present.
- Some completed historical payments have no journal, no owner-income line, or a sale commission stored as `rental_commission`.
- Some historical rental payments have buyer-trust rows. Those rows were not reversed.
- Some historical introduction payments have an owner amount and no owner-income line. Those rows were not backfilled.

## Current Architecture

```text
Payment acceptance
→ transactionDomain (RENTAL or SALE, stored, not recomputed from today's rentalType)
→ accounting posting
→ owner income on the domain ledger
→ company commission from that same domain
→ journal
→ buyer trust only when the domain is SALE
→ accountingComplete from the artifact check, not from status=completed
```

Introduction is a rental payment type. It uses domain `RENTAL`.

## Verification Results

Authenticated calls went to a development server on port 5055 with `NODE_ENV=development` and `MANTIS_TEST_SEAM=1`. The existing development server on port 5000 was left running. Signup created an enterprise admin, then properties, tenants, leases, and payments.

| ID | Old failure | Current implementation | Test | Result |
| --- | --- | --- | --- | --- |
| 001 | Two active accounts for one property and ledger | Unique partial index and duplicate-key reload | 10 inserts and 10 parallel payments | PASS |
| 002 | Rental reached buyer trust | Trust and `payment.confirmed` require SALE | Rental payment HTTP | PASS, trust 0 |
| 003 | Sale hit the rental ledger | Domain SALE selects the sale ledger | Sale payment HTTP | PASS |
| 004 | Rental hit the sale ledger | Domain RENTAL selects the rental ledger | Same rental payment | PASS |
| 005 | Property edits rewrote history | Stored domain is what later reads use | Change `rentalType`, then statement and reversal | PASS |
| 006 | Missing owner income looked complete | Positive cash requires an owner-income artifact; zero owner cash does not invent one | 100% commission payment and one-shot income failure | PASS |
| 007 | Introduction skipped the rental ledger | Introduction posts the owner remainder, rental commission, and a rental journal | Introduction above one month's rent | PASS, owner amount 600, trust 0 |
| 008 | Commission label ignored the payment | Source comes from the stored domain | Sale, rental, and introduction payments | PASS |
| 009 | Journal loss was silent | Durable journal event, one journal after retry, second retry does not duplicate | Journal seam then two repairs | PASS |
| 010 | Reversal used today's property type | Reversal domain and ledger follow the stored domain | Sale reversed after a change to management; rental reversed after a change to sale | PASS for domain and ledger |
| 011 | Sync replayed payments | Forced sync returns replay disabled and does not add payments | HTTP sync with confirm, reason, and force | PASS, count unchanged |
| 012 | One account served every report | `ledger` is required and applied | Both ledgers on one property | PASS, balances differed |
| 013 | Webhook minted ids | Missing payer is 400 and saves no payment | Signed webhook without payer | PASS |
| 014 | Sale minted a property id | Missing or unknown targets are 400 with no row | Four invalid sale creates | PASS |
| 015 | Contradictions committed | 409 or 400 before insert | Sale on rental property; rental on sale property | PASS, 0 rows |
| 016 | Equal rent and deposit became deposit-only | Deposit-only is zero rent cash plus a positive deposit | 500/500 and deposit-only | PASS |
| 017 | Completed meant accounted | `accountingState` is independent of receipt status | Compared complete rental/sale with the zero-owner and journal-failure cases | PASS |

## Failure Injection Results

Test seams run only when `NODE_ENV` is not `production` and `MANTIS_TEST_SEAM=1`, and only on the first attempt for that payment.

| Failure | Succeeded first | Failed first | Recorded state | Retry | Duplicates |
| --- | --- | --- | --- | --- | --- |
| Owner income | Commission path could proceed; income row absent | First `recordIncomeFromPayment` | `accountingComplete=false`, `owner_income` ledger event | First repair posted 1 income row and completed accounting. Second repair left 1 row | None |
| Journal | Owner income and company commission already posted | First `syncPaymentReceived` | `ACCOUNTING_INCOMPLETE`, `journal` ledger event, 0 journals | First repair created 1 journal. Second repair left 1 journal and 1 income row | None |
| Zero owner amount | Commission and the payment row | Owner income refused with `OWNER_INCOME_AMOUNT_MISSING` | `status=completed`, `accountingComplete=false`, income rows 0 | Not a retry that invents an amount | None |
| Webhook identity | Nothing financial | Request | 400 `WEBHOOK_ACTOR_REQUIRED` | Not applicable | No payment, no trust |

A receipt upsert bug (`status` in both `$set` and `$setOnInsert`) had turned the webhook into HTTP 500 before the identity check. That conflict was removed. The same malformed webhook then returned 400 and saved nothing.

## Concurrency Results

| Case | Result |
| --- | --- |
| 10 concurrent rental account inserts, same property | 1 success, 9 duplicate-key errors, 1 active rental account |
| Sale account for that same property | Inserted. Rental and sale coexist |
| 10 concurrent rental payments through the API | 10 responses 201, 1 active rental account |
| Sale property after its sale payment | 1 active sale account |

## Source Audit

Current writers, and what they are allowed to do:

| Path | Trigger | Automatic | Idempotent | Domain | Partial success | Wrong ledger |
| --- | --- | --- | --- | --- | --- | --- |
| `ensurePaymentAccountingPosted` | Payment create and explicit repair | No | Re-checks existing artifacts | Stored domain | Yes, then `accountingComplete=false` and a ledger event for retryable failures | No |
| `recordIncomeFromPayment` | Orchestrator only | No | Skips an existing income row for that payment | `historicalTransactionDomain` | Failure is recorded | No |
| `postCompanyCommission` | Orchestrator only | No | Skips an active line for that payment | `journalPaymentType` | Failure enqueues `company_commission` | No |
| `syncPaymentReceived` | Orchestrator and journal retry | Journal retry only | Journal `sourceId` is the payment id | Stored domain | Journal event | No |
| Buyer trust / `payment.confirmed` | Sale completion | No | Trust writer returns skipped for non-sale | SALE only | Rental does not create trust | No |
| Webhook create | Signed webhook | No | Event receipt | Property kind, then stored domain | Identity failure saves no payment | No |
| `syncPropertyAccountsWithPayments` | Not called by sync jobs | No | Throws `HISTORICAL_REPLAY_DISABLED` | n/a | No new rows | No |
| `migrateSalesLedgerForCompany` | Not on the routine sync path | No | n/a | Explicit sale ledger if ever called | Not reached by maintenance | No |
| `runPropertyLedgerMaintenance` | Admin maintenance | Detection only, dry-run | Does not merge | n/a | No financial rewrite | No |
| `mergeDuplicateAccounts` | Explicit confirmed merge | No | Refuses unless the classifier allows a safe empty/one-sided group | Ledger on the group key | Skips unsafe groups | No |
| Scheduled payment sync | Timer | Yes, detection | Reconcile and flag only | Does not re-derive from `rentalType` | Does not post ledgers | No |

`PropertyAccount.findOne` used for a financial write includes `ledgerType`. Owner statements reject a missing ledger. The accountant manual provisional path can still mint a property or tenant id, and permanent posting stays off while `isProvisional` is true.

## Test Results

| Suite | Result |
| --- | --- |
| Authenticated HTTP harness, 20 checks | 20 passed, 0 failed |
| `runPhase2FinancialHardeningTests` | Passed, including zero-owner cash staying incomplete |
| `runPhase2bCompletenessTests` | Passed |
| `runPhase2cAccountingIntegrityTests` | Passed |
| `runPhase2dWritePathLockdownTests` | Passed |

The hardening script reads source from `src/` when launched from `dist/`, matching the other phase scripts.

## Build Results

- Server TypeScript: `npx tsc --pretty false --noEmitOnError false` in `server` exited 0.
- Client production build: `npm run build` in `client` exited 0. The build folder was produced.

## Historical Data Risks

Still present, and still not a current write-path failure:

- Missing `transactionDomain` on pre-guardrail payments.
- Missing journals and missing owner-income lines on old completed payments.
- Sale payments labelled `rental_commission`.
- Rental payments with buyer-trust rows.
- `accountingComplete` omitted on old rows.

None of these were backfilled.

## Residual Risks

1. Reversal posts the owner-income reversal on the correct historical ledger, then tries to archive the company commission line. That archive is rejected because the company ledger is immutable. The error fails the reversal's journal/company step. The original commission projection remains. A reversing general-ledger entry may already have been posted before that throw. This is not a cross-ledger posting. It is an incomplete company-side reversal.
2. Standalone local MongoDB has no multi-document transactions. Payment save and accounting post are sequential. Failures stay on the payment as incomplete instead of rolling the payment back.
3. Provisional manual accountant payments can still store a generated property or tenant id. Permanent accounting does not run while the payment is provisional.
4. Historical contamination listed above remains.

## Phase Gate Decision

```text
PASS WITH DOCUMENTED RISKS
```

Every Phase 1 mechanism was attempted on disposable data and did not recur. The company-commission reversal gap is a real remaining financial behaviour and is why this is not an unqualified pass. It does not place a new rental payment in buyer trust, a sale payment on the rental ledger, or a second active account on the same ledger.
