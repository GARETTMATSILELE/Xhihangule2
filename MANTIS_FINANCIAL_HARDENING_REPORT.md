# Phase 2 financial hardening report

## What changed

New payments store `transactionDomain` (`RENTAL` or `SALE`) at acceptance. Owner income, company commission, the receipt journal, trust, webhook trust, and reversals use that snapshot. They do not re-read `Property.rentalType` when posting or reversing an existing payment.

`introduction` remains a payment type and maps to `RENTAL`. A new introduction payment against a sale property is rejected. It is no longer an exemption inside `recordIncomeFromPayment`.

Sale create requires a property, development, or unit. It does not invent a property id or a tenant id. A sale against a rental property returns `ACCOUNTING_CLASSIFICATION_CONFLICT` and is not saved.

`postBuyerPaymentToTrust` returns `not_sale_domain` for anything that is not `SALE`, before it can create a trust account. `emitPaymentConfirmedIfNeeded` returns before emitting when the payment is not a sale.

Owner statements and property-account reads require an explicit ledger when both can exist. `GET /accountants/property-accounts/:propertyId?ledger=rental|sale` loads that ledger even after `Property.rentalType` changes. Omitting the query still opens the current property domain. The accountant and admin account lists always pass the account's own ledger.

A completed payment with positive cash and no computable owner amount throws `OWNER_INCOME_AMOUNT_MISSING`, opens an accounting exception, and does not retry. The HTTP body includes `receiptStatus: PAYMENT_RECEIVED` and `accountingState: ACCOUNTING_INCOMPLETE` when posting is not complete. The payment row is not rolled back.

Journal failure enqueues a `journal` ledger event. The retry calls `syncPaymentReceived` only.

`sync_property_accounts` no longer replays payments or runs `migrateSalesLedgerForCompany`. `syncPropertyAccountsWithPayments` throws `HISTORICAL_REPLAY_DISABLED`. Development ledger ensure no longer calls `recordIncomeFromPayment`. `migrateSalesLedgerForCompany`, if invoked later, opens the destination with ledger `sale` rather than the property's current type.

Index migration no longer archives duplicate accounts when the unique index cannot be created. `ALLOW_ACCOUNTING_INDEX_MIGRATION` was not turned on.

Duplicate groups are classified by `classifyDuplicateGroup`. Automatic merge is specified only for `SAFE_DUPLICATE` and is not run from startup.

## What was not done

Production was not inventoried. Existing duplicate accounts were not merged. The unique index was not created. Historical payments were not rewritten and were not given a backfilled `transactionDomain`. Ten concurrent database inserts were not executed.

## Tests

`server/src/scripts/runPhase2FinancialHardeningTests.ts` covers the domain, deposit, trust, duplicate classification, and source guards.

`runPhase2bCompletenessTests.ts` now treats a stored rental domain as rental even if a property-type resolver would throw, and treats a snapshot of `RENTAL` with `paymentType: sale` as `payment_type_mismatch`.

## Decision

```text
PHASE 2 — PASS WITH DOCUMENTED RISKS
```

The code no longer lets rental cash into sale trust, no longer classifies a retry from today's `rentalType`, and no longer presents an owner statement by picking the newest account. The unique index is not enforced, and the live duplicate and incomplete-payment counts are unknown until a read-only production inventory is run. Those two items block a clean PASS.
