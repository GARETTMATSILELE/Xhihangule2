# Mantis Phase 2.7 — Reversal Implementation Report

## Defect

Reversing a finalized payment cancelled the owner-income line and then tried to archive the company commission line. The company ledger rejected the archive because posted lines are immutable. The orchestrator reported the company and journal steps as failed together. The original commission stayed economically active. A reversing journal could already have been posted.

## Root cause

`reverseIncomeFromPayment` set the original income status to `cancelled`. `syncPaymentReversed` then `$set` `transactions.$[t].isArchived` on `CompanyAccount` and rewrote the account totals from the remaining lines. The company immutability guard rejected that update. Journal posting and the archive shared one try/catch, so a rejected archive hid a journal that had already posted. Buyer-trust reversal was not part of the orchestrator.

## Implementation

Reversal is now a counter-posting on the existing accounting path.

- Owner income: the completed income line stays. A new expense, category `payment_reversal`, is appended for the posted income amount on the historical ledger. Idempotency key `payment:{id}:owner-income:reversal:{target}`.
- Company commission: the original line stays. A new income line is appended with the negative posted amount, `reversesPaymentId`, and the reversal payment id. Totals move by that negative amount. The line is not archived.
- Journal: the original journal stays. `sourceId {paymentId}:reversal` swaps the posted debits and credits. If no original journal exists, the reversal journal is built from the payment snapshot, not from today's property settings.
- Trust: a SALE receipt is reversed with one debit for the posted credit. Rental and introduction do not create a buyer-trust reversal. The original receipt is not deleted.
- The original payment stays `completed`. `reversalState` is `reversal_in_progress`, `reversal_incomplete`, or `reversed`. The reversal payment has its own `accountingComplete`.
- Company, journal, and trust failures are separate. A retry creates only missing artifacts. Development-only one-shot seams (`PHASE27_FAIL_OWNER`, `PHASE27_FAIL_COMPANY`, `PHASE27_FAIL_JOURNAL`, `PHASE27_FAIL_TRUST`) require `NODE_ENV !== production` and `MANTIS_TEST_SEAM=1`.
- VAT records are no longer zeroed in place. Tax obligations still reverse through the existing tax-obligation projection.

## Affected files

- `server/src/services/accountingIntegrationService.ts`
- `server/src/services/propertyAccountService.ts`
- `server/src/services/paymentAccountingOrchestrator.ts`
- `server/src/services/trustPaymentPostingService.ts`
- `server/src/services/testFailureSeam.ts`
- `server/src/controllers/paymentController.ts`
- `server/src/models/Payment.ts`
- `server/src/models/CompanyAccount.ts`
- `server/src/models/PropertyAccount.ts`

## Index

Local payments had 5 reversal-linked documents, 0 duplicate full reversals, and 1 non-negative document that also carries `reversalOfPaymentId`. The index `one_full_reversal_per_payment` was created on the development database. It is unique only for `amount < 0`, so that document is outside the index. No payment document was modified.

No historical financial repair ran. Disposable Phase 2.7 companies, payments, and users were removed. Leftover counts after the run: companies 0, P27 payments 0, phase27 users 0.

## Tests

Authenticated HTTP on a development server, port 5055, disposable company only. 32 checks passed, 0 failed. Covered rental, introduction, sale, sale trust, commission and domain changes before reversal, journal equality, double reversal, 10 concurrent reversals, four failure injections with retry, operational net, audit lines, and an incomplete company reversal.

Phase 2 hardening, completeness, accounting integrity, and write-path lockdown suites passed.

## Reporting

The owner statement keeps both the original credit and the reversal debit. On the disposable rental property the statement was income 1800, deductions 1800, net 0, and the net matched income plus other income minus deductions. The ledger rows included the reversal description. An incomplete company reversal left the original commission (34.92) and a zero counter, with the payment still `completed` and `reversalState = reversal_incomplete`.

Statements do not suppress a reversed payment. The net is the ledger net.

## Residual risks

- `reconcilePropertyLedgerDuplicates` can still cancel duplicate income rows. It is not called by reversal, posting, or the scheduled detection job.
- The existing tax-obligation reversal creates a counter-obligation and marks the original obligation `REVERSED`. Amounts are not rewritten. `VatRecord` is no longer zeroed by payment reversal.
- The posted VAT amount on the disposable rental payment was 0. The commission counter still used the posted 38.80 after the property commission was changed from 10 to 40, and the reversal journal credits equalled the original journal debits (1000). The reversal path does not call the current VAT-rate lookup.
- A crash in the first 60 seconds after the in-progress lock, before a reversal payment exists, returns 409. After 60 seconds one request can continue. The concurrent test produced one reversal payment and nine already-in-progress responses.

These residuals do not leave a completed reversal with an active company commission, do not duplicate a full reversal, and do not post to today's property ledger.

## Phase 3

Phase 3 was not started.
