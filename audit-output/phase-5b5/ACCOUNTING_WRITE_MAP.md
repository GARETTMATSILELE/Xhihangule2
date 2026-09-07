# ACCOUNTING WRITE MAP

Definitive map of **payment-derived and ledger** Mongo writes in `server/src` as of Phase 5B.5.

This is a code map. It does **not** mean these writes were executed against the live local database during verification.

Legend:

- **Trigger GET?** ordinary HTTP GET
- **Retry-safe?** second call does not duplicate (idempotent key / policy skip / already-applied)
- **Orchestrator?** goes through `postPaymentAccounting` / `reversePaymentAccounting`, or a policy-gated writer those functions also call

---

## 1. Central orchestrator

| Source | Purpose | Trigger | Idempotent? | GET? | Retry? |
|---|---|---|---|---|---|
| `paymentAccountingOrchestrator.postPaymentAccounting` | Fan-out owner income, agent commission, company commission, journal | Payment create/complete (HTTP), webhook complete, change stream, poll | Yes — each writer is idempotent; policy skip | No | Partial failure enqueues LedgerEvents |
| `paymentAccountingOrchestrator.reversePaymentAccounting` | Cancel property rows, agent penalties, journal/company reverse | Reverse HTTP, status→failed, change stream `reversed`, LedgerEvent `payment_reversal` | Yes — cancel/penalty identities | No | Partial → enqueue `payment_reversal` |

Trust credit/debit is **not** inside the orchestrator. Sales trust is `payment.confirmed` / `payment.reversed` → `trustPaymentPostingService` with identity `reversal:{paymentId}`.

---

## 2. HTTP payment create / complete / reverse

| Source | Purpose | Trigger | Idempotent? | GET? | Orchestrator? |
|---|---|---|---|---|---|
| `paymentController.createPayment` | Lease/rental payment | POST | Writer-level | No | **Yes** |
| `paymentController.createPaymentAccountant` | Accountant payment | POST | Writer-level | No | **Yes** |
| `paymentController` sales create | Sale payment | POST | Writer-level | No | **Yes** |
| `paymentController` update/status/finalize | Complete or un-provisional | PUT/PATCH | Writer-level | No | **Yes** |
| `paymentController.createPaymentPublic` | Public payment | POST | Writer-level | No | **Yes** |
| `paymentController` reverse | Flip payment + reverse ledgers | POST | Writer-level | No | **Yes** (`reversePaymentAccounting`) + `payment.reversed` event |
| `agentController.createPayment` | Agent-created payment | POST | Writer-level | No | **Yes** |
| `paymentService.createPayment` | Alternate create | POST | Writer-level | No | **Yes** |
| `paymentService` status→failed | Reverse accounting | PUT | Writer-level | No | **Yes** reverse |
| `paymentWebhookController` | External confirmation | POST webhook | Writer-level | No | **Yes** (5B.5 wired) + `payment.confirmed` for trust |

---

## 3. Policy-gated ledger writers (called by orchestrator and retries)

