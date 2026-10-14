# PHASE I — PRODUCTION READINESS & FINANCIAL/TAX INTEGRITY AUDIT

**Date:** 18 September 2026  
**Workspace:** Individual Landlord (Mantis / Xhihangule2)  
**Method:** AUDIT → TEST → IDENTIFY → FIX VERIFIED DEFECTS → REGRESSION → DOCUMENT RISKS

This is an engineering/product-readiness assessment. It is not a ZIMRA, tax-law, or filing certification.

---

## Executive status

```
PASS WITH DOCUMENTED RISKS
```

**Engineering recommendation:** `READY FOR CONTROLLED PILOT`

Not ready to describe as production-certified, ZIMRA compliant, or legally compliant. A controlled pilot is appropriate where operators treat every tax figure as a working paper, honour `REVIEW_REQUIRED`, and do not file from Mantis.

---

## Architecture assertion

```
                    ACCOUNTING
                         │
                         ▼
             IMMUTABLE TAX SNAPSHOT
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
         VAT       RENTAL TAX      INCOME TAX
          │              ▼              │
          └──────────────┼──────────────┘
                         ▼
                 TAX COMPLIANCE
                         │
                         ▼
                  ANNUAL TAX PACK
```

```
Accounting remains authoritative: YES
Tax projections remain derived: YES
Historical financial rewrite: NO
Historical tax backfill: NO
Agency accounting modified: NO
Competing ledger introduced: NO
PAYE introduced: NO
CGT introduced: NO
ZIMRA filing introduced: NO
Fiscalisation introduced: NO
```

Invariant held:

```
ONE ACCOUNTING TRANSACTION
        ↓
ONE AUTHORITATIVE ACCOUNTING EVENT
        ↓
ONE IMMUTABLE TAX SNAPSHOT
        ↓
ZERO OR MORE TAX PROJECTIONS
```

---

## Financial integrity

| Area | Result |
|---|---|
| Duplicate detection | PASS — `LandlordFinancialTransaction` idempotencyKey + E11000 replay; payment orchestrator unchanged |
| Reversal integrity | PASS — original LFT/tax records immutable; linked reversals via `safeReverseForSource` |
| Accounting source-of-truth | PASS — rent still `postPaymentAccounting` / `ensurePaymentAccountingPosted`; expenses/other income/deposits via LFT then PropertyAccount projection |
| Period integrity | PASS — missing tax period is `PERIOD_REQUIRED`; closed/locked reject ordinary mutation; no auto-created tax periods |
| Immutability | PASS — snapshots, VAT, rental-tax, income-tax, packs block in-place update/delete |
| Deposit | PASS after fix — receipt is liability; application requires `rentalDepositId`, cannot exceed remaining (paid − payout); original receipt unchanged |
| Fail-soft tax | PASS — accounting post does not rethrow tax overlay 409; overlay retried on idempotent hit |

Fail-closed: unauthorized access, duplicate financial write, closed-period mutation, cross-company access, invalid accounting mutation.  
Fail-soft: tax projection temporarily unavailable after a valid accounting post (logged).

---

## Tax integrity

### VAT (Phase E)

- Not registered → `NOT_VAT_REGISTERED` / `NOT_APPLICABLE` with `vatAmount: null`, not `$0`.
- Exempt → calculated `0`.
- Missing supplier VAT evidence → `REVIEW_REQUIRED`, `vatAmount: null`.
- VAT amounts do not leak into rental/income records except as null placeholders.
- Landlord VAT payment model absent → pack reconciliation `paymentStatus: NOT_RECORDED`, `unreconciled: null` (not a fabricated payable).

### Presumptive rental tax (Phase F)

- Golden case: commercial, USD 2,000 on 17 Sep 2026, rule `ZW_PRESUMPTIVE_RENTAL_PN08_2026` → USD 300 via `TaxRule.rate`, not a literal `0.15`.
- Residential dwelling → `NOT_APPLICABLE`.
- Mixed-use / unclear → `REVIEW_REQUIRED`.
- Deposit receipt → no rental-tax record / `NOT_APPLICABLE`.

