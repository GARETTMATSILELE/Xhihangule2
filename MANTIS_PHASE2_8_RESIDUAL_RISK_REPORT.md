# MANTIS Phase 2.8 — Residual Financial Risk Report

## Executive Summary

Phase 2.7 left three residual risks. None of them reopened a Phase 2.6 corruption path, and none required a new accounting or tax engine.

1. `reconcilePropertyLedgerDuplicates` could cancel income rows that merely shared a payment id, including rows that were not identical.
2. Tax reversal already copied the posted amount into a counter-obligation, but a retry could insert a second counter, and a tax failure was trapped inside the journal step so a reversal could be treated as complete without the counter.
3. A crash after the reversal lock, and before the reversal payment existed, returned "already in progress" for 60 seconds because the lock age was taken from `updatedAt`.

Phase 2.8 contained all three. Automatic duplicate cancellation is disabled. Manual cancellation is limited to classifier-proven identical copies. Tax reversal is idempotent, uses the stored obligation, and blocks `reversed` until the counter exists. A stale lock can be reclaimed only when no reversal payment exists and the lock is older than 60 seconds. The reclaim was proven not to create a second reversal.

Historical financial records were not rewritten. Disposable Phase 2.8 companies, payments, ledgers, tax rows, and webhook receipts were removed after the run.

## Risk 1 — Duplicate Cleanup

### Original behaviour

`reconcilePropertyLedgerDuplicates` grouped ledger lines by payment id and cancelled every line except the earliest, even when amounts differed. It was not called by payment posting, reversal, the scheduled maintenance job, startup, or the integrity read. It was reachable from two confirmed maintenance endpoints: reconcile-duplicates, and merge-duplicates (which called it after merging accounts).

### Callers

| Caller | Automatic? | Financial write? | Can cancel income? | Current status |
| --- | ---: | ---: | ---: | --- |
| Payment posting | No | No | No | Does not call it |
| Reversal | No | No | No | Does not call it |
| Scheduled maintenance | No | No | No | Does not call it |
| Startup | No | No | No | Does not call it |
| Integrity / detection job | No | No | No | Does not call it |
| GET property account | No | No | No | Does not call it |
| Admin/accountant reconcile endpoint | No | Yes, only after confirm, reason, and audit | Only identical copies | Manual |
| Merge endpoint | No | Archives classifier-approved duplicate account documents | No | Manual; no longer calls income cleanup |

### Implementation decision

```text
AUTOMATIC CLEANUP: DISABLED
MANUAL CLEANUP: ENABLED ONLY FOR CLASSIFIER-APPROVED CASES
DETECTION: ENABLED
```

`classifyLedgerTransactionDuplicates` classifies completed income rows before any write:

- `SAFE_IDENTICAL` — same payment, same ledger, same amount, same category. Later copies may be cancelled.
- `REQUIRES_REVIEW` — same payment, but amount or category differs. Nothing is cancelled.
- `NOT_A_DUPLICATE_FOR_AUTOMATIC_CLEANUP` — the same payment appears on more than one ledger. Nothing is cancelled.
- `NOT_DUPLICATE` — a single income row, or an income row beside a reversal line. Nothing is cancelled.

The confirmed reconcile endpoint still calls `reconcilePropertyLedgerDuplicates(propertyId)`. The function now returns the classification and cancels rows only when the plan is `SAFE_IDENTICAL`. Ambiguous, cross-ledger, and reversal groups return `removed: 0` and `mutated: false`. The merge endpoint no longer calls income cleanup. Account merge remains the existing classifier for duplicate account documents (`SAFE_DUPLICATE` only: no financial history, or one account with history and the rest empty). It archives the spare account document. It does not cancel income lines.

The function inspects the account returned for the property's current ledger. It does not load the other ledger, so a rental line is not cancelled while the current ledger is sale, and the reverse. Cross-ledger pairs are refused when they are classified together.

### Tests

- P28-001: reversal, scheduled maintenance, and startup do not call the cleanup. The function refuses to mutate unless the classification is `SAFE_IDENTICAL`.
- P28-002: identical copies classify as safe. The confirmed endpoint cancelled one disposable copy and left one completed income row. An audit record is written by the existing migration-audit wrapper (confirm and reason required).
- P28-003: a different amount classified as `REQUIRES_REVIEW`. The different row stayed `completed`.
- P28-003b: the same payment on rental and sale classified as `NOT_A_DUPLICATE_FOR_AUTOMATIC_CLEANUP`.
- P28-004: original income plus a reversal expense classified as `NOT_DUPLICATE`. Reconciling the reversed disposable property removed nothing, and the original income stayed completed.

