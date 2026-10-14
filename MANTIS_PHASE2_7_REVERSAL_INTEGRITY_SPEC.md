# Mantis Phase 2.7 — Reversal Integrity Spec

A finalized payment is history. A reversal does not erase it. The reversal is a new financial event with equal and opposite counter-postings, an explicit link to the original, and its own completion state.

## Original immutability

A completed payment keeps:

- its amount, deposit, payment type, and payment date
- `transactionDomain`
- the commission and VAT snapshot stored on the payment
- `status = completed` and `postingStatus = posted`
- `accountingComplete` as it was when the original posting finished

The reversal records `reversalPaymentId`, `reversalState`, `reversalReason`, `reversedAt`, and `reversedBy` on the original. Those fields identify the reversal. They do not rewrite the economic event.

## Counter-posting model

| Original artifact | Reversal artifact | Original row |
| --- | --- | --- |
| Property-ledger owner income | Expense `payment_reversal` for the posted income amount, idempotency key `payment:{id}:owner-income:reversal:{ledgerTarget}` | Stays `completed` |
| Company commission line | New income line with the negative posted amount, `reversesPaymentId` = original payment, `paymentId` = reversal payment | Not archived |
| Journal `sourceId = {paymentId}` | Journal `sourceId = {paymentId}:reversal` with debit and credit swapped | Stays posted |
| Sale buyer-trust credit | Trust debit for the original receipt credit, reference `reversal:{paymentId}` | Receipt stays |

Configured property expenses are countered with an income line. They are not cancelled. Pass-through charges use the existing pass-through append, on the historical ledger.

Amounts come from the posted ledger line, posted journal lines, or the posted trust receipt. They are not recomputed from the property's current commission, VAT rate, levy, or rental type.

## Domain

`historicalTransactionDomain` selects the ledger. `Property.rentalType` is not read to decide a reversal.

- RENTAL, including introduction payments, counters the rental ledger and does not create a buyer-trust reversal.
- SALE counters the sale ledger and, when a buyer-trust receipt exists, posts one trust debit.

## Completeness

`Payment.reversalState` is `reversal_in_progress`, `reversal_incomplete`, or `reversed`.

The reversal is `reversed` only when every required artifact is reversed or not applicable:

- owner income, when a completed income line was posted
- company commission, when a positive company line was posted
- journal, when cash was posted
- buyer trust, only when the historical domain is SALE and a receipt exists

Anything else stays `reversal_incomplete`. A retry inspects existing counter-entries and creates only the missing ones.

The original payment remains `completed`. The reversal payment carries `accountingComplete`.

## Idempotency and over-reversal

One original payment has one full reversal payment. The create path locks with `reversalPaymentId` absent. A partial unique index, `one_full_reversal_per_payment`, allows one negative-amount reversal document per `reversalOfPaymentId`. Existing data had no duplicate full reversals, so the index does not rewrite history. A second request returns that reversal and does not post again. Counter-entries are keyed by idempotency key, `reversesPaymentId`, journal `sourceId`, or trust reference.

A full reversal is the only supported reversal. The counter amount is the posted amount, so it cannot exceed the original posting. A second full reversal is not created.

If the process stops after the in-progress lock and before the reversal payment exists, a request inside 60 seconds is rejected as already in progress. After 60 seconds one request may continue. If the reversal payment exists but was not linked, the retry links it and does not create another.

## Reporting

Operational and audit statements both read the ledger. A fully reversed pair remains visible as the original line and the counter-line. The statement net is income minus the reversal expense, which equals the ledger net. Incomplete reversals stay visible: a missing company counter leaves the original commission in the company balance. Statements do not drop a payment because a reversal was requested.

## Authorization

`POST /api/accountants/payments/:id/reverse` still requires `canManagePayments` and `hasFinancePrivileges`. A reversal reason is required. Viewing a payment does not grant reversal.

## What this phase does not do

- No historical replay, backfill, or repair of old reversals, old commission labels, or historical rental trust rows.
- No second accounting or tax engine. Tax obligations continue through `reversePaymentTaxObligations`.
- Company-ledger and property-ledger immutability guards stay in place. Reversal does not set `isArchived` or cancel posted income.
