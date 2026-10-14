# MANTIS Financial Forensic Audit

Phase 1 of the production-readiness programme. Audit only. No ledger code, no index, and no historical repair was changed to produce this document.

Companion documents:

- `MANTIS_FINANCIAL_WRITE_PATH_MAP.md`
- `MANTIS_ACCOUNTING_ROOT_CAUSE_MATRIX.md`
- `MANTIS_SALES_FINANCIAL_PATH_AUDIT.md`

Evidence base: workspace source on 7 October 2026, git history (203 commits, not shallow, HEAD `8070b217` *Vat on Commission and Reports*), and the uncommitted diff in `accountingPostingPolicy.ts`, `paymentAccountingOrchestrator.ts`, and `propertyAccountService.ts`. Production records were not opened. Failures are traced as anonymised scenarios against this code.

## Scope

| Failure | Question answered |
| --- | --- |
| A | Why a rental receipt can exist while owner income does not |
| B | Why two property accounts can exist for one property |
| C | Why a transaction can land on the wrong book |
| D | Why rental activity can show in sales records and the reverse |

Also mapped: payment create, rental and sales posting, owner income, property-account creation, ledger selection, account lookup, transaction classification, and the fixes already in the tree.

## How money is supposed to move

```text
PAYMENT
  → postPaymentAccounting
  → PropertyAccount owner income (projection)
  → AgentAccount and CompanyAccount commission (projections)
  → JournalEntry (company GL)
  → reports
```

Owner income is not the company journal. The journal records agency cash and owner payable. The figure an owner statement shows is a completed income row on `PropertyAccount`, excluding pass-through. That string is `OWNER_INCOME_SOURCE_OF_TRUTH` in `accountingPostingPolicy.ts`.

Tax attachment runs after posting and is not the source of the owner balance.

## Failure A — rental recorded, owner income missing

The healthy path is real and narrow. `createPayment`, `createPaymentAccountant`, and `createAgentPayment` save a completed `Payment`, then `ensurePaymentAccountingPosted` calls `recordIncomeFromPayment`, which pushes `rental_income` for `max(0, ownerAmount - passThroughTotal)` onto the single active rental `PropertyAccount`.

The symptom "payment exists, owner income does not" is produced by every one of the following. They were confirmed in code. They are not alternatives guessed from the symptom.

### A1. Combined rent and deposit was classified as deposit-only

`amount` is the rent portion. `depositAmount` is the deposit. Commit `8070b217` still contains:

```text
isDepositOnlyPayment: deposit > 0 && amount <= deposit
```

A receipt of rent 500 and deposit 500 takes the deposit-only branch. `postPaymentAccounting` returns `skipped` and does not call `recordIncomeFromPayment`. The payment remains `completed`. This predicate was introduced in `959988a5` and kept when posting moved into the policy module.

The workspace copy of the same function is uncommitted and reads `deposit > 0 && amount <= 0`. Under that rule the same receipt posts owner income. Any environment running `8070b217` still drops combined receipts.

Historical receipts already skipped were not rewritten. That is required. They will stay missing until a controlled correction.

### A2. The receipt is committed before accounting, and failure does not undo it

`ensurePaymentAccountingPosted` documents that an incomplete projection leaves the payment saved and `accountingComplete` false. The orchestrator catches an owner-income exception, sets artifact `failed`, optionally enqueues a ledger event, and continues with commission and the journal. HTTP create still succeeds. A change-stream failure is logged. A webhook ensure failure is logged and the webhook can still be accepted.

So "recorded" means `Payment.status === 'completed'`. It does not mean owner income exists.

### A3. Owner amount computes to zero and the write returns

If `commissionDetails.ownerAmount` is absent, or rental pass-through is greater than or equal to that amount, the function logs and continues. It does not throw. If any pass-through or configured expense was written, the payment is not put in suspense. The statement, which ignores pass-through when it sums owner income, shows nothing.

### A4. Duplicate accounts abort the write

`getOrCreatePropertyAccount` throws 409 when more than one active account matches `(propertyId, ledgerType)`. That exception fails the owner-income artifact. The payment stays completed. Failure B is therefore a live cause of Failure A.

### A5. Income was archived with the duplicate

