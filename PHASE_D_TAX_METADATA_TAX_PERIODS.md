# Phase D — Tax Metadata & Tax Periods

**Date:** 17 September 2026  
**Scope:** Classification, snapshots, and tax-period assignment for **new** individual transactions only.  
**Not in scope:** VAT calculation, presumptive tax calculation, income-tax calculation, tax journals, historical backfill, Tax Centre redesign, agency commission/VAT behaviour.

Mantis remains a landlord accounting / tax **working-paper** system. It is not ZIMRA-certified and does not file returns.

---

## 1. Architecture

Phase B already locked the financial write path:

```
Rent: Payment → ensurePaymentAccountingPosted → postPaymentAccounting
Non-rent: individualAccountingService.postEntry → LandlordFinancialTransaction → PropertyAccount projection
```

Phase D attaches an overlay **after** those posts:

```
canonical write
  → resolve owner + property tax profiles (effective at transaction date)
  → resolve TaxRule metadata (identity + configuredRate only)
  → resolve TaxPeriod (or PERIOD_REQUIRED)
  → persist immutable TransactionTaxSnapshot
  → audit TAX_METADATA_CREATED / TAX_PERIOD_ASSIGNED / TAX_RULE_RESOLVED / TAX_PROFILE_SNAPSHOT_CREATED
```

Snapshots live in their own collection so historical `Payment` and `PropertyAccount` documents are not rewritten.

Accounting periods and tax periods remain distinct. A transaction may carry both `accountingPeriodId` and `taxPeriodId` / `taxPeriodKey`. One transaction can be relevant to more than one tax type (`VAT` and `PRESUMPTIVE_RENTAL_INCOME_TAX`).

---

## 2. Models

### Reused

| Model | Role |
|---|---|
| `AccountingPeriod` | Financial period gate from Phase B. Unchanged. |
| `TaxRule` | Phase C registry. Identified, not calculated. |
| `IndividualTaxProfile` | Owner snapshot source. `profileVersion` increments on update. |
| `Property` tax overlay | Property snapshot source (`propertyUseClass`, `vatSupplyTreatment`, `rentalTaxTreatment`). |
| `LandlordFinancialTransaction` | Canonical non-rent write. Nullable `taxSnapshotId`, `taxCalculationStatus`, `taxPeriodKey`. |
| `Payment` | Canonical rent write. **Not mutated** for tax fields. |
| `AccountingEventLog` | Audit events. |

### New

| Model | Role |
|---|---|
| `TaxPeriod` | Per-company, per-`taxType`, per-`periodKey` (`YYYY-MM` UTC). Statuses: `OPEN`, `REVIEW`, `FINALIZED`, `AMENDED`, `LOCKED`. Unique on `companyId + taxType + periodKey`. |
| `TransactionTaxSnapshot` | Immutable posting overlay. Unique on `companyId + sourceType + sourceId`. Rejects non-null tax amounts and in-place updates. |

Historical documents may have `taxClassification: null` conceptually because they have **no snapshot row**. That is intentional.

---

## 3. Transaction lifecycle

| Source | When metadata attaches | Source kind |
|---|---|---|
| Individual rent (`POST /accountants/payments`) | After `postPaymentAccounting` (individual workspace only) | `PAYMENT_RENT` |
| Deposit-only payment | After deposit_only policy skip | `PAYMENT_DEPOSIT` |
| Expense / bill / maintenance | After `individualAccountingService.postEntry` | `EXPENSE` / `MAINTENANCE` |
| Other income | Same canonical path | `OTHER_INCOME` |
| Capital | Same path; remains outside P&L | `CAPITAL` |
| Deposit liability posted as LFT | Same path | `LIABILITY` |

If a snapshot already exists, persist is a no-op (idempotent). Snapshots are never mutated when the live tax profile later changes.

Agency payments do not receive individual snapshots.

---

## 4. Tax metadata

Classification is produced by `buildTaxClassification` (`taxClassificationService`). It never computes `taxAmount`.

Typical snapshot fields:

- `taxTypesRelevant`
- `taxRuleReferences` (`ruleId`, `ruleCode`, `ruleVersion`, `configuredRate`, `taxAmount: null`)
- `taxProfileSnapshot` (VAT registration, rental regime, property use class, treatments, owner profile version)
- `vatTreatment` / `rentalTaxTreatment` / `deductibility` / `capitalOrRevenue`
- `classificationSource` (`PROPERTY_PROFILE`, `LANDLORD_PROFILE`, `TAX_RULE`, `USER_SELECTED`, `ACCOUNTANT_REVIEW`)
- `taxCalculationStatus` (`NOT_APPLICABLE`, `NOT_CALCULATED`, `READY_FOR_CALCULATION`, `REVIEW_REQUIRED` — never auto `CALCULATED`)
- `reviewReasons` (factual: missing classification, missing rule, missing expense classification, VAT review required)
- `taxAmount`, `vatAmount`, `presumptiveTaxAmount`, `incomeTaxAmount` = **null**

`SYSTEM_DEFAULT` is not used to silently mark a supply exempt. Ambiguous cases go to `ACCOUNTANT_REVIEW` / `REVIEW_REQUIRED`.

---

## 5. Tax periods

`taxPeriodService.resolveTaxPeriod({ companyId, taxType, transactionDate })`:

