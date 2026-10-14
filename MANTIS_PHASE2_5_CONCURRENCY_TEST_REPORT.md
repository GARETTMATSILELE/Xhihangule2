# Phase 2.5 concurrency test report

Target: local `accounting.propertyaccounts` on `127.0.0.1`. The partial unique index `propertyId_1_ledgerType_1` where `isArchived` is false was already present. It was not created in this phase.

A new property id was used. The documents were named `PHASE25_DISPOSABLE_DO_NOT_KEEP` and contained no transactions. They were deleted at the end. Existing accounts were not modified.

## Same property, rental, 10 concurrent inserts

```text
inserted: 1
duplicate key 11000: 9
active rental accounts left: 1
```

## Same property, sale, 10 concurrent inserts

```text
inserted: 1
duplicate key 11000: 9
active sale accounts left: 1
```

## Both ledgers

```text
active accounts for that property before cleanup: 2
rental and sale both present
```

## Archived rental, then a new rental

The active rental was archived. A new non-archived rental insert succeeded.

```text
active rental: 1
archived rental: 1
```

## Cleanup

```text
documents deleted: 3
filter: the disposable property id and the disposable name
transactions on those documents: none
```

```text
CONCURRENCY: PASS
```
