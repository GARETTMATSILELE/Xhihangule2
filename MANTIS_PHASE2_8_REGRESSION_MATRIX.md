# MANTIS Phase 2.8 Regression Matrix

Development MongoDB only. Disposable companies were removed after the run. Historical financial documents were not modified.

| ID | Scenario | Expected | Actual | Result | Risk |
| --- | --- | --- | --- | --- | --- |
| P28-001 | Duplicate cleanup caller audit | No automatic financial mutation | Reversal, scheduled maintenance, and startup do not call cleanup. Mutation runs only for `SAFE_IDENTICAL` | PASS | Contained |
| P28-002 | Safe duplicate | Controlled remediation | Classifier `SAFE_IDENTICAL`. Confirmed endpoint cancelled 1 identical copy and kept 1 completed income row | PASS | None |
| P28-003 | Ambiguous duplicate | Preserved | Classifier `REQUIRES_REVIEW`. Removed 0. Different-amount row stayed completed | PASS | None |
| P28-003b | Different ledger | Not an automatic duplicate | `NOT_A_DUPLICATE_FOR_AUTOMATIC_CLEANUP`. No ids cancelled | PASS | None |
| P28-004 | Reversal + duplicate cleanup | No interference | Classifier `NOT_DUPLICATE`. Confirmed reconcile removed 0. Original income stayed completed | PASS | None |
| P28-005 | Tax counter-obligation | Equal/opposite | Original VAT 15.50. One counter 15.50 linked by `reversalOf` | PASS | None |
| P28-006 | Historical tax amount | Preserved | Original amount 15.50, period, and type unchanged after reversal | PASS | None |
| P28-007 | Tax configuration change | No recalculation | New 5% rate added after posting. Counter stayed 15.50 at rate 0.155 | PASS | None |
| P28-008 | Tax failure/retry | One counter | Seam left `reversal_incomplete` and 0 counters. Retry created 1 counter and `reversed`. Second retry stayed at 1 | PASS | None |
| P28-009 | Stale reversal lock | Safe recovery | Crash after lock: HTTP 500, no reversal payment. Lock aged past 60s. Retry created exactly 1 reversal | PASS | None |
| P28-010 | Existing reversal payment | Reused | Link cleared and state set in progress. Retry restored the same reversal id. Count stayed 1 | PASS | None |
| P28-011 | Concurrent reversal | One effective reversal | 10 requests, statuses 200/409 only. 1 reversal payment, 1 company counter, 1 owner counter | PASS | None |
| P28-012 | Complete reversal | All artifacts complete | `reversed` with owner counter, company counter, reversal journal, and tax counter | PASS | None |

## Phase 2.7 checks included in the same run

| ID | Scenario | Expected | Actual | Result | Risk |
| --- | --- | --- | --- | --- | --- |
| P27-double | Second reversal | Same reversal, no second document | HTTP 200, same reversal id, 1 negative document | PASS | None |
| P27-amount | Posted commission after rate change | Counter equals posted amount | Posted 38.80, counter -38.80 after commission was changed to 40% | PASS | None |
| P27-sale | Sale reversal | Domain SALE, trust credit and debit, company counter | State reversed, original completed, 1 trust credit, 1 trust debit, company counter present | PASS | None |
| P27-intro | Introduction reversal | Domain RENTAL, owner counter, no trust | State reversed, trust count 0, owner reversal line present | PASS | None |
| P27-report | Fully reversed statement | Original and reversal both visible, net 0 | Owner statement net 0 across 2 rows | PASS | None |

## Phase 2.6 corruption paths

| ID | Expected on the current API | Actual | Result |
| --- | --- | --- | --- |
| REAL-CORRUPTION-001 | One rental account under concurrent payments | 10 payments, 1 rental account | PASS |
| REAL-CORRUPTION-002 | Rental domain, no buyer trust | Domain RENTAL, trust 0 | PASS |
| REAL-CORRUPTION-003 | Sale domain, sale ledger, one trust receipt | Domain SALE, trust 1 | PASS |
| REAL-CORRUPTION-004 | Rental income stays on the rental ledger | Ledger rental | PASS |
| REAL-CORRUPTION-005 | Reversal follows the stored domain | Domain remained RENTAL after the property was changed to sale | PASS |
| REAL-CORRUPTION-006 | 100% commission does not invent owner income | Completed, accounting incomplete, owner amount 0 | PASS |
| REAL-CORRUPTION-007 | Introduction is RENTAL, one-month commission, no trust | Owner 600, HTTP 201, no trust | PASS |
| REAL-CORRUPTION-008 | Company source follows domain | Rental source `rental_commission`; sale source `sales_commission` | PASS |
| REAL-CORRUPTION-009 | Journal failure stays incomplete, retry posts once | Journal 0 then 1, repair HTTP 200, accounting complete | PASS |
| REAL-CORRUPTION-010 | Company reversal is a counter-posting | State reversed, positive line kept, negative counter added, not archived | PASS |
| REAL-CORRUPTION-011 | Sync does not replay history | HTTP 200, `historicalBackfill` false | PASS |
| REAL-CORRUPTION-012 | Statements require a ledger | Rental 200, sale 200, missing ledger 400 `LEDGER_REQUIRED` | PASS |
| REAL-CORRUPTION-013 | Webhook without an actor does not post | HTTP 400 `WEBHOOK_ACTOR_REQUIRED`, no payment saved | PASS |
| REAL-CORRUPTION-014 | Sale without property context is rejected | HTTP 400 `SALE_CONTEXT_REQUIRED` | PASS |
| REAL-CORRUPTION-015 | Cross-domain create is rejected | Rental on sale property 400; sale on rental property 409 | PASS |
| REAL-CORRUPTION-016 | Rent plus deposit posts income; deposit-only does not | Combined income 1, deposit-only income 0 | PASS |
| REAL-CORRUPTION-017 | Completeness is not forced | Healthy rental complete; zero-owner rental incomplete | PASS |

## Phase 2 regression suites

| Suite | Result |
| --- | --- |
| Phase 2 financial hardening | PASS |
| Phase 2B completeness | PASS |
| Phase 2C accounting integrity | PASS |
| Phase 2D write-path lockdown | PASS |
| Phase 3D legacy cleanup guards | PASS |
| Phase 2.1 startup lockdown | PASS |
| Phase 5B accounting | PASS |

## Build

| Check | Result |
| --- | --- |
| Server TypeScript | PASS |
| Client production build | PASS |
