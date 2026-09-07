# PHASE 5B.5 — READ-ONLY DATABASE SCAN

**Scan window:** 2026-08-31T14:05:15Z → 2026-08-31T14:05:28.492Z (13.0s)  
**Scanner:** `audit-output/phase-5b5/run-readonly-scan.js` (copy of the Phase 5A scanner; write CSV names changed so Phase 5A files were not overwritten)  
**Operations used:** `listCollections`, `indexes`, `countDocuments`, `find` / `toArray`, `hello`  
**Operations not used:** `update*`, `insert*`, `delete*`, `bulkWrite`, `save`, `create`, `findOneAndUpdate`, posting, reconciliation, repair, `ensureLedgerIndexes()`

---

## Environment

| Item | Value |
|---|---|
| MongoDB host | `localhost:27017` |
| Cosmos / Azure | **No** — scanner aborts if host is not localhost or URI matches `cosmos.azure.com` |
| Main database | `property-management` |
| Accounting database | `accounting` |
| Replica set | **None** (`hello.setName` is null; standalone) |
| Application env files | `server/.env` and `server/.env.production` both exist; **neither contains a Mongo URI** |
| How the app reaches this DB | `server/src/config/database.ts` defaults to `mongodb://localhost:27017/property-management` and `mongodb://localhost:27017/accounting` because dotenv loads after the URI module is evaluated |
| Remote production accessed | **NO** |

`.env` / `.env.production` set `NODE_ENV=production` but do not set `MONGODB_URI` / `ACCOUNTING_DB_URI` / Cosmos connection strings.

---

## Comparison to Phase 5A (`scan-raw.json`)

Every collection count, index signature, and financial metric below is **unchanged**.

| Metric | Phase 5A | Phase 5B.5 | Changed? |
|---|---:|---:|---|
| Payments | 157 | 157 | No |
| PropertyAccounts | 131 | 131 | No |
| CompanyAccounts | 4 | 4 | No |
| AgentAccounts | 9 | 9 | No |
| JournalEntries | 38 | 38 | No |
| TrustTransactions | 92 | 92 | No |
| LedgerEvents | 113 | 113 | No |
| Pending LedgerEvents | 27 | 27 | No |
| Processing LedgerEvents | 0 | 0 | No |
| Property balance mismatches | 2 | 2 | No |
| Reversed payments | 5 | 5 | No |
| Reversed sale leftovers (active income) | 1 (`69ba734618ae7e900167c1f5`) | 1 (same id) | No |
| Missing owner income (USD exposure) | 1,200,825 | 1,200,825 | No |
| Missing agent commissions (count / USD) | 10 / 1,414.26 | 10 / 1,414.26 | No |
| Levy gaps (missing collection + payout rows) | 21 | 21 | No |
| Automated finding rows | 56 | 56 | No |
| Integrity score | 32 | 32 | No |

**Collection inventory:** zero deltas across main and accounting databases.  
**Index inventory:** zero deltas on `propertyaccounts`, `companyaccounts`, `agentaccounts`, `trusttransactions`, `ledgerevents`, `payments`, `journalentries`.

Balance-mismatch account ids still:

- `6889d00f0c4f5d6e515904e5`
- `6889d00f0c4f5d6e515904ea`

Provisional commissions still posted on two historical payments (unchanged).

---

## What this scan proves

1. Existing historical damage is still present and **untouched**.
2. This verification did **not** create new accounting records.
3. Stored balances were **not** recalculated/saved.
4. Indexes were **not** created or dropped.
5. The 27 pending LedgerEvents were **not** processed (still `pending`, still generation-less).
6. Payment statuses were **not** changed (still 157 payments; reversed leftover still reversed with completed income).

Raw output: `audit-output/phase-5b5/scan-raw.json`.
