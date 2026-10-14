# Phase G — Individual ordinary income-tax working paper

**Date:** 17 September 2026  
**Status:** Implemented as a sibling tax projection. Not a ZIMRA assessment, filing system, or certification.

---

## Architecture

```
Accounting transaction
        │
        ▼
Immutable Phase D tax snapshot
        │
        ├── Phase E → IndividualVatRecord
        ├── Phase F → IndividualRentalTaxRecord
        └── Phase G → IndividualIncomeTaxRecord
```

The accounting ledger remains authoritative. Phase G consumes `sumPropertyAccountPeriodPnl` and Phase D snapshots. It does not post journals, mutate snapshots, or rewrite historical amounts.

## Data flow

1. New individual write → `postPaymentAccounting` / `individualAccountingService.postEntry`
2. Fail-soft `TransactionTaxSnapshot` (Phase D)
3. Fail-soft `IndividualVatRecord` (Phase E) and `IndividualRentalTaxRecord` (Phase F)
4. Fail-soft `IndividualIncomeTaxRecord` LINE (Phase G) — classification and working-paper amounts; **line `taxAmount` stays null**
5. Period working paper aggregates LINE records + approved manual adjustments + accounting profit
6. `TaxRule` `ZW_INCOME_TAX_TRADE_INVESTMENT_2024` supplies the rate
7. Landlord-recorded `IndividualIncomeTaxPayment` reconciles against calculated tax

## Tax-rule sources (verified)

| Source | What it establishes |
|---|---|
| [ZIMRA tax rates](https://www.zimra.co.zw/domestic-taxes/corporate/tax-rates) | Income of an individual from trade and investments = **25%**. Company/trust trade and investment income = 25%. PAYE tables are separate. AIDS levy listed as 3% of tax chargeable. |
| Finance Act s14(2b) / Finance Act 13 of 2023 / Public Notice 9 of 2024 | Trade/investment rate moved from 24% to 25% for years of assessment beginning **1 January 2024**. |
| Finance Act distinction | Taxable income from **employment** (PAYE progressive) vs taxable income from **trade or investment** (flat). |
| ZIMRA Public Notice 08 of 2026 | Presumptive rental tax is a **final tax**. It is not duplicated into ordinary taxable income. |
| ITF 12C | Box 26 Aids Levy 3% of tax after credits. Credits/losses affect the charge first. |

Registry rule: `ZW_INCOME_TAX_TRADE_INVESTMENT_2024`, `taxType = INCOME_TAX`, `calculationMethod = TAXABLE_INCOME_PERCENT`, `rate = 25`, effective 2024-01-01. Services never hard-code `0.25`.

## PAYE separation

Progressive 0% / 20% / 25% / 30% / 35% / 40% bands are remuneration/PAYE tables and are **not** applied to landlord trade/investment income.

AIDS levy is **not** auto-applied. The working paper always records `AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW`.

## Classifications

`TAXABLE_INCOME` · `ALLOWABLE_DEDUCTION` · `NON_DEDUCTIBLE` · `CAPITAL` · `EXEMPT_INCOME` · `TAX_ADJUSTMENT` · `PRIVATE_EXPENSE` · `NOT_INCOME_TAX_RELEVANT` · `REVIEW_REQUIRED`

Accounting expense is not automatically a tax deduction. Deductibility comes from the snapshot / user classification. Unclear treatment is `REVIEW_REQUIRED` with a null tax amount.

## Calculation formula

```
Accounting profit          (PropertyAccount P&L, deposits/capital excluded)
+ classified add-backs     (non-deductible, private, accounting depreciation)
+ approved manual add-backs
− approved extra deductions
− exempt / presumptive rental income already in accounting
+ other approved adjustments
= Taxable income
× TaxRule.rate / 100
= Calculated ordinary income tax
− recorded tax payments
= Unreconciled calculated amount
```

Allowable deductions that already reduced accounting profit are **not** subtracted again.

## Presumptive interaction

When the **snapshot** `rentalTaxRegime` is `PRESUMPTIVE_RENTAL`, rental receipts are `NOT_INCOME_TAX_RELEVANT` / exempted from ordinary taxable income. Phase F records remain the presumptive projection. The system does not subtract `IndividualRentalTaxRecord.taxAmount`.

## Periods

Reuses Phase D `TaxPeriod` with `taxType = INCOME_TAX`. Missing periods → `PERIOD_REQUIRED`. Closed/locked → no mutation; reversals/amendments only. Periods are not auto-created.

Income tax is annual in law; monthly `YYYY-MM` periods are aggregated on the annual foundation view (`/tax/income/annual`).

## Immutability

LINE records cannot be updated or hard-deleted. Profile or rule changes after posting do not rewrite the snapshot or the original LINE. Reversals create a linked `REVERSAL` record.

## Adjustment model

`IndividualIncomeTaxAdjustment` requires amount, currency, category, reason, period, and user. Status starts `PENDING` (review). Approved rows enter the working paper. Users cannot overwrite `taxableIncome`.

## Reconciliation

Accounting profit → add-backs → allowable adjustments → exempt amounts → other adjustments → taxable income → tax rule → calculated income tax → recorded payments → unreconciled amount. Detection-only.

## Limitations / legal uncertainties

- AIDS levy not calculated (credits/reliefs/losses not modelled).
- Capital allowances / tax depreciation not implemented (`REVIEW_REQUIRED` / add-back).
- VAT-inclusive receipts require review; Phase E VAT amounts are not reused as the income-tax base.
- No verified exchange-rate source: mixed USD/ZWG → `CURRENCY_CONVERSION_REQUIRED`.
- Historical transactions are not backfilled; they appear as `NOT_YET_TAX_CLASSIFIED`.
- No ZIMRA filing, fiscalisation, PAYE, or Capital Gains Tax.

## Non-goals

Agency accounting · competing ledger · historical rewrite · Phase E/F calculation changes · CGT · PAYE · ZIMRA certification.
