# Phase 9 — Financial Controls Audit

**Date:** 16 September 2026  
**Method:** Read-only inspection of Phase 7–8.3 documentation and current source. No production financial records were modified during this audit.

**Prior status:** Phase 8.3 `PASS WITH DOCUMENTED RISKS`

This application is not ZIMRA certified, legally certified, tax certified, EAC certified, or IFRS certified.

---

## 1. Existing financial controls

### Canonical posting pipeline (intact)

```
Payment (completed)
  → accountingPostingPolicy.evaluatePermanentAccountingPolicy
  → paymentAccountingOrchestrator.postPaymentAccounting
      → propertyAccountService.recordIncomeFromPayment
      → agentAccountService.syncCommissionForPayment
      → accountingIntegrationService.postCompanyCommission
      → accountingIntegrationService.syncPaymentReceived
          → allocateRentalReceipt (canonical split)
          → buildAgentReceiptJournal
          → accountingService.postTransaction
  → paymentAccountingReconciliation (read-only)
  → accountingComplete
```

Single GL writer: `accountingService.postTransaction`. All other modules delegate to it.

### Immutability already present

| Record | Control |
| --- | --- |
| `JournalEntry` | `status: posted` immutable; save-after-create blocked; deleteOne/deleteMany/findOneAndDelete blocked; unique `(companyId, reference)` and sparse unique `(companyId, sourceModule, sourceId)` |
| Completed `Payment` | `paymentFinancialImmutability.ts` blocks material financial field updates; reverse → reversal payment → correction draft |
| `TrustTransaction` | Updates blocked |
| `AccountingEventLog` | Append-only |
| `TaxOverride` | Reason required; approval statuses PENDING / APPROVED / REJECTED |

### Idempotency already present (payment journals)

Payment journals use stable `sourceId`: `paymentId`, `{paymentId}:commission`, `{paymentId}:reversal`. Unique index absorbs retries.

Payment unique indexes: `idempotencyKey`, `externalProvider+externalTransactionId`, `referenceNumber` (all partial).

Subledgers: PropertyAccount `transactions.idempotencyKey`; AgentAccount commission `reference`; CompanyAccount `transactions.paymentId` (non-archived); TaxObligation `(companyId, paymentId, taxType, reversalOf)` sparse unique; TrustTransaction `paymentId` unique partial.

### Detection-only integrity

- `paymentAccountingIntegrity.ts` — projection completeness / orphans; no ledger writers
- `taxIntegrityService.ts` — VAT / CGT / CGWT / TRUST / COMPANY; `detectionOnly: true`, `repaired: false`
- `trustReconciliation.ts` — PARTIAL scope; `BALANCED_WITHIN_SCOPE` or `RECONCILIATION_EXCEPTION`; never FULL / never RECONCILED
- Trust recon job — detection-only
- Daily/monthly full sync — detection-only for payment accounting

### Period / tax locks already present

- Env `ACCOUNTING_PERIOD_LOCK_BEFORE` on payment controller reverse/delete/status
- VAT period lock when `VatReturn` is SUBMITTED / PAID / RECONCILED (`assertVatPeriodOpen`)
- Trust account CLOSED / settlement `locked` blocks trust posting

### Auth already present

`accountingRoutes` uses global `auth`. Reads: `canViewCommissions`. Writes: `isAccountant`. Balance backfill: `isSystemAdmin`. Unauthenticated tax/accounting endpoints return 401.

### Tax controls (Phase 8.3 — preserve)

- Receipt upload ≠ PAID
- VAT NOT ACTIVE when `taxProfile.vatRegistered` is false
- VAT return from `TaxObligation` vs GL 2101
- Legacy CGT $38,000 on 24 The Chimes flagged, not recalculated
- CompanyAccount.agencyShare vs GL 4001 documented as intentional difference

### Audit logs already present

- `AccountingEventLog` — journal post + integration failures
- `PaymentAuditLog` — create/edit/post/reverse/delete/void
- `TrustAuditLog` — trust actions

---

## 2. Existing weaknesses

