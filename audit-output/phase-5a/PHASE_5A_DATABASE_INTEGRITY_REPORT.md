# PHASE 5A READ-ONLY DATABASE INTEGRITY REPORT

**Scan window:** 2026-08-31T12:27:40.635Z → 2026-08-31T12:27:43.366Z (2.7s)  
**Scanner:** `audit-output/phase-5a/run-readonly-scan.js`  
**Operations used:** `listCollections`, `indexes`, `countDocuments`, `find` / `toArray` only.  
**Operations not used:** `update*`, `insert*`, `delete*`, `bulkWrite`, `save`, `create`, `findOneAndUpdate`, application posting/reconciliation/repair services, `ensureLedgerIndexes()`.

---

## Environment scanned (important)

This scan targeted the **MongoDB instance currently serving the running application** (`node dist/index.js` on localhost:5000).

| Item | Value |
|---|---|
| MongoDB | Standalone `mongod` 8.0.9 on `localhost:27017` |
| Cosmos DB | **No** |
| Main database | `property-management` |
| Accounting database | `accounting` |
| Replica set | None (matches historical “transaction numbers are only allowed on a replica set” logs) |
| `.env.production` Mongo URI | **Not present** — no remote production cluster was reachable from this environment |

The dataset is operationally live (company **The Benjamins Realty** and others, USD 7,715,096.96 in Payment.amount). It is **not** a confirmed Azure/Cosmos production cluster. Treat findings as **current application-database damage**, not as a cloud-production attestation.

---

## 1. Executive Summary

| Metric | Count |
|---|---:|
| Payments scanned | 157 |
| PropertyAccounts scanned | 131 |
| CompanyAccounts scanned | 4 |
| AgentAccounts scanned | 9 |
| JournalEntries scanned | 38 |
| TrustTransactions scanned | 92 |
| LedgerEvents scanned | 113 |
| Automated finding rows | 56 |
| Confirmed financial integrity problems (distinct issues, see below) | **14 issue classes** |
| High-confidence risks with evidence | **6** |
| Code-only risks (no data evidence here) | **5** |

**Highest-risk records**

- Reversed sale `69ba734618ae7e900167c1f5`: PropertyAccount sale income **USD 203,950.22 still `completed`**, CompanyAccount commission **USD 5,248.92 still active**, agent commission **USD 5,248.92 with no penalty**.
- Two PropertyAccounts for owner “Garett Matsilele” store income **USD 5,100 higher** than sum of completed transactions.
- Six completed **introduction** payments plus one rental payment have **no PropertyAccount income** (scanner missing-owner-income total **USD 1,200,825**, of which **USD 480,000** is provisional).
- Standalone levy pass-through: **19 missing collections**, **2 missing payouts**.
- AgentAccount unique indexes **were never created**; 12 payments posted **both** owner and collaborator split lanes onto the **same** agent.

**Estimated financial exposure (USD only — no ZWL present)**

See Financial Exposure Summary. Several large numbers are **quantifiable from stored documents**. Journal vs CompanyAccount differences are **semantic**, not added into a single “lost money” total.

**Database integrity score: 32 / 100**  
(Automated: start 100; deduct for reversed leftovers, balance mismatches, missing artifacts, duplicates, provisional posts. Harsh because it also counts journal-coverage gaps. See scoring section.)

**P4-C01 / P4-C02 / P4-C03 / P4-H01 outcome on this database**

| Phase 4 ID | Observed in this DB? |
|---|---|
| P4-C01 pass-through last-write-wins | **No duplicate/lost rent pass-through keys.** 9/9 rent+levy combined payments match. **19 levy-ledger collections missing** — consistent with posting failure, not proven `$set` race. Race *indicators* exist. |
| P4-C02 recalc overwrite | **2 accounts** with stored totals ≠ sum(transactions) (**USD 5,100**). Cause not uniquely proven as pass-through `$set`. |
| P4-C03 unique `transactions.paymentId` vs expenses | Unique index **exists**. **Zero** income+configured_expense pairs. **Zero** PROPERTY_EXPENSE postings. **Code risk only here.** |
| P4-H01 reversed + active configured expense | **Zero** such rows. **Code risk only here.** |

