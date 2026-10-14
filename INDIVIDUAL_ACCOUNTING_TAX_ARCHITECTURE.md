# Individual Landlord Accounting & Tax Architecture

**Phase A audit date:** 17 September 2026  
**Status:** Phase A–I complete. Controlled-pilot engineering gate only.  
**Certification:** Mantis is not ZIMRA-certified, tax-certified, IFRS-certified, or capable of filing a ZIMRA return.

Mantis must keep an auditable financial record for each landlord and property, and produce tax working papers the landlord or accountant can use when preparing ZIMRA obligations.

---

## 1. Current architecture discovered

### Workspaces

| Workspace | Purpose |
|---|---|
| Agency | Trust, commission, VAT on commission, CGT/CGWT, ZIMRA workflows |
| Individual | Landlord profit-centre. Gate: `workspaceType === 'individual'` or `plan === 'INDIVIDUAL'` |

### Canonical payment path (must remain)

```
Payment completion
  → ensurePaymentAccountingPosted
  → postPaymentAccounting
  → property / agent / company projections
  → accountingIntegrationService.syncPaymentReceived
  → reconcilePayment
  → accountingComplete
```

Individual rent uses this path via `POST /accountants/payments` (`createPaymentAccountant`). Properties are created with `rentalType: management` and `commission: 0`.

### Broken individual write path (Phase B replaces)

```
Expense / bill / maintenance / POST /individual/income
  → IndividualWorkspaceService.postEntry
  → PropertyAccount.transactions.push + save
```

No period lock, no canonical source, no tax metadata, no VAT, no audit event. `correctEntry` posts a contra line (not a true void).

### Reporting defect

`getSummary()` labelled `monthlyIncome` / `monthlyExpenses` as this month but used `PropertyAccount.totalIncome` / `totalExpenses` (lifetime). `annualProfit = netProfit * 12`. `tax-preparation` returned the same rows as P&L.

### Deposits

Payment `depositAmount` goes to `RentalDeposit` via `ensureDepositLedgerFromPayment` and is excluded from owner income (`deposit_only` policy). No individual UI. No apply/refund/forfeit lifecycle.

---

## 2. Existing reusable services

| Service | Reuse |
|---|---|
| `paymentAccountingOrchestrator` | Rent only. Do not clone. |
| `propertyAccountService.recordIncomeFromPayment` | Owner-income projection from Payment |
| `accountingPeriodService.assertPeriodAllowsPosting` | Period gate (currently GL-only) |
| `TaxRate` + `taxRateService.getVatRateForDate` | Effective-dated VAT/CGT/CGWT |
| `vatApplicability` / `vatPolicyService` | VAT gates; currently commission/sale oriented |
| `vatCalculation` | Inclusive/exclusive VAT math |
| `TaxObligation` + `taxObligationService` | Canonical tax amounts (extend types; do not invent a second tax ledger) |
| `TaxReviewItem` | Review queue |
| `AccountingEventLog` | Append-only audit |
| `PaymentAuditLog` | Payment mutations |
| `taxIntegrityService` | Detection-only pattern |
| `File` model + `/files` | Supporting documents |
| `RentalDeposit` | Deposit received/payout rows |

Agency-only (do not drive individual rent VAT from these): VAT on commission, trust `TaxRecord`/`TaxPayout`, sale settlement `taxEngine`.

---

## 3. Existing models to extend

| Model | Change |
|---|---|
| `Company.taxProfile` | Add landlord fields (TIN already on Company; add `rentalTaxRegime`, income-tax registration). Keep company-scoped. |
| `Property` | Already has `propertyUseClass`, `vatSupplyTreatment`, CGT cost fields. Unhide in individual UI; add `rentalTaxTreatment`, effective dates. Do not create a competing property collection unless needed. |
| `TaxRate.taxType` | Add `PRESUMPTIVE_RENTAL` (and later `INCOME_TAX`) as dated rates. Do not hard-code 15% in business logic. |
| `TAX_TYPES` | Add `PRESUMPTIVE_RENTAL_INCOME_TAX`. Do not merge into VAT. |
| `PropertyAccount.accountingTreatment` | Add `LIABILITY`, `CAPITAL` so deposits and capital works are excluded from P&L. |
| `AccountingPeriod` | Reuse. Do not create a duplicate financial period model. Tax periods may reference it. |
| `VatRecord` | Agency payment VAT aggregate. Individual output/input VAT should use `TaxObligation` (`VAT_OUTPUT` / `VAT_INPUT`) linked to source, not a second orphan store. |
| `File` | Link `transactionId` / `taxPeriodId` when posting documents. |

