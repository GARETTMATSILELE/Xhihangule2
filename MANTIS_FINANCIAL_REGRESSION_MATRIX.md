# Financial regression matrix

Phase 2 scenarios traced to automated checks in `server/src/scripts/runPhase2FinancialHardeningTests.ts` and `runPhase2bCompletenessTests.ts`. These tests do not use a database. Concurrent inserts against MongoDB were not executed, because the production unique index is intentionally not enabled and no database was available for a load test.

| Id | Expectation | Where it is checked |
| --- | --- | --- |
| REAL-001 | Management property plus rental payment resolves to `RENTAL` and owner income uses `ownerAmount` | Hardening test |
| REAL-001b | Two active rental accounts with split income are `CONFLICTING_HISTORY` and are not auto-merged | `classifyDuplicateGroup` |
| REAL-002 | Duplicate-key race with one reloaded account is `use_existing`; two is `ambiguous`. Index migration does not archive | `resolveDuplicateKeyRace` and source check |
| REAL-003 | Rental, including introduction, is not sale trust. Trust writer returns `not_sale_domain` | `mayPostSaleTrust` and trust service source |
| REAL-004 | Sale payment against a management property throws `ACCOUNTING_CLASSIFICATION_CONFLICT` before save | `resolveCreateTransactionDomain` |
| REAL-005 | Archived income is a reconciliation case. Reports do not load an account without an explicit ledger, so an archived duplicate is not silently substituted | Reporting source check. Balance verification needs the live inventory |
| REAL-006 | Rent 500 and deposit 500 is not deposit-only | `isDepositOnlyPayment` |
| REAL-007 | Sale with no property, development, or unit throws `SALE_CONTEXT_REQUIRED`. Sales create does not mint ids | Domain resolver and payment controller source |
| REAL-008 | Owner amount 0 is not written as income. The poster throws `OWNER_INCOME_AMOUNT_MISSING` | `computeOwnerIncomeAmount` and source check |
| REAL-009 | Stored `RENTAL` stays `RENTAL` for journal classification even if payment type is later read as sale | `journalPaymentType` |
| REAL-010 | Stored `SALE` stays `SALE` | `journalPaymentType` |
| REAL-011 | Reversal copies `historicalTransactionDomain` from the original payment | Payment controller source (`historicalTransactionDomain(lockedOriginal)`) |
| REAL-012 | Same copy for a sale original | Same |
| REAL-013 | Owner statement API requires `ledger=rental` or `ledger=sale`. Property account lookup filters `ledgerType`. `getPropertyAccount` uses the requested ledger and does not reject it because today's `rentalType` differs. Accountant and admin lists open `?ledger=` from the account row | Reporting API, read model, property account service, list pages |
| REAL-014 | Company commission uses `journalPaymentType`, so a stored rental domain cannot become `sales_commission` | `accountingIntegrationService` |
| REAL-015 | Journal `sourceModule` uses the same helper | `accountingIntegrationService` |
| REAL-016 | Webhook stores `transactionDomain` from the classified payment type and emits trust only when `mayPostSaleTrust` | Webhook controller |
| REAL-017 | Change stream still calls `postPaymentAccounting`, which reads the stored domain | Existing change-stream path |
| REAL-018 | Owner-income ledger retry calls `postPaymentAccounting` | `ledgerEventService` |
| REAL-019 | Journal failure enqueues a `journal` ledger event that calls only `syncPaymentReceived` | Orchestrator and ledger event service |
| REAL-020 | Missing owner amount records an exception and does not enqueue a retry | Orchestrator `isPermanentAccountingFailure` |

Golden figures checked in the same script:

| Case | Result |
| --- | --- |
| Rent with owner amount 850 | Owner income 850, not deposit-only |
| Rent and an equal deposit | Not deposit-only |
| Deposit with zero rent | Deposit-only |
| Sale owner amount 90000 with pass-through 500 | Owner income 90000 (pass-through is not subtracted on a sale) |

Ten-way concurrent HTTP tests were not run. The race handler is covered. A database concurrency run belongs with the index, after the inventory.