1. Uses the transaction/accounting date in UTC. Never the browser local date.
2. Maps to calendar `YYYY-MM`.
3. Looks up an existing `TaxPeriod` document.
4. If none exists → `assignmentStatus = PERIOD_REQUIRED` (does **not** create a period).
5. If status is `FINALIZED` or `LOCKED` → `PERIOD_CLOSED` (new attaches are rejected with 409 for landlord entries; payment attach is logged and swallowed so agency posting cannot fail).

Opening a period is an explicit `POST /individual/tax/periods` action.

---

## 6. Tax-rule resolution

`getEffectiveTaxRule(taxType, transactionDate)` from the Phase C registry.

Phase D stores the **identity** of the rule that would apply. The registry rate (e.g. 15.5% VAT, 15% presumptive) is copied onto `configuredRate` only. It is not multiplied by the transaction amount.

Tax-rule effective dates and tax-period calendar keys are different concepts and are tested separately.

---

## 7. Profile snapshots

Mandatory invariance:

```
Create transaction → snapshot stored from the profile in force that day
Change property/owner profile later → existing snapshot unchanged
Create a later transaction → new snapshot uses the new profile version
```

Owner `profileVersion` increments on tax-profile updates so the snapshot can point at the version used at posting time.

---

## 8. Historical-data policy

Hard invariant:

- No `Payment.updateMany` / historical PropertyAccount rewrite.
- No loop that classifies existing transactions.
- Schema additions are nullable / overlay-only.
- Historical rows without snapshots are **not** integrity errors. Future phases may add an explicit Historical Tax Review workflow.

---

## 9. Audit controls

Write events only (no read noise):

| Event | When |
|---|---|
| `TAX_METADATA_CREATED` | Snapshot insert |
| `TAX_PERIOD_ASSIGNED` | Period key / id recorded (including `PERIOD_REQUIRED`) |
| `TAX_RULE_RESOLVED` | Rule references stored |
| `TAX_PROFILE_SNAPSHOT_CREATED` | Profile snapshot stored |
| `TAX_PERIOD_OPENED` / `TAX_PERIOD_REVIEWED` / `TAX_PERIOD_FINALIZED` | Period lifecycle |

There is no `TAX_CLASSIFICATION_UPDATED` path in Phase D because posted snapshots are immutable. Corrections belong to a later reclassification mechanism.

---

## 10. API changes

All routes remain behind existing individual auth (`req.user.companyId`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/individual/tax/periods` | Opened periods + transaction summaries |
| POST | `/individual/tax/periods` | Explicitly open a period |
| GET | `/individual/tax/periods/:id` | Period detail + transactions (no tax payable) |
| PUT | `/individual/tax/periods/:id` | Status change |
| GET | `/individual/tax/review` | Factual review queue |
| GET | `/individual/tax/integrity` | Detection-only findings |
| GET | `/individual/transactions/:sourceType/:sourceId/tax` | Snapshot for one transaction |
| GET | `/individual/expenses` `/income` `/reports/:type` | Optional filters: `taxPeriodId`, `taxPeriodKey`, `taxTreatment`, `taxCalculationStatus`, `taxType` |

Create expense/income responses include `{ account, tax }`. Tax amounts in JSON are `null`.

---

## 11. UI changes

- Settings → Tax: existing profile form plus **Tax periods** (type, period, status, transaction counts, review counts, not-calculated counts). No tax payable.
- Period detail drill-down from opened periods.
- Review queue lists factual reasons.
- Expense/bill dialog: tax treatment, deductibility, capital/revenue. Caption: tax period is assigned from the date; VAT/income tax are not calculated.
- Expense list shows tax period + calculation status when a snapshot exists.

Do not show VAT payable / income tax payable.

---

## 12. Testing

`npm run test:individual-accounting-d` in `server/`.

Coverage:

- UTC period keys, year boundaries, leap years
- Closed / locked vs missing period
- Tax-rule effective dates independent of period keys
- Commercial VAT-registered rent: metadata, rule version, `taxAmount = null`
- Profile snapshot invariance
- Residential treatment from property profile
- Missing rule → review, still uncalculated
- Expense / capital metadata without input-VAT journals
- Deposit `NOT_APPLICABLE`
- Source inspection: no `taxableAmount * rate`, no historical `Payment.updateMany`, orchestrator still `postPaymentAccounting`

Also run Phase B, Phase C, and Phase 8 suites for regression.

---

## 13. Known limitations

- Tax periods are not auto-opened. Many new transactions will show `PERIOD_REQUIRED` until the landlord opens the month.
- Payment metadata attach is fail-soft; a closed tax period will not block rent accounting.
- Deposit **application to rent** is still not a first-class individual UI. When that write exists, it must attach `PAYMENT_RENT` metadata to the **application**, not the original deposit receipt.
- Historical transactions remain unclassified until a later review workflow.
- Reports can filter by tax metadata; they still do not produce VAT/income-tax working papers (Phases E–G).
- Integrity scans snapshots only (max 500 per company in this phase).

---

## 14. Deliberately not implemented

- Output/input VAT calculation or journals
- Presumptive rental tax calculation or journals
- Income-tax / taxable-income calculation
- ZIMRA returns, fiscalisation, FDMS
- Automatic historical reconstruction or repair
- Agency commission VAT changes
- Tax Centre working papers (VatWorkingPaper, PresumptiveRentalSchedule, IncomeTaxWorkingPaper, AnnualTaxPack)
