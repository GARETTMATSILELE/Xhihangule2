# PHASE 5B — LOGIC REMEDIATION REPORT

**Date:** 2026-08-31  
**Scope:** Application accounting engine only. No MongoDB documents, indexes, migrations, backfills, or historical repairs.

**Evidence:** `audit-output/phase-5a/PHASE_5A_DATABASE_INTEGRITY_REPORT.md`

---

## Accounting flow (inspected)

Payment create/complete (lease, accountant, sales, agent, paymentService)
→ `postPaymentAccounting`
→ PropertyAccount income / pass-through / configured expense
→ AgentAccount commission lanes
→ CompanyAccount commission (SSOT for agency revenue)
→ JournalEntry (gross collections, accounts 4001/4002)
→ `payment.confirmed` → TrustTransaction (sales only)

Payment reverse (controller after Payment status flip, change stream, LedgerEvent retry)
→ `reversePaymentAccounting`
→ cancel PropertyAccount income + configured_expense + pass-through reversal
→ AgentAccount penalty per role
→ journal reversal + CompanyAccount archive
→ `payment.reversed` → Trust debit (`reference=reversal:{originalPaymentId}`)

GET paths no longer post, reverse, backfill, or persist recalculated balances.

---

## Authoritative sources of truth (future writes)

| Concept | Source of truth | Notes |
|---|---|---|
| Owner income | `PropertyAccount.transactions` (completed income, not PASS_THROUGH) | Dual sale unit+dev ledgers remain intentional |
| Agency commission revenue | `CompanyAccount.transactions` (active, non-archived income) | `Company.revenue` is a stale denormalized cache; payment paths no longer `$inc` it |
| Agent commission | `AgentAccount.transactions` (role-qualified reference) | `User.commission` remains a separate denormalized field |
| Owner balance | PropertyAccount running balance | `User.balance` is **not** an owner ledger; payment paths no longer `$inc` it from `Property.ownerId` |
| Journal 4001/4002 | Gross collections journal | Intentionally ≠ `Payment.agencyShare`. Do not force equality |
| Trust | `TrustTransaction` | Original credit immutable; reversal is a separate debit |

---

## Same-agent split business rule (enforced)

A person **may** occupy both development-owner-agent and collaborator roles.

When `ownerUserId === collaboratorUserId`:

- Post **both** role lanes onto the same AgentAccount
- Identities: `{paymentId}-owner` and `{paymentId}-collaborator`
- Do **not** also post undifferentiated `agentShare`
- Totals = ownerAgentShare + collaboratorAgentShare

This matches the 12 historical rows (same agent `68d2804b21344cbef4e24aed`). Those rows are left untouched.

---

## Findings investigated → code change

