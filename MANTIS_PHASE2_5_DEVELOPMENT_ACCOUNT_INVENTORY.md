# Phase 2.5 development account inventory

Local databases `property-management` and `accounting` on `127.0.0.1`. Read-only. Production was not used.

## Property accounts

```text
Documents: 133
ledgerType rental: 82
ledgerType sale: 51
Other ledger types: 0
Active duplicate groups (same propertyId and ledgerType, not archived): 0
Properties with both an active rental ledger and an active sale ledger: 51
Archived accounts that still hold financial rows: 0
Inactive, non-archived accounts: 0
Accounts with no propertyId: 0
Accounts whose id is a development or unit, not a property: 48
Accounts with no property, development, or unit: 0
```

## Unique index already on the collection

```text
name: propertyId_1_ledgerType_1
unique: true
key: { propertyId: 1, ledgerType: 1 }
partialFilterExpression: { isArchived: false }
```

The duplicate query returned 0 groups, which matches the index. `ALLOW_ACCOUNTING_INDEX_MIGRATION` was not turned on.

## Duplicate classification

```text
SAFE_DUPLICATE: 0
POSSIBLE_DUPLICATE: 0
CONFLICTING_HISTORY: 0
REQUIRES_MANUAL_REVIEW: 0
```

No keeper was selected. No account was archived by this phase.

## Owner income placement

```text
Cross-ledger income (rental payment on sale ledger, or the reverse): 0
Two income lines on the same account for one payment: 0
One sale payment posted to two different sale targets: 25
```

Those 25 are unit plus development. They are not duplicate accounts for one property and one ledger.
