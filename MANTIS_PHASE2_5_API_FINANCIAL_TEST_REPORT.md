# Phase 2.5 API financial test report

```text
SIGNED-IN HTTP TESTS: NOT RUN
```

The development server is running, and its integrity job already reads local data. This phase did not log in as an accountant and did not post a new payment through the API.

What the database and the running process show instead:

- Rental payment `6aad38ad8586d1d64c4bd5df` stays `accountingComplete: false` with accounting status `incomplete`. The scheduled integrity pass reports `missing: ["ownerIncome"]` and does not flip it to complete.
- No completed payment with missing owner income is stored as `accountingComplete: true`. The two true rows have owner amounts.
- Owner income for existing payments is not on the opposite ledger. Rental cash is not on the sale ledger, and sale cash is not on the rental ledger.
- 51 properties already have both ledgers. A report that selects by `ledgerType` can tell them apart. The signed-in screens that pass `?ledger=rental` and `?ledger=sale` were not clicked.
- Sale against a management property, rental against a sale property, journal retry, and a forced `OWNER_INCOME_AMOUNT_MISSING` create were not executed through HTTP. Those paths are covered by `runPhase2FinancialHardeningTests`, which passed in this phase, and by the source of `resolveCreateTransactionDomain`, `mayPostSaleTrust`, and the journal ledger-event type.

```text
API LIFECYCLE: NOT DEMONSTRATED OVER HTTP
DATABASE PROJECTION CHECK: PASS FOR LEDGER SEPARATION AND THE KNOWN INCOMPLETE PAYMENT
```
