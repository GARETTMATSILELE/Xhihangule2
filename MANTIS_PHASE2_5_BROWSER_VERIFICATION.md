# Phase 2.5 browser verification

```text
STATUS: NOT RUN
```

No signed-in accountant or admin session was opened.

Not verified:

- `/accountants/property-accounts/:id?ledger=rental` shows the rental ledger
- `/accountants/property-accounts/:id?ledger=sale` shows the sale ledger
- a property whose current `rentalType` changed still opens the historical ledger from the explicit query
- each accountant list row opens that row's ledger
- each admin list row opens that row's ledger
- a missing ledger returns a controlled not-found error and does not fall back to the newest account or to today's `rentalType`

The client code that passes `ledger` on the accountant and admin list links was not exercised in a browser during this phase.