---

## Priority Findings

### P0 — Immediate financial integrity

#### F5A-P0-01 — Reversed sale still has completed owner income
- **Severity:** CRITICAL  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `payments`, `accounting.propertyaccounts`  
- **Records:** Payment `69ba734618ae7e900167c1f5`; PropertyAccount `699d505fd8858aa4cfb30bd9` (property/entity `699d5017d8858aa4cfb30b96`); income tx `69ba734618ae7e900167c234`  
- **Amount:** USD 203,950.22  
- **Evidence:** Payment `status=reversed`; income `status=completed`, `category=sale_income`, `idempotencyKey=payment:69ba734618ae7e900167c1f5`.  
- **Likely cause:** P4-H02 — ledger reversal after Payment commit failed or GET cleanup never ran.  
- **Historical damage:** YES  
- **Recommended repair (later):** Cancel that income row / run `reverseIncomeFromPayment` for this id.  
- **Migration:** Repair write; no schema migration required.

#### F5A-P0-02 — Reversed sales still have active CompanyAccount commission
- **Severity:** CRITICAL  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `accounting.companyaccounts`  
- **Records:**  
  - `6999a778d0d16f54222e09d0` → commission USD 4,619.05, `isArchived=false`  
  - `69ba734618ae7e900167c1f5` → commission USD 5,248.92, `isArchived=false`  
- **Amount:** USD 9,867.97 still in company income  
- **Evidence:** Direct CompanyAccount transaction `paymentId` match, not archived.  
- **Likely cause:** `syncPaymentReversed` archive path failed or skipped.  
- **Historical damage:** YES  
- **Recommended repair:** Archive those rows and rebuild CompanyAccount totals from remaining active transactions.  
- **Migration:** Data repair.

#### F5A-P0-03 — Reversed sales with agent commission and no penalty
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `agentaccounts`  
- **Records:**  
  - `699c28656d09fb46b6840191` commission USD 2,729.44, no penalty  
  - `69ba734618ae7e900167c1f5` commission USD 5,248.92, no penalty  
- **Amount:** USD 7,978.36  
- **Evidence:** Agent rows `type=commission`, `status=completed`; no `type=penalty` for those paymentIds. Two other reversed sales **did** receive matching penalties.  
- **Likely cause:** P4-H02 / paymentId type mismatch / reverse not invoked. AgentAccount has **no unique/paymentId indexes**.  
- **Historical damage:** YES  
- **Recommended repair:** Post penalty rows (or equivalent) for those two payments.  
- **Migration:** Data repair.

#### F5A-P0-04 — PropertyAccount stored balances ≠ sum of completed transactions
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `accounting.propertyaccounts`  
- **Records:**  
  - `6889d00f0c4f5d6e515904e5` property `68778f56a77a7624d898bde7` rental — stored income 6600 vs calculated 2775 (**+3825**)  
  - `6889d00f0c4f5d6e515904ea` property `6881ecd8a15ae3f0afd218ff` rental — stored income 6600 vs calculated 5325 (**+1275**)  
- **Amount:** USD 5,100 overstated stored `totalIncome` / `runningBalance` / `netOwnerBalance`  
- **Owner name on both ledgers:** Garett Matsilele  
- **Evidence:** Independent recalculation using application filters (`income`+`completed`, exclude `PASS_THROUGH` / cancelled). **Not written back.**  
- **Likely cause:** Crash between `$push` and recalc, stale `$inc`-era totals, or later cancellation without recalc.  
- **Historical damage:** YES  
- **Recommended repair:** Recalc-and-save in a later controlled repair job.  
- **Migration:** No schema change.