`archiveDuplicateActiveLedgers` sets `isArchived: true` on the extra documents and does not move `transactions`. Reporting `getAccount` loads `isArchived != true`. The receipt is still on a document. The owner statement does not read that document.

### A6. The report picks the other ledger

`getAccount` is `findOne` sorted by `updatedAt`, with no `ledgerType` filter. Income written to the rental account is invisible when the newer sale account is the one returned.

### A7. Policy skips that are intentional

Provisional, suspense, status other than completed, reversal rows, and true deposit-only (`amount <= 0`) do not post owner income. A provisional receipt that was never finalized is a missing figure by design. A receipt flipped to suspense because its property id does not resolve (A8) then stays skipped forever, because suspense denies the policy.

### A8. Sale and some rental targets do not resolve

`createSalesPaymentAccountant` stores `new ObjectId()` when no property id is sent. The resolver cannot find a property, development, or unit. The payment is marked suspense. Owner income is absent. The same loop treats a 404 or an unknown `rentalType` on a target as non-fatal and moves on.

### Ruled out for A

Payment method does not choose a second owner-income writer. Paynow billing does not write `PropertyAccount`. Ecosystem payment verify does not create a `Payment`. The frontend does not send `ledgerId`.

## Failure B — duplicate property accounts

One creator: `getOrCreatePropertyAccount`. Lookup key: `propertyId` + `ledgerType` + not archived + active. `ownerId` and `companyId` are not part of the key. `PropertyAccount` has no `companyId` field.

The schema declares a partial unique index on `(propertyId, ledgerType)` for `isArchived: false`. It is not applied on ordinary startup.

| Mechanism | Effect |
| --- | --- |
| `accountingConnection` `autoIndex: false` | Mongoose will not build the index |
| `models/indexes.ts` | Does not include `PropertyAccount` |
| `ALLOW_ACCOUNTING_INDEX_MIGRATION` | Index creation and the one-time cleanup run only when this is `true` |
| Find-then-insert | Two concurrent callers both see zero rows and both insert when the unique index is absent |
| Duplicate-key reload | Works only after the unique index exists |
| One-time cleanup | Archives extras, keeps the newest by `lastUpdated`, does not merge lines, then marks `property_account_duplicate_cleanup_v1` complete |
| 409 | After duplicates exist, later writes refuse rather than pick |

Rental and sale accounts for the same property are allowed. They are different keys. Counting them as duplicates would be wrong.

Lease create does not create accounts. Property create, property update, payment post, pass-through, expenses, payouts, opening balances, development backfill, and sales migration all call `getOrCreate`.

`CompanyAccount` has the same find-then-insert shape and no unique index on `companyId`. That is a separate duplicate risk for agency commission, not for the property statement.

A unique index must not be added until duplicate groups are listed and a merge-before-archive migration exists. The current index helper's reaction to duplicate keys is to archive without merging, which recreates Failure A.

## Failure C — wrong ledger

Classification is not one decision.

| Book | Decision |
| --- | --- |
| Owner `PropertyAccount.ledgerType` | Current `Property.rentalType`, or `sale` for a development/unit id |
| Income category | Sale if the resolved ledger is sale or `payment.paymentType` is `sale` |
| Company commission source | `payment.paymentType` |
| GL `sourceModule` and journal shape | `payment.paymentType`, defaulting to rental when blank |
| Trust | Whoever emits `payment.confirmed` |
| Webhook | `Property.rentalType` only |

`propertyUse`, including `Both`, is not an input. Asset type (house, commercial) is not an input. Lease id is not an input. Client `ledgerId` does not exist.

Guarded creates (accountant and agent rental forms) reject a supplied `paymentType` that disagrees with the resolved ledger. `createSalesPaymentAccountant` does not. It always saves `sale`.

`recordIncomeFromPayment` throws when sale-vs-rental disagrees, then the orchestrator still posts company commission and the journal from `paymentType`. The owner book and the company book can disagree on the same receipt. The payment looks posted.

`introduction` skips that throw. If the property's current `rentalType` is `sale`, the introduction receipt is written as sale income.

Reversal uses the same current-property resolution. A property switched from management to sale after the original post will not find the original rental line by looking only at the sale account.

## Failure D — rental and sales cross-posted