1. **No `AccountingPeriod` entity.** No OPEN / SOFT_CLOSED / CLOSED workflow, no reopen-with-reason, no GL-wide period gate. Env date lock and VAT return lock only.
2. **`accountingService.postTransaction` does not enforce period lock.** Manual journals, trust-tax journals, and ZIMRA remittance journals can post into a locked VAT period.
3. **`JournalLine` has no immutability hooks.** Lines can theoretically be updated/deleted even though entries cannot.
4. **Journal `findOneAndUpdate` is not blocked** on `JournalEntry` (only save and deletes).
5. **Manual journal `sourceId` includes `Date.now()`** — retries duplicate.
6. **ZIMRA payment `sourceId` / `reference` use timestamp + random** — retries duplicate.
7. **`LedgerEvent` enqueue has no unique DB index** — concurrent enqueue possible (downstream unique indexes usually absorb this).
8. **No duplicate-receipt detector** for same company/property/payer/amount/date/reference besides unique keys and advance-period overlap.
9. **No payment allocation status** (`FULLY_ALLOCATED` / `PARTIALLY_ALLOCATED` / `UNALLOCATED` / `OVERPAYMENT`). `Payment` has no `unallocatedAmount`.
10. **Mongo `PaymentAllocation` collection is unused.** Canonical split is the function `allocateRentalReceipt`. Owner income projection still prefers `commissionDetails.ownerAmount`.
11. **No trial-balance service or UI.** Closest: balance sheet / ledger / bank recon.
12. **No Financial Controls dashboard.** Accountant has Accounting Integrity (payment projections) and Tax Compliance, not a control-close surface.
13. **`AccountingException` kinds are too narrow** (`incomplete_projection`, `orphan_accounting`) for period, trial balance, duplicates, negatives, trust mismatches.
14. **Trust posting is event-parallel**, not inside the orchestrator (`trustEventListener` → `trustPaymentPostingService`).
15. **VatRecord and original TaxObligation are mutated on reversal** (not append-only).
16. **`Payment.status: refunded` is unused.** Refunds are not a first-class financial event; correction is reverse + draft.
17. **No negative-balance review** framework.
18. **No month-end close checklist.**
19. **Reports page party statements aggregate Payment[] independently** of enterprise owner statements (ledger + `paymentAllocation` snapshot) — possible display divergence.
20. **Explicit backfill/repair APIs still exist** (admin confirm + reason): property-account sync, development ledger ensure, balance backfill, payment accounting repair.
21. **FX:** SAME_CURRENCY = 1; otherwise FX_REVIEW_REQUIRED. Live FX not implemented.
22. **Change-stream payment delete** cancels one PropertyAccount tx and does not reverse journals/agent/company/VAT/tax.

---

## 3. Existing canonical paths

| Concern | Canonical path |
| --- | --- |
| Payment posting | `postPaymentAccounting` |
| Payment reversal | `reversePayment` (controller) → `reversePaymentAccounting` → new reversal journals |
| Rental split | `allocateRentalReceipt` |
| GL | `accountingService.postTransaction` |
| Trust GL recon | `buildTrustReconciliationReport` (PARTIAL) |
| Tax working paper | `TaxObligation` → `VatReturn` → GL 2101 |
| Tax remittance | `recordZimraPayment` with allocated + unallocated = amount |
| Company vs client money | Dr 1003; Cr 4001/4002 commission; Cr 2101 VAT; Cr 2103/2104 residual; Cr 2107 levy |
| Integrity | detection-only services + `AccountingException` / `TaxReviewItem` |

Do **not** add a second posting pipeline.

---

## 4. Legacy paths still present

| Path | Status | Phase 9 treatment |
| --- | --- | --- |
| `backfillFromExistingData` | Explicit migration | Leave; do not auto-run |
| `ensureDevelopmentLedgersAndBackfillPayments` | Explicit admin | Leave gated |
| `POST /property-accounts/sync` | Explicit admin backfill | Leave gated |
| `POST /accounting/migrations/backfill-balances` | system_admin + confirm | Leave gated |
| `POST /accountants/payments/:id/accounting/repair` | Explicit repair | Leave gated; never silent |
| Mongo `PaymentAllocation` model | Dead | Do not resurrect as a second formula |
| `trustMatterService.buildPaymentAllocation` | Display | Keep display-only |
| `Payment.status: refunded` | Unused enum | Do not silently map onto original amount |
| `server/src/app.ts` | Not production entry | Out of Phase 9 scope |
| Reports-page Payment aggregation | Independent of GL | Detection/report; do not rewrite history |

---

## 5. Proposed Phase 9 controls

All detection unless noted. No historical amount rewrite. No automatic period reopen. No fake FULL trust recon.

### 5.1 Accounting periods

New `AccountingPeriod` (company-scoped): OPEN / SOFT_CLOSED / CLOSED, close/reopen reason, actor, timestamps.

- OPEN: normal posting
- SOFT_CLOSED: posting requires accountant override + reason + audit
- CLOSED: reject posting; corrections via reversal + new posting
- Reopen: accountant/admin, reason, audit before/after — never automatic

Gate **`accountingService.postTransaction`** and payment create/complete (not only the env date).

### 5.2 Posted journal immutability

Block `findOneAndUpdate` / `updateOne` / `updateMany` on `JournalEntry` and `JournalLine`. Preserve reversal-as-new-entry. Do not mutate original journals.

### 5.3 Idempotency

