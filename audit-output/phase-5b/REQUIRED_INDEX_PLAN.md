# REQUIRED INDEX PLAN (Phase 5B — document only)

**Do not create or drop these indexes in this phase.**  
Schema definitions were corrected so a later controlled deploy does not recreate harmful uniques.

Phase 5A observed: AgentAccount `_id` only; LedgerEvent `_id` only; PropertyAccount unique `transactions.paymentId` **does** exist and conflicts with income + configured_expense.

| Collection | Key | Unique | Partial filter | Purpose | Duplicate-risk prevented | Historical duplicates must be resolved first? |
|---|---|---|---|---|---|---|
| `accounting.propertyaccounts` | `{ propertyId: 1, ledgerType: 1 }` | YES | `{ isArchived: false }` | One active ledger per entity/type | Duplicate PropertyAccounts | YES if any duplicate active pairs remain |
| `accounting.propertyaccounts` | `{ propertyId: 1, ledgerType: 1, 'transactions.idempotencyKey': 1 }` | YES | idempotencyKey exists and is string | One income/expense/payout identity per ledger | Duplicate owner income / configured expense | YES — inspect duplicate keys before create |
| `accounting.propertyaccounts` | `{ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }` | **NO** (lookup) | sparse | Find income by payment | n/a | Drop the **existing unique** version first in 5C |
| `accounting.propertyaccounts` | `{ 'passThroughAccounts.transactions.idempotencyKey': 1 }` | YES | key exists | Pass-through collection/payout identity | Duplicate levy/rent levy lines | YES if any duplicate keys (5A found 0) |
| `agentaccounts` | `{ agentId: 1, 'transactions.type': 1, 'transactions.reference': 1 }` | YES | type=commission and reference non-empty | One commission lane per payment+role | Duplicate commissions / retry | YES — 12 same-agent split rows use distinct references (`-owner` / `-collaborator`) so they can coexist |
| `agentaccounts` | `{ agentId: 1, 'transactions.paymentId': 1, 'transactions.type': 1 }` | **NO** | sparse | Lookup by payment | Must **not** be unique (same agent two roles) | n/a — schema unique removed |
| `ledgerevents` | `{ status: 1, nextAttemptAt: 1, createdAt: 1, processorGeneration: 1 }` | NO | — | Worker claim queue | n/a | NO |
| `ledgerevents` | `{ type: 1, paymentId: 1, status: 1 }` | NO | — | Avoid piling open events | Duplicate open events (app also upserts) | Optional unique later after collapsing opens |
| `ledgerevents` | `{ type: 1, levyPaymentId: 1, status: 1 }` | NO | levyPaymentId exists | Levy retry identity | Duplicate levy events | NO |
| `trusttransactions` | `{ paymentId: 1 }` | YES | paymentId exists objectId | One original trust tx per payment | Duplicate buyer credits | YES if any duplicate paymentIds |
| `trusttransactions` | `{ companyId: 1, reference: 1 }` | NO (consider unique for `reversal:*`) | optional prefix | Reversal identity `reversal:{originalPaymentId}` | Duplicate trust reversals | YES before unique |
| `companyaccounts` | `{ companyId: 1, 'transactions.paymentId': 1 }` | NO | — | Commission lookup / archive | App uses `$elemMatch` + `$not` | Optional unique on active commission |
| `journalentries` (or accounting journal collection) | `{ companyId: 1, sourceId: 1 }` | YES if not already | — | Journal posting identity (`paymentId` / `paymentId:reversal`) | Duplicate journals | YES for 115 missing — uniqueness does not create missing rows |

## 5C deploy order (when authorized)

1. Resolve historical duplicates listed in `HISTORICAL_REPAIR_QUEUE.md` where uniqueness would fail.
2. Drop unique `{ propertyId, ledgerType, transactions.paymentId }` on PropertyAccount.
3. Create idempotencyKey unique (pass-through + transactions).
4. Create AgentAccount and LedgerEvent indexes.
5. Confirm `autoIndex` remains off in production; use an explicit index script with `ALLOW_ACCOUNTING_INDEX_MIGRATION=true`.
