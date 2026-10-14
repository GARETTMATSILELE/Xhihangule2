# Transaction domain spec

A payment has one accounting domain, captured when the payment is accepted.

```text
RENTAL
SALE
```

`introduction` stays a payment type. It is rental accounting: introduction commission on a let. It uses `transactionDomain = RENTAL`. It is rejected when the property's domain at acceptance is `SALE`.

## Snapshot

`Payment.transactionDomain` is set on create and is immutable.

| At acceptance | Stored |
| --- | --- |
| Property `rentalType` management or introduction, payment rental or introduction | `RENTAL` |
| Property `rentalType` sale, or a development / unit, payment sale | `SALE` |
| Requested domain disagrees with the entity | `ACCOUNTING_CLASSIFICATION_CONFLICT`, nothing is saved |

Later edits to `Property.rentalType` do not change the payment.

Legacy rows that have no `transactionDomain` are read from `paymentType` (`sale` → `SALE`, `rental` and `introduction` → `RENTAL`). That fallback is historical payment state. It does not read `Property.rentalType`. Rows with neither field stay unclassified and do not get a guessed domain. They are not backfilled.

## Who must use it

| Writer | Rule |
| --- | --- |
| Owner `PropertyAccount` | `ledgerForDomain(historicalTransactionDomain)` via `getOrCreatePropertyAccount(id, ledger)` |
| Company commission | `sales_commission` only for `SALE` |
| Journal | `journalPaymentType`, not `paymentType \|\| 'rental'` |
| Trust | `mayPostSaleTrust` inside `postBuyerPaymentToTrust`. Rental returns `not_sale_domain` and does not create a trust account |
| `payment.confirmed` | Emitted only when `mayPostSaleTrust` is true |
| Reversal | Copies `historicalTransactionDomain` from the original payment and reverses that ledger |
| Reports | `ledger=rental` or `ledger=sale` is required. `findOne` without a ledger returns nothing |
| Tax | Still its own projection. It does not choose the accounting domain |
| Change stream and ledger retry | Call `postPaymentAccounting`, which reads the stored domain |
| Webhook | Classifies from the property at acceptance, stores the domain, and does not emit trust for a rental. A missing payer is not replaced with a generated id. A rental without a tenant or payer is rejected. `processedBy` is the payer or the property agent |

## Sale context

`createSalesPaymentAccountant` requires a real property, development, or unit in the company. It does not generate a property id or a tenant id. A sale against a management or introduction property is a classification conflict and is not saved.

## Contradictions

```json
{
  "code": "ACCOUNTING_CLASSIFICATION_CONFLICT",
  "transactionDomain": "SALE",
  "resolvedDomain": "RENTAL",
  "message": "The transaction domain conflicts with the property accounting domain."
}
```

Positive rent or sale cash with no computable owner amount raises `OWNER_INCOME_AMOUNT_MISSING`, records an open accounting exception, and does not enqueue a retry that would invent an amount. The payment stays `completed`. `accountingComplete` stays false and the API returns `accountingState: ACCOUNTING_INCOMPLETE`.
