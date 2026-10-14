# Phase 2.5 development database integrity report

## Executive result

```text
PHASE 2.5 — PASS WITH DOCUMENTED RISKS
```

The local development databases were inventoried read-only. Production was not opened. The database was not reset. No existing payment, journal, tax snapshot, trust row, or property-account history was rewritten.

Disposable empty property accounts were inserted only for the concurrency check, then deleted. Three empty documents were removed. They had no transactions.

```text
PHASE 3 MAY BEGIN ONLY IF THESE RISKS ARE CONFIRMED NON-BLOCKING.
```

## 1. Environment

```text
Development MongoDB connection: FOUND
Database target: LOCAL
Connection successful: YES
Environment: development server already running with NODE_ENV=development
MongoDB host class: local (127.0.0.1)
Database name: property-management (main) and accounting (property and company ledgers)
Production accessed: NO
Database reset: NO
```

The server resolves a local URI when `NODE_ENV` is not `production` at process start and no Mongo URI is set. This session used that local target only.

## 2. Existing database statistics

| Collection | Database | Count | Financial role |
| --- | --- | ---: | --- |
| payments | property-management | 162 | Cash receipts |
| properties | property-management | 60 | Current property state |
| propertyaccounts | accounting | 133 | Owner ledgers |
| companyaccounts | accounting | 5 | Company commission |
| journalentries | property-management | 44 | Journals |
| journallines | property-management | 100 | Journal lines |
| trusttransactions | property-management | 93 | Trust movements |
| trustaccounts | property-management | 50 | Trust accounts |
| ledgerevents | property-management | 114 | Retry queue, all `owner_income` |
| accountingexceptions | property-management | 1 | Open exception |
| leases | property-management | 30 | Leases |
| tenants | property-management | 28 | Tenants |
| companies | property-management | 23 | Companies |
| users | property-management | 52 | Users |
| propertyowners | property-management | 14 | Owners |
| developments | property-management | 8 | Sale developments |
| developmentunits | property-management | 180 | Sale units |

Property-account ledger types: 82 rental, 51 sale. 51 properties have both an active rental ledger and an active sale ledger. That is a lifecycle pair, not a duplicate.

## 3. Duplicate accounts

```text
Active duplicate groups: 0
SAFE_DUPLICATE: 0
POSSIBLE_DUPLICATE: 0
CONFLICTING_HISTORY: 0
REQUIRES_MANUAL_REVIEW: 0
```

## 4. Payment-domain consistency

All 162 payments have no stored `transactionDomain`. The historical fallback is `paymentType`.

| paymentType | transactionDomain | Count |
| --- | --- | ---: |
| rental | missing | 84 |
| introduction | missing | 6 |
| sale | missing | 72 |
| rental | SALE | 0 |
| sale | RENTAL | 0 |
| introduction | SALE | 0 |

Stored-domain contradictions: 0. Payments whose fallback domain differs from the property's current `rentalType`: 0.

## 5. Owner ledger consistency

Completed payments with positive cash, excluding deposit-only:

| Result | Count | Class |
| --- | ---: | --- |
| Income on the expected ledger | 112 | EXPECTED |
| Sale income on two sale targets (unit and development) | 25 | EXPECTED |
| Income on the other ledger | 0 | — |
| No owner income | 11 | MANUAL REVIEW |

The 25 two-target rows are the sale posting shape, not two accounts for the same property and ledger.

## 6. Company commission consistency

| Result | Count |
| --- | ---: |
| Source matches the fallback domain | 92 |
| Sale payment stored as `rental_commission` | 45 |
| Rental payment stored as `sales_commission` | 0 |
| Agency share with no company line | 9 |

New posting uses `journalPaymentType`, so a new sale is `sales_commission`. The 45 rows are historical labels. They were not rewritten.

## 7. Journal consistency

Completed payments with positive cash:

| Result | Count |
| --- | ---: |
| Journal module matches the fallback domain | 17 |
| Rental payment with sale journal | 0 |
| Sale payment without a sale journal | 0 |
| Missing journal | 129 |
| Duplicate journal for one payment | 0 |

## 8. Trust consistency

Trust rows linked to a payment: 78.

| Classification | Count | Meaning |
| --- | ---: | --- |
| SALE | 67 | Expected buyer-trust |
| RENTAL | 11 | Historical contamination |
| INTRODUCTION | 0 | — |
| UNCLASSIFIED | 0 | — |

The 11 rental rows are `BUYER_PAYMENT` credits. They were not reversed. Current `postBuyerPaymentToTrust` returns `not_sale_domain` before it creates a trust account, and `emitPaymentConfirmedIfNeeded` returns before emit when the payment is not a sale.