---

## 4. New models required

| Model | Role |
|---|---|
| `LandlordFinancialTransaction` | Canonical source for individual expenses, other income, maintenance costs, capital, deposit applications. Rent remains `Payment`. |
| `TaxPeriod` | Filing/working-paper period (OPEN / REVIEW / FINALIZED / AMENDED / LOCKED). May reference `AccountingPeriod`. |
| `TaxAdjustment` | Explicit add-back / deduction. Never mutates accounting profit. |
| `TaxRule` | Versioned legal configuration (`ruleCode`, `effectiveFrom/To`, `rate`, `sourceReference`). Broader than `TaxRate` (treatments, methods). Implemented in Phase C as a system registry; not applied to historical transactions. |
| `IndividualTaxProfile` | Landlord tax profile keyed by `companyId`. Kept separate from `Company.taxProfile` so agency VAT settings cannot wipe rental-tax fields. VAT registration is dual-written to `Company.taxProfile` (source of truth for `vatApplicability`). |
| Property tax overlay | Fields on `Property`: `vatEffectiveFrom/To`, `rentalTaxTreatment`, `rentalTaxEffectiveFrom`, `ownershipPercentage`, `taxNotes`, plus existing use class / VAT treatment / acquisition fields. |

No `CanonicalTransaction` exists today. Do not treat `PropertyAccount.transactions` as the entry API.

---

## 5. Existing APIs to modify

| API | Change |
|---|---|
| `POST/PUT/DELETE /individual/expenses` | Route through `individualAccountingService`. Keep URL. |
| `POST/PUT/DELETE /individual/income` | Same. |
| `POST /individual/maintenance/:id/record-expense` | Same. |
| `GET /individual/dashboard` | Period-aware summary. Query `period=this_month\|year_to_date\|last_12_months\|lifetime`. |
| `GET /individual/accounting` | Same period contract. |
| `GET /individual/reports/:type` | Distinct report types (Phase H). Stop aliasing tax-preparation to P&L. |
| Property create (individual) | Stop hiding VAT/use-class. Keep commission 0 unless an agency relationship exists. |

`POST /accountants/payments` stays the rent writer.

---

## 6. New APIs required

```
GET/PUT  /individual/tax-profile
GET/PUT  /individual/properties/:id/tax-profile
GET/POST /individual/tax/periods
GET      /individual/tax/periods/:id
GET      /individual/tax/vat
GET      /individual/tax/vat/working-paper
GET      /individual/tax/rental-income
GET      /individual/tax/presumptive-rental
GET      /individual/tax/income-tax
GET/POST /individual/tax/adjustments
PUT      /individual/tax/adjustments/:id
GET      /individual/tax/annual-pack
GET      /individual/tax/integrity
GET      /individual/rent-status
POST     /individual/deposits/:id/apply
POST     /individual/deposits/:id/refund
```

Phase B implements the accounting service behind existing expense/income routes plus period-aware dashboard. Tax profile routes are in Phase C. Remaining tax working-paper routes start in Phase D–G.

---

## 7. Existing UI to modify

- Dashboard cards — explicit period labels
- Expenses / Bills forms — supplier, VAT mode, deductibility (Phase B API; full form Phase K)
- Property form individualMode — unhide use class and VAT treatment (Phase C)
- Settings — tax profile (Phase C)
- Reports catalogue — honest labels (Phase H)
- Property detail — Tax / VAT / Documents tabs (Phase K)
- Rent Collection — consume server rent-status (Phase B/H)

---

## 8. New UI required

Tax Centre: TaxProfileForm, PropertyTaxProfileForm, TaxPeriodSelector, VatWorkingPaper, PresumptiveRentalSchedule, IncomeTaxWorkingPaper, TaxAdjustmentTable, TaxReviewWarnings, AnnualTaxPack, TaxTransactionDrilldown.

Payment receipts stay acknowledgements. Tax invoices are a separate document type. Do not label pdf-lib output as fiscalised (`fiscalStatus = NOT_FISCALISED`).

---

## 9. Migration requirements

- Non-destructive Mongoose schema + `COLLECTIONS` entries
- Indexes: `companyId+propertyId+date`, `idempotencyKey` unique, `sourcePaymentId`, `taxPeriodId`
- Do not backfill historical VAT/tax amounts
- Historical Tax Review counts unclassified legacy `PropertyAccount` rows that have no `LandlordFinancialTransaction`
- `AccountingPeriod` already unique on `companyId+periodStart+periodEnd`

---

## 10. Tax-rule gaps requiring authoritative-source verification

