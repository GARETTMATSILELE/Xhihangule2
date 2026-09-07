# PHASE 5B.5 — POST-DEPLOYMENT ACCOUNTING ENGINE VERIFICATION

**Date:** 2026-08-31  
**Scope:** Read-only verification that the Phase 5B engine is wired on production paths. Historical financial documents were **not** repaired. Phase 5C was **not** started.

During this phase, **source-only** routing/GET fixes were applied where verification found bypasses. Those fixes do not write historical Mongo documents. The live `node dist/index.js` process was **not** rebuilt or restarted.

---

## 1. Environment

| Item | Value |
|---|---|
| MongoDB host | `localhost:27017` |
| Main database | `property-management` |
| Accounting database | `accounting` |
| Replica set | None (standalone; change streams unavailable) |
| Application environment | `server/.env` and `server/.env.production` both set `NODE_ENV=production` and contain **no Mongo URI** |
| `.env.production` remote Mongo URI | **Not present** |
| Cosmos / Azure | **Not connected.** Scanner aborts on non-localhost / `cosmos.azure.com` |
| How the process reaches Mongo | `database.ts` defaults to local URIs because the module is imported **before** `dotenv.config()`. After dotenv, runtime features see `NODE_ENV=production` so scheduled sync / trust background default **off** |

**Remote/Cosmos database accessed: NO.**

---

## 2. Step 1 — Phase 5B architecture in source

Confirmed in current `server/src` (not the 5B report alone):

- `evaluatePermanentAccountingPolicy` — single provisional / suspense / reversal-row / deposit-only gate
- `postPaymentAccounting` / `reversePaymentAccounting`
- `projectCommissionLanes` — same-agent owner + collaborator **both** allowed
- `ledgerMutationPolicy` — status cancel + nested pass-through `$push`; amount mutation blocked
- `ledgerEventStateMachine` + `processorGeneration: 2`
- Atomic pass-through `$push`; `recalculateBalance` scalars + `ledgerRevision`
- GET property/agent accounts do not persist
- No `$inc Company.revenue` / `$inc User.balance` on payment paths

---

## 3. Step 2 — Single accounting orchestrator

| Entry point | Accounting function | Direct ledger writes? | Correct? |
|---|---|---|---|
| Payment creation (lease, accountant, sales, public, agent, `paymentService`) | `postPaymentAccounting` | Only via orchestrator writers | Yes |
| Payment finalisation / un-provisional complete | `postPaymentAccounting` | Via orchestrator | Yes |
| Payment reversal / status→failed | `reversePaymentAccounting` | Via orchestrator; trust via `payment.reversed` | Yes (trust event-driven by design) |
| Change stream (if replica set) | `postPaymentAccounting` / `reversePaymentAccounting` | No longer piecemeal income+company | Yes (5B.5) |
| Polling fallback (this standalone host) | `postPaymentAccounting` including `introduction` | Previously company-only and **skipped introduction** | Yes (5B.5) |
| LedgerEvent processor | Piece writers (`recordIncomeFromPayment`, `syncCommissionForPayment`, `postCompanyCommission`, levy, `reversePaymentAccounting`) | Direct **retry** of orchestrator pieces; policy-gated | Yes as retry |
| GET endpoints | None for payment ledgers | No | Yes |
| Webhook confirmation | `postPaymentAccounting` + `payment.confirmed` | Previously trust-only | Yes (5B.5) |
| Levy create/payout | Pass-through writers | Direct (not Payment) | Yes for levy domain |
| Scheduled 48h recon | `recordIncomeFromPayment` + `postCompanyCommission` | Bypass of **full** orchestrator (no agent/journal) | Acceptable retry of income/company; **not** a GET path |
| `syncAllPayments` / POST backfills | Same writers | Can backfill history if invoked | **Not invoked** this phase |

**Bypasses that remain (documented, not Phase 5C data repair):**

- Levy stays on pass-through APIs.
- LedgerEvent execute calls writers directly (correct retry).
- 48h recon and `syncAllPayments` can post missing **future** income without going through the orchestrator fan-out for agent/journal. Owner income and company commission still use the central policy.

---

## 4. Step 3 — GET is read-only (payment ledgers)

Payment / property / agent / company / owner dashboard GET handlers do **not** `save`/`create`/`$inc` accounting ledgers.

**Fixed in 5B.5 (source):**