### Final status

PASS. No automatic process can cancel income. Reversal does not call this path.

## Risk 2 — Tax Reversal

### Original behaviour

`reversePaymentTaxObligations` created a counter-obligation with the original tax amount and marked the original `REVERSED`. It did not set `taxAmount` to 0. The counter amount is stored positive because `TaxObligation.taxAmount` cannot be negative. The call sat inside the journal step, and a retry did not look for an existing `reversalOf` link before inserting another counter.

### What changed

The original obligation id, amount, rate, period, and type stay on the original document. The counter copies that stored amount and rate. It does not call the tax calculator. A second call finds the existing `reversalOf` row and does not insert another. `PHASE28_FAIL_TAX` is a development-only one-shot seam. Tax now runs as its own reversal step. If it throws, reversal status is partial and `reversalState` stays `reversal_incomplete`. `syncPaymentReversed` still calls the same function after the journal, so the ledger-event retry path remains idempotent.

Operational tax reconciliation excludes `REVERSED` rows, so a finished pair does not remain as outstanding. The obligation list returns both the original and the counter. An incomplete reversal leaves the original payable and creates no counter, so the outstanding amount stays visible.

### Tests

Disposable rental, company VAT registration, and a 15.5% VAT rate produced one VAT-on-commission obligation of 15.50 at rate 0.155.

- P28-005: after reversal, one counter exists for 15.50, linked by `reversalOf`.
- P28-006: the original amount, period, and type were unchanged.
- P28-007: a new 5% rate was added after the payment was posted. The reversal still used 15.50 and rate 0.155.
- P28-008: the seam left `reversal_incomplete`, the original payment completed at 1000, and zero counters. The retry created one counter and reached `reversed`. A further retry left that one counter.
- P28-012: the completed reversal had the owner counter, the company counter, the reversal journal, and the tax counter together.
- The obligation list returned both the original and the counter.

Tax reversal did not delete the payment, the owner income, the company commission, the journal, or the trust row, and it did not call duplicate cleanup.

### Final status

PASS. The original obligation remains auditable. The counter matches the stored amount. Current tax settings do not recalculate it. Retry does not duplicate it. An incomplete tax reversal is not reported as reversed.

## Risk 3 — Reversal Lock

### Original behaviour

The lock set `reversalState` to `reversal_in_progress`. Age was `updatedAt`. Any later write refreshed that timestamp. A crash before the reversal payment existed returned 409 until the timestamp was 60 seconds old.

### Recovery design

`reversalLockAt` and `reversalLockBy` are optional fields. Historical payments are not backfilled. The lock sets both. A lock is stale only when `reversalPaymentId` is absent, the state is `reversal_in_progress`, and `reversalLockAt` is older than 60 seconds. If an older in-progress row has no `reversalLockAt`, age falls back to `updatedAt`, still at 60 seconds. The takeover writes a new `reversalLockAt` in the same atomic update, so a second waiter cannot pass the age filter. The threshold was not shortened.

If a reversal payment already exists and the original link is missing, the request links that payment and does not create another. `reversalState = reversed` returns the existing reversal and does not acquire the lock. A completed reversal cannot move back to in progress, and the unique partial index `one_full_reversal_per_payment` still rejects a second negative reversal for the same original. The index was already present. It was not rebuilt and no payment documents were rewritten to satisfy it. Its partial filter is `reversalOfPaymentId` exists and `amount < 0`, so ordinary payments are outside it.

`reversed` is set only when required artifacts are reversed or explicitly skipped. A failed tax step forces partial even if the other artifacts succeeded.

### Tests

