# Phase F — Presumptive rental income tax

**Date:** 17 September 2026  
**Workspace:** Individual landlord only  
**Certification:** Mantis is not ZIMRA-certified and does not file returns.

---

## 1. Authoritative tax sources

Verified on 17 September 2026 against:

| Source | Finding |
|---|---|
| [ZIMRA Public Notice 08 of 2026](https://www.zimra.co.zw/public-notices?download=4444%3Apublic-notice-08-of-2026-presumptive-rental-income-tax) (issued 5 February 2026) | 15% of **gross rental received**; final tax; no deductions, allowances, credits or set-off. Effective 1 January 2026. |
| Finance Act, 2025 (Act No. 7 of 2025) | Introduces the tax. |
| Income Tax Act s36R and 39th Schedule (as cited in the notice and secondary commentary) | Legislative home of the tax. |
| Subsequent ZIMRA public notices after PN 08 | None found that amend the 15% rate or the gross-rental method. |

Implemented registry row (not hard-coded in services):

```
ruleCode            ZW_PRESUMPTIVE_RENTAL_PN08_2026
effectiveFrom       2026-01-01
effectiveTo         (open)
rate                15
calculationMethod   GROSS_RENTAL_PERCENT
sourceReference     ZIMRA Public Notice 08 of 2026
sourceDocument      Public Notice 08 of 2026 (issued 5 February 2026); Finance Act 2025 (Act 7 of 2025); Income Tax Act s36R and 39th Schedule
```

No later notice required a new `TaxRule` version. If the rate or method changes, add a new version; do not edit historical records.

---

## 2. Taxpayer applicability

Applicability is **not** inferred from `workspaceType` or plan.

Order of decision:

1. Is this a rental receipt (`PAYMENT_RENT` or rental-like `OTHER_INCOME`)? Deposits and liabilities are skipped.
2. What does the **Phase D snapshot** say for `rentalTaxRegime` / `rentalTaxTreatment`?
3. What is the property use class on that snapshot?
4. Is there an effective `TaxRule` for `PRESUMPTIVE_RENTAL_INCOME_TAX` on the transaction date?

| Snapshot regime | Engine result |
|---|---|
| `PRESUMPTIVE_RENTAL` + commercial premises + effective rule | Calculate |
| `SELF_ASSESSMENT` | `NOT_APPLICABLE` (ordinary income tax is Phase G) |
| `EXEMPT` / `NOT_APPLICABLE` | `NOT_APPLICABLE` (`taxAmount` null) |
| `ACCOUNTANT_REVIEW` or missing regime | `REVIEW_REQUIRED` (`taxAmount` null) |
| Commercial missing rule | `RULE_UNAVAILABLE` → `REVIEW_REQUIRED` |
| Residential dwelling | `NOT_APPLICABLE` (PN 08 s2: residential portion is not liable) |
| Mixed-use / short-term / unclassified | `REVIEW_REQUIRED` |

---

## 3. Rental tax regimes

Reuse Phase C `RENTAL_TAX_REGIMES`:

`SELF_ASSESSMENT | PRESUMPTIVE_RENTAL | EXEMPT | NOT_APPLICABLE | ACCOUNTANT_REVIEW`

Taxpayer-level regime lives on the landlord profile and is snapshotted. Property-level `rentalTaxTreatment` and `propertyUseClass` can narrow applicability. They are not assumed identical across an owner's portfolio.

---

## 4. Tax base

PN 08: **gross rental received**, no deductions.

`resolveRentalTaxBase`:

```
Gross receipt
− identified tenant deposits
− identified levy allocations (pass-through, not an "allowance")
= Rental tax base
```

If `rentAllocated` is present, that rent figure is the base. VAT amounts are never used as the rental-tax base. Accounting owner income is not assumed to equal the tax base.

Unclear items (parking, storage, other income, mixed receipts without a rent split) → `REVIEW_REQUIRED`.

---

## 5. Calculation

`taxAmount = roundMoney(taxBase × (TaxRule.rate / 100))`

- Precision: 2 decimal places via `roundMoney`
- Rounding: half-up (`Math.round`)
- Currency: transaction currency stored on the record; conversion basis stored if present
- Never `taxBase * 0.15`

---

## 6. Rule resolution

`getEffectiveTaxRule('PRESUMPTIVE_RENTAL_INCOME_TAX', transactionDate, 'ZW')` at snapshot time. The rental-tax record stores `taxRuleId`, `taxRuleVersion`, `taxRuleCode`, `sourceReference`, and `taxRate` from that snapshot reference.

---

## 7. Tax periods

Reuse Phase D `TaxPeriod` with `taxType = PRESUMPTIVE_RENTAL_INCOME_TAX`. Missing period → `PERIOD_REQUIRED`. Periods are not auto-created. `FINALIZED` / `LOCKED` reject ordinary posts; corrections use reversal + new source.

---

## 8. Tax records

`IndividualRentalTaxRecord` is a tax **projection**. It is not a second GL and not `IndividualVatRecord` or agency `TaxObligation`.

Unique active original: `companyId + sourceType + sourceId + taxType + recordKind`.

---

## 9. Payments

`IndividualRentalTaxPayment` records landlord-entered remittances. They do not alter calculated records and are not treated as ZIMRA-confirmed assessments.

---

## 10. Reversals

Original records are immutable. A linked `REVERSAL` row stores `originalRecordId` (`reversalOf`), `reversalTransactionId`, `reversalReason`, `reversalDate`. Amendments are accounting reversal → new transaction → new snapshot → new rental-tax calculation.

---

## 11. Audit trail

`RENTAL_TAX_CALCULATED`, `RENTAL_TAX_REVIEW_REQUIRED`, `RENTAL_TAX_REVERSED`, `RENTAL_TAX_AMENDED`, `RENTAL_TAX_PAYMENT_RECORDED`, `RENTAL_TAX_FINALIZED`.

Idempotent re-runs return the existing original (no in-place rewrite). A true amendment keeps the previous original and posts a reversal plus a new source.

---

## 12. Historical-data policy

No scan of historical payments. No `updateMany` of Payments / PropertyAccounts / snapshots / VAT records. No startup backfill. Historical review is a future explicit workflow.

---

## 13. VAT separation

The same rent may have an `IndividualVatRecord` and an `IndividualRentalTaxRecord`. Bases and rates are independent. PN 08: presumptive rental tax does not replace VAT.

---

## 14. Known limitations

- Ordinary income tax, CGT, and withholding are not calculated.
- No ZIMRA filing or fiscalisation.
- No automatic presumptive-tax payable GL journal (not approved).
- Residential vs mixed-use splits inside one building are not auto-allocated; mixed-use stays review.
- Levy treatment uses identified `levyAllocated` only; commentary that “all service charges are rent” is not treated as the legal rule.
- Deposit application is a new income write; the original deposit remains not applicable.
- Agency `TAX_TYPE_MODE.PRESUMPTIVE_RENTAL_INCOME_TAX` stays `NOT_IMPLEMENTED` so Phase 8 TaxObligation automation is unchanged.
- Annual schedule is a foundation, not the Phase G tax pack.

**Disclaimer:** This report presents rental-tax calculations based on the taxpayer information, transaction records and configured Zimbabwe tax rules available in Mantis. It is a tax working paper and does not constitute tax advice or confirmation of a ZIMRA-assessed liability.