#### F5A-P0-05 — Missing PropertyAccount income for completed introduction/rental payments
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `payments` vs `propertyaccounts`  
- **Records (completed, no completed income):**  
  - Rental `687e370b1a13203601cb3d91` amount 4,500  
  - Introduction `68aa547b83f881b6082c56fd`, `68aa5b29592945e431200e99`, `68aa5bba592945e431201038`, `68c2d2646d542abc5fd57c85`  
  - Provisional introduction `68c2c8a3e329519c550c6a09`, `68c2c951e329519c550c6c8a` (controller *should* skip property income; still listed because `recordIncomeFromPayment` itself does not skip provisional — they have **no** income, which matches controller skip)  
- **Amount:** Scanner missing-owner-income total **USD 1,200,825**. Non-provisional subset **USD 720,825** (scanner total minus USD 480,000 provisional).  
- **Evidence:** Completeness-style target lookup found no completed `type=income` for those paymentIds. 121 other payments **are** OK.  
- **Likely cause:** Introduction payments never posted; 27 LedgerEvents still `pending` may include some of these.  
- **Historical damage:** YES (non-provisional)  
- **Recommended repair:** Post via `recordIncomeFromPayment` in a later phase; inspect pending LedgerEvents first.  
- **Migration:** Data repair.

---

### P1 — High priority

#### F5A-P1-01 — Company revenue representations disagree (The Benjamins Realty)
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE (divergence); semantics differ by design for journal  
- **Collection:** `payments`, `companyaccounts`, `companies`, `journalentries`, `companybalances`  
- **Company:** `683403ccf652d8cd543c6932` The Benjamins Realty, USD  

| Representation | Amount (USD) |
|---|---:|
| Payment `commissionDetails.agencyShare` (completed, non-reversal, non-provisional) | 171,304.33 |
| CompanyAccount active income | 179,053.84 |
| `Company.revenue` | 124,963.48 |
| Journal credits to 4001/4002 | 1,181,918.45 |
| CompanyBalance.totalRevenue | 199,740.87 |

- **Evidence:** CompanyAccount is **USD 7,749.51 above** Payment agencyShare (matches leftover reversed commissions ~9,867.97 order of magnitude, not exact). Journal is **gross collections**, not agency share (P4-H03). `Company.revenue` is **below** both.  
- **Do not pick a winner in this phase.**  
- **Historical damage:** YES for CompanyAccount vs Payment and Company.revenue vs Payment. Journal difference is **architectural**.  
- **Repair later:** Align CompanyAccount with Payment after reversing leftover rows; decide whether `Company.revenue` remains a denormalized counter.

#### F5A-P1-02 — Missing agent commissions
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Amount:** USD 1,414.26 across 10 payments (see CSV / scan-raw `parts.agent.missing`)  
- **Evidence:** `agentShare > 0`, completed, not provisional/suspense; no AgentAccount `type=commission` with that `paymentId`.  
- **Likely cause:** P4-H04 (no change-stream agent sync) + GET backfill never opened those agent ledgers. **AgentAccount indexes other than `_id_` are absent.**  
- **Migration:** Backfill from Payment.

#### F5A-P1-03 — Same agent received both split-sale commission lanes
- **Severity:** HIGH  
- **Confidence:** HIGH-CONFIDENCE DATA RISK (confirmed same `agentId`; intent of split is not proven)  
- **Collection:** `agentaccounts`  
- **Records:** 12 payments, agent `68d2804b21344cbef4e24aed`, refs `*-owner` and `*-collaborator` (or `{paymentId}-owner/collaborator`)  
- **Example:** payment `68ff10a2f1a47a84ebee3187` amounts 291 + 291  
- **Evidence:** Two commission rows, same agent, different role suffixes. Schema unique `{agentId, paymentId, type:commission}` **does not exist in the database**, so both lanes inserted.  
- **Likely cause:** P4-C09 / P4-H05 — same user as owner-agent and collaborator; unique index never built.  
- **If those lanes were meant for two people, this is duplicate money on one ledger. If they were meant for one person filling both roles, the AgentAccount is 2× Payment.agentShare.**  
- **Historical damage:** Treat as **confirmed double posting to one agent ledger**; product must confirm split intent.  
- **Extra on ledger if fully duplicative:** USD 2,546.25 (sum of the smaller lane on each pair).