- P28-009: the seam threw after the lock and before the reversal payment (HTTP 500, state in progress, zero reversal documents). After `reversalLockAt` was set two minutes in the past on that disposable payment, the retry created exactly one reversal.
- P28-010: the reversal payment existed, `reversalPaymentId` was cleared, and the state was set back to in progress. The retry linked the same reversal. One negative reversal document remained.
- P28-011: ten concurrent reversals produced one reversal payment, one company counter, and one owner counter. Responses were 200 or 409 only.
- P27-double: a second reversal of an already reversed payment returned the same reversal. One document.
- P27-sale: sale reversal stayed SALE, original status stayed completed, company counter was negative, and the trust receipt credit remained beside one reversal debit.
- P27-intro: introduction reversal stayed RENTAL, produced an owner counter, and created no trust row.
- P27-amount: after the property commission was changed to 40%, the company counter was -38.80 against the posted +38.80.

### Final status

PASS. Stale locks recover after 60 seconds without a duplicate reversal. A linked reversal payment is reused. `reversed` includes the tax counter when a tax obligation exists.

## Reporting

Owner statement for the fully reversed disposable rental returned both the original credit and the reversal debit. Reported net matched rental income plus other income minus deductions, and that net was 0. Incomplete tax reversal stayed `reversal_incomplete` with no counter, so it was not presented as a finished reversal. The obligation list shows the original and the counter after completion. No report redesign was made.

## Regression Results

| Suite | Result |
| --- | --- |
| `runPhase2FinancialHardeningTests` | PASS |
| `runPhase2bCompletenessTests` | PASS |
| `runPhase2cAccountingIntegrityTests` | PASS |
| `runPhase2dWritePathLockdownTests` | PASS |
| Phase 3D legacy cleanup (call-site guard) | PASS |
| Phase 2.1 startup lockdown | PASS |
| Phase 5B accounting (scheduled recon does not cancel duplicates) | PASS |
| REAL-CORRUPTION-001 through 017 | PASS, 17/17 |
| Phase 2.7 reversal checks in the same disposable run | PASS |
| P28-001 through P28-012 | PASS |
| Server `tsc` | PASS |
| Client production build | PASS (exit 0; existing compile warnings only) |

REAL-CORRUPTION-010 now expects the Phase 2.7 counter-posting result: original company commission remains, a negative counter is added, and the original line is not archived. That passed, with posted 38.80 and counter -38.80.

## Source audit

| Pattern | Classification |
| --- | --- |
| Cancel identical income in `reconcilePropertyLedgerDuplicates` | MANUAL ONLY |
| Cancel ambiguous, cross-ledger, or reversal income | Not permitted; classification returns no ids |
| Scheduled, startup, posting, and reversal duplicate cleanup | DETECTION ONLY / not invoked |
| Archive of classifier-approved empty duplicate account documents | MANUAL ONLY |
| `deletePayment` | SAFE; posted, reversed, voided, and completed payments return 409 |
| Journal and trust deletion on reversal | Not used; counter-entries are appended |
| Tax obligation deletion or `taxAmount = 0` | Not used |
| Tax counter amount | SAFE; copied from the stored obligation |
| Historical commission or VAT recalculation during reversal | Not used; counters use posted lines and the stored tax amount |
| `Property.rentalType` during reversal | SAFE; domain comes from the stored transaction domain |
| Second full reversal | Blocked by the lock, the existing-link recovery, and `one_full_reversal_per_payment` |
| Automatic historical repair or replay | Not enabled; sync returns `historicalBackfill: false` |

No path was classified DANGEROUS.

## Historical Data

Disposable Phase 2.8 companies, users, payments, property ledgers, company ledger rows, journals, trust rows, tax obligations, webhook receipts, and orphaned VAT rates created for those deleted companies were removed.

```text
Historical financial data modified: NO
```

The reversal index was inspected, not rebuilt. No historical payment, journal, trust row, commission, VAT record, or tax obligation was updated.

## Residual Risks

None that can leave the wrong ledger, a duplicate reversal, deleted history, an incorrect reversal amount, a hidden incomplete reversal, an active company commission after a completed reversal, or an incorrect tax counter.

The 60-second stale-lock threshold remains. A retry during that window returns 409. That delay is the protection against reclaiming a lock that may still belong to a live process.

The tax counter is stored as a positive amount with `reversalOf` and status `REVERSED`, because the tax schema rejects a negative amount. The original amount is unchanged. Net outstanding for the pair is zero. The audit list shows both rows.

## Phase 3 Gate

```text
PASS
```

Phase 3 is permitted. It was not started.
