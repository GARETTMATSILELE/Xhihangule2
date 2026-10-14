# Phase 2.5 production financial integrity report

## Executive result

```text
PHASE 2.5 — BLOCKED
```

Production was not queried and was not modified. The live database could not be positively identified from this workspace, so the inventory, merge, unique-index, concurrency, trust, and browser gates were not run.

```text
PHASE 3 MUST NOT BEGIN.
```

## Phase 2 implementation baseline

```text
Git HEAD: 8070b217720f774ae490fc550bb3914b1b739966
Commit: 8070b217 Vat on Commission and Reports
Working tree: dirty
```

The dirty tree includes the uncommitted Phase 2 financial-domain work plus a large set of unrelated client, server, and documentation changes. This workspace is not the committed HEAD alone.

Expected Phase 2 files:

| Requested name | On disk |
| --- | --- |
| `MANTIS_PHASE2_DATABASE_READINESS_REPORT.md` | Present |
| `MANTIS_PROPERTY_ACCOUNT_RECONCILIATION_SPEC.md` | Present |
| `MANTIS_TRANSACTION_DOMAIN_SPEC.md` | Present |
| `MANTIS_PHASE2_FINANCIAL_HARDENING_REPORT.md` | Absent. The Phase 2 file is `MANTIS_FINANCIAL_HARDENING_REPORT.md` |
| `MANTIS_PHASE2_FINANCIAL_REGRESSION_MATRIX.md` | Absent. The Phase 2 file is `MANTIS_FINANCIAL_REGRESSION_MATRIX.md` |
| `MANTIS_PHASE2_IMPLEMENTATION_NOTES.md` | Present |

Phase 2 test sources present:

- `server/src/scripts/runPhase2FinancialHardeningTests.ts`
- `server/src/scripts/runPhase2bCompletenessTests.ts`
- `server/src/scripts/runPhase2dWritePathLockdownTests.ts`

They were not re-executed in this phase.

## Production identity

```text
Production connection available: NO
Database host identity: REDACTED
Database name: REDACTED
Environment identifier: REDACTED
```

How the server chooses a database (`server/src/config/database.ts`):

- Production (`NODE_ENV=production`) requires one of `MONGODB_URI`, `MONGODB_URI_PROPERTY`, `CUSTOMCONNSTR_MONGODB_URI`, `CUSTOMCONNSTR_MONGODB_URI_PROPERTY`, or `AZURE_COSMOS_CONNECTIONSTRING`.
- Accounting uses `ACCOUNTING_DB_URI`, `MONGODB_URI_ACCOUNTING`, `CUSTOMCONNSTR_ACCOUNTING_DB_URI`, or `CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING`.
- Without those variables, and only when `NODE_ENV` is not `production`, the code falls back to local MongoDB. That local database is not production.

What this machine actually has:

- `server/.env` and `server/.env.production` both set `NODE_ENV=production`.
- Neither file contains a MongoDB or Cosmos connection variable. Key names were inspected. Values were not printed.
- The process environment for this session has those connection variables unset, and `ALLOW_ACCOUNTING_INDEX_MIGRATION` unset.
- Azure CLI has a cached account, but listing web apps and Cosmos accounts failed with an interactive re-authentication requirement. No resource name, host, or database was read.

`NODE_ENV=production` in a local env file is not identification of the production database. No host was classified as Cosmos, Atlas, or any other remote. The gate stops here.

## Database inventory

Not run. Counts are unknown. See `MANTIS_PHASE2_5_DATABASE_INVENTORY.md`.

## Duplicate account inventory

Not run. Classifications were not assigned to live groups.

```text
SAFE_DUPLICATE: unknown
POSSIBLE_DUPLICATE: unknown
CONFLICTING_HISTORY: unknown
REQUIRES_MANUAL_REVIEW: unknown
```

## Accounting completeness

Unknown. No payment collection was read.

## Transaction-domain inventory

Unknown. No payment collection was read. No backfill was performed.

## Trust contamination

Unknown. No trust collection was read. No reversal was performed.

## Legacy payment classification

Unknown. No rows were rewritten.

## Archived financial accounts

Unknown.

## Reconciliations performed

None. See `MANTIS_PHASE2_5_DUPLICATE_RECONCILIATION_LOG.md`.

## Unique index

```text
Before: not inspected
After: not created
ALLOW_ACCOUNTING_INDEX_MIGRATION: unset
```

## Concurrency

Not run. See `MANTIS_PHASE2_5_CONCURRENCY_TEST_REPORT.md`.

## Browser

Not run. See `MANTIS_PHASE2_5_BROWSER_VERIFICATION.md`.

## Automated tests

Not re-executed in Phase 2.5.

```text
Phase 2 tests: NOT RUN
Existing accounting tests: NOT RUN
Integration tests: NOT RUN
API tests: NOT RUN
Browser tests: NOT RUN
Build: NOT RUN
TypeScript: NOT RUN
Lint: NOT RUN
```

## Source notes that do not replace the database gate

These are workspace observations only. They do not prove production data.

- `emitPaymentConfirmedIfNeeded` returns before emit when `mayPostSaleTrust` is false. The webhook emit is behind the same check. `postBuyerPaymentToTrust` returns `not_sale_domain` for a non-sale payment.
- `migrateSalesLedgerForCompany` is defined and exported. No controller or maintenance job calls it.
- `syncPropertyAccountsWithPayments` throws `HISTORICAL_REPLAY_DISABLED`.
- `repairPaymentAccounting` remains the explicit single-payment repair route.
- `recordIncomeFromPayment` is called from the accounting orchestrator and uses `historicalTransactionDomain` for the ledger. Completeness dependencies still expose `resolveLedgerTypeForProperty`, which reads current `Property.rentalType`. That helper must not be used to reclassify an existing payment. This phase did not re-prove every caller.

## Remaining blocker

The production database cannot be positively identified, so every production gate below that point is unmet:

- read-only inventory
- duplicate resolution
- unique index
- concurrency
- trust contamination evidence
- domain contradiction evidence
- signed-in accountant browser test
- regression, build, and TypeScript evidence for this phase

## Financial conservation statement

```text
No historical payment amount was changed.
No historical journal amount was changed.
No historical tax snapshot was changed.
No payment was replayed to reconstruct history.
No financial transaction was deleted.
```

No database connection was opened, so no financial document was read or written.