#### F5A-P1-04 — Levy payments missing pass-through collections/payouts
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `levypayments` vs `propertyaccounts.passThroughAccounts`  
- **Records:** 19 missing `levy-payment:{id}:collection`; 2 missing payouts for paid-out levies (29 levy documents total).  
- **Evidence:** Idempotency key / `levyPaymentId` lookup against flattened pass-through arrays. Combined **rent** levy lines (9 payments) **did** post.  
- **Likely cause:** Levy controller catch-and-log; P4-C01/C02 possible but not proven (no duplicate keys).  
- **Pass-through outstanding:** no payout-exceeds-collection rows; **no completed pass-through payouts at all** except the two expected-missing paid-out levies.  
- **Migration:** Backfill collections from LevyPayment.

#### F5A-P1-05 — Reversed sale trust reversals missing
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Collection:** `trusttransactions`  
- **Records:** Four reversed **sale** payments have original TrustTransaction (or sale trust posting expected) without a reversal paymentId trust debit: `6999a778…`, `6999c9e6…`, `699c2865…`, `69ba7346…`  
- **Evidence:** Trust unique `{paymentId}` exists; reversal uses **reversal Payment id**. If reversal payment exists, a second TrustTransaction should exist.  
- **Likely cause:** `payment.reversed` event / trust reverse path not run.  
- **Note:** Unique index is global on `paymentId`; original credit remains. Missing debit means **trust still holds the buyer funds**.  
- **Migration:** Post reversing TrustTransaction with reversal paymentId.

#### F5A-P1-06 — User.balance holds owner income on agent/admin users
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE relative to intended landlord identity  
- **Collection:** `properties`, `users`  
- **Evidence:** 53/56 properties have `ownerId` matching a **User**; **0** match a PropertyOwner `_id`. 23 properties have `ownerId != propertyOwnerId`. Users with `balance ≠ 0`:

| User | Role | balance (USD) |
|---|---|---:|
| Debbie Lee Vico | agent | 22,250 |
| Garett Matsilele | agent | 4,375 |
| Moses Chigwena | admin | 2,040 |
| Muscline Properties | admin | 800 |
| Backsberg Backsberg | admin | 1,200 |
| Samsung Properties | admin | 2,000 |
| **Total** | | **32,665** |

- **Likely cause:** P4-H09 — Payment `$inc User.balance` on `Property.ownerId`.  
- **Historical damage:** YES as a second owner-money store on the wrong entity type. PropertyAccount remains the ledger SSOT for owner net.  
- **Do not zero these balances in 5A.**

#### F5A-P1-07 — Provisional completed payments already have agent commission
- **Severity:** HIGH  
- **Confidence:** CONFIRMED DATA DAMAGE  
- **Records:** `68c2c8a3e329519c550c6a09`, `68c2c951e329519c550c6c8a` amount 240,000 each  
- **Evidence:** `isProvisional=true`, `status=completed`, AgentAccount commission present, Property/Company/Journal/Trust empty.  
- **Likely cause:** Agent sync on create is not gated the same way as property posting, **or** GET backfill ignored provisional. (`syncCommissionForPayment` *does* skip provisional — so these commissions imply a path that did not honour that guard, or `isProvisional` was set **after** commission post.)  
- **Historical damage:** YES  
- **Uncertainty:** Whether provisional flag was added after posting cannot be proven from current documents alone.

---

### P2 — Operational consistency

#### F5A-P2-01 — Journal coverage is sparse (115 payments missing journal)
- **Severity:** MEDIUM  
- **Confidence:** CONFIRMED (coverage gap). Not all of this is “lost money” — journal posts **gross** and was clearly not applied to every historical payment.  
- **Evidence:** 12 OK, 115 MISSING, 30 N/A. `AccountingEventLog` has **0** `payment_sync_failed` rows and **0** indexes besides `_id`.  
- **VAT:** 10 payments expected a VatRecord and lack one; 4 OK.  
- **Repair later:** Optional backfill; do not treat 1.18M journal revenue as reconcilable to agencyShare.

