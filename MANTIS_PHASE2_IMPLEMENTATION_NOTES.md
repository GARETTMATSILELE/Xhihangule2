# Phase 2 implementation notes

Order followed: diagnostics and the reconciliation design, then domain enforcement, trust, reporting, sale validation, introduction, reversal, retry, and the competing sync path. The unique index step was stopped before enablement because production duplicates are unknown.

## Files

| Area | File |
| --- | --- |
| Domain rules | `server/src/services/transactionDomain.ts` |
| Duplicate classification | `server/src/services/propertyAccountDuplicateInventory.ts` |
| Payment snapshot | `server/src/models/Payment.ts` (`transactionDomain`, sale property/tenant no longer always required) |
| Posting | `paymentAccountingOrchestrator.ts`, `propertyAccountService.ts`, `paymentAccountingCompleteness.ts`, `accountingIntegrationService.ts` |
| Trust | `trustPaymentPostingService.ts`, `emitPaymentConfirmedIfNeeded`, webhook |
| Retry | `LedgerEvent` type `journal`, `ledgerEventService.execute` |
| Reports | `reporting/readModels`, `reporting/api`, `reporting/builders`, client `reportingService.ts`, property account detail |
| Sync | `maintenanceJobQueueService.ts`, `propertyAccountController.ts` |
| Tests | `runPhase2FinancialHardeningTests.ts`, `runPhase2bCompletenessTests.ts` |

## Introduction

Operationally, introduction is a rental commission on a property whose `rentalType` is `introduction`, usually tied to a lease. Webhook and lease creates already stored `paymentType: rental` for that case. The payment type `introduction` is the same rental domain. It is valid only when the property domain at acceptance is `RENTAL`. Historical introduction rows without `transactionDomain` resolve to `RENTAL` from `paymentType`.

## Partial posting

Mongo transactions are not wrapped around the orchestrator. The deployment already falls back when transactions are unsupported, and the ledgers are separate collections. Completeness stays on `accountingComplete` / `accountingStatus`, with a receipt-versus-accounting distinction on the create response. Idempotent keys still protect a second income line. Journal retry is a single artifact retry.

## Competing writes left in place on purpose

`repairPaymentAccounting` still posts one named payment through the orchestrator. That is the controlled correction path.

`GET /accountants/property-accounts/:id` accepts `ledger=rental` or `ledger=sale` and loads that account even when the property's current `rentalType` is the other domain. The accountant and admin lists pass the row's ledger. Omitting the query still means the current property domain.

`migrateSalesLedgerForCompany` remains callable and now targets ledger `sale`. The sync job and the sync endpoint do not call it.

Manual provisional accountant payments can still hold a generated id while `isProvisional` is true. Permanent posting stays denied until finalization. Sale create of a completed payment cannot use that path.

## Production

Do not set `ALLOW_ACCOUNTING_INDEX_MIGRATION=true`. Run the read-only inventory against production before any merge or index.
