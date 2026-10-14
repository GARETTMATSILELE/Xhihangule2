# Phase 9 — Financial Controls & Audit Readiness

**Date:** 16 September 2026  
**Prior:** Phase 8.3 `PASS WITH DOCUMENTED RISKS`

This application is not ZIMRA certified, legally certified, tax certified, EAC certified, or IFRS certified.

## 1. Objective

Add a financial-control layer on the existing Phase 7 orchestrator: periods, posted-record immutability, idempotent posting keys, duplicate/overpayment/negative-balance reviews, trial balance, PARTIAL trust scope, owner/GL agreement via canonical `PaymentAllocation`, append-only audit for close/reopen, and an accountant Financial Controls surface.

No historical amount rewrite. No second posting pipeline. No FDMS / live FX / PAYE / ZIMRA filing.

## 2. Existing architecture

```
PAYMENT → paymentAccountingOrchestrator.postPaymentAccounting
       → property / agent / company projections
       → accountingIntegrationService.syncPaymentReceived
       → allocateRentalReceipt + accountingService.postTransaction
       → reconciliation → accountingComplete
```

## 3. Controls implemented

- Accounting periods OPEN / SOFT_CLOSED / CLOSED
- Period gate on `accountingService.postTransaction`
- JournalEntry + JournalLine update/delete blocked
- Deterministic `sourceId` for new manual journals and ZIMRA remittances
- Duplicate payment review (detection)
- Allocation control statuses (derived, not a second formula)
- Negative GL balance review (detection)
- Trial balance from JournalLine
- FinancialControlException (append-only; never deleted)
- Trust categories IN_SCOPE / NOT_IMPLEMENTED; scope remains PARTIAL
- Month-end checklist (PASS only when condition passes)
- Accountant Financial Controls page
- Financial integrity runner (`detectionOnly: true`, `repaired: false`)

## 4. Accounting period controls

Model `AccountingPeriod`. Missing period covering a date = unmanaged OPEN (does not block live posting). SOFT_CLOSED requires override reason. CLOSED rejects posting; corrections = reversal + new posting. Reopen requires accountant, reason, audit before/after. Never automatic.

## 5. Journal immutability

Posted `JournalEntry` and `JournalLine` cannot be updated or deleted. Payment material fields remain blocked by `paymentFinancialImmutability`. Reversal creates new journals.

## 6. Idempotency

Payment journals keep stable `sourceId`. New manuals use `manual:{reference}`. New ZIMRA remittances use `taxpay:{company|zimraRef|paymentRef|amount|date|allocations}`. Unique indexes absorb retries. Historical sourceIds are not rewritten.

## 7. Payment controls

`classifyReceiptControlStatus`: FULLY_ALLOCATED / PARTIALLY_ALLOCATED / OVERPAYMENT / UNALLOCATED / REQUIRES_REVIEW. Unallocated ≥ 0. Overpayment is not auto-applied as future rent. Duplicates open `DUPLICATE_REVIEW_REQUIRED`.

## 8. Trust controls

Still PARTIAL: GL 1003 vs 2103–2107. Status `BALANCED_WITHIN_SCOPE` or `RECONCILIATION_EXCEPTION`. Never FULL / never RECONCILED. Buyer deposits, maintenance, unallocated receipts, per-owner books, off-book custody are `NOT_IMPLEMENTED`.

## 9. Trial balance controls

Debits and credits from `JournalLine`. `BALANCED` / `UNBALANCED` / `REQUIRES_REVIEW`. Difference is visible. No auto-fix.

## 10. Owner / property reconciliation

Canonical example: rent 1000, levy 50, commission 150, VAT 23.25, owner 826.75, levy payable 50, trust 1050, company revenue 150. Same `allocateRentalReceipt` as GL.

## 11. Audit trail

`AccountingEventLog` (append-only) for period close/soft-close/reopen/override and exception review. Fields include actor, reason, before, after. No secrets.

## 12. Approval controls

Ordinary orchestrated payment posting remains automated. Accountant (+ reason) required for period close, period reopen, SOFT_CLOSED override, exception waive/resolve, manual journal (existing isAccountant), tax override (existing).

## 13. Refund controls

`Payment.status: refunded` remains unused. Canonical correction is reverse → reversal payment → correction draft. Original amount is not reduced. Excessive/duplicate refunds are not implemented as a silent amount edit.

## 14. Financial exceptions

`FinancialControlException`: OPEN / UNDER_REVIEW / EXPLAINED / RESOLVED / WAIVED. Hard delete blocked. Dashboard also counts `AccountingException` and `TaxReviewItem`.

## 15. Security controls

New routes: `auth` + `canViewCommissions` (GET) / `isAccountant` (POST). Unauthenticated 401. Non-accountant write 403.

## 16. Tests

`npm run test:phase9` plus Phase 7–8.3 regression.

## 17. Live verification

See Phase 9 final report (boot `phase: '9'`, accountant Financial Controls, trial balance, trust PARTIAL, tax compliance, 401/CORS).

## 18. Historical safety verification

24 The Chimes sale $190,000 / legacy CGT $38,000 must remain unchanged. Integrity is detection-only.

## 19. Remaining limitations

PARTIAL trust; no FDMS; no live FX; ZIMRA/PAYE/corporate tax external; historical tax reviews; CompanyAccount.agencyShare ≠ GL 4001 by design; trust posting still event-parallel to the orchestrator; VatRecord mutation on reversal (pre-existing); explicit admin backfill/repair APIs remain gated.

## 20. Future scope

FDMS, ZIMRA filing, PAYE, corporate tax, live FX, expanding trust recon to NOT_IMPLEMENTED categories, dedicated refund event (without mutating original payments), moving trust posting inside the orchestrator.

## 21. Final status

```
PASS WITH DOCUMENTED RISKS
```

See the Phase 9 final report. Historical financial amounts were not rewritten. Trust recon remains PARTIAL. FDMS, live FX, and external tax filing remain out of scope.