- GET trust full no longer calls `verifyAndRepairAccountInvariants`
- GET trust list / matter / full no longer `ensureForTrustAccount` upsert

**Residual catalog GET writes (not payment history):**

- GET `/charge-types` → `seedDefaults` (`$setOnInsert`)
- GET `/accounting/dashboard-summary` → `initializeForCompany` (ChartOfAccount `$setOnInsert` + `createIndex` once per process if indexes not yet marked)

These are **not** PropertyAccount / AgentAccount / CompanyAccount / TrustTransaction / Payment mutations. They are catalog seeds.

**GET payment-ledger mutation: NONE.**  
**GET catalog seed: residual (not a 5C historical-repair blocker).**

---

## 5. Step 4 — Provisional gating

Central rule: `evaluatePermanentAccountingPolicy` denies `isProvisional === true` even when `status === completed`.

Enforced on: `recordIncomeFromPayment`, `syncCommissionForPayment` (`shouldPostAgentCommission`), `postCompanyCommission`, `syncPaymentReceived`, orchestrator, trust posting, recon filter (`isRecordIncomeEarlyExit`), change stream/poll filters, 5B.5 `verifyAndReconcile`, 5B.5 scheduled company pass.

**Previous bypass:** `verifyAndReconcile` and scheduled recon raw `CompanyAccount.updateOne $push` without `isProvisional`. **Closed in source.**

---

## 6. Step 5 — Reversal engine

`reversePaymentAccounting`:

- PropertyAccount income + configured expense + pass-through cancel (`transactions.$[t].status`)
- AgentAccount penalty per role (`REV-{paymentId}-{role}`)
- Journal reversal + CompanyAccount archive
- Trust: **not** in this function; `payment.reversed` → debit with `reference=reversal:{originalPaymentId}`

**Idempotency:** second reverse does not add another penalty / journal / trust debit (identity lookup). Partial failure enqueues `payment_reversal` (generation 2); retry does not duplicate successful pieces.

---

## 7. Step 6 — PropertyAccount immutability

Pre-update hook (`PropertyAccount.ts`) still blocks illegal `$set`/`$pull` of history.

**Allow-list** (`ledgerMutationPolicy`):

- `$set transactions.$[t].(status|updatedAt|notes)` — authorised cancel
- nested `$push` on `passThroughAccounts.$.transactions`
- payout status paths

**Not** a global disable. Amount mutation and deleting history still throw.

This is the safe workaround for the Phase 5A defect (hook blocked reversal `$set status`; `Promise.allSettled` hid the failure).

---

## 8. Step 7 — PropertyAccount concurrency

`recalculateBalance`:

- Totals from current ledger via `computePropertyAccountTotals`
- `$set` scalars only (runningBalance, totals, passThroughCollected/Paid/Outstanding)
- `$inc ledgerRevision` with match on current revision
- **Does not** `$set` `passThroughAccounts` or `transactions`

Remaining `$set` on `transactions.$[t].status` is reversal, not array replace.

---

## 9. Step 8 — Pass-through / levy

Levy POST → `recordPassThroughCollection` nested `$push` → recalc scalars. Failure enqueues `levy_collection` (not swallowed). Payout same with `levy_payout`. Duplicate key → no second row. Historical 19 missing collections **unchanged** (not backfilled).

---

## 10. Step 9 — Agent commission

`projectCommissionLanes` is the SSOT. Same-agent owner + collaborator: both lanes, identities `{paymentId}:owner` / `{paymentId}:collaborator`, references `{paymentId}-owner` / `{paymentId}-collaborator`. No extra undifferentiated `agentShare` lane. GET does not backfill. Historical 12 split rows left in place.

---

## 11. Step 10 — LedgerEvent processor

Inspected only. **Did not process the 27 pending events.**

- Atomic `findOneAndUpdate` claim
- Filter `processorGeneration: 2`
- Stale `processing` reclaim after 5 minutes
- Failure → `failed` + backoff `nextAttemptAt`
- In-process `this.processing` mutex

Worker crash cannot permanently strand a **generation 2** event. Generation-less 5A events stay pending until Phase 5C.

---

## 12. Step 11 — Company.revenue

No `$inc` / `findByIdAndUpdate` of `Company.revenue` in `server/src` payment paths. Field remains on the schema. Agency SSOT is `CompanyAccount`.