Recorded from ZIMRA Public Notice 08 of 2026 (issued 5 February 2026) and secondary commentary. **Do not hard-code legal conclusions where the statute and notice may diverge.**

| Topic | What is reasonably established | Gap |
|---|---|---|
| Presumptive rental tax | Finance Act 2025 (Act 7 of 2025); Income Tax Act s36R and 39th Schedule; 15% of **gross** rental; **final tax**; no deductions/credits/set-off; effective **1 January 2026**; return by **5th**, pay by **10th** of following month | Store as dated `TaxRule` with `sourceReference: "ZIMRA Public Notice 08 of 2026"`. Rate must not be a TypeScript constant used as the only source of truth. |
| Who is in | Proprietor / landlord / owner / lessee / sub-lessee receiving rent from a tenant liable for presumptive tax | Registration history (in ZIMRA before 31 Dec 2025 vs after) is **taxpayer-profile data**, not `workspaceType`. Default `ACCOUNTANT_REVIEW`. |
| Residential vs business premises | Commentary: purely residential often outside scope; mixed-use taxable on business portion | Official notice emphasises premises used for business/trade/occupation. **Do not auto-exempt residential.** Missing classification → `ACCOUNTANT_REVIEW`. |
| Existing vs new registrants | Administrative position: already declaring rental income under normal IT before 31 Dec 2025 may continue self-assessment | Possible mismatch between statute and notice. Regime = `SELF_ASSESSMENT` \| `PRESUMPTIVE_RENTAL` \| `ACCOUNTANT_REVIEW`. Never infer from individual workspace. |
| VAT on residential dwelling rental | Existing engine: `RESIDENTIAL_DWELLING` → `EXEMPT` | Confirm against current VAT Act for short-term accommodation. Add `SHORT_TERM_ACCOMMODATION` use class as review. |
| VAT 15.5% from 1 Jan 2026 | Already in `TaxRate` seed | Reuse. Do not duplicate. |
| Input VAT on landlord expenses | `VAT_INPUT` exists as MANUAL | Need supplier tax invoice + landlord VAT registration. Unregistered landlords: do not fabricate input VAT. |
| Income tax (self-assessment) | PAYE/CORPORATE_TAX marked EXTERNAL | Working paper only: accounting profit ± adjustments. No claim of final liability if review required. |
| FDMS / fiscalisation | Not implemented | `NOT_FISCALISED`. No fake QR/device serial. |

---

## 11. Risks

1. Dual write if expenses keep pushing `PropertyAccount` and also create a canonical row.
2. Treating PropertyAccount as source of truth after introducing canonical entries.
3. Auto-classifying VAT = 0 because commission is 0% (wrong for a VAT-registered commercial landlord).
4. Auto-applying 15% presumptive tax to residential individual landlords.
5. Rewriting historical amounts or backfilling tax.
6. Breaking agency commission / trust / Phase 7–9 tests.
7. Period lock on individual writes blocking live rent if periods are CLOSED (must use the same UNMANAGED = allowed rule).
8. Deposit posted as `type: expense` would hit P&L (`computePropertyAccountTotals` treats non-income as expense).
9. Excel still CSV until Phase H.
10. `postEntry` `.save()` after array push may be looser than `$push` idempotent updates used by the payment writer.

---

## 12. Recommended implementation phases

| Phase | Scope | Status |
|---|---|---|
| A | Audit | Done |
| B | Canonical individual writes, period-aware P&L, deposit/capital exclusion, audit | Done |
| C | Owner + property tax profiles, rental tax regime, unhide classification UI | Done |
| D | Transaction tax metadata, tax periods | Done |
| E | Input/output VAT working paper | Done |
| F | Presumptive vs self-assessment rental tax | Done |
| G | Income-tax working paper + TaxAdjustment | Done |
| H | Distinct reports, real XLSX, tax pack, rent-status unification | |
| I | Receipt vs tax invoice, documents | |
| J | Integrity detection, period finalize/lock | |
| K | Tax Centre UI, drill-down, warnings | |

Do not start C until B tests pass and no duplicate ledger posts exist.

---

## 13. Tests required

Phase B:

- Deposit / LIABILITY excluded from income and expense totals
- Capital excluded from P&L
- `postEntry` no longer writes PropertyAccount directly
- Idempotent expense post
- Period CLOSED rejects individual expense
- `getSummary` this-month income is period-filtered, not lifetime
- `annualisedRunRate` is labelled separately from `financialYearProfit`
- Agency orchestrator still the rent writer (source inspection)
- Golden: rent 1000, commission 0, owner income 1000 (existing payment tests remain)