### Ordinary income tax (Phase G)

- Accounting profit 18,000 + non-deductible 1,000 + depreciation add-back 500 − approved deduction 500 → taxable 19,000 × configured `ZW_INCOME_TAX_TRADE_INVESTMENT_2024`.
- PAYE bands/thresholds/employment tax are not used.
- AIDS levy remains `REVIEW_REQUIRED` / warning. Not auto-applied.
- Capital expenditure classified `CAPITAL`, not ordinary deductible expense. Accounting depreciation is an add-back review, not a tax allowance.
- Annual schedule sums months; incomplete months listed; missing month is not silently annualised × 12.

### Snapshots, rules, periods

- Historical snapshots are immutable. Live profile/rule changes apply only to new writes.
- Mixed USD+ZWG → `CURRENCY_CONVERSION_REQUIRED`. No invented FX rate.
- Joint ownership ≠ 100% → `OWNERSHIP_ALLOCATION_UNCLEAR` blocker (`REVIEW_REQUIRED`). Displayed ownership is not used to scale tax. Owner share is `null` when not 100%.

---

## Compliance

| Area | Result |
|---|---|
| Readiness | PASS — blockers prevent ready/finalise |
| Evidence | PASS — `File` company-scoped; unique (companyId, documentId, sourceId) |
| Reviews | PASS — resolve/waive; evidenceId company-checked |
| Annual packs | PASS — consume stored E/F/G totals; `sumCompleteTaxAmounts` does not drop nulls into a partial total |
| Finalisation / versioning | PASS after fix — create vN then supersede; E11000 returns existing version; finalized pack not mutated in place |
| Pack sharing | Not implemented — FUTURE FEATURE |

---

## Security

| Area | Result |
|---|---|
| Authorization | Individual tax routes use `req.user.companyId` only |
| Client-supplied companyId | Rejected — `req.body.companyId` is not used |
| Property isolation | Property lookups include companyId |
| File isolation | Evidence attach/resolve require File.companyId match |
| Cross-company live API matrix | **NOT_RUN** against two authenticated companies (demo adapter intercepts `/demo`) |
| Stack traces to clients | Development-only in `errorHandler` |

---

## UI

Live browser exercised on `http://localhost:3000/demo` (sample workspace, fictional data, mutations disabled).

| Route | Result |
|---|---|
| Individual Dashboard | PASS — sample portfolio loads |
| Finance → VAT | PASS — `NOT_REGISTERED`, Output/Input/Net **not calculated** (not `$0`) |
| Finance → Rental Tax | PASS — calculated rental tax `$300.00`, payments `$0.00` |
| Finance → Income Tax | PASS after fix — accounting profit / taxable / calculated tax **not calculated**; review required |
| Tax Compliance | PASS — REVIEW REQUIRED; VAT not calculated; rental tax `$300`; income tax not calculated; no combined ZIMRA payable |
| Settings → Tax | PASS — profile + periods; VAT registered unchecked; accountant-review regime |
| Accounting → Apply Deposit to Rent | PASS — dialog requires original deposit ID; demo POST blocked |
| Runtime exceptions | PASS after income-tax overview child fix |
| NaN / undefined amounts | Not observed |
| Network (demo) | GET 200 via demo adapter; mutating POST 403 `DEMO_MODE` |

Authenticated live-company API 401/403/404/500/409 matrix: **NOT_RUN**.

---

## Exports

| Format | Result |
|---|---|
| PDF | PASS after wrap — disclaimer not truncated at 108 chars; includes taxpayer, year, accounting, VAT, rental tax, income tax, adjustments, payments, evidence, reviews, disclaimer |
| XLSX | PASS — `buildXlsxWorkbookSheets` OOXML (`PK` + `xl/worksheets/sheetN.xml`), not CSV masquerading |
| CSV | PASS — labelled sheets; disclaimer appended |

