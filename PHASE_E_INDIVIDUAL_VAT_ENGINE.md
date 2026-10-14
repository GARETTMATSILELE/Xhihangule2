# Phase E — Individual landlord VAT engine

**Date:** 17 September 2026  
**Scope:** VAT applicability, calculation, VAT records, working papers, review, and reconciliation for **new** individual transactions.  
**Certification language:** VAT working paper / VAT calculation / VAT preparation support. Not ZIMRA-certified. Does not file VAT returns.

---

## 1. Architecture

```
SOURCE TRANSACTION
  → immutable Phase D TransactionTaxSnapshot
  → evaluateIndividualVatApplicability (snapshot only)
  → calculateIndividualVat (TaxRule rate + roundMoney)
  → IndividualVatRecord (tax projection)
  → VAT working paper / drill-down / reconciliation
```

Agency `VatRecord` (`vatCollected` / `vatPaid`) and `TaxObligation` are **not** written. Mixing individual rental VAT into those collections would change Phase 8 integrity and commission VAT.

Accounting remains authoritative. VAT failure after a successful post is fail-soft and audited (`VAT_FAILED` / `VAT_REVIEW_REQUIRED`).

No VAT payable journals are posted to the GL.

---

## 2. Applicability

Inputs (from the snapshot, never the live profile):

- landlord `vatRegistered` at posting
- property `vatSupplyTreatment` / user VAT mode
- source kind (rent/other income → OUTPUT; expense/maintenance/capital → INPUT)
- effective VAT `TaxRule`

Outcomes: `NOT_VAT_REGISTERED`, `NOT_APPLICABLE`, `EXEMPT`, `STANDARD`, `ZERO_RATED`, `OUT_OF_SCOPE`, `REVIEW_REQUIRED`.

`VAT = 0` is not used for not-applicable or failed calculation. Those store `vatAmount: null`.

Workspace type and commercial use class never imply VAT registration.

---

## 3. Calculation methods

Registry rate is a **percentage** (15.5). Converted once with `vatPercentToFraction` then passed to existing `extractInclusiveVat` / `exclusiveVatOn` (`roundMoney`, 2 dp).

| Method | Formula |
|---|---|
| Inclusive | VAT = gross − gross / (1 + rate) |
| Exclusive | VAT = net × rate |

Individual rent defaults to **exclusive** unless `Payment.vatIncluded === true`. Expenses use `vatMode`.

**Rounding policy:** round only at the helper result boundary. Documented in `tax/vatRounding.ts`.

---

## 4. Input vs output

- Output: landlord supplies (rent, other income).
- Input: purchases. Supplier VAT charged ≠ recoverable VAT.
- Recoverable / non-recoverable / review / not applicable.
- Missing supplier VAT number or invoice number → `REVIEW_REQUIRED`, `vatAmount = null`.
- Capital may carry input VAT classification; no capital allowances or CGT.

---

## 5. Tax rules and periods

Rule identity (`taxRuleId`, version, code, effectiveFrom, configured rate) is copied onto the VAT record from the snapshot/registry.

Tax periods: `TaxPeriod` type `VAT`. Closed/locked periods reject new VAT originals/reversals (409). Payment attach remains fail-soft.

---

## 6. Immutable snapshots

`TransactionTaxSnapshot` is unchanged: `taxAmount` / snapshot `vatAmount` stay null. VAT lives on `IndividualVatRecord`.

March snapshot + March VAT record do not update when the June profile or June rule changes.

---

## 7. VAT records

Collection `individualvatrecords`. Unique on `companyId + sourceType + sourceId + direction + recordKind`.

Records are insert-only. Reversal creates `recordKind: REVERSAL` linked by `reversalOf`. No in-place `vatAmount` updates.

`incomeTaxAmount` and `presumptiveTaxAmount` remain null.

---

## 8. Reconciliation

Detection only: working paper totals vs record sums; duplicate originals; missing snapshot; period/rule/currency mismatches. No automatic repair.

---

## 9. Period locking

`OPEN → REVIEW → FINALIZED / AMENDED / LOCKED` on `TaxPeriod`. Finalizing a VAT period emits `VAT_FINALIZED`. Ordinary VAT mutation is rejected while closed.

---

## 10. Audit

`VAT_CALCULATED`, `VAT_REVIEW_REQUIRED`, `VAT_FAILED`, `VAT_REVERSED`, `VAT_FINALIZED`, `VAT_AMENDED`. Recalculation is reversal + new source, not silent replace.

---

## 11. Historical-data policy

No loop over historical Payments/snapshots. VAT posts only when Phase D attach runs for a **new** write (or an idempotent retry of that write).

---

## 12. Limitations

- Tax periods are still not auto-opened.
- Deposit receipts stay non-VAT; deposit-to-rent application is not a first-class write.
- No ZIMRA return, fiscalisation, or GL tax-liability posting.
- Agency commission VAT is unchanged.

## Authoritative VAT-rule reference

Zimbabwe standard VAT rate change 1 January 2026 lives on `TaxRule` `ZW_VAT_STANDARD` v1 (15%) / v2 (15.5%), seeded from the existing dated `TaxRate` table. Phase E does not hard-code those percentages.
