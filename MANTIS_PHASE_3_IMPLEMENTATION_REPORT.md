# MANTIS Phase 3 — Accounting Trust & Adoption

## 1. Executive summary

Phase 3 makes the existing owner statement explain how money moves from the amount received to the net owner amount. The explanation is built from the payment snapshot and the property-ledger row that the reporting layer already uses. It does not recalculate commission, VAT, or levy from today's property or tax settings, and it does not rewrite historical records.

For a stored allocation of 1,000.00 received, 100.00 commission, 100.00 levy, and 15.50 VAT, the shared waterfall reports a net owner amount of 784.50. The same statement dataset is rendered on screen, in the text statement, and in CSV/PDF export. A difference between that explained amount and the recorded owner income is shown as review required. The recorded amount is left unchanged.

## 2. Accountant workflow findings

Accountants already had an Accounting Integrity page for incomplete, mismatched, and orphaned projections. What was missing was a plain explanation of the owner waterfall and a read-only trace from a payment to its posting state. The integrity page now shows amount received, commission, levy, VAT, and net owner amount from the stored snapshot, plus Complete / Incomplete / Not Applicable for owner income, company commission, journal, trust, and tax. Retry remains the existing repair endpoint. The page states that a retry posts only missing artifacts.

## 3. Owner reporting findings

The property account statement already had columns for rent, commission, VAT, levy, and owner amount. Those columns were labelled in agency language and did not show the subtraction as one statement. The summary and column headings now use owner language: amount received, commission, VAT on commission, levy, net owner amount, owner payouts, and balance due to the owner. The header shows the ledger and the currency. Selecting a row shows the stored calculation and the payment id.

## 4. Existing report architecture inspected

Owner statements are built by `OwnerStatementBuilder` from the property-ledger projection and `PaymentCommissionSnapshot` rows. Screen preview is `OwnerStatementPreview`. PDF, CSV, Excel, and JSON are `ExportEngine` over that same DTO. Ledger selection (`ledger=rental|sale`, otherwise `400 LEDGER_REQUIRED`) stays in the reporting API. Accounting integrity, reconciliation, and explicit repair already existed and were not replaced.

## 5. Reporting architecture changes

`explainOwnerWaterfall` is the only new calculation. It subtracts the stored commission, levy, and VAT from the stored gross amount and rounds with the existing money helper. The builder attaches that explanation to each income row and to the statement. The posted owner-income credit remains `ownerAmount`. If it disagrees with the snapshot explanation, `reviewRequired` is set and a warning is added. No ledger write follows.

## 6. New/updated endpoints

- `GET /api/accountants/payments/:id/financial-trace` — read-only payment, stored allocation, posting state, and reversal links. Accountant dashboard permission. Company-scoped.
- `GET /api/accountants/trust-visibility` — recent trust rows for the company, marked sale or historical rental. Read-only.

Existing owner-statement and export routes are unchanged apart from the extra fields on the DTO.

## 7. New/updated DTOs

`OwnerWaterfallDTO` carries gross amount, commission, levy, VAT, VAT rate when stored, net owner amount, recorded owner amount, difference, review flag, and the formula text. `OwnerStatementDTO` now includes `ledger`, `currency`, and `ownerMoneyWaterfall`. Ledger rows include `paymentId` and `ownerWaterfall`.

## 8. Owner statement changes

Summary labels and transaction headings use the owner waterfall. A panel under the summary shows the subtraction. A row with a payment or a waterfall can be selected to show that row's figures. Rental and sale stay on the requested ledger.

## 9. Accountant report changes

The company reports page already separates agency commission from gross collections. Phase 3 did not rebuild that page. The integrity detail now shows the same waterfall an owner statement uses, loaded from the payment snapshot rather than from a second calculator.

## 10. Accounting Control Centre changes

`/accountant-dashboard/accounting-integrity` remains the control centre. Summary cards filter the exception list. The detail dialog explains what is complete, incomplete, or not applicable, and what a retry will do.

