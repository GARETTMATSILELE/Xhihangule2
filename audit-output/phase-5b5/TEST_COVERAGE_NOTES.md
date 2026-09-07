# PHASE 5B.5 — TEST COVERAGE NOTES

Tests run in isolation via `ts-node` against `server/src/scripts/runPhase5bAccountingTests.ts` and `runPhase2aSafetyTests.ts`. They **do not** connect to `property-management` / `accounting`. There is no `mongodb-memory-server` in this repo, so lifecycle A–H was **not** executed against Mongo. Simulated / policy / source-contract tests cover the same defects.

| Test | Phase 5A defect it protects |
|---|---|
| Provisional `evaluatePermanentAccountingPolicy` deny | Provisional agent commissions on `68c2c8a3…` / `68c2c951…` |
| `isRecordIncomeEarlyExit` true for provisional | Same — recon jobs must not post them |
| Introduction `allowed === true` | Seven missing introduction/rental income rows (type omitted from change stream / recon) |
| Sale `shouldPostTrust`; rental false | Trust only for sales |
| Same-agent split two lanes `{id}-owner` / `{id}-collaborator` | 12 historical same-agent rows — **do not collapse**; identities must stay distinct |
| Undifferentiated `agentShare` suppressed when split exists | Duplicate third lane |
| Totals exclude cancelled | USD 5,100 stored totals vs completed transactions |
| Immutability allow-list: status cancel allowed; amount `$set` blocked | Reversal leftovers because hook blocked `$set status` |
| Nested pass-through `$push` allowed | Concurrent levy/rent collections |
| Simulated concurrent pass-through: both keys survive | P4-C01 last-write-wins `$set` of whole `passThroughAccounts` |
| Penalty retry identity `REV-{id}-{role}` | Duplicate reversal penalties |
| LedgerEvent claim generation 2 skip | 27 generation-less pending events must not be processed |
| Stale `processing` reclaim | Crash-stranded events |
| Webhook source contains `postPaymentAccounting` | Webhook completed sales with no orchestrator (agent/journal missing) |
| Change stream / poll source contains `postPaymentAccounting` + introduction | Poll previously skipped `introduction` |
| `verifyAndReconcile` uses policy; no raw CompanyAccount `$push` | Provisional company commission bypass |
| Scheduled recon uses `shouldPostCompanyCommission` | Same bypass on 5-minute job |
| GET `getPropertyAccount` source: no `recordIncomeFromPayment` / `save` / `recalculateBalance` | GET-driven posting and persist-recalc |
| GET `getAgentAccount` source: no `syncCommissionTransactions` / `backfillMissingForAgent` | GET-driven agent backfill |
| GET trust full / matter: no `verifyAndRepair` / `ensureForTrustAccount` | GET mutating TrustAccount / TrustMatter |

`npx tsc --noEmit` passed (no unused-strict failures from the 5B.5 edits).