A property may legitimately move between rental and sale. Historical transactions must keep the domain they were posted under. The code allows two ledgers per property and then re-derives the live ledger from today's `rentalType`, which is the conflict.

Proven cross paths:

1. Rental into trust (sales holding). `emitPaymentConfirmedIfNeeded` runs from rental create, accountant create, status update, and finalize. `postBuyerPaymentToTrust` posts any completed, non-provisional payment and will create the trust account. `shouldPostTrust` is never consulted there. Trust reversal does check `paymentType === 'sale'`, so the forward path is the hole.

2. Sale payment into sales company/GL while the property is rental. Owner income is rejected. `postCompanyCommission` still writes `sales_commission`. `syncPaymentReceived` still uses `sourceModule: 'sale'`.

3. Introduction into the sale owner ledger after `rentalType` becomes `sale`.

4. `migrateSalesLedgerForCompany` writes onto whatever `getOrCreatePropertyAccount` resolves now. A property that is still `management` receives `sale_income` on the rental ledger. This path is still invoked by the `sync_property_accounts` maintenance job.

5. Reports show whichever account was updated last, so each domain's lines can appear in the other domain's screen.

Owner-income rental/sale mismatch on the live writer is blocked for ordinary `rental` and `sale` types. That block is real. It does not cover trust, company, GL, introduction, migration, or the report query.

## Prior fixes

| Change | Commit or tree | Verdict |
| --- | --- | --- |
| Single orchestrator and posting policy | `8070b217`, plus workspace edits | Valid structure. Competing writers remain: change stream, levy controller, manual journals, trust event, maintenance backfill. |
| Deposit-only means no rent cash | Workspace only, uncommitted | Valid for new combined receipts. Committed HEAD still has the defect. |
| `amount <= deposit` treated as deposit-only | `959988a5`, still in `8070b217` | This is a cause, not a fix. |
| Refuse ambiguous active accounts | `e17c3061` | Valid fail-closed behaviour. Causes missing income until someone merges. |
| Partial unique index and archive-duplicates | `8d4fb274`, `b28e37af`, gated by env | Partial. Unsafe to enable while duplicates exist, because archive does not merge. |
| Ledger merge API | `099da38b` | Valid manual tool. |
| Payment type must match `rentalType` on owner post | `e17c3061` | Valid for that writer. Introduction exempt. Company, journal, and trust do not use it. |
| Webhook classifies only from `rentalType` | Current `paymentWebhookController` | Valid. Unknown is rejected. |
| `accountingComplete` flag | Current reconciliation module | Valid detection. Status `completed` still means "recorded" in the payment UI. |
| Idempotency on income lines | Current `recordIncomeFromPayment` | Valid against a second line on the same account. |
| Startup does not run ledger maintenance | Current `index` boot, asserted by Phase 2d script | Valid. |
| Historical sync job | `maintenanceJobQueueService` `sync_property_accounts` | Still a financial writer, including `migrateSalesLedgerForCompany`. |

No commit message is titled "missing owner income" or "wrong ledger". The behaviour lives in `e17c3061` (*Mantis v3.0*) and `8070b217`.

## Anonymised cases traced

| Id | Story | Trace |
| --- | --- | --- |
| REAL-001 | Rent receipt, no deposit, owner amount set, one rental account | Income row is written. This path is intact. |
| REAL-001b | Same receipt, two active rental accounts | 409, payment stays completed, statement unchanged. |
| REAL-002 | Two requests create the account together, unique index absent | Two documents. Later payments hit REAL-001b. |
| REAL-003 | Ordinary completed rent | Trust event posts buyer funds and can open a trust account. |
| REAL-004 | Sales form against a rental property | Sale company and GL rows; owner income rejected. |
| REAL-005 | Income left on an archived duplicate | Statement query skips it. |
| REAL-006 | Rent amount equal to deposit amount | Missing owner income on `8070b217`. Posted in the workspace policy. |
| REAL-007 | Sales receipt with no property selected | Random property id, suspense, no owner income. |
| REAL-008 | Introduction receipt, property now marked sale | Written to the sale ledger. |
| REAL-009 | Completed rent, owner amount zero | No income row, no error. |

Automated tests for REAL-001 through REAL-009 are not added in this phase. Phase 1 does not change runtime behaviour. Phase 2 is the phase that turns each confirmed failure into a permanent regression.