| Source | Collection / field | Purpose | Trigger | Idempotent? | GET? |
|---|---|---|---|---|---|
| `propertyAccountService.recordIncomeFromPayment` | `accounting.propertyaccounts.transactions` `$push` | Owner income (+ dual sale unit/dev) | Orchestrator, LedgerEvent `owner_income`, scheduled recon, `syncAllPayments` | `evaluatePermanentAccountingPolicy` + completeness + idempotencyKey | No |
| `propertyAccountService.reverseIncomeFromPayment` | `transactions.$[t].status=cancelled` | Cancel income/expense/pass-through | Orchestrator reverse | Status already cancelled → no-op | No |
| `propertyAccountService.recordPassThroughCollection` / `Payment` | nested `$push` `passThroughAccounts.$.transactions` | Levy / pass-through | Levy POST, payment income path, LedgerEvent levy_* | `idempotencyKey` e.g. `levy-payment:{id}:collection` | No |
| `propertyAccountService.recalculateBalance` | scalar `$set` + `$inc ledgerRevision` | Totals only | After ledger writes | Skips if scalars unchanged; stale revision skipped | No |
| `agentAccountService.syncCommissionForPayment` | `agentaccounts.transactions` `$push` | Role lanes | Orchestrator, LedgerEvent `agent_commission` | `shouldPostAgentCommission`; reference `{id}`, `{id}-owner`, `{id}-collaborator` | No |
| `agentAccountService.reverseCommissionForPayment` | penalty `$push` | Reverse commission | Orchestrator reverse | `REV-{id}-{role}` | No |
| `accountingIntegrationService.postCompanyCommission` | `companyaccounts.transactions` `$push` | Agency commission SSOT | Orchestrator, change-stream helper, scheduled recon, verifyAndReconcile | `shouldPostCompanyCommission`; paymentId match | No |
| `accountingIntegrationService.syncPaymentReceived` | `journalentries` / `journallines` | Gross collection 4001/4002 | Orchestrator | `shouldPostJournal`; unique reference | No |
| `accountingIntegrationService.syncPaymentReversed` | journal reversal + company archive | Reverse company/journal | Orchestrator reverse | Duplicate journal/source skip | No |
| `trustAccountService.recordBuyerPayment` | `trusttransactions` insert | Sale trust credit | `payment.confirmed` | paymentId / event dedupe | No |
| `trustAccountService` reversal post | `trusttransactions` debit | Sale trust reversal | `payment.reversed` | `reference=reversal:{paymentId}` | No |

---

## 4. Levy (not payment orchestrator)

| Source | Purpose | Trigger | Idempotent? | GET? | Retry? |
|---|---|---|---|---|---|
| `levyPaymentController.createLevyPayment` | Pass-through collection | POST | Key `levy-payment:{id}:collection` | No | catch → `levy_collection` event |
| `levyPaymentController` payout | Pass-through payout | POST/PUT | Key `levy-payment:{id}:payout` | No | catch → `levy_payout` event |
| `ledgerEventService.repostLevyCollection/Payout` | Same writers | Event retry | Same keys | No | Yes |

Levy is intentionally **not** funneled through `postPaymentAccounting` because it is a `LevyPayment` document, not a `Payment`.

---

## 5. Change streams / jobs (can bypass full orchestrator)

| Source | Purpose | Trigger | Idempotent? | GET? | Notes |
|---|---|---|---|---|---|
| `databaseSyncService.handlePaymentChange` | Full post / reverse | Change stream (replica set) | Yes | No | 5B.5: `postPaymentAccounting` / `reversePaymentAccounting` |
| `databaseSyncService.pollPaymentChanges` | Full post recent completed | Polling fallback (this standalone mongod) | Yes | No | 5B.5: includes `introduction`; `postPaymentAccounting` |
| `databaseSyncService.syncAllPayments` | Income + company for **all** completed payments | `performFullSync` / daily cron if enabled | Policy + writers | No | **Can backfill historical missing income if invoked** — not run during 5B.5 |
| `databaseSyncService.verifyAndReconcilePaymentPosting` | Income + company | Called from full sync | Policy then writers | No | 5B.5: no archive/dedupe of historical duplicates |
| `scheduledSyncService.executeLedgerReconciliation` | Owner income last 48h; company commission | Cron `*/5 * * * *` when sync schedules on | Policy / `isRecordIncomeEarlyExit` | No | Does **not** post agent/journal; 5B.5 company pass uses `postCompanyCommission` |
| `ledgerEventService.processPending` | Retry pieces | 15s loop **if** real-time sync started | Writer-level | No | Claims **generation 2 only** — 5A’s 27 pending events are not claimed |
| `jobs/trustReconciliationJob` | Emit `payment.confirmed` for missing sale trust; `$set` TrustAccount balances | Daily 02:15; also POST `/reconciliation/run` | Event dedupe | No | **Can create TrustTransactions for historical sales** if it runs |