#### F5A-P2-02 — 27 LedgerEvents stuck pending
- **Severity:** MEDIUM  
- **Confidence:** HIGH-CONFIDENCE DATA RISK  
- **Collection:** `ledgerevents`  
- **Evidence:** 86 completed, 27 pending, 0 processing, 0 duplicate open keys, 0 stuck `processing`. Collection indexes: **`_id` only** (schema’s status/paymentId indexes were **never created**).  
- **Likely cause:** P4-H12 processor not claiming, or repeated failure without status update.  
- **Do not complete them in 5A.** They may be the retry queue for missing introduction/rental income.

#### F5A-P2-03 — Index gaps vs schema
Observed **read-only** `listIndexes`:

| Collection | Schema unique intended | Present? |
|---|---|---|
| `propertyaccounts` `{propertyId,ledgerType}` partial | yes | **Yes** |
| `propertyaccounts` `transactions.paymentId` unique | yes | **Yes** |
| `propertyaccounts` `transactions.idempotencyKey` unique | yes | **No** |
| `companyaccounts` `transactions.paymentId` unique | partial `isArchived $ne true` | **Yes, but sparse — not the schema partial** |
| `agentaccounts` commission unique indexes | yes | **No — `_id` only** |
| `ledgerevents` type/paymentId/status | yes | **No — `_id` only** |
| `trusttransactions` paymentId unique partial | yes | **Yes** |
| `payments` companyId+idempotencyKey unique | yes | **Yes** |
| `sync_failures` / `accountingeventlogs` | supporting indexes | **`_id` only** |

#### F5A-P2-04 — Referential orphans
- **78 payments** reference a `tenantId` with no Tenant document (mostly sales; schema requires `tenantId`).  
- **31 payments** reference a `propertyId` that is not a Property, Development, or DevelopmentUnit.  
- **0** PropertyAccounts point at unknown entities.  
- **0** multiple active leases.  
- **0** stale PropertyOwner.properties entries.  
- **Severity:** MEDIUM  
- **Historical damage:** YES for broken joins; not automatically wrong money.

#### F5A-P2-05 — Race indicators (not confirmed historical races)
8 indicators: payments created 17–55ms apart on the same property (typical sale dual-write / installment), plus one pass-through pair 166ms apart on property `69df880c17359b59e4c4f98a` (two different paymentIds — both collections **exist**, so this did **not** lose a row).  
**Label:** evidence / indicators only.

#### F5A-P2-06 — Pending rent cap
One pending rental `69e095cd5c387a0812163d96` period 2026-5 **amount 0**, no other payments that month. **No demonstrated cap collision.** P4-H15 remains code risk.

---

### P3 — Architectural cleanup / code-only

| ID | Phase 4 | This database |
|---|---|---|
| P4-C03 | Unique paymentId vs configured expense | Index present; **no configured expenses exist** — cannot have fired |
| P4-H01 | Reversed + active expense | **0 rows** |
| P4-H06 | Sale dual ledger | **25/25** dual sales have unit **and** development income **equal to `ownerAmount`**. Dual posting is **intact and intentional**. Company-wide sum of all PropertyAccount `totalIncome` **would double-count** those sales. |
| P4-H10 | Mixed currency | **All 157 payments USD.** No mixed-currency rollups. |
| P4-M12 municipal | Code does not post | `municipalpayments` **0 documents** |
| P4-H14 reporting companyId | Code | Not exploited; PropertyAccount still has no `companyId` |

---

## 2–18. Scan parts (condensed evidence)

### Part 1 — Inventory (selected)

**property-management (79 collections):** payments 157, properties 56, leases 27, tenants 25, users 35, companies 19, propertyowners 11, agentaccounts 9, levypayments 29, journalentries 38, journallines 86, trusttransactions 92, trustaccounts 49, ledgerevents 113, accountingeventlogs 38, vatrecords 8, ChargeTypes 45, developmentunits 180, developments 8, municipalpayments 0, sync_failures 0.

