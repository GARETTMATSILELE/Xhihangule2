# Phase 2.5 database inventory

```text
STATUS: NOT RUN
REASON: production database was not positively identified
```

No MongoDB or Cosmos connection variable is present in `server/.env`, `server/.env.production`, or the process environment. Azure resource listing did not authenticate far enough to name a database host. Local MongoDB was not queried, because the development fallback is not production.

## C1 Property account duplicates

Not queried.

```text
SAFE_DUPLICATE: unknown
POSSIBLE_DUPLICATE: unknown
CONFLICTING_HISTORY: unknown
REQUIRES_MANUAL_REVIEW: unknown
```

Also not inspected: inactive non-archived accounts, archived accounts with financial rows, accounts with no property, unexpected `ledgerType`, missing `propertyId`.

## D Uniqueness index

```text
Index exists: UNKNOWN
Index name: UNKNOWN
Unique: UNKNOWN
Partial filter: UNKNOWN
Key: UNKNOWN
Document-level conflicts: UNKNOWN
```

The index was not created. `ALLOW_ACCOUNTING_INDEX_MIGRATION` is unset.

## E Accounting completeness

```text
Completed payments total: unknown
accountingComplete true: unknown
accountingComplete false: unknown
accountingComplete missing/null: unknown
transactionDomain RENTAL: unknown
transactionDomain SALE: unknown
transactionDomain absent: unknown
paymentType rental / introduction / sale / neither: unknown
```

Incomplete artifact classes (`OWNER_INCOME_MISSING`, `COMMISSION_MISSING`, `JOURNAL_MISSING`, `TRUST_MISSING`, `MULTIPLE_ARTIFACTS_MISSING`, `CLASSIFICATION_UNRESOLVED`, `OTHER`) were not counted. Nothing was repaired.

## F Domain consistency

Not queried. No matrix of payment versus owner ledger, commission, journal, and trust was built.

## G Trust contamination

```text
Total buyer-trust payment postings: unknown
SALE: unknown
RENTAL: unknown
INTRODUCTION: unknown
UNCLASSIFIED: unknown
```

## H Sale/rental cross-contamination

Not queried.

## I Legacy payment domain

Not counted. No `transactionDomain` backfill was performed.

## J Archived accounts with financial history

Not queried.

## K Golden production traces

No production payment was traced.