Later phases: VAT inclusive/exclusive from `TaxRate`, presumptive from `TaxRule`, tax adjustments, period lock, no historical rewrite.

---

## Transaction lifecycle (target)

```
Expense / other income / maintenance cost / deposit application
  → individualAccountingService (idempotent)
  → period gate
  → LandlordFinancialTransaction (canonical)
  → PropertyAccount $push projection
  → AccountingEventLog
  → (Phase D) immutable TransactionTaxSnapshot + tax period assignment (snapshot tax amounts stay null)
  → (Phase E) IndividualVatRecord + VAT working paper (not agency VatRecord / TaxObligation)
  → (Phase F) IndividualRentalTaxRecord + rental-tax working paper (not a GL payable journal)
  → (Phase G) IndividualIncomeTaxRecord LINE + ordinary income-tax working paper (not PAYE, not a GL payable journal)

Rent
  → PaymentForm
  → POST /accountants/payments
  → postPaymentAccounting
  → PropertyAccount income from ownerAmount
  → RentalDeposit if depositAmount > 0
  → (Phase D) individual-only tax snapshot on Payment (immutable overlay; Payment amounts unchanged)
  → (Phase E) output VAT from the snapshot into IndividualVatRecord; agency commission VAT unchanged
  → (Phase F) presumptive rental tax from the **same snapshot** into IndividualRentalTaxRecord when regime is PRESUMPTIVE_RENTAL
  → (Phase G) ordinary income-tax LINE from the **same snapshot** into IndividualIncomeTaxRecord; taxable income is a period working paper, not rent × 25%
```

## Historical-data policy

Existing PropertyAccount rows and Payments are not rewritten. Missing tax metadata appears in Historical Tax Review counts. Reclassification is an explicit, audited action.

## Compliance limitations

Working papers and schedules only. No ZIMRA filing, no FDMS, no claim of certified compliance.

## Phase C implemented

- `GET/PUT /individual/tax-profile` — owner tax profile. `rentalTaxRegime` defaults to `ACCOUNTANT_REVIEW` and is never inferred from `workspaceType`.
- `GET/PUT /individual/properties/:id/tax-profile` — property use class, VAT treatment with effective dates, rental tax treatment.
- `GET /individual/tax/rules` — dated `TaxRule` registry, including ZIMRA Public Notice 08 of 2026 (15% gross rental, effective 1 January 2026) as configuration only.
- Individual Settings → Tax tab; property detail → Tax tab; property create/edit shows classification without agency commission VAT.
- VAT registration on the landlord profile updates `Company.taxProfile` so existing `vatApplicability` continues to work.
- No tax amounts are posted. `PRESUMPTIVE_RENTAL_INCOME_TAX` and `INCOME_TAX` exist on `TAX_TYPES` as `NOT_IMPLEMENTED` until Phases F–G.

## Phase D implemented

- New individual rent, expense, other-income, capital, and deposit-received writes receive an immutable `TransactionTaxSnapshot`.
- `TaxPeriod` is a separate calendar from `AccountingPeriod`. Missing periods are `PERIOD_REQUIRED`; they are never auto-created. Closed/locked periods reject new metadata attaches (payments fail-soft so agency posting cannot break).
- Snapshots store owner/property profile versions, tax-rule references (`configuredRate` from the registry), and `taxCalculationStatus`. `taxAmount` / `vatAmount` / presumptive / income-tax amounts are always `null`.
- Historical Payments, PropertyAccounts, and LandlordFinancialTransactions are not backfilled.
- Settings → Tax → Tax periods plus a factual review queue. Expense/income lists can filter by `taxPeriodId`, `taxTreatment`, `taxCalculationStatus`, and `taxType`.
- Integrity findings are detection-only (`TRANSACTION_MISSING_TAX_PERIOD`, `TAX_PROFILE_SNAPSHOT_MISSING`, `TAX_RULE_REFERENCE_INVALID`, `TAX_PERIOD_CLOSED`, `TAX_METADATA_MISMATCH`).
- See `PHASE_D_TAX_METADATA_TAX_PERIODS.md`.

## Phase E implemented

- New individual writes that receive a Phase D snapshot also receive an `IndividualVatRecord` (output for rent/other income, input for expenses) calculated from **that snapshot**.
- Inclusive/exclusive math reuses `extractInclusiveVat` / `exclusiveVatOn` with `TaxRule` percentages via `vatPercentToFraction`. `vatAmount` may be non-null for VAT only.
- Agency `VatRecord` and `TaxObligation` are not written. No VAT payable journals. No income-tax or presumptive amounts.
- APIs: `GET /individual/tax/vat`, `/tax/vat/working-paper` (json/csv/xlsx/pdf), `/tax/vat/transactions`, `/tax/vat/review`, `/tax/vat/reconciliation`.
- UI: Settings → Tax VAT status; expense VAT section; Finance → VAT centre.
- See `PHASE_E_INDIVIDUAL_VAT_ENGINE.md`.