**accounting (6 collections):** propertyaccounts 131, companyaccounts 4, invoices 6.

Mongo type: **standalone community server 8.0.9**, not Cosmos.

### Part 2 — Pass-through

- Duplicate pass-through `idempotencyKey`: **0**  
- Duplicate pass-through `paymentId`+type: **0**  
- Rent/combined payments expected LEVY collection: **9/9 OK**  
- Payout > collection: **0**  
- Payout without collection: **0** among nested arrays  
- Levy source documents: **19 missing collections, 2 missing payouts**

### Part 3 — Balances

131 accounts recalculated in memory. **2 mismatches** (F5A-P0-04). Others match within USD 0.015.

### Part 4 — Configured expenses

- Income + configured_expense same paymentId: **0**  
- Completed rental PROPERTY_EXPENSE lines: **0**  
- Reversed + completed configured expense: **0**  
- Unique `transactions.paymentId` index: **present**

### Part 5 — Reversals (5 payments)

| Payment | Type | Income | Company | Agent | Trust reversal |
|---|---|---|---|---|---|
| `6999a778…` | sale | cancelled | **active 4619.05** | commission+penalty | **missing** |
| `6999c9e6…` | sale | cancelled | ok | commission+penalty | **missing** |
| `699c2865…` | sale | cancelled | ok | **commission, no penalty** | **missing** |
| `69ba7346…` | sale | **completed 203950.22** | **active 5248.92** | **commission, no penalty** | **missing** |
| `69dfa1a9…` | rental | none found | none | none | n/a |

Rental reversal looks clean on property/company/agent (or never posted).

### Part 6 — Company revenue

See F5A-P1-01. Smaller companies: Pam Golding / Pakanaka Matore match Payment vs CompanyAccount but `Company.revenue=0`. Croco Motors matches all three at 139.68. Three companies have journal/CompanyBalance 800/1200/2000 with **zero** agencyShare — journal-only / workspace seed, not payment commission.

### Part 7 — Agent commission

Missing 10 (USD 1,414.26). “Duplicates” 12 are split lanes on one agent (F5A-P1-03). No VersionError logs were scanned (combined.log was not parsed as a structured agent VersionError corpus in this pass — **logs not used as proof**).

### Part 8 — Provisional

2 completed provisional payments; property income **not** posted (good vs controller); agent commission **was** posted (bad vs `syncCommissionForPayment` guard).

### Part 9 — Pending

2 pending payments; 1 rental with amount 0. No cap collision.

### Part 10 — Sale dual ledger

25 completed sales with both developmentId and unitId: **unit amount = development amount = ownerAmount** in every case. Dual posting is consistent. Any report that **sums all company PropertyAccounts** will count those 25 sales twice. That is a **reporting** risk, not missing/extra rows on a single ledger.

### Part 11 — LedgerEvent

113 events; 27 pending; no overlapping open duplicates; no unique enqueue index.

### Part 12 — Journal / AccountingEventLog

0 failed-sync log rows. 0 duplicate `(sourceModule, sourceId)` journals. Sparse posting coverage (F5A-P2-01).

### Part 13 — Owner identity

See F5A-P1-06. `ownerId != propertyOwnerId` on 23 properties is **expected** given the two-field model, not a scan error.

### Part 14 — Currency

USD only. Mixed-currency rollup **not evidenced**.

### Part 15 — Reporting isolation

Not queried via HTTP. Code still loads PropertyAccount by `propertyId` without `companyId` (P4-H14). **Not exploited.** Accountant GET mutates (Phase 4); this scan did **not** call GET.

### Part 16 — Referential

See F5A-P2-04.

### Part 17 — Municipal / levy

Municipal: empty collection; code risk only. Levy: F5A-P1-04.

### Part 18 — Cross-ledger matrix

Full matrix: `PHASE_5A_PAYMENT_RECONCILIATION.csv` (157 rows).

