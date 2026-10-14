# Mantis Phase 2.7 — Reversal Regression Matrix

Disposable authenticated HTTP against the development server. Original payments stayed `completed`. Historical rows were not modified. The disposable company was deleted after the run.

| Test | Result | Evidence |
| --- | --- | --- |
| Full rental reversal | PASS | Original amount 1000, status completed, domain RENTAL. One owner-income counter on the rental ledger for the posted income. |
| Full sale reversal | PASS | Original domain SALE, amount 1000, status completed. Owner counter on the sale ledger. |
| Introduction reversal | PASS | Domain stayed RENTAL. One rental-ledger counter. No buyer-trust row. |
| Company commission reversal | PASS | Posted commission 38.80 remained. Counter -38.80. Original line not archived. |
| Journal reversal | PASS | Original journal remained. Reversal journal credits 1000 equalled original debits 1000. |
| Sale trust reversal | PASS | Original credit 1000 remained. One debit 1000. |
| Rental reversal, no buyer trust | PASS | Trust rows 0. |
| Property type changed before reversal | PASS | Property moved to sale. Reversal still used RENTAL and the rental ledger. |
| Commission changed before reversal | PASS | Property commission changed from 10 to 40. Counter stayed -38.80. |
| VAT configuration changed | PASS | Posted VAT snapshot stayed 0. Reversal did not recompute. Journal was the exact opposite of the posted journal. |
| Retry incomplete reversal | PASS | Owner, company, journal, and trust failures each reached `reversed` on retry. |
| Retry completed reversal | PASS | A second retry did not add a company line. |
| Double reversal | PASS | Second request returned the same reversal payment. One company counter. |
| Concurrent reversal | PASS | 10 requests: 1 success, 9 already in progress. 1 reversal payment. 1 owner counter. 1 company counter. |
| Failed owner reversal | PASS | `reversal_incomplete`, owner counter absent, original amount unchanged. Retry completed it once. |
| Failed company reversal | PASS | Owner counter present, company counter absent, state incomplete. Retry created one company counter. |
| Failed journal reversal | PASS | Company counter present, reversal journal absent, state incomplete. Retry created one journal. |
| Failed trust reversal | PASS | Sale owner, company, and journal present. Trust debit absent. Retry created one debit. |
| Operational report | PASS | Owner statement income 1800, deductions 1800, net 0. Net equals income minus deductions. |
| Audit report | PASS | Statement rows include the original credit and a reversal description. |
| Incomplete reversal report | PASS | Company original 34.92, counter 0, payment still completed, state `reversal_incomplete`. |

## Existing Phase 2 suites

| Suite | Result |
| --- | --- |
| Phase 2 financial hardening | PASS |
| Phase 2b completeness | PASS |
| Phase 2c accounting integrity | PASS |
| Phase 2d write-path lockdown | PASS |

## Source audit after the change

| Path | Result |
| --- | --- |
| Archive company commission during reversal | Removed. Company immutability guard unchanged. |
| Delete payment or accounting transaction during reversal | Not present on the reversal path. |
| Cancel finalized owner income during reversal | Removed. `reconcilePropertyLedgerDuplicates` can still cancel duplicate rows and is not called by reversal. |
| Recalculate historical commission or VAT from current property settings | Reversal uses the posted company line, posted journal, and posted trust credit. |
| Re-resolve reversal ledger from `Property.rentalType` | Reversal passes the historical domain ledger. |
| Second reversal mechanism | Controller, ledger-event retry, and the change stream call `reversePaymentAccounting`. The trust listener posts the trust debit only after the reversal is complete, and the trust reference makes that call idempotent. |