## Phase F implemented

- New individual rent and deposit-application writes that receive a Phase D snapshot also receive an `IndividualRentalTaxRecord` calculated from **that snapshot**.
- Applicability uses snapshotted `rentalTaxRegime` (never workspace type). Self-assessment and accountant-review do not fabricate presumptive tax.
- Rate is `TaxRule.rate` (`ZW_PRESUMPTIVE_RENTAL_PN08_2026`, 15% of gross rental received). No hard-coded `* 0.15`.
- Tax base is rule-driven gross rental after identified deposits/levies. VAT amounts are not the rental-tax base.
- Deposit receipts stay `NOT_APPLICABLE`. Deposit application is a new `DEPOSIT_APPLICATION` income write.
- APIs: `GET /individual/tax/rental`, `/tax/rental/working-paper` (json/csv/xlsx/pdf), transactions, review, reconciliation, annual foundation, `POST /tax/rental/payments`, `POST /deposits/apply`.
- No income-tax/CGT engine, no historical backfill, no presumptive-tax payable GL journal. Agency `TaxObligation` mode remains `NOT_IMPLEMENTED`.
- See `PHASE_F_PRESUMPTIVE_RENTAL_TAX.md`.

## Phase G implemented

- New individual writes that receive a Phase D snapshot also receive an `IndividualIncomeTaxRecord` LINE classified from **that snapshot**.
- Working paper: accounting profit from `sumPropertyAccountPeriodPnl` + add-backs + approved adjustments − exempt/presumptive rental income → taxable income → `TaxRule` `ZW_INCOME_TAX_TRADE_INVESTMENT_2024` (25% taxable income from trade/investment; not PAYE bands).
- Presumptive rental receipts are excluded from ordinary taxable income via snapshot regime, not by subtracting Phase F tax amounts.
- AIDS levy is a review item, not an auto-added 3%. Capital allowances and tax depreciation are not implemented.
- APIs: `GET /individual/tax/income*`, `POST /tax/income/calculate`, `/adjustments`, `/payments`. UI: Finance → Income Tax.
- No CGT, PAYE, historical backfill, competing ledger, or agency TaxObligation writes. `TAX_TYPE_MODE.INCOME_TAX` remains `NOT_IMPLEMENTED`.
- See `PHASE_G_INCOME_TAX.md`.

## Phase H implemented

- Consolidation layer only. Finance → Tax Compliance centre reads Phase D snapshots, Phase E VAT, Phase F rental tax, Phase G income tax, accounting P&L for the tax year, tax periods, reviews, files, and recorded tax payments.
- No second tax engine. Missing E/F/G projections are `NOT_CALCULATED` / `REVIEW_REQUIRED`.
- Deterministic readiness (`BLOCKER` / `WARNING` / `INFORMATION`) drives status. Users cannot mark a year ready while blockers remain.
- Evidence register references existing `File` rows. Review queue can be resolved or waived (reason + audit). Annual `IndividualTaxPack` is an immutable snapshot with versioning (`supersedesPackId`).
- Exports: PDF, genuine multi-sheet XLSX, CSV. Three projections stay separate. No ZIMRA filing, assessment, CGT, PAYE, or agency accounting change.
- See `PHASE_H_TAX_COMPLIANCE.md`.

## Phase I implemented

- Production-readiness audit of Phases B–H. No new tax engine, no historical backfill, no agency accounting change.
- Verified defects fixed: null tax totals coerced to `$0`; deposit over-apply; tax overlay skipped on idempotent replay; pack version race; PDF truncation; Phase D–H indexes omitted from startup `createIndexes()`; joint-ownership invented share; VAT unreconciled treated as payable; income-tax overview rendering objects as React children.
- Fail-soft tax overlay after accounting remains. Unique indexes remain the concurrency control.
- Live demo workspace (`/demo`) exercised: Dashboard → Finance VAT / Rental Tax / Income Tax / Tax Compliance → Settings Tax → Accounting Apply deposit.
- Engineering recommendation: **READY FOR CONTROLLED PILOT** with documented limitations (AIDS levy, capital allowances, VAT payments, ownership allocation, FX, historical unclassified).
- See `PHASE_I_PRODUCTION_READINESS_AUDIT.md` and `PHASE_I_IMPLEMENTATION_REPORT.md`.
