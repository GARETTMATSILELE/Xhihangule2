# PHASE I IMPLEMENTATION REPORT

**Date:** 18 September 2026  
**Scope:** Individual workspace production-readiness audit. Fix verified defects only. No new tax engine.

---

## Status

**PASS WITH DOCUMENTED RISKS**

**Recommendation:** `READY FOR CONTROLLED PILOT`

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

---

## What was audited (not rebuilt)

Write paths: rent orchestrator → `ensurePaymentAccountingPosted` → `postPaymentAccounting`; `individualAccountingService` expense / other-income / deposit / deposit-application / reversal; tax overlay `attachForLandlordEntry` / `safeAttachForPayment`.

Projections: `TransactionTaxSnapshot`, `TaxPeriod`, `TaxRule`, `IndividualTaxProfile`, `IndividualVatRecord`, `IndividualRentalTaxRecord`, `IndividualIncomeTaxRecord`, adjustments, tax payments, compliance reviews, evidence, packs.

Controls: Accounting Integrity (detection-only, unchanged), `AccountingEventLog`, `req.user.companyId` scoping, indexes, fail-soft overlay.

---

## Fixes made

### 1. Null tax totals displayed or aggregated as zero

**Problem:** Working papers, annual totals, pack VAT/rental sums, and VAT/rental UI used `|| 0` / skip-null sums, turning `NOT_CALCULATED` into `$0`.  
**Root cause:** Missing complete-or-null aggregation; UI `money(value || 0)`.  
**Change:** `sumCompleteTaxAmounts` / `netFromNullable`; VAT, rental, pack, and income annual schedule use them; VAT/Rental/Compliance UI `display()`; VAT PDF labels `not calculated`.  
**Risk:** Periods with a mix of calculated and review rows now show **not calculated** instead of a partial total. That is intended.  
**Test:** Phase I null-aggregation unit tests; live VAT page shows `not calculated`.

### 2. Tax overlay skipped or thrown after accounting

**Problem:** Idempotent LFT hits returned without overlay; overlay 409 could surface after a successful post.  
**Root cause:** Early return on existing idempotencyKey; rethrow of tax errors.  
**Change:** `ensureTaxOverlay` always called (including E11000 replay); overlay failures logged, accounting remains valid.  
**Risk:** A posted entry may exist without projections until a later retry. Overlay is retried on idempotent replay.  
**Test:** Phase I source assertions; Phase B/E/F/G still PASS.

### 3. Deposit application over-apply and duplicate payout

**Problem:** Application could exceed remaining deposit; repeated apply could create extra payout rows.  
**Root cause:** `rentalDepositId` optional; no remaining-balance check; payout not keyed.  
**Change:** Require `rentalDepositId`; remaining = paid − payout; reject over-apply; payout `referenceNumber = APPLY-${applicationId}`. UI label required.  
**Risk:** Existing clients that omitted `rentalDepositId` now receive 400. Correct.  
**Test:** Phase I deposit assertions; live Apply Deposit dialog requires original deposit ID.

### 4. Pack version race

**Problem:** Concurrent generate after a finalized pack could supersede then fail create, leaving a superseded v1 with no v2.  
**Root cause:** Supersede-before-create.  
**Change:** Create vN first, then mark previous FINALIZED as SUPERSEDED; catch E11000 and return the existing version.  
**Risk:** Brief window with FINALIZED v1 + GENERATED v2 before supersede. Readers sort by version desc.  
**Test:** Phase I create-then-supersede string order + unique index.

### 5. PDF truncation

**Problem:** Pack/VAT PDF `slice(0, 108)` cut the disclaimer and totals.  
**Root cause:** Single-line draw without wrap.  
**Change:** Word wrap; extra sections (accounting, adjustments, payments, evidence, reviews).  
**Risk:** Longer PDFs / extra pages.  
**Test:** Phase I asserts wrap helper and no `slice(0, 108)`.

### 6. Phase D–H indexes not created at startup

**Problem:** `autoIndex: false` and `createIndexes()` omitted tax collections, so unique constraints might never exist in Cosmos.  
**Root cause:** New models not added to the startup list.  
**Change:** Register LFT, snapshots, periods, rules, profiles, VAT/rental/income records, payments, adjustments, evidence, reviews, packs.  
**Risk:** First boot may log non-fatal index conflicts if names differ. Unique-index build on existing duplicates would warn, not wipe data.  
**Test:** Phase I indexes.ts assertions.

### 7. Joint ownership invented a taxable share

**Problem:** Pack property summary scaled `ownerShareIncome` by ownership % while tax engines used 100%.  
**Root cause:** Display treated percentage as an allocation rule.  
**Change:** `ownerShareIncome` is `null` unless ownership is 100%; readiness `OWNERSHIP_ALLOCATION_UNCLEAR` is a **blocker**.  
**Risk:** Packs that previously looked “ready” with 50% ownership now `REVIEW_REQUIRED`. Correct.  
**Test:** Phase I ownership readiness unit test.

### 8. VAT unreconciled presented as payable

**Problem:** Reconciliation set VAT `unreconciled` to net VAT position with no payment model.  
**Root cause:** Subtracting null payments from calculated VAT.  
**Change:** `recordedPayments: null`, `paymentStatus: 'NOT_RECORDED'`, `unreconciled: null`.  
**Risk:** UI shows “not recorded” instead of a VAT payable number. Correct.  
**Test:** Phase I + live compliance copy.

### 9. Income-tax overview crashed on object `reviewItems`

**Problem:** React: `Objects are not valid as a React child (found: object with keys {reason})`.  
**Root cause:** Overview rendered `overview.reviewItems` directly; demo (and any array-shaped payload) is not a count.  
**Change:** Render array length or numeric count; demo overview returns `reviewItems: 1`.  
**Risk:** None.  
**Test:** Live `/demo/tax/income` after fix.

### 10. Pack VAT/rental totals used skip-null `sumStored`

**Problem:** Pack totals could disagree with Phase E/F working papers that refuse incomplete sums.  
**Root cause:** `sumStored` added present numbers and ignored nulls.  
**Change:** Pack assembleYear uses `sumCompleteTaxAmounts` for VAT and rental tax.  
**Risk:** Annual pack net VAT/rental tax becomes null if any applicable row is incomplete.  
**Test:** Phase I aggregation tests; pack consumes stored projections (no recalculation).

---

## Limitations not implemented (correct)

- AIDS levy: keep review. Do not guess 3%.
- Capital allowances: not implemented; capital ≠ operating expense.
- FX: no invented rate. `CURRENCY_CONVERSION_REQUIRED`.
- Historical backfill: `NOT_YET_TAX_CLASSIFIED`.
- Pack sharing, ZIMRA filing, PAYE, CGT, fiscalisation: out of scope.

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
Live UI: PASS (http://localhost:3000/demo)
```

---

## Final recommendation

```
READY FOR CONTROLLED PILOT
```

Operators must treat Mantis figures as working papers, resolve `REVIEW_REQUIRED` with an accountant, and must not describe the product as ZIMRA compliant or production-certified.