## 9. Accounting completeness

| State | Count |
| --- | ---: |
| Completed payments | 155 |
| `accountingComplete` true | 2 |
| `accountingComplete` false | 1 |
| Flag missing | 152 |

The false row is rental payment `6aad38ad8586d1d64c4bd5df`, amount 500, owner amount 425, status `incomplete`, and the running integrity job reports `ownerIncome` missing. It is not presented as fully accounted. The two true rows are rental payments with owner amounts 1730 and 1688.15.

## 10. Deposit classification

| Shape | Count | Owner income |
| --- | ---: | --- |
| Rent cash and deposit both positive | 19 | 18 have income, 1 does not |
| Deposit-only shape (`amount <= 0`, deposit > 0) | 4 | 0 have rent income |
| Rent cash only | 134 | — |

The one combined payment without income is `692d95e22442ee2a23b8b12b`: amount 800, deposit 800, owner amount 0. Under the Phase 2 rule this is not deposit-only. It is a missing owner amount, not a deposit skip.

## 11. Introduction

6 introduction payments. Fallback domain is `RENTAL` for all 6. None are in buyer trust. None posted to a sale ledger. None have an owner-income line, even though `ownerAmount` is populated. Class: MANUAL REVIEW. Not rewritten.

## 12. Sale classification

72 sale payments. All have a property, development, or unit context in the counts taken. Sale income on a rental ledger: 0. The 48 property accounts whose id is not a `properties` document are developments or units. Orphan accounts with no property, development, or unit: 0.

## 13. Reversal classification

5 payments carry a reversal link. This database has no case where the payment domain and the property's current type disagree, so a lifecycle reversal could not be observed in existing rows. Reversal code copies `historicalTransactionDomain` from the original payment. No reversal row was modified.

## 14. Archived accounts

Archived accounts that still hold transactions or payouts: 0. Inactive but non-archived accounts: 0.

## 15. Controlled merge

Not executed against existing data. There is no duplicate group to merge. `classifyDuplicateGroup` still marks split completed income as `CONFLICTING_HISTORY` with automatic merge disallowed. The older `mergeDuplicateAccounts` helper does not call that classifier. It was not run.

## 16. Unique index

Already present on `accounting.propertyaccounts`:

```text
name: propertyId_1_ledgerType_1
unique: true
key: propertyId, ledgerType
partialFilterExpression: { isArchived: false }
```

`ALLOW_ACCOUNTING_INDEX_MIGRATION` was not set. The index was not recreated.

## 17. Concurrency

Pass. See `MANTIS_PHASE2_5_CONCURRENCY_TEST_REPORT.md`.

## 18. API lifecycle

Not run through a signed-in HTTP session. Database reads show rental and sale ledgers are separate, and the incomplete rental is stored as `accountingComplete: false`. Journal retry and the owner-amount exception were not forced through the API in this phase.

## 19. Regression tests

```text
runPhase2FinancialHardeningTests: PASS
runPhase2dWritePathLockdownTests: PASS
runPhase2bCompletenessTests: NOT RE-RUN
TypeScript: NOT RUN
Build: NOT RUN
```

## 20. Remaining inconsistencies

| Item | Class | Blocks Phase 3? |
| --- | --- | --- |
| 11 historical rental buyer-trust rows | MANUAL REVIEW | No, if they are reviewed and new rentals stay out of trust |
| 11 completed payments with cash and no owner income | MANUAL REVIEW | No, if they stay visibly incomplete |
| 45 historical sale commissions labeled `rental_commission` | MANUAL REVIEW | No for new postings; yes if reports treat that label as the domain |
| 129 completed payments with no journal | EXPECTED legacy gap | No |
| 152 completed payments with no `accountingComplete` flag | EXPECTED legacy gap | No, provided missing is not displayed as complete |
| All payments lack `transactionDomain` | EXPECTED | No. Fallback is `paymentType`. Do not backfill from `rentalType` |
| Live merge helper ignores `SAFE_DUPLICATE` | FIX REQUIRED before that helper is used | Yes for any merge operation. Not for daily posting |
| Signed-in ledger UI and forced journal retry not exercised | MANUAL REVIEW | No for the data inventory. Yes before calling the UI proven |

## Financial conservation

```text
No historical payment amount was changed.
No historical journal amount was changed.
No historical tax snapshot was changed.
No payment was replayed to reconstruct history.
No existing financial transaction was deleted.
```

Three empty disposable property accounts created for the concurrency test were deleted. They contained no transactions.