| Finding | Root Cause | Code Change | Test | Historical Repair Required |
|---|---|---|---|---|
| Reversal leftovers (sale `69ba734618ae7e900167c1f5` and peers) | PropertyAccount immutability hook blocked `$set transactions.$[t].status`; controller `Promise.allSettled` then treated ledger failure as non-fatal; payment already `reversed` | Allow status cancel; `reversePaymentAccounting` covers all ledgers; enqueue `payment_reversal` on partial failure; change stream uses orchestrator | YES — immutability allow-list + reversal outcome + penalty retry | YES |
| Provisional agent commission | `recordIncomeFromPayment` / journal / company / trust lacked a single provisional rule; GET/backfill could post after create | `evaluatePermanentAccountingPolicy` on every writer | YES — provisional completed payment | YES |
| Agent duplicate / same-agent split | `addCommission` deduped by paymentId only (dropped second role); unique paymentId index would block two lanes | Role identity `paymentId-role`; lookup-only paymentId index in schema | YES — same agent both roles | YES (indexes in 5C; 12 rows stay) |
| Missing agent commissions | GET-driven backfill + non-idempotent write; introduction omitted from change stream | Orchestrator on create; introduction in change stream/sync filters | YES — lanes + policy | YES |
| Levy 19 missing collections | Errors swallowed; `$set` entire `passThroughAccounts`; GET after write | Atomic nested `$push`; enqueue `levy_collection` / `levy_payout` | YES — concurrent keys | YES |
| Balance overwrite USD 5,100 | `recalculateBalance` `$set` entire `passThroughAccounts` from stale snapshot | Scalar-only `$set` + `ledgerRevision` optimistic check | YES — cancelled excluded; recalc payload has no array | YES |
| Concurrent pass-through loss | In-memory merge then replace array | `pushPassThroughTransactionAtomic` | YES — two keys survive | NO (no lost rent+levy keys in 5A) |
| 27 pending LedgerEvents | In-memory lock; non-atomic claim; crash stranded `processing` | Atomic `findOneAndUpdate` claim; stale reclaim; **generation 2 only** so 5A pending events are not processed | YES — generation skip + stale reclaim | YES (5C may process/repair) |
| GET mutates accounting | `getPropertyAccount` backfill/recalc/reconcile; `getAgentAccount` `syncCommissionTransactions` | GET is read-only (in-memory totals only) | Covered by architecture; GET no longer calls writers | NO |
| Company.revenue ≠ CompanyAccount | Independent `$inc Company.revenue` on payment create | Stop writing `Company.revenue` from payment paths; CompanyAccount is SSOT | Policy/docs | YES (do not change stored revenue in 5B) |
| User.balance USD 32,665 | `$inc User.balance` via `Property.ownerId` (agent User) | Stop owner-income `$inc` on User | Policy/docs | YES (do not zero balances in 5B) |
| Introduction missing PropertyAccount income | Change stream/syncAllPayments omitted `introduction`; type mismatch throw vs sale property; catch-and-continue | Include introduction; skip type throw for introduction; orchestrator + events | YES — introduction allowed | YES |
| Trust missing reversal | Event emit failure; non-stable reversal reference; unique paymentId | Stable `reversal:{originalPaymentId}`; duplicate-by-reference; provisional skip | YES — reversal retry identity | YES |
| Journal 115 missing | Journal is gross collections; failures logged then swallowed | `syncPaymentReceived` rethrows after `AccountingEventLog`; orchestrator records failure | Semantic docs; failure observable | YES (do not backfill journals) |
| Unique `transactions.paymentId` vs expense | Schema unique on paymentId | Schema unique removed (lookup index only); configured_expense omits paymentId, uses idempotencyKey | Documented | YES (drop live unique in 5C) |

---

## Files / functions changed (primary)

- `server/src/services/accountingPostingPolicy.ts` (new)
- `server/src/services/commissionProjection.ts` (new)
- `server/src/services/propertyAccountTotals.ts` (new)
- `server/src/services/ledgerMutationPolicy.ts` (new)
- `server/src/services/ledgerEventStateMachine.ts` (new)
- `server/src/services/paymentAccountingOrchestrator.ts` (new) — `postPaymentAccounting`, `reversePaymentAccounting`
- `server/src/services/ledgerEventService.ts` — atomic claim, generation 2, extra event types
- `server/src/models/LedgerEvent.ts`, `PropertyAccount.ts`, `AgentAccount.ts`
- `server/src/services/propertyAccountService.ts` — posting, reversal, pass-through, recalc, GET
- `server/src/services/agentAccountService.ts` — lanes, atomic commission, GET no backfill
- `server/src/services/accountingIntegrationService.ts` — `postCompanyCommission`, journal guards, rethrow
- `server/src/controllers/paymentController.ts`, `agentController.ts`, `levyPaymentController.ts`
- `server/src/services/paymentService.ts`, `databaseSyncService.ts`, `trustAccountService.ts`, `trustPaymentPostingService.ts`

---

## Tests added

`server/src/scripts/runPhase5bAccountingTests.ts`  
Run: `npm run test:phase5b` (isolated; no live database).

Also run `npm run test:phase2a` (reconciliation filter now excludes provisional).

---

## Remaining risks

- Live unique index `{propertyId, ledgerType, transactions.paymentId}` still exists in Mongo; income+expense same paymentId cannot land until 5C drops it. New expenses omit `paymentId`.
- AgentAccount still has only `_id` in the scanned DB; application-level identity is the guard until 5C creates indexes.
- GET `getPropertyAccount` returns 404 if no ledger exists yet (first payment creates it). Empty-property accountant pages may show not-found until a post.
- `User.commission` is still incremented on some paymentService paths (not owner `User.balance`).
- Scheduled reconciliation can still post **new** missing income for **future** payments; it will not run against the 27 generation-less LedgerEvents.

---

## Intentionally deferred (Phase 5C)

See `HISTORICAL_REPAIR_QUEUE.md`. Index creation: `REQUIRED_INDEX_PLAN.md`.

### FIXED IN CODE vs HISTORICAL DATA STILL REQUIRES REPAIR

All rows in the table above that say Historical Repair **YES** are **FIXED IN CODE** for future writes and **NOT repaired** in the database.