## 11. Exception workflow

Exceptions continue to come from the existing integrity list: incomplete, mismatched, and orphaned components. The dialog does not invent statuses. Missing journal, owner income, or company commission stays visible beside the amounts already posted.

## 12. Reconciliation workflow

Statement reconciliation compares the snapshot waterfall with recorded owner income. A mismatch is `reviewRequired` plus a data-quality warning. Repair is still the explicit, confirmed accounting repair. Duplicate cleanup and historical replay were not re-enabled.

## 13. Trust reporting changes

The integrity page lists recent trust transactions. Sale-domain rows are identified as sale trust. Rental-domain rows are labelled historical records, not new buyer-trust receipts. Trust documents are not updated.

## 14. Reversal visibility

The financial trace returns `reversalState`, `reversalPaymentId`, and `reversalOfPaymentId` when those fields exist. Owner statements still list the original income credit and the reversal debit as separate rows. Net effect is the running balance. Original rows are not collapsed to zero.

## 15. Audit trail

The statement timeline engine is unchanged and still built from ledger rows. The financial trace adds the posting sequence that can be stated from stored artifacts: payment, allocation, and each posting state. Events that are not stored are not invented.

## 16. Export/PDF changes

PDF column labels now say amount received, commission, VAT, levy, and net owner. CSV and Excel still export the same DTO fields as before, including rent amount, commission, VAT, levy, and owner amount. The text statement prints the waterfall lines from `ownerMoneyWaterfall` on that DTO.

## 17. Tests executed

- `runPhase3AccountingTrustTests`: 1,000 − 100 − 100 − 15.50 = 784.50 on the statement DTO, the text export, and the CSV export. No-VAT stays 0. A stored 15.5% snapshot is not replaced. A 684.50 recorded amount against a 784.50 explanation is review required and is not rewritten. Rental and sale ledger labels stay distinct.
- Reporting reconciliation and statement presentation tests passed.
- Phase 2 financial hardening, 2B completeness, 2C integrity, and 2D write-path lockdown passed.
- Server `tsc` passed.
- Server Jest passed (1 suite, 5 tests).
- Client Vitest passed (5 files, 25 tests).
- Client production build passed.

## 18. Regression results

Posting, reversal, duplicate cleanup, and tax reversal code were not changed. The disposable HTTP matrices from Phases 2.6, 2.7, and 2.8 were not re-run in this phase because those harnesses are not kept in the repository. The automated suites that still live in the repo passed.

## 19. Performance observations

The statement still loads one property ledger and the payment snapshots for that statement period. The financial trace loads one payment, one reconciliation, a tax count, and a trust count. Trust visibility is limited to 50 rows. Reporting was not moved into the browser.

## 20. Security observations

The new reads require the accountant-dashboard permission and the caller's company id. Agents who can create payments do not gain this route through payment-management permission alone. Owner statements keep the existing authenticated reporting route and ledger requirement.

## 21. Known limitations

- The running development server on port 5000 was not restarted, so the new screen was not clicked through in the browser against that process.
- CSV column titles were left as they were so the existing export test still finds "Rent Amount". The numbers are the statement DTO.
- Company-wide commission reports were not redesigned.
- Date-range filtering already existed. No new period-close lock was added.
- A single statement uses the ledger currency. Mixed-currency rows are not added together by this phase.

## 22. Remaining risks

The full Phase 2.6–2.8 HTTP regression was not repeated. That is an evidence gap, not a detected posting defect. A recorded owner amount that does not match the stored allocation is now visible and is not auto-corrected. Historical rows that never stored a commission snapshot still show the ledger credit without an invented waterfall.

## 23. Phase 3 acceptance result

```text
PASS WITH DOCUMENTED RISKS
```

The 1,000 / 100 / 100 / 15.50 / 784.50 waterfall is produced from one statement dataset and can be traced to the payment id. The HTTP corruption and reversal matrices from the previous phases were not re-executed here. Phase 3 does not start the senior rental-agent UX work.