| Artifact | OK | MISSING | DUPLICATE | CONTRADICTORY | N/A |
|---|---:|---:|---:|---:|---:|
| Property income | 121 | 7 | 0 | 1 | 28 |
| Configured expense | 0 | 0 | 0 | 0 | 157 |
| Pass-through (from Payment lines) | 9 | 0 | 0 | 0 | 148 |
| Company commission | 115 | 4 | 0 | 0 | 38 |
| Agent commission | 94 | 6 | 12 | 0 | 45 |
| Journal | 12 | 115 | 0 | 0 | 30 |
| Trust | 63 | 0 | 0 | 0 | 94 |
| VAT | 4 | 10 | 0 | 0 | 143 |

`NOT_APPLICABLE` means application rules do not require that artifact (reversal row, zero share, non-sale for trust, no VAT, sale has no charge-line pass-through, etc.).

The 1 CONTRADICTORY property cell is reversed sale `69ba7346…` (income still completed).

---

## 19. Historical damage assessment

### CONFIRMED DATA DAMAGE
- Reversed sale with live owner income (USD 203,950.22)  
- Reversed sales with live company commission (USD 9,867.97)  
- Reversed sales with unpenalized agent commission (USD 7,978.36)  
- Missing trust reversal on 4 reversed sales  
- Stored PropertyAccount totals ≠ transactions (USD 5,100)  
- Missing property income on non-provisional introduction/rental payments  
- Missing agent commissions (USD 1,414.26)  
- Split-sale double lane on one AgentAccount (USD 2,546.25 extra if both lanes are the same person)  
- 19 levy collections not on pass-through  
- Company.revenue / CompanyAccount / Payment agencyShare disagree for Benjamins Realty  
- User.balance on agent/admin users (USD 32,665)  
- 2 provisional payments with agent commission  

### HIGH-CONFIDENCE DATA RISK
- 27 pending LedgerEvents (possible unposted income queue)  
- Missing AgentAccount / LedgerEvent / idempotencyKey indexes  
- Race-time clustered writes (no proven lost row)  
- 31 payments with unknown propertyId; 78 missing tenants  
- Journal/VAT coverage gaps  
- CompanyAccount USD 7,749.51 above Payment agencyShare (partially explained by unarchived reversals)

### CODE RISK ONLY (no damage in this snapshot)
- P4-C03 configured-expense unique-index conflict  
- P4-H01 unreversed configured expense  
- P4-H10 mixed-currency sums  
- Municipal pass-through  
- Reporting companyId IDOR (not tested against live HTTP)

### INFORMATIONAL
- Sale dual-ledger posting is complete and equal  
- Rent+levy combined pass-through is complete (9/9)  
- Trust present for required completed sales (63 OK, 0 missing)  
- No pass-through idempotencyKey duplicates  
- USD-only book  

---

## Financial Exposure Summary

**Currency: USD only. ZWL is not present. USD and ZWL were not added together.**

| Bucket | USD | Notes |
|---|---:|---|
| Missing owner income (scanner) | 1,200,825 | Includes 480,000 provisional introduction |
| Missing owner income excluding those 2 provisionals | 720,825 | Prefer this for “should have posted” |
| Duplicated owner income (same ledger) | 0 | No duplicate income paymentIds found |
| Unreversed configured expenses | 0 | None in dataset |
| Missing pass-through from **Payment** lines | 0 | 9/9 OK |
| Missing pass-through from **LevyPayment** | Not summed here as Payment.ownerAmount | 19 levies; amounts on levy docs (see scan-raw `parts.levy.gaps`) |
| Duplicated pass-through | 0 | |
| Incorrect company commission (CA − Payment, Benjamins) | +7,749.51 | CompanyAccount higher; leftover reversals contribute |
| `Company.revenue` vs Payment agencyShare (Benjamins) | −46,340.85 | Denormalized counter low |
| Journal 4001/4002 vs agencyShare | +1,010,614 | **Different semantics (gross vs commission) — not loss** |
| Missing agent commission | 1,414.26 | |
| Extra agent split-lane on one agent | 2,546.25 | If duplicate; confirm product intent |
| Reversed-but-active owner income | 203,950.22 | Single sale |
| Reversed-but-active company commission | 9,867.97 | |
| Reversed-but-unpenalized agent commission | 7,978.36 | |
| Overstated stored property runningBalance vs txs | 5,100 | Cached totals only |
| User.balance on agent/admin | 32,665 | Parallel store, wrong entity type |