Default `APP_ROLE=api` with `NODE_ENV=production` after dotenv: `runSyncSchedules` / `runTrustBackground` default **off in production** unless `ENABLE_*` is true. `.env` sets `NODE_ENV=production` but dotenv runs **after** `database.ts` URI resolution and **before** `getRuntimeFeatures()`, so the running API uses production runtime flags (background jobs **off** unless env overrides).

---

## 6. Admin / POST repair (not GET; not used in 5B.5)

| Source | Purpose | Trigger | GET? |
|---|---|---|---|
| `POST /property-accounts/sync` | Sync property accounts | Accountant POST | No |
| `POST .../developments/ensure-ledgers` | Ensure + backfill sales into development ledgers | POST | No |
| `POST .../reconcile-duplicates` | Remove duplicate income rows | POST | No |
| `POST /agent-accounts/:id/sync-commissions` | `syncCommissionTransactions` + `backfillMissingForAgent` | POST | No |
| `POST /migrations/backfill-balances` | Journal/COA backfill; optional `replayExisting` | POST | No |
| `POST /trust-accounts/reconciliation/run` | Trust recon + possible historical trust posts | POST | No |
| `propertyAccountService.ensureDevelopmentLedgersAndBackfillPayments` | Internal backfill via `recordIncomeFromPayment` | POST ensure-ledgers | No |
| `accountingIntegrationService.backfillFromExistingData` | Replay payments into journal | POST backfill | No |
| `runPropertyLedgerMaintenance` | Migrate/merge/recalc | Production startup **worker** only | No |

---

## 7. GET handlers — payment ledgers

| Endpoint | Writes payment/property/agent/company/trust ledgers? |
|---|---|
| GET property account / transactions / payouts | **No** — `getPropertyAccount` 404 if missing; in-memory totals only |
| GET agent account / company agent accounts | **No** — 404 if missing; no `syncCommissionTransactions` |
| GET company account summary/transactions | **No** (read) |
| GET payments / sales payments / reports | **No** |
| GET health `/ledger-events` | **No** — counts only |
| GET trust list / full / matter | **No ledger repair** after 5B.5 (read `TrustMatter` only; no `verifyAndRepairAccountInvariants`) |
| GET charge-types | **Catalog seed** `$setOnInsert` ChargeType defaults — not a payment ledger |
| GET `/accounting/dashboard-summary` | **Catalog seed** `initializeForCompany` (ChartOfAccount `$setOnInsert` + `createIndex` if not yet ensured) — not a payment ledger |

---

## 8. Fields that are no longer accounting writes

| Field | Remaining writers | Classification |
|---|---|---|
| `Company.revenue` | Schema default only. No `$inc` in `server/src` payment paths | Stale denormalized cache. **Not SSOT.** |
| `User.balance` | Schema default only. No `$inc` in `server/src` | Leftover wallet field. **Not owner income.** |
| `User.commission` | `paymentService` `$inc` on create / failed reverse | Denormalized agent total, **not** AgentAccount |

---

## 9. PropertyAccount concurrency / immutability

| Write | Pattern | Safe? |
|---|---|---|
| Income / expense append | `$push` transactions | Yes |
| Pass-through append | nested `$push` `passThroughAccounts.$.transactions` or `$push` new bucket | Yes — not `$set` whole array |
| Recalc | `$set` scalars only + `$inc ledgerRevision` with revision predicate | Yes — cannot clobber concurrent `$push` |
| Reversal | `$set transactions.$[t].status` | Allowed by `ledgerMutationPolicy` |
| Amount rewrite / `$pull` history / `$set transactions` array | Blocked by pre-update hook | Yes |
| `$set passThroughAccounts` (whole) | Allowed by policy path `passThroughAccounts` **if** a caller still does it | Recalc **does not**. Pass-through helpers use `$push`. |

---

## 10. Index creation

`initializePropertyAccountIndexes` / `ensureIndexes` (trust, accounting, charge types) are **no-ops** unless `ALLOW_ACCOUNTING_INDEX_MIGRATION=true`. That flag is **not** set in `.env` or `.env.production`.
