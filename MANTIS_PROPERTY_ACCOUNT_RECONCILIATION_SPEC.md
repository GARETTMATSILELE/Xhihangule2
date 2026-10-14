# Property account reconciliation spec

Phase 2 design. Automatic merge is allowed only for groups this spec classifies as `SAFE_DUPLICATE`. Every other group requires an accountant to choose the keeper. Nothing in startup or the sync job runs a merge.

## What a duplicate is

```text
same propertyId
+ same ledgerType
+ more than one active, non-archived PropertyAccount
```

`(propertyId, rental)` together with `(propertyId, sale)` is a lifecycle pair. It is not a duplicate.

## Keeper selection

Do not choose the newest account.

| Order | Rule |
| --- | --- |
| 1 | Active and not archived |
| 2 | Holds the completed income, expenses, opening balances, and owner payouts |
| 3 | Referenced payment idempotency keys stay on the keeper |
| 4 | Older `createdAt` wins only when every candidate is financially empty |

`classifyDuplicateGroup` in `server/src/services/propertyAccountDuplicateInventory.ts` applies that rule.

| Class | Meaning | Automatic merge |
| --- | --- | --- |
| `SAFE_DUPLICATE` | One account holds the money, or every account is empty | Allowed after an explicit confirm and reason |
| `POSSIBLE_DUPLICATE` | More than one account has financial rows that do not obviously conflict | No |
| `CONFLICTING_HISTORY` | Completed income for different payments, or the same payment with different amounts, is split across accounts | No |
| `REQUIRES_MANUAL_REVIEW` | Owner payouts exist on more than one account, or the keeper cannot be proved | No |

## Merge steps, when a later controlled run is authorised

1. Refuse unless the operator passes the keeper id, the source ids, a reason, and confirm.
2. Re-read the group inside the request. If the classification is not `SAFE_DUPLICATE` and the operator did not explicitly name the keeper, stop.
3. Copy transactions onto the keeper. Keep subdocument ids and idempotency keys. Skip a line only when the keeper already has the same idempotency key or the same payment income line with the same amount.
4. Copy owner payouts the same way.
5. Recompute the keeper balance with the existing `recalculateBalance`.
6. Write an audit record: operator, reason, keeper id, source ids, counts moved, timestamp.
7. Archive the source only after the copy is saved.
8. Re-read the keeper and confirm the source transactions are present and the source is archived.

Do not delete the source. Do not delete payments or journals. Do not replay the payments.

## Index

Do not set `ALLOW_ACCOUNTING_INDEX_MIGRATION`. The index helper no longer archives duplicates when index creation hits a duplicate key. It logs and stops. Enable the partial unique index on `(propertyId, ledgerType)` for `isArchived: false` only after a read-only inventory shows no active duplicate group, including inactive-but-not-archived rows that would occupy the key.