Keep existing payment `sourceId`. For **new** manual journals and ZIMRA remittances, require a caller-supplied or deterministic `sourceId` (no `Date.now()`). Do not rewrite historical sourceIds.

### 5.4 Duplicate payment review

Detection for same company + property + amount + currency + date (+ optional reference/payer). Create `DUPLICATE_REVIEW_REQUIRED` exception. Accountant: confirm duplicate / mark legitimate / link / reason. Never merge or delete.

### 5.5 Allocation / overpayment

Derived control statuses from existing amounts + canonical allocation (do not invent a second formula):

`FULLY_ALLOCATED` | `PARTIALLY_ALLOCATED` | `UNALLOCATED` | `OVERPAYMENT` | `REQUIRES_REVIEW`

Invariant: unallocated ≥ 0 unless a controlled refund/adjustment exists. Do not auto-apply overpayment as future rent.

### 5.6 Negative balances

Detection-only `NEGATIVE_BALANCE_REVIEW` for GL 1003, 2103–2107, 2101, 4001, company/property/agent accounts. Classify permitted / temporary / unexplained. Never auto-correct.

### 5.7 Trust

Preserve PARTIAL. Add explicit category flags: `IN_SCOPE` | `OUT_OF_SCOPE` | `NOT_IMPLEMENTED` | `REQUIRES_REVIEW`. Never label FULL or RECONCILED. Detection types: `TRUST_BANK_LIABILITY_MISMATCH`, owner/seller/tax/deposit/levy mismatches, `UNALLOCATED_TRUST_FUNDS`.

### 5.8 Trial balance

Read-only: total debits, credits, difference, account/journal counts, date range, currency. `BALANCED` | `UNBALANCED` | `REQUIRES_REVIEW`. Never hide imbalance. Never auto-fix.

### 5.9 Account / posting integrity

Detection: orphan journals/lines, missing payment posting, posting without source, duplicate posting, orphan allocation/trust tx. Prefer extending integrity runner; persist as control exceptions.

### 5.10 Owner / property / GL

Compare Payment → `PaymentAllocation` snapshot → PropertyAccount → owner payable → GL 2103/2107/4001/1003 using **existing** `allocateRentalReceipt`. Report differences. Do not create another formula.

### 5.11 Company revenue

Detection report: gross collections vs commission revenue vs agencyShare vs owner/seller/trust. Keep CompanyAccount vs GL 4001 as a controlled documented difference.

### 5.12 Tax

Do not redesign Phase 8. Integrity runner must still see tax reviews, receipt ≠ PAID, VAT NOT ACTIVE, legacy CGT $38,000 unchanged.

### 5.13 Audit trail

Append-only financial audit events for: period close/reopen, override, duplicate review, exception resolve/waive, manual journal, ZIMRA payment, reversal, control integrity run. Fields: actor, role, action, entityType, entityId, timestamp, reason, before, after, source, requestId. No secrets.

Extend `AccountingEventLog` rather than a parallel secret-bearing log.

### 5.14 Approvals

Do **not** wrap ordinary orchestrated payment posting.

Require accountant (+ reason) for: period close, period reopen, manual journal, explicit payment accounting repair (already), tax override (already), exception waive.

Refunds: do not reduce original payment amount. Direct refunds greater than available / without source → block + exception. Prefer existing reverse workflow until a dedicated refund event exists.

### 5.15 Month-end checklist + dashboard

Accountant Financial Controls page. Checklist items PASS only when underlying condition passes. Overall: `PASS` | `PASS WITH REVIEW ITEMS` | `REQUIRES ATTENTION` | `BLOCKED`. No scores.

### 5.16 Exceptions

New `FinancialControlException` (do not overload payment-projection `AccountingException` kinds). Statuses OPEN / UNDER_REVIEW / EXPLAINED / RESOLVED / WAIVED. Never delete. Dashboard aggregates this + open `AccountingException` + open `TaxReviewItem`.

### 5.17 FX

Unchanged: SAME_CURRENCY rate 1; otherwise FX_REVIEW_REQUIRED. No live FX.

### 5.18 Security

New endpoints: `auth` + `canViewCommissions` (read) / `isAccountant` (write). Unauthenticated 401. Agent/owner 403. Do not broaden roles.

---

## 6. Files / services affected

### New (proposed)

| File | Role |
| --- | --- |
| `server/src/models/AccountingPeriod.ts` | Periods |
| `server/src/models/FinancialControlException.ts` | Control exceptions |
| `server/src/services/accountingPeriodService.ts` | Open/close/reopen + posting gate |
| `server/src/services/trialBalanceService.ts` | Debits = credits |
| `server/src/services/financialControlsService.ts` | Dashboard, checklist, integrity run |
| `server/src/services/duplicatePaymentReviewService.ts` | Duplicate detection |
| `server/src/services/negativeBalanceReviewService.ts` | Negative GL/subledger detection |
| `server/src/services/ownerPropertyReconService.ts` | PaymentAllocation vs property vs GL |
| `server/src/controllers/financialControlsController.ts` | HTTP |
| `server/src/scripts/runPhase9FinancialControlsTests.ts` | Tests |
| `client/src/pages/AccountantDashboard/FinancialControlsPage.tsx` | UI |
| `PHASE9_FINANCIAL_CONTROLS.md` | Implementation doc |

