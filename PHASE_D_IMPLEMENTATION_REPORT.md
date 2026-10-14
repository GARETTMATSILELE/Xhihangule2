# Phase D implementation report

**Date:** 17 September 2026  
**Scope completed:** Tax metadata and tax periods for **new** individual transactions.  
**Not started:** Phases E–G (tax calculation, tax journals, working papers).

---

## Implementation summary

New individual financial writes now carry an immutable tax overlay:

- **What** happened, **when**, **which property**, **which accounting period**, **which tax period** (or `PERIOD_REQUIRED`)
- **Which tax profile and tax-rule versions** applied at posting time
- **`taxCalculationStatus`** of `NOT_CALCULATED`, `READY_FOR_CALCULATION`, `REVIEW_REQUIRED`, or `NOT_APPLICABLE`
- **`taxAmount` / `vatAmount` / presumptive / income-tax amounts remain `null`**

Rent still posts through `POST /accountants/payments` → `postPaymentAccounting`. Expenses and other income still post through `individualAccountingService`. Agency accounting is unchanged.

Historical Payments, PropertyAccounts, and landlord transactions were not backfilled.

---

## Files changed

### New

- `server/src/services/tax/taxMetadataTypes.ts`
- `server/src/models/TaxPeriod.ts`
- `server/src/models/TransactionTaxSnapshot.ts`
- `server/src/services/taxPeriodService.ts`
- `server/src/services/taxClassificationService.ts`
- `server/src/services/individualTaxMetadataService.ts`
- `server/src/scripts/runIndividualAccountingPhaseDTests.ts`
- `client/src/pages/IndividualDashboard/components/TaxPeriodsPanel.tsx`
- `PHASE_D_TAX_METADATA_TAX_PERIODS.md`
- `PHASE_D_IMPLEMENTATION_REPORT.md`

### Extended

- `server/src/config/collections.ts` — `TAX_PERIODS`, `TRANSACTION_TAX_SNAPSHOTS`
- `server/src/models/LandlordFinancialTransaction.ts` — nullable `taxSnapshotId`, `taxCalculationStatus`, `taxPeriodKey`
- `server/src/services/individualAccountingService.ts` — attach snapshot after projection
- `server/src/services/paymentAccountingOrchestrator.ts` — individual-only `safeAttachForPayment` after post / deposit-only skip
- `server/src/services/individualWorkspaceService.ts` — `{ account, tax }` create response; batch tax fields on lists; report filters
- `server/src/services/individualTaxProfileService.ts` — owner `profileVersion` increment (Phase C carry-forward used by snapshots)
- `server/src/routes/individualRoutes.ts` — tax period / review / integrity / transaction tax APIs; list/report filters
- `server/package.json` — `test:individual-accounting-d`
- `client/src/services/individualWorkspaceService.ts` — tax period APIs
- `client/src/pages/IndividualDashboard/components/TaxProfileForm.tsx` — Tax periods panel
- `client/src/pages/IndividualDashboard/pages/FinancePages.tsx` — classification fields + tax caption
- `INDIVIDUAL_ACCOUNTING_TAX_ARCHITECTURE.md`

---

## Database changes

Additive only. No historical rewrite loop.

| Change | Detail |
|---|---|
| Collection `taxperiods` | Unique `companyId + taxType + periodKey` |
| Collection `transactiontaxsnapshots` | Unique `companyId + sourceType + sourceId`; immutable; rejects non-null tax amounts |
| `landlordfinancialtransactions` | Nullable tax overlay keys + compound index `companyId + taxPeriodKey + taxCalculationStatus` |
| Existing `payments` / `propertyaccounts` | **Untouched** |

Mongoose schema registration is the migration. Indexes:

- `TaxPeriod`: `companyId+taxType+periodKey` unique; `companyId+taxType+periodStart+periodEnd`; `companyId+status+periodStart`
- `TransactionTaxSnapshot`: `companyId+sourceType+sourceId` unique; `companyId+taxPeriodKey+taxCalculationStatus`; `companyId+propertyId+transactionDate`

---

## API changes

Behind `auth` + `requireIndividualWorkspace` (`req.user.companyId` only).

