# PHASE G IMPLEMENTATION REPORT

**Date:** 17 September 2026  
**Scope:** Individual ordinary income-tax working paper and reconciliation.

---

## Status

**PASS WITH DOCUMENTED RISKS**

No stop condition required a halt. The ordinary trade/investment rate is verified at 25% from ZIMRA’s tax-rates page and Finance Act s14(2b), distinct from PAYE bands. Uncertainties (AIDS levy, capital allowances, VAT-inclusive base, mixed-currency conversion, presumptive-vs-ordinary on incomplete profiles) are `REVIEW_REQUIRED` rather than guessed.

---

## Tax rule verification

| Source | Result |
|---|---|
| [ZIMRA tax rates](https://www.zimra.co.zw/domestic-taxes/corporate/tax-rates) | Individual income from trade and investments = **25%**. Company/trust trade and investment income = 25%. PAYE progressive tables published separately. AIDS levy listed as 3% of tax chargeable. |
| Finance Act s14(2b) | Flat rate on taxable income of an individual from trade or investment. |
| Finance Act 13 of 2023 / Public Notice 9 of 2024 | Trade/investment rate raised from 24% to 25% from the year of assessment beginning **1 January 2024**. |
| Finance Act employment vs trade/investment | PAYE bands apply to **employment/remuneration**, not landlord trade/investment income. |
| ZIMRA Public Notice 08 of 2026 | Presumptive rental tax is a **final tax**; not duplicated into ordinary taxable income. |
| ITF 12C (self-assessment) | Box 26 Aids Levy 3% of tax after credits. Accounting depreciation is not an allowable deduction. Capital allowances are a separate unimplemented regime. |

Registry rule seeded: `ZW_INCOME_TAX_TRADE_INVESTMENT_2024`, `taxType = INCOME_TAX`, `calculationMethod = TAXABLE_INCOME_PERCENT`, `rate = 25`, effective 2024-01-01. Services never hard-code `0.25`. AIDS levy is **not** auto-applied.

---

## Implementation

### Models
- `IndividualIncomeTaxRecord` (LINE ORIGINAL/REVERSAL; immutable; `taxAmount` always null on the line)
- `IndividualIncomeTaxAdjustment` (manual, reason required, PENDING → APPROVED)
- `IndividualIncomeTaxPayment` (landlord-recorded; not a ZIMRA confirmation)

### Services
- `tax/incomeTaxTypes.ts`, `tax/incomeTaxRounding.ts`
- `individualIncomeTaxClassification.ts`
- `individualIncomeTaxCalculation.ts` (working-paper arithmetic)
- `individualIncomeTaxService.ts` (post/reverse/working paper/recon/review/annual/exports/payments/adjustments)

### APIs (individual workspace, `req.user.companyId`)
- `GET /individual/tax/income`
- `GET /individual/tax/income/working-paper` (json/csv/xlsx/pdf)
- `GET /individual/tax/income/transactions`
- `GET /individual/tax/income/review`
- `GET /individual/tax/income/reconciliation`
- `GET /individual/tax/income/annual`
- `POST /individual/tax/income/calculate`
- `POST /individual/tax/income/adjustments`
- `POST /individual/tax/income/adjustments/:id/approve`
- `POST /individual/tax/income/payments`

### UI
- Finance → **Income Tax** (`/individual/tax/income` and nested working-paper/transactions/review/reconciliation routes)
- Tabs: Overview, Working paper, Transactions, Adjustments, Review, Reconciliation, Annual, Exports
- Settings → Tax ordinary-income callout
- Required disclaimer shown

### Database
- Collections: `individualincometaxrecords`, `individualincometaxadjustments`, `individualincometaxpayments`
- Unique: `companyId + sourceType + sourceId + taxType + recordKind`
- Indexes: period, periodKey, property+periodKey, calculationStatus

### Exports
- CSV, genuine XLSX (`buildXlsxWorkbook`), readable PDF

### Audit events
- `INCOME_TAX_CALCULATED` / `INCOME_TAX_RECALCULATED`
- `INCOME_TAX_ADJUSTMENT_CREATED` / `INCOME_TAX_ADJUSTMENT_APPROVED`
- `INCOME_TAX_PERIOD_FINALIZED`
- `INCOME_TAX_PAYMENT_RECORDED`
- `INCOME_TAX_REVERSED`
- `INCOME_TAX_REVIEW_REQUIRED`

### Tests
- `server/src/scripts/runIndividualAccountingPhaseGTests.ts`
- `npm run test:individual-accounting-g`

---

## Tax calculation

```
Ordinary income-tax working paper: YES
Taxable income calculation: YES
Income-tax calculation: YES (TaxRule-driven; not rent × 25%)
Tax adjustments: YES
Tax payments: YES
Annual foundation: YES
```

Formula:

```
Accounting profit
+ add-backs (non-deductible, private, accounting depreciation)
− approved extra deductions
− exempt / presumptive rental income
+ other approved adjustments
= Taxable income
× TaxRule.rate / 100
= Calculated income tax
− recorded payments
= Unreconciled calculated amount
```

Unknown tax is **null**, never a fabricated 0.

---

## Separation

```
VAT modified: NO
Presumptive rental tax modified: NO
CGT introduced: NO
PAYE introduced: NO
Agency accounting modified: NO
Historical financial rewrite: NO
Historical tax backfill: NO
Competing accounting ledger: NO
ZIMRA filing integration: NO
Fiscalisation introduced: NO
```

Phase D classification gained additive `INCOME_TAX` **rule references** on **new** snapshots only. Snapshot tax amounts remain null. Phase E/F calculation engines were not changed.

---

## Tests

```
Phase B: PASS
Phase C: PASS
Phase D: PASS
Phase E: PASS
Phase F: PASS
Phase G: PASS
Phase 8: PASS
Server tsc: PASS
Client tsc: PASS
```

Golden case: USD 24,000 income − 6,000 expenses = 18,000 profit; +1,000 non-deductible +500 depreciation −500 allowable adjustment = **USD 19,000** taxable × configured 25% = **USD 4,750**. Presumptive property A vs self-assessment property B remain separate.

---

## Known limitations

- AIDS levy is a review item, not calculated (credits/losses not modelled).
- Capital allowances / tax depreciation schedule not implemented.
- VAT-inclusive receipts require review; Phase E VAT amounts are not reused as the income-tax base.
- Mixed USD/ZWG working papers require conversion review; no RBZ rate source is wired.
- Historical transactions are displayed as `NOT_YET_TAX_CLASSIFIED`; they are not backfilled.
- Income tax is annual in law; monthly `TaxPeriod` keys are aggregated on the annual foundation view.
- Demo workspace has no posted LINE records, so the UI correctly shows **not calculated** rather than $0.
- No ZIMRA return, assessment, or filing claim.

---

## UI verification

Demo `/demo/tax/income`: Finance nav includes Income Tax; disclaimer present; Overview/Working paper/Transactions/Annual tabs render; missing amounts labelled **not calculated**; historical empty-state copy present. Settings → Tax still exposes the landlord profile and income-tax registration.

See `PHASE_G_INCOME_TAX.md` and `INDIVIDUAL_ACCOUNTING_TAX_ARCHITECTURE.md`.