## Existing detection, already built

These surfaces already exist and should be extended in a later phase rather than replaced:

- `accountingComplete` / `accountingStatus` on `Payment`
- Accountant accounting integrity page
- Financial controls page
- Explicit repair route `repairPaymentAccounting`
- Property-account merge route
- Phase scripts `runPhase2aSafetyTests`, `runPhase2bCompletenessTests`, `runPhase5bAccountingTests` (committed) and further phase scripts present in the workspace

Detection is not correction. None of these paths may silently rewrite historical journals.

## PHASE 1 STATUS

```text
PHASE 1 STATUS
ROOT CAUSES IDENTIFIED:
  A1 Combined rent+deposit skipped by committed deposit rule (amount <= deposit).
  A2 Completed payment is not rolled back when owner-income posting fails.
  A3 Zero computed owner amount skips the income row without an error.
  A4 Duplicate active property accounts fail the income write with 409.
  A5 Duplicate cleanup archives income out of the statement query.
  A6 Reports load one account and ignore ledger type.
  B  Property-account uniqueness is declared and not enforced unless a gated migration runs; create is find-then-insert.
  C  Owner ledger uses current Property.rentalType; company and GL use Payment.paymentType; they can diverge. Sales create does not check the property.
  D1 Rental completion emits payment.confirmed and trust posting does not require a sale.
  D2 Introduction skips the rental/sale mismatch check.
  D3 Sales-ledger migration follows current rentalType, so sale income can be written onto a rental account.
  D4 A property may hold both ledgers over its life; that is valid. Re-resolving history against today's rentalType is the defect.

UNKNOWN ROOT CAUSES:
  Whether the deployed database has the partial unique index (depends on ALLOW_ACCOUNTING_INDEX_MIGRATION and on whether duplicates blocked creation).
  Whether the running deployment is commit 8070b217 or this workspace. The combined-payment outcome depends on that.
  Counts of live duplicate groups and of completed rentals with accountingComplete false. Not measured; production data was not opened.
  Which historical receipts failed via A1 versus A3 versus A4 versus A5. The code can produce all four; the share of each needs a read-only integrity query in a later phase.

EXISTING FIXES THAT ARE VALID:
  Central postPaymentAccounting and evaluatePermanentAccountingPolicy.
  Workspace deposit-only rule (amount <= 0 with deposit > 0).
  Owner-income mismatch throw for rental versus sale, webhook classification from rentalType, unknown rejected.
  409 when several active accounts share a key.
  Idempotent income key payment:{paymentId}.
  accountingComplete stored separately from payment status.
  Startup ledger maintenance disabled.
  Sale commission completeness check before sales insert.
  Trust reversal limited to sale payments.

FIXES THAT ARE INSUFFICIENT:
  Committed deposit rule amount <= deposit.
  Unique index left opt-in, with archive-without-merge on conflict.
  skipTrust not applied by the trust writer.
  Sales create without a property-domain check, and with generated property and tenant ids.
  Introduction exemption on the mismatch check.
  Partial orchestrator success leaving status completed.
  Journal failure not enqueued for retry.
  Report query without ledgerType.
  sync_property_accounts still calling recordIncomeFromPayment and migrateSalesLedgerForCompany.

STRUCTURAL CHANGES REQUIRED:
  One transaction domain, stored with the payment, used by owner ledger, company source, journal, and trust.
  Contradiction returns a classification conflict and posts no artifact.
  Property-account identity enforced by the database only after a non-destructive duplicate reconciliation.
  Completed rental with a positive rent portion must not present as accounted when owner income is absent.
  Trust receipts only for sales, matching the reversal rule.
  Reports select ledgerType.
  No automatic replay of historical payments.

NO-CHANGE AREAS:
  Accounting engine, tax engine, lease engine, and authentication architecture.
  Historical journal amounts, tax snapshots, and payment rows. No silent repair.
  Canonical direction payment → orchestrator → property account / journal → reports.
  True deposit-only receipts (no rent cash) staying off owner income.
  Ecosystem verify and notifications staying off the financial write path.
  Rental and sale as two legitimate ledgers for one property over time.
  Fail-closed 409 while duplicates still exist.
```

Phase 2 has not been started.