| Method | Path |
|---|---|
| GET/POST | `/individual/tax/periods` |
| GET/PUT | `/individual/tax/periods/:id` |
| GET | `/individual/tax/review` |
| GET | `/individual/tax/integrity` |
| GET | `/individual/transactions/:sourceType/:sourceId/tax` |
| GET | `/individual/expenses`, `/individual/income`, `/individual/reports/:type` accept `taxPeriodId`, `taxPeriodKey`, `taxTreatment`, `taxCalculationStatus`, `taxType` |

Create expense/income returns `{ account, tax }` with `taxAmount: null`. Period detail returns `vatPayable: null`.

---

## UI changes

- Settings → Tax: Tax periods (type, period, status, counts, review queue). No tax payable.
- Expense/bill dialog: tax treatment, deductibility, capital/revenue. Caption that VAT/income tax are not calculated.
- Expense list: tax period + status when a snapshot exists.

Verified in the demo workspace at `/demo/settings` (Tax tab) and `/demo/expenses` (Add Expense dialog). Live authenticated posting was not exercised in the browser (demo blocks writes).

---

## Tests executed

| Suite | Command | Result |
|---|---|---|
| TypeScript (`tsc`) | `npm run test:individual-accounting-d` (includes build) | Pass |
| Phase D | `node dist/scripts/runIndividualAccountingPhaseDTests.js` | **ALL PASS** (12 cases) |
| Phase B | `node dist/scripts/runIndividualAccountingPhaseBTests.js` | **ALL PASS** |
| Phase C | `node dist/scripts/runIndividualAccountingPhaseCTests.js` | **ALL PASS** |
| Phase 8 | `node dist/scripts/runPhase8TaxComplianceTests.js` | **ALL PASS** (14 cases) |
| Client compile | CRA `npm start` after TaxPeriodsPanel type fix | Compiled (pre-existing warnings only) |

Phase D cases include UTC/leap-year period keys, closed/locked vs `PERIOD_REQUIRED`, rule effective dates independent of period keys, commercial VAT-registered rent with `taxAmount = null`, **profile snapshot invariance**, residential treatment from the property profile, missing-rule review, expense/capital without input-VAT journals, deposit `NOT_APPLICABLE`, and source inspection that no `taxableAmount * rate` or historical `Payment.updateMany` was introduced.

---

## Historical-data integrity confirmation

- No migration iterates existing Payments, PropertyAccounts, expenses, or income to populate tax metadata.
- Snapshots are insert-only for **new** source ids. Duplicate key returns the existing snapshot.
- Payment documents are not given tax fields; the overlay is a separate collection.
- LandlordFinancialTransaction tax keys are nullable and only set on new posts after attach.
- Integrity checks scan snapshots only and never repair.

---

## Agency regression confirmation

- `postPaymentAccounting` remains the rent writer.
- Individual snapshot attach is gated on `workspaceType === 'individual' || plan === 'INDIVIDUAL'`.
- Payment attach is fail-soft (`safeAttachForPayment`) so a tax-period 409 cannot fail agency posting.
- Phase 8 VAT/commission/CGT/settlement tests passed unchanged.

---

## Known limitations

- Tax periods are not auto-created. New transactions often have `PERIOD_REQUIRED` until the month is opened.
- Deposit application-to-rent is still not a first-class individual UI. The original deposit receipt stays `NOT_APPLICABLE`; a future application write must attach rental metadata to the **application**.
- Historical rows remain unclassified (by design).
- Reports can filter by tax metadata; they still do not compute tax payable.
- Integrity scan is capped at 500 snapshots per company.

---

## Explicit confirmation — no tax calculation or tax journals

Phase D does **not** introduce:

- `taxAmount = taxableAmount * rate` (or equivalent) on individual posting
- `vatPayable` / `incomeTaxPayable` / `presumptiveTaxPayable` as calculated transaction values
- VAT Payable / Input VAT / Output VAT / Income Tax Payable / Presumptive Tax Payable journals
- Automatic transition to `CALCULATED`
- Placeholder zeroes that could be mistaken for a calculated tax

`configuredRate` on a rule reference is the registry rate (configuration), not a posted tax amount. Snapshot `taxAmount` is `null`.