Opening the files in desktop Excel was **NOT_RUN** on this machine; OOXML structure is unit-tested.

---

## Database

| Area | Result |
|---|---|
| Startup indexes | PASS after fix — Phase D–H models included in `createIndexes()` (required because `autoIndex: false`) |
| Unique keys | company+source+kind on VAT/rental/income records; pack company+year+version; evidence company+document+source |
| Cosmos notes | Compound unique indexes are used and are Cosmos-compatible if the shard key is `companyId` or the unique key includes the partition key. `TaxRule` unique `{ruleCode, version}` is global (not company-scoped) — acceptable for a system registry. `RentalDeposit` has **no** unique application key; service-level payout `APPLY-${applicationId}` is the idempotency control. Document before changing Cosmos index policy. |
| Orphan scan of live data | **NOT_RUN** — no automatic repair. Detection belongs in a future integrity job. Code paths report `RECORD_WITHOUT_SOURCE` on reconcile rather than deleting. |
| Demo vs production | Demo company ids are `demo-*` and only served under `/demo`. They must not be loaded into production Mongo/Cosmos. |

---

## Known risks (explicit)

| Item | Classification | Why |
|---|---|---|
| AIDS levy not auto-applied | WARNING | Legal treatment vs this trade/investment rate is not confidently established. `REVIEW_REQUIRED` is correct. |
| Capital allowances not implemented | WARNING / FUTURE FEATURE | Capital is not silently treated as an operating deduction. |
| VAT payment model absent | WARNING | Payments labelled `NOT_RECORDED`. Must not be read as VAT payable. |
| Ownership allocation not implemented | MATERIAL RISK | Now a readiness **blocker**. Pilot properties should be 100% owned or stay in review. |
| Mixed-currency conversion absent | MATERIAL RISK | No authoritative FX source implemented. `CURRENCY_CONVERSION_REQUIRED` remains correct. Candidate (not implemented): RBZ published rate for the tax-point date — confirm with a tax practitioner before any integration. |
| Historical transactions unclassified | WARNING | `NOT_YET_TAX_CLASSIFIED` until a new write. No backfill. |
| Annual income-tax aggregation depends on Phase G | WARNING | Pack reads `annualSchedule`; incomplete months are listed, not zero-filled as complete. |
| Pack sharing absent | FUTURE FEATURE | No secure share channel. |
| Live authenticated API / two-company isolation | MATERIAL RISK | Browser pass used `/demo`. Direct cross-company HTTP against production-like data was not executed in this phase. |
| Default CORS allowlist includes `localhost:3000` / `5173` even when `NODE_ENV=production` unless `CLIENT_URL`/`ALLOWED_ORIGINS` override is complete | WARNING | Do not ship production with the default localhost origins. |
| Authenticated Accounting Integrity / agency suite beyond Phase 8 static tests | Phase 8 PASS; full live integrity job against production data **NOT_RUN** | Detection-only behaviour was not changed. |

---

## Traceability quality bar

An independent reviewer can trace landlord → property → lease → payment → accounting entry → tax snapshot → VAT / rental tax / income tax → working paper → review → evidence → annual pack **for new writes after Phases D–H**.

Gaps that remain visible rather than guessed:

1. Historical pre-D amounts: `NOT_YET_TAX_CLASSIFIED`.
2. Joint ownership: displayed, not allocated.
3. Mixed currency: no combined annual tax amount.
4. AIDS levy / capital allowances / VAT payments: not represented as calculated money.

---

## Regression

```
Phase B: PASS
Phase C: PASS
Phase D: PASS
Phase E: PASS
Phase F: PASS
Phase G: PASS
Phase H: PASS
Phase I: PASS
Phase 8: PASS
Server tsc: PASS
Client tsc: PASS
Live UI: PASS (demo workspace)
Authenticated live-company UI: NOT_RUN
```
