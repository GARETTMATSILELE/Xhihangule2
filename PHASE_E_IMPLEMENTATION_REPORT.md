# Phase E implementation report

**Date:** 17 September 2026  
**Scope completed:** Individual landlord VAT applicability, calculation, VAT records, working papers, review, and reconciliation for **new** transactions.  
**Not started:** Phases F–G (presumptive rental tax, income tax).

---

## Implementation summary

New individual writes still follow Phase D (immutable snapshot first). Phase E then calculates VAT **from that snapshot** into `IndividualVatRecord`.

Agency `VatRecord` and `TaxObligation` are not used. No VAT payable journals. Snapshot `taxAmount` / `vatAmount` stay null. `incomeTaxAmount` and `presumptiveTaxAmount` stay null.

Rent remains `POST /accountants/payments` → `postPaymentAccounting`. Individual VAT attach/reversal is gated to individual workspaces and is fail-soft.

---

## Files changed

### New

- `server/src/services/tax/vatRounding.ts`
- `server/src/services/individualVatApplicability.ts`
- `server/src/services/individualVatCalculation.ts`
- `server/src/models/IndividualVatRecord.ts`
- `server/src/services/individualVatService.ts`
- `server/src/utils/xlsxWorkbook.ts`
- `server/src/scripts/runIndividualAccountingPhaseETests.ts`
- `client/src/pages/IndividualDashboard/pages/VatCentrePage.tsx`
- `PHASE_E_INDIVIDUAL_VAT_ENGINE.md`
- `PHASE_E_IMPLEMENTATION_REPORT.md`

### Extended

- `server/src/config/collections.ts`
- `server/src/models/LandlordFinancialTransaction.ts` — optional `inputVatEligibility`
- `server/src/services/individualTaxMetadataService.ts` — VAT post after snapshot; VAT overlay on getForSource
- `server/src/services/individualAccountingService.ts` — supplier/input VAT fields; VAT reversal
- `server/src/services/paymentAccountingOrchestrator.ts` — individual-only VAT reversal after accounting reversal
- `server/src/services/individualWorkspaceService.ts` / `individualTaxProfileService.ts` / `taxPeriodService.ts` / `individualRoutes.ts`
- `server/package.json`
- Client: workspace service, FinancePages, TaxProfileForm, PropertyTaxProfileForm, nav, routes
- `INDIVIDUAL_ACCOUNTING_TAX_ARCHITECTURE.md`

---

## Database changes

Additive only.

| Change | Detail |
|---|---|
| Collection `individualvatrecords` | Insert-only VAT projection. Unique `companyId+sourceType+sourceId+direction+recordKind` |
| `landlordfinancialtransactions.inputVatEligibility` | Optional, new writes only |
| Payments / PropertyAccounts / Phase D snapshots | **Not rewritten** |

No historical VAT backfill loop.

---

## API changes

Behind `auth` + `requireIndividualWorkspace`.

| Path | Purpose |
|---|---|
| GET `/individual/tax/vat` | Overview |
| GET `/individual/tax/vat/working-paper` | JSON + `format=csv\|xlsx\|pdf` |
| GET `/individual/tax/vat/transactions` | Drill-down |
| GET `/individual/tax/vat/review` | Factual review queue |
| GET `/individual/tax/vat/reconciliation` | Detection-only |

---

## UI changes

- Settings → Tax: VAT status (registered / not registered), deregistration date. Not inferred from property type.
- Property → Tax: VAT treatment with effective-from required when treatment changes (server).
- Expense form: inclusive/exclusive, supplier VAT number, invoice number, input eligibility.
- Finance → VAT: overview, transactions, working paper, review, reconciliation, CSV/XLSX/PDF.

Verified in demo at `/demo/tax/vat`. Demo has no live VAT records (writes blocked).

---

## Tests executed

| Suite | Result |
|---|---|
| TypeScript (`tsc`) | Pass |
| Phase E (18 cases including golden + XLSX PK header) | **ALL PASS** |
| Phase B | **ALL PASS** |
| Phase C | **ALL PASS** |
| Phase D | **ALL PASS** |
| Phase 8 | **ALL PASS** |
| Client compile | No issues found |

---

## Confirmations

```
VAT calculations introduced: YES
Income tax calculations introduced: NO
Presumptive rental tax calculations introduced: NO
CGT calculations introduced: NO
Historical financial records rewritten: NO
Historical VAT automatically backfilled: NO
Agency accounting modified: NO
```

(`paymentAccountingOrchestrator` gained an individual-only VAT reversal call after existing reversal; agency posting logic is unchanged. Phase 8 passed.)

---

## Known limitations

- VAT periods are not auto-opened.
- Deposit-to-rent application is still not a first-class write.
- No GL VAT-payable journals (working paper only).
- No ZIMRA filing or fiscalisation.