**Not quantifiable from available data:** exact levy missing-collection dollars (gaps listed by levyId in scan-raw; not rolled into Payment agency/owner amounts); whether pending LedgerEvents would fully restore missing introduction income; remote Cosmos production (not connected).

---

## Database Integrity Score

**Score: 32 / 100**

Methodology (automated, documented in scanner):

- Start at 100  
- − up to 24 for reversed-payment leftovers  
- − up to 16 for balance mismatches (2 × 2 = 4 used)  
- − up to 20 for missing required artifacts  
- − up to 12 for duplicates  
- − up to 8 for provisional accounting posts  
- Floor 0  

This score **over-punishes** journal non-coverage (architectural) and **correctly punishes** the reversed sale that is still live on the property ledger.

A **ledger-focused** reading (ignore journal/VAT coverage): the books are usable for most completed rentals and dual sales, with **concentrated** damage on reversals, introduction posting, levy pass-through, agent indexes, and cached balances.

---

## Recommended Phase 5B repair order (do not execute now)

1. Isolate payment `69ba7346…` and reverse/cancel leftover property income, company commission, agent commission, trust debit.  
2. Archive remaining reversed company commissions; rebuild CompanyAccount totals.  
3. Recalculate the two Garett Matsilele rental accounts from transactions.  
4. Drain/inspect 27 pending LedgerEvents, then post missing introduction/rental income.  
5. Backfill levy pass-through collections.  
6. Backfill missing agent commissions; decide split-lane same-agent policy; **then** create AgentAccount unique indexes.  
7. Stop using `User.balance` as owner income (code + optional freeze).  
8. Align `Company.revenue` or stop displaying it.

---

## Files produced

| File | Role |
|---|---|
| `audit-output/phase-5a/PHASE_5A_DATABASE_INTEGRITY_REPORT.md` | This report |
| `audit-output/phase-5a/PHASE_5A_PAYMENT_RECONCILIATION.csv` | 157-payment artifact matrix |
| `audit-output/phase-5a/PHASE_5A_FINDINGS.csv` | Automated finding rows |
| `audit-output/phase-5a/scan-raw.json` | Full machine-readable snapshot |
| `audit-output/phase-5a/run-readonly-scan.js` | Re-runnable read-only scanner (not application source) |

---

## Final safety check

1. **Application source code modified:** NO (`server/src` untouched).  
2. **Database records inserted/updated/deleted/archived/cancelled/reversed:** NO.  
3. **Indexes created or modified:** NO (`indexes()` read only).  
4. **Migrations run:** NO.  
5. **Reconciliation/posting/recalc-with-save invoked:** NO.  
6. **Database operations:** `listCollections`, `indexes`, `countDocuments`, `find`.  
7. **Start / end:** 2026-08-31T12:27:40.635Z / 2026-08-31T12:27:43.366Z.  
8. **Database/environment:** local standalone MongoDB 8.0.9, dbs `property-management` + `accounting`, host `localhost:27017`.  
9. **Checks not performed:** remote Cosmos/production cluster (no URI); HTTP reporting IDOR exploit test; levy amount rollup into exposure table; combined.log VersionError mining.  
10. **Uncertainty:** whether this local dataset is a copy of cloud production; whether same-agent split lanes are commercially intended; whether provisional flags were set after agent commission posted; exact mapping of 27 pending LedgerEvents to the 7 missing-income payments.

**No repairs were applied.**  
**SCAN FIRST. REPAIR LATER.**