### Existing to extend (not replace)

| File | Change |
| --- | --- |
| `accountingService.ts` | Period gate; audit; journal immutability callers |
| `models/JournalEntry.ts` / `JournalLine.ts` | Block updates |
| `zimraPaymentService.ts` | Deterministic sourceId for **new** posts |
| `accountingController.ts` | Manual journal sourceId; trial balance if not separate |
| `accountingRoutes.ts` | New control routes |
| `tax/trustReconciliation.ts` | Category flags IN_SCOPE / OUT_OF_SCOPE / NOT_IMPLEMENTED |
| `taxIntegrityService.ts` / `paymentAccountingIntegrity.ts` | Call into control integrity (detection only) |
| `AccountantSidebar.tsx` / `App.tsx` | Financial Controls nav |
| `accountingService.ts` (client) | API client |
| `config/collections.ts` | New collection names |
| `LEGACY_CODE_AUDIT.md` | Note JournalLine update gap closed; dead PaymentAllocation remains |

**Do not modify:** Phase 7 orchestrator design, historical journals, 24 The Chimes, live tax configuration, trust PARTIAL semantics.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Unique indexes on historical duplicates | Do not add uniqueness that historical data violates; detect and review |
| Period close blocking live posting unexpectedly | Default: no CLOSED period until accountant creates/closes one |
| Trial balance of incomplete ChartOfAccount.balance snapshots vs journals | Trial balance from JournalLine, not mutated account.balance |
| Trust zero difference misread as full recon | Keep PARTIAL / BALANCED WITHIN SCOPE labels |
| Integrity run creating exceptions on known historical gaps | Detection only; do not repair; do not invent tax obligations |
| JWT ephemeral secret on this machine | Fresh accountant login after API restart |
| Client production build vs CRA HMR | Verify running API PID vs dist timestamp |
| Concurrent posting races | Rely on unique indexes + Mongo atomic guards; document remaining windows |
| Repair/backfill APIs | Remain explicit, confirmed, audited — not automatic |

---

## 8. Tests required

All tests use isolated fixtures / source assertions. **Do not mutate 24 The Chimes, historical CGT $38,000, or live owner/trust balances.**

- Payment posts once; retry / double submit → one journal (`sourceId` unique)
- Posted journal cannot be edited or deleted; reversal is a new journal
- OPEN accepts posting; SOFT_CLOSED requires override; CLOSED rejects; reopen needs permission + reason + audit
- Duplicate payment → review exception, no auto-merge
- Full / partial / overpayment / unallocated statuses; unallocated ≥ 0
- Trust PARTIAL; never FULL/RECONCILED; imbalance → RECONCILIATION_EXCEPTION
- Trial balance balanced vs unbalanced detection
- Gross rent ≠ company revenue; levy 2107; VAT 2101; owner 2103
- Canonical rent+levy $1,000 / $50 / $150 / $23.25 / $826.75
- Tax: receipt ≠ PAID; legacy CGT unchanged (source + live read)
- Refund must not reduce original payment amount
- Audit event immutable; no secrets
- 401 unauthenticated; 403 unauthorized; accountant 200
- Phase 7, 8, 8.1, 8.2, 8.3 must still PASS

---

## 9. Out of scope (do not implement)

FDMS, ZIMRA electronic filing, PAYE, corporate tax, live FX, expanding trust recon to buyer/maintenance/unallocated/per-owner/off-book as if implemented, new tax types, Phase 7 redesign, automatic historical migration/repair, AI financial decisions.

---

## 10. Audit conclusion

Phase 7–8.3 already provide a canonical orchestrator, posted-journal immutability (entries), payment financial immutability, payment-journal idempotency, detection-only integrity, PARTIAL trust recon, and tax controls.

Phase 9 should **add a control layer**: periods, trial balance, duplicate/negative/unallocated reviews, stronger line-level journal immutability, financial-control exceptions, month-end checklist, audit coverage for close/reopen/overrides, and an accountant Financial Controls surface — **without** rewriting history or replacing the orchestrator.

**Proposed implementation status after this audit:** proceed in controlled sub-phases.

**Expected sign-off band:** `PASS WITH DOCUMENTED RISKS` remains likely because PARTIAL trust, no FDMS, no live FX, external ZIMRA/PAYE/corporate tax, and historical review items stay.