`systemAdminExpansionController` “revenue” is SaaS analytics, not this field.

---

## 13. Step 12 — User.balance

No `$inc User.balance` in `server/src`. `paymentService` still `$inc User.commission` (denormalized agent total, not owner income).

---

## 14. Step 13 — Introduction payments

Supported types on orchestrator/policy: rental, sale, **introduction** (and others that pass completed + policy). Poll/change-stream include introduction (5B.5 poll fix). Completeness path no longer drops introduction solely for not being rental/sale. **Seven historical missing-income records were not backfilled.**

---

## 15. Step 14 — Trust reversal

Completed sale → `payment.confirmed` → TrustTransaction credit.  
Reversed sale → `payment.reversed` → debit `reference=reversal:{paymentId}`; existing reference returns `{ duplicate: true }`.  
Orchestrator does not emit trust; controllers/webhook still emit events. **No historical TrustTransactions created.**

---

## 16. Step 15 — Journal semantics

Journals 4001/4002 remain **gross collections**. CompanyAccount remains **agencyShare**. They are not required to equal each other. Duplicate journal prevention: unique reference / `shouldPostJournal`.

---

## 17. Tests

| Command | Result |
|---|---|
| `npx ts-node --transpile-only src/scripts/runPhase5bAccountingTests.ts` | **passed** |
| `npx ts-node --transpile-only src/scripts/runPhase2aSafetyTests.ts` | **passed** |
| `npx tsc --noEmit` | **passed** |

`npm run test:phase5b` / `test:phase2a` were **not** run as `npm run build && node dist/...` because a live `node dist/index.js` is holding the compiled tree; rewriting `dist` on Windows can fail and would not change the already-running process. The same test scripts were executed from `src` via `ts-node`.

No isolated Mongo fixture exists. Optional dry-run A–H against a throwaway database was **not** executed. Source-contract and simulated tests cover reversal, provisional, introduction, same-agent split, pass-through concurrency, LedgerEvent generation skip, and GET read-only call sites. See `TEST_COVERAGE_NOTES.md`.

---

## 18. Database safety / Step 19–20

See `PHASE_5B5_READONLY_SCAN.md`. All compared financial metrics **match Phase 5A exactly**. No unexpected new accounting records.

---

## 19. Remaining risks (not 5C work, not auto-repaired)

1. Live process is still the **previous `dist` build** until someone rebuilds and restarts. 5B.5 webhook/poll/GET-trust/source routing is in `server/src`.
2. Unique `{propertyId, ledgerType, transactions.paymentId}` index still exists in Mongo (5C).
3. AgentAccount still has only `_id` in the scanned DB (5C).
4. POST backfill / `syncAllPayments` / trust recon POST can still mutate history if an operator runs them.
5. GET ChargeType / ChartOfAccount catalog seed remains.

---

## PASS / FAIL GATE

## PASS — READY FOR PHASE 5C

- Payment-derived create/complete/reverse/webhook/change-stream/poll paths use the corrected engine (orchestrator + central policy).
- GET does not mutate payment/property/agent/company/trust **ledgers**.
- Provisional gating has no remaining raw CompanyAccount `$push` bypass in source.
- Reversal is idempotent; immutability allow-lists cancel without disabling the hook.
- Concurrency: nested `$push` + scalar recalc + `ledgerRevision`.
- Introduction is included.
- Levy failures enqueue retryable events.
- Agent posting is identity-idempotent; same-agent split preserved.
- LedgerEvents: generation 2 claim/retry; 27 pending events **not** processed.
- `Company.revenue` / `User.balance` are not payment-path writes.
- Tests and TypeScript passed.
- Read-only scan shows **no** unexpected changes vs Phase 5A.
- No production/Cosmos database was accessed.

Do **not** begin Phase 5C from this task.

---

## FINAL SAFETY STATEMENT

| Question | Answer |
|---|---|
| MongoDB documents modified | **NO** |
| Historical accounting records modified | **NO** |
| Indexes modified | **NO** |
| Migrations run | **NO** |
| Historical payments processed | **NO** |
| Existing LedgerEvents processed | **NO** |
| Existing balances recalculated/saved | **NO** |
| Remote/Cosmos database accessed | **NO** |
| GET accounting writes detected (payment ledgers) | **NO** |

Source files were edited for routing/GET safety. The live local accounting database was only **read**. Historical corruption remains in place for Phase 5C.
