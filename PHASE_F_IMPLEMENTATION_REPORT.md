# Phase F implementation report

**Date:** 17 September 2026  
**Scope completed:** Individual landlord presumptive rental income tax applicability, rule-driven tax base, calculation, records, payments, working papers, review, reconciliation, deposit-to-rent application, and exports for **new** transactions.  
**Not started:** Phase G (ordinary income tax).

---

## Audit (required first return)

1. **Phase C rental-tax profile** — `rentalTaxRegime` on `IndividualTaxProfile` / `Company.taxProfile`; never inferred from workspace. Enums reused: `SELF_ASSESSMENT | PRESUMPTIVE_RENTAL | EXEMPT | NOT_APPLICABLE | ACCOUNTANT_REVIEW`.
2. **Phase D snapshot** — immutable `TransactionTaxSnapshot` with `rentalTaxRegime`, `rentalTaxTreatment`, `propertyUseClass`, and `taxRuleReferences` including `PRESUMPTIVE_RENTAL_INCOME_TAX`. Snapshot tax amounts stay null.
3. **Phase E VAT projection** — `IndividualVatRecord` from the same snapshot. Untouched calculation. Rental tax is a sibling projection.
4. **Tax-rule registry** — `ZW_PRESUMPTIVE_RENTAL_PN08_2026` v1, rate 15, `GROSS_RENTAL_PERCENT`, effective 2026-01-01. Notes updated to the verified PN 08 text. Rate still lives in the registry.
5. **Period architecture** — Phase D `TaxPeriod`; rental tax resolves `taxType = PRESUMPTIVE_RENTAL_INCOME_TAX`. No auto-create.
6. **Deposit application** — previously identified as a gap. Phase F adds first-class `DEPOSIT_APPLICATION` income (`POST /individual/deposits/apply`) without mutating the original deposit.
7. **Accounting reversal** — existing LFT/payment reversal now also posts an immutable rental-tax reversal.
8. **Models reused** — `TransactionTaxSnapshot`, `TaxPeriod`, `TaxRule`, `AccountingEventLog`, `roundMoney`, `buildXlsxWorkbook`.
9. **Models created** — `IndividualRentalTaxRecord`, `IndividualRentalTaxPayment`.
10. **Services created** — applicability, tax-base resolver, calculation, `individualRentalTaxService`.
11. **APIs modified** — `GET /individual/tax/rental*`, `POST /individual/tax/rental/payments`, `POST /individual/deposits/apply`; metadata `getForSource` overlays rental tax; attach hooks after VAT.
12. **UI** — Finance → Rental Tax centre; Settings → Tax regime callout; Accounting → apply deposit to rent; transaction drill-down.
13. **Database** — additive collections `individualrentaltaxrecords`, `individualrentaltaxpayments`.
14. **Zimbabwe rule verification** — PN 08 aligns with the Phase C seed (15% of gross rental received, final tax, no deductions). Residential premises are not liable (PN 08 s2) — modelled in applicability, not as a hard-coded rate. No later amending notice found.
15. **Risks** — levy/service-charge grey area handled as identified `levyAllocated` exclusion or `REVIEW_REQUIRED`; mixed-use not auto-split; agency TaxObligation mode left `NOT_IMPLEMENTED`.
16. **Test plan** — `runIndividualAccountingPhaseFTests.ts` (20 mandated cases + golden + currency + rounding + no-backfill).

No stop condition required a halt: the legal rate and gross-rental method match the registry; unclear bases go to accountant review.

---

## Implementation summary

New individual rent / other-income writes still follow Phase D (immutable snapshot). Phase F then evaluates presumptive rental tax **from that snapshot** into `IndividualRentalTaxRecord`.

VAT calculation is unchanged. Income tax and CGT are not introduced. No tax-payable GL journal. No historical backfill.

```
Payment / deposit application
  → accounting
  → TransactionTaxSnapshot
  → VAT evaluation (Phase E, unmodified)
  → rental-tax applicability / base / rule / calculation
  → IndividualRentalTaxRecord
```

---

## Files changed

### New

- `server/src/services/tax/rentalTaxRounding.ts`
- `server/src/services/individualRentalTaxApplicability.ts`
- `server/src/services/individualRentalTaxBase.ts`
- `server/src/services/individualRentalTaxCalculation.ts`
- `server/src/models/IndividualRentalTaxRecord.ts`
- `server/src/models/IndividualRentalTaxPayment.ts`
- `server/src/services/individualRentalTaxService.ts`
- `server/src/scripts/runIndividualAccountingPhaseFTests.ts`
- `client/src/pages/IndividualDashboard/pages/RentalTaxCentrePage.tsx`
- `PHASE_F_PRESUMPTIVE_RENTAL_TAX.md`
- `PHASE_F_IMPLEMENTATION_REPORT.md`

### Extended

- Collections, tax-rule notes, deposit-application category, metadata attach/reversal, payment orchestrator, tax-period finalize event, individual routes, workspace client, nav/routes/settings/accounting UI, `INDIVIDUAL_ACCOUNTING_TAX_ARCHITECTURE.md`

---

## Test results

- Server `tsc`: pass
- Phase B: pass
- Phase C: pass
- Phase D: pass
- Phase E: pass
- Phase F: pass
- Phase 8: pass
- Client `tsc --noEmit`: pass

---

## Confirmations

```
Presumptive rental tax calculation introduced: YES
VAT calculation modified: NO
Income tax calculation introduced: NO
CGT calculation introduced: NO
Historical rental tax backfill: NO
Historical financial rewrite: NO
Agency accounting modified: NO
Tax payable GL journal introduced: NO
```

Phase G was not started.
