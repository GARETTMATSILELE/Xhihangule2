# Phase H — Individual tax compliance, annual tax pack & evidence layer

**Date:** 18 September 2026  
**Status:** Implemented as a consolidation / evidence layer. Not a ZIMRA filing, assessment, or certification system.

---

## Architecture

```
                    PROPERTY / TENANT ACTIVITY
                              │
                              ▼
                         ACCOUNTING
                              │
                              ▼
                  TRANSACTION TAX SNAPSHOT
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
            VAT        PRESUMPTIVE RENTAL   INCOME TAX
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    TAX COMPLIANCE CENTRE
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           Reviews         Evidence       Reconciliation
                              │
                              ▼
                       ANNUAL TAX PACK
                              │
                              ▼
                    ACCOUNTANT HANDOFF
```

Phase H does **not** contain a VAT, presumptive rental-tax, or ordinary income-tax formula. It reads:

- `sumPropertyAccountPeriodPnl` for the selected tax year (`YYYY-01` … `YYYY-12`)
- `IndividualVatRecord`
- `IndividualRentalTaxRecord` / `IndividualRentalTaxPayment`
- `IndividualIncomeTaxRecord` / adjustments / payments via Phase G `annualSchedule`
- existing `TaxPeriod`, `TransactionTaxSnapshot`, `File`, `AccountingEventLog`

Missing projections surface as `NOT_CALCULATED` or `REVIEW_REQUIRED`. They are never silently calculated inside Phase H.

## Annual aggregation

- Period keys for the tax year are `${year}-01` through `${year}-12`.
- Accounting uses calendar bounds of that year, not lifetime `totalIncome` / `totalExpenses`.
- No `annualProfit × 12`.
- Currencies stay separate. Mixed currencies are a **blocker** (`CURRENCY_CONVERSION_REQUIRED`) until a verified conversion source exists. RBZ rates are not invented.

## Readiness

`evaluateComplianceReadiness` is deterministic and pure.

| Status | Meaning |
|---|---|
| `NOT_STARTED` | No activity |
| `REVIEW_REQUIRED` | Material blockers remain (including after a pack was finalised) |
| `READY_FOR_ACCOUNTANT` | No blockers; warnings remain (AIDS levy, missing documents, unmatched payments, ownership) |
| `READY_FOR_TAX_PREPARATION` | No blockers and no warnings |
| `FINALIZED` | Latest pack is finalised **and** no blockers |
| `IN_PROGRESS` | Reserved in the status model; not assigned by the current rules |

Users cannot select `READY`. Status is derived.

### Blockers

Missing classification, missing tax rule, missing tax period, incomplete taxable-income calculation, unresolved VAT / rental-tax / income-tax reviews, mixed currency, pending adjustments.

### Warnings

Missing supporting documents, unmatched recorded payments, capital allowances not implemented, AIDS levy not included, ownership % ≠ 100.

### Information

Not VAT registered, no presumptive rental tax applicable, no tax payment recorded.

## Evidence

`IndividualTaxEvidence` **references** `File.documentId`. Files are not copied. Upload ≠ reviewed.

Categories: `RENTAL_RECEIPT`, `TENANCY_AGREEMENT`, `INVOICE`, `SUPPLIER_INVOICE`, `MAINTENANCE_INVOICE`, `RATES_STATEMENT`, `BANK_EVIDENCE`, `TAX_PAYMENT_PROOF`, `VAT_DOCUMENT`, `CONTRACTOR_QUOTE`, `CAPITAL_EXPENDITURE_DOCUMENT`, `OTHER_INCOME_EVIDENCE`, `OTHER`.

Statuses: `MISSING`, `UPLOADED`, `REVIEWED`, `ACCEPTED`, `REQUIRES_REVIEW`, `NOT_REQUIRED`.

## Reviews

`IndividualTaxComplianceReview` consolidates Phase E/F/G queues plus unclassified snapshots.

Statuses: `OPEN` → `IN_REVIEW` → `RESOLVED` | `WAIVED`.

A waiver requires a reason, user, timestamp, and `TAX_COMPLIANCE_REVIEW_WAIVED` audit event. Reviews are never hard-deleted. Resolving a review does **not** mutate the source transaction.

## Finalisation and versioning

- Reuses existing `TaxPeriod` lock/finalise. Phase H does not add a second lock.
- `POST .../pack/finalize` refuses with 409 while blockers remain.
- `IndividualTaxPack` stores an immutable summary of the consumed projections. Query `updateOne` / `findOneAndUpdate` are blocked.
- Document `.save()` is allowed only for `GENERATED → FINALIZED` and `FINALIZED → SUPERSEDED`.
- A later correction creates **version N+1** with `supersedesPackId`. Version 1 is not overwritten.

## Exports

PDF (cover + disclaimer + three separate projections + schedules), genuine multi-sheet XLSX via `buildXlsxWorkbookSheets`, and CSV. Sheets: Cover, Taxpayer, Properties, Rental Income, Expenses, VAT, Rental Tax, Income Tax, Adjustments, Tax Payments, Review Items, Evidence Register, Reconciliation.

There is **no** combined “Total Tax Payable” and **no** “ZIMRA balance”.

## Payments

Landlord-recorded Phase F/G payments are listed separately. VAT has no payment model; VAT recorded payments stay `null` (information). Labels are “Recorded by landlord”, never “ZIMRA confirmed”.

## Ownership

Configured `ownershipPercentage` is displayed as property total vs owner share. Tax projections are **not** scaled. Anything other than 100% is `OWNERSHIP_ALLOCATION_UNCLEAR` (warning / review). No invented joint-owner tax rules.

## Sharing

Not implemented. No existing secure share/email infrastructure is reused. “Prepare for accountant” generates/opens the pack; it does not claim delivery.

## Limitations / legal uncertainties

- AIDS levy remains a warning; not auto-calculated.
- Capital allowances are not implemented.
- Mixed-currency conversion has no verified rate source.
- Ownership allocation legal treatment is uncertain → review.
- Historical rows without snapshots remain `NOT_YET_TAX_CLASSIFIED`. No backfill.
- Agency `TaxObligation` / commission VAT / CGT / PAYE unchanged and not introduced here.

See `PHASE_H_IMPLEMENTATION_REPORT.md`.
