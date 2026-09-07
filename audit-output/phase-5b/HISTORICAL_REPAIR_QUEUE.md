# HISTORICAL REPAIR QUEUE (Phase 5C — do not execute in 5B)

All items below were confirmed or strongly indicated by Phase 5A. **Do not repair them until the 5B engine is deployed and tests pass.**

## Reversal leftovers

| Item | IDs / amount | Repair |
|---|---|---|
| Reversed sale with completed owner income | Payment `69ba734618ae7e900167c1f5`; PropertyAccount `699d505fd8858aa4cfb30bd9`; income tx `69ba734618ae7e900167c234`; USD 203,950.22 | Run `reversePaymentAccounting` (or 5C job) once; cancel income; archive company commission USD 5,248.92; agent penalty; trust reversal |
| Reversed sale company commission still active | Payment `6999a778d0d16f54222e09d0`; USD 4,619.05 | Archive CompanyAccount commission |
| Reversed sale agent commission without penalty | Payment `699c28656d09fb46b6840191`; USD 2,729.44 | Post one penalty |
| Four reversed sales missing Trust reversal | See Phase 5A report | One debit `reversal:{paymentId}` each |

## PropertyAccount totals

| Account | Variance | Repair |
|---|---|---|
| `6889d00f0c4f5d6e515904e5` | stored income +USD 3,825 vs sum(completed) | Recalc scalars with 5B `computePropertyAccountTotals` (no array replace) |
| `6889d00f0c4f5d6e515904ea` | +USD 1,275 | Same |
| Total | USD 5,100 | Do not rewrite transaction arrays unless rows are proven stale |

## Missing owner income

| Class | Notes | Repair |
|---|---|---|
| 1 rental | `687e370b1a13203601cb3d91` | Post via 5B `recordIncomeFromPayment` once |
| 6 introduction | Scanner missing-owner-income USD 1,200,825 of which USD 480,000 provisional | Post **non-provisional** only (~USD 720,825). Do not post the two provisional introductions |

## Provisional commissions (do not keep)

| Payment | Repair |
|---|---|
| `68c2c8a3e329519c550c6a09` | Reverse/penalize AgentAccount commission posted while provisional |
| `68c2c951e329519c550c6c8a` | Same |

## Agent commissions

| Class | Repair |
|---|---|
| 10 missing commissions USD 1,414.26 | Post via `syncCommissionForPayment` / `projectCommissionLanes` once each |
| 12 same-agent split lanes | **Do not modify** — intended two-role posting |

## Levy

| Class | Repair |
|---|---|
| 19 standalone LevyPayments missing collections | Post `levy-payment:{id}:collection` via `recordPassThroughCollection` |
| 2 missing payouts | Post `levy-payment:{id}:payout` |

## Company / user denormalized caches

| Field | Observation | Repair |
|---|---|---|
| `Company.revenue` | USD 124,963.48 vs CompanyAccount 179,053.84 vs Payment agencyShare 171,304.33 | Decide whether to resync cache from CompanyAccount or stop displaying it. **Do not invent a fourth number.** |
| `CompanyBalance` | USD 199,740.87 | Treat as separate operational cache; reconcile only after SSOT is agreed |
| `User.balance` | USD 32,665 on agent/admin users | Do **not** zero or transfer in 5C without an owner-ledger migration plan. PropertyAccount remains owner SSOT |

## Journal

| Class | Repair |
|---|---|
| 115 missing journal entries | Optional: backfill **gross collection** journals. Do **not** force totals to agencyShare |
| Accounts 4001/4002 | Document as gross; reporting should not treat them as commission revenue |

## LedgerEvents

| Class | Repair |
|---|---|
| 27 pending (no `processorGeneration`) | Inspect payload; post missing artifacts with 5B orchestrator **or** mark completed if already posted. Do not let generation-2 worker drain them blindly |

## Indexes

Create only after duplicates in this queue are resolved. See `REQUIRED_INDEX_PLAN.md`.

## Explicitly out of scope for 5C until 5B is live

- Recalculating and saving all PropertyAccounts in bulk without per-account review
- Processing the 27 pending events against production as a side effect of deploying 5B (guarded by `processorGeneration: 2`)
