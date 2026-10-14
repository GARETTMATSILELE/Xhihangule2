# Phase 2.5 reconciliation test report

```text
EXISTING DATA MERGE: NOT PERFORMED
```

The development accounting database has 0 active duplicate property-account groups. There was no `SAFE_DUPLICATE` group to authorize.

`classifyDuplicateGroup` remains the Phase 2 rule:

- one account holding the money, or all accounts empty: `SAFE_DUPLICATE`, automatic merge allowed only after an explicit confirm
- completed income split across accounts: `CONFLICTING_HISTORY`, automatic merge prohibited

The older `mergeDuplicateAccounts` function does not call that classifier. It copies lines onto a keeper, drops subdocument ids, and archives the other account. A second line with the same `paymentId` is not copied. That helper was not executed, including on a fixture, because it does not implement the Phase 2 stop rule.

No existing transaction, payout, payment, journal, or trust row was moved or archived.

Balance conservation on existing data was not changed, because no merge ran.
