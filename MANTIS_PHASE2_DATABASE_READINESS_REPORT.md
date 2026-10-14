# Phase 2 database readiness

Read-only production diagnostics were not run.

This workspace was not connected to the production database. No inventory of live duplicate accounts, missing `accountingComplete` flags, or trust postings on rental payments was taken. The counts below are unknown.

| Question | Result |
| --- | --- |
| Partial unique index on `(propertyId, ledgerType)` exists in production? | Unknown |
| Duplicate active rental accounts? | Unknown |
| Duplicate active sale accounts? | Unknown |
| Inactive, non-archived accounts occupying the unique key? | Unknown |
| Archived accounts that still hold income? | Unknown |
| Completed rentals with `accountingComplete` false? | Unknown |
| Completed sales with `accountingComplete` false? | Unknown |
| Rental payments that already posted to sale trust? | Unknown |
| Sale payments with rental accounting, or the reverse, already stored? | Unknown |
| Payments missing `transactionDomain`? | Expected for every row created before this change. Not counted |

`ALLOW_ACCOUNTING_INDEX_MIGRATION` was not enabled.

The index migration path no longer archives duplicate accounts when index creation fails. Turning the flag on before an inventory would still be unsafe if duplicates exist, because the unique index cannot be built on top of them. Leave the flag unset until a read-only inventory, run against the real database, shows no active duplicate group and a controlled merge has preserved any split history.

Workspace source is not production.
