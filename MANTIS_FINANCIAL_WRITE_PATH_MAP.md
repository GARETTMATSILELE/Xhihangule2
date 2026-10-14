# MANTIS Financial Write-Path Map

Phase 1 forensic map of the current workspace source. This document records paths. It does not change them.

Commit inspected: `8070b217` (`Vat on Commission and Reports`).
Workspace differs from that commit in `accountingPostingPolicy.ts`, `paymentAccountingOrchestrator.ts`, and `propertyAccountService.ts`. Where the difference changes a financial outcome, both behaviours are named.

## Authoritative chain

```text
PAYMENT (status = completed, policy allows)
        ↓
postPaymentAccounting                          paymentAccountingOrchestrator.ts
        ↓
┌─ PropertyAccount income / pass-through / configured expense     propertyAccountService.recordIncomeFromPayment
├─ AgentAccount commission                                         agentAccountService.syncCommissionForPayment
├─ CompanyAccount commission                                       accountingIntegrationService.postCompanyCommission
└─ JournalEntry + JournalLine (+ VAT obligation metadata)          accountingIntegrationService.syncPaymentReceived
                                                                   → accountingService.postTransaction
        ↓
REPORTS read PropertyAccount, CompanyAccount, JournalEntry
```

Owner income source of truth, as coded in `accountingPostingPolicy.ts`:

```text
PropertyAccount.transactions (completed income, non-PASS_THROUGH)
```

Company revenue source of truth, as coded:

```text
CompanyAccount.transactions (active, non-archived agency commission income)
```

`User.balance` is explicitly not owner income.

Tax records attached after posting (`individualTaxMetadataService.safeAttachForPayment`) are a projection. They are not the accounting source.

Trust cash for a sale is a separate event path (`payment.confirmed` → `trustPaymentPostingService.postBuyerPaymentToTrust`). It is not a step inside `postPaymentAccounting`.

## Policy gate

Every orchestrator post calls `evaluatePermanentAccountingPolicy` first.

| Condition | Result |
| --- | --- |
| Missing payment, reversal row, negative amount, status not `completed`, provisional, suspense | All artifacts skipped |
| Deposit-only | All artifacts skipped, including owner income |
| `commissionFinalized === false` | Agent and company commission skipped; owner income and journal still allowed |
| `paymentType !== 'sale'` | `skipTrust: true` on the policy object |

Deposit-only definition:

| Source | Predicate | Combined rent + deposit (`amount > 0` and `depositAmount > 0`) |
| --- | --- | --- |
| Workspace `isDepositOnlyPayment` | `deposit > 0 && amount <= 0` | Posts rental accounting for the rent portion |
| Commit `8070b217` | `deposit > 0 && amount <= deposit` | Skips owner income, commission, and journal when the rent portion is less than or equal to the deposit |

`amount` is the rent or sale cash portion. `depositAmount` is separate. A true deposit-only receipt is `amount <= 0` with a positive deposit.

## 1. Rental payment create paths that reach the orchestrator

| Entry | Route | Function | Then |
| --- | --- | --- | --- |
| Lease / standard create | `POST /payments` | `paymentController.createPayment` | Save `Payment` → deposit ledger if needed → `ensurePaymentAccountingPosted` → `emitPaymentConfirmedIfNeeded` |
| Accountant create | `POST /accountants/payments` | `createPaymentAccountant` | Same post-commit ensure |
| Agent create | `POST /agents/payments` | `agentController.createAgentPayment` | Same |
| Public authenticated create | `POST /payments/public` | `createPaymentPublic` | Ensure when status is completed |
| Status flip | payment status routes | `updatePaymentStatus` | Ensure on transition to completed |
| Finalize provisional | `POST /accountants/payments/:id/finalize` | `finalizeProvisionalPayment` | Clear provisional, then ensure |
| Payment webhook | payment-confirmation webhook | `paymentWebhookController` | Create or update `Payment`, then ensure. Ensure errors are logged and do not fail the HTTP acceptance |
| Change stream | Mongo change stream | `databaseSyncService.handlePaymentChange` | Calls `postPaymentAccounting` directly for completed rental, sale, or introduction. Errors are logged |
| Ledger retry | `ledgerEventService.execute` | owner income / agent commission / company commission | Calls `postPaymentAccounting` |
| Explicit repair | accountant repair route | `repairPaymentAccounting` | Calls the orchestrator. This is a controlled repair, not a silent startup repair |

`ensurePaymentAccountingPosted` (`paymentAccountingReconciliation.ts`) posts, reconciles, and persists `accountingComplete` / `accountingStatus`. If the projection is incomplete, the `Payment` row stays saved and `status` stays `completed`.

Cash, bank, and mobile are stored as `paymentMethod`. `buildAgentReceiptJournal` debits the trust-bank GL code for agent receipts regardless of method. Method does not select the owner ledger.

### Canonical rental owner-income path

```text
createPayment / createPaymentAccountant / createAgentPayment
→ Payment.save (status completed)
→ ensurePaymentAccountingPosted
→ postPaymentAccounting
→ propertyAccountService.recordIncomeFromPayment
→ evaluatePermanentAccountingPolicy
→ checkPaymentAccountingCompleteness (skip write if already proven)
→ resolveLedgerTypeForProperty(payment.propertyId)
→ mismatch check (introduction is exempt)
→ buildOwnerIncomeLedgerTargets (rental: the property id only)
→ getOrCreatePropertyAccount
→ computeOwnerIncomeAmount = max(0, ownerAmount - passThroughTotal)
→ PropertyAccount.transactions $push type=income category=rental_income
   idempotencyKey = payment:{paymentId}
→ recalculateBalance
→ reports / owner statements read that PropertyAccount
```

Owner amount comes from `payment.commissionDetails.ownerAmount`, calculated on the server for accountant and agent creates. If that field is missing or the pass-through total consumes it, `incomeAmount <= 0` and the income row is not written. Pass-through and configured-expense rows can still be written. The payment is not placed in suspense in that case.

### Deposit ledger

`ensureDepositLedgerFromPayment` upserts `RentalDeposit`. Deposit-only receipts do not create owner income. Combined receipts should create both the deposit ledger row and the rental income row. On commit `8070b217` the policy treats many combined receipts as deposit-only, so the income row is skipped.

### Levy

- Combined rent + levy is allocated in `combinedPaymentService` and may create a linked `LevyPayment`.
- Pass-through on the property ledger is written inside `recordIncomeFromPayment`.
- Standalone levy (`levyPaymentController.createLevyPayment`) calls `recordPassThroughCollection` directly and does not run the full orchestrator.

### What does not create rental owner income

- Paynow / billing sessions write `BillingPayment` for subscriptions.
- `ecosystem/services/paymentProvider.verifyAndPostTenantPayment` verifies a provider result and does not create a `Payment` or a journal.
- Municipal payments stay on `MunicipalPayment`.
- Notifications do not post ledgers.

## 2. Sales payment path

```text
SalesPaymentForm (paymentType hardcoded 'sale')
→ POST /accountants/sales-payments
→ createSalesPaymentAccountant
→ Payment { paymentType: 'sale', status: 'completed' }
   propertyId = supplied id OR a newly generated ObjectId
   tenantId   = supplied id OR a newly generated ObjectId
→ ensurePaymentAccountingPosted
→ postPaymentAccounting
→ recordIncomeFromPayment
   ledger from Property.rentalType of payment.propertyId
   if that id is not a property, Development, or DevelopmentUnit: target skipped, payment set isInSuspense
   if property.rentalType is management/introduction: mismatch throw, owner income failed
   if property.rentalType is sale, or the id is a development/unit: sale PropertyAccount income
→ agent commission, company sales_commission, journal sourceModule 'sale'
→ emitPaymentConfirmedIfNeeded
→ trustPaymentPostingService.postBuyerPaymentToTrust
```

`createSalesPaymentAccountant` does not call `resolveLedgerTypeForProperty` before save. The comment above the function still says the payment type is fixed to `introduction`. The saved type is `sale`.

Sale owner-income targets (`buildOwnerIncomeLedgerTargets`):

- Unit id, when present.
- Development id, when present or resolved from the unit.
- The property id only when neither unit nor development is present.

Each target is its own `PropertyAccount` identity `(entityId, ledgerType)`. That is two accounts for two entities, not a duplicate of one key.

Company commission source is chosen from `payment.paymentType` (`sales_commission` vs `rental_commission`), not from `Property.rentalType`.

## 3. Journal path

```text
postPaymentAccounting
→ accountingIntegrationService.syncPaymentReceived
→ shouldPostJournal
→ buildAgentReceiptJournal({ paymentType })
→ accountingService.postTransaction
→ JournalEntry + JournalLine
```

Sale journals use seller payable and sales commission revenue. Rental journals use owner payable and agency revenue. A missing `paymentType` is passed to the journal builder as `'rental'`.

Journal failure is caught in the orchestrator and recorded as `journal: failed`. Unlike owner income, agent commission, and company commission, a journal failure does not enqueue a `LedgerEvent`.

## 4. Property account creation

One document creator: `PropertyAccountService.getOrCreatePropertyAccount`.

```text
resolveLedgerTypeForProperty
→ find active non-archived account for (propertyId, ledgerType)
→ 0 found: insert
→ 1 found: return it
→ more than 1: HTTP 409, refuse to choose
→ duplicate-key on insert: reload; 1 winner returned; more than 1 → 409
```

Callers:

| Caller | When |
| --- | --- |
| `propertyController.createProperty` / `updateProperty` / `createPropertyPublic` | After property save |
| `recordIncomeFromPayment` / `reverseIncomeFromPayment` | Payment post and reversal |
| `recordPassThroughCollection` / `recordPassThroughPayment` | Levy and pass-through |
| `addExpense`, `addOpeningBalanceAdjustment`, `createOwnerPayout`, `appendManualLedgerTransaction` | Manual ledger operations |
| `syncPropertyMetadata` | Property name / owner sync |
| `ensureDevelopmentLedgersAndBackfillPayments` | Admin / maintenance job |
| `migrateSalesLedgerForCompany` | Historical sale-income move |
| `individualWorkspaceService` | Individual landlord post |

Lease creation does not create a `PropertyAccount`.

Identity key: `(propertyId, ledgerType)` where `ledgerType` is `rental` or `sale`. `companyId`, `ownerId`, and currency are not part of the key. `companyId` is not a field on `PropertyAccount`.

Schema declares a partial unique index on `{ propertyId: 1, ledgerType: 1 }` where `isArchived: false`. Accounting connection uses `autoIndex: false`. `models/indexes.ts` does not create this index. Runtime creation runs only when `ALLOW_ACCOUNTING_INDEX_MIGRATION=true` (`ledgerMutationPolicy.isIndexCreationAllowed`). Without that index, two concurrent `getOrCreate` calls can both insert.

## 5. Ledger selection

| Book | Selector | Function |
| --- | --- | --- |
| Owner `PropertyAccount` | `Property.rentalType`: `management` and `introduction` → `rental`; `sale` → `sale`. Development and DevelopmentUnit ids → `sale` | `resolveLedgerTypeForProperty` |
| Income category | `sale_income` when ledger is sale or `payment.paymentType === 'sale'`; otherwise `rental_income` | `recordIncomeFromPayment` |
| Company commission | `payment.paymentType === 'sale'` → `sales_commission`, otherwise `rental_commission` | `postCompanyCommission` |
| GL journal module | `payment.paymentType === 'sale'` → `sale`, otherwise `payment` | `syncPaymentReceived` |
| Trust | Event `payment.confirmed`. Writer does not read `paymentType` or `shouldPostTrust` | `postBuyerPaymentToTrust` |
| Webhook classification | `Property.rentalType` only. Unknown is rejected | `resolveWebhookCreatedPaymentFinancials` |

`propertyUse` (`Rental`, `Sale`, `Both`, `Internal`) is not read by the resolver. Property asset `type` (house, apartment, residential, commercial) selects default commission percent, not the ledger.

No payment create path accepts a client `ledgerId`. Accountant and agent creates compare a supplied `paymentType` with the resolved ledger and return HTTP 400 on conflict. Sales create does not.

There is no `ACCOUNTING_CLASSIFICATION_CONFLICT` code. Conflicts surface as the message `Payment type … does not match Property.rentalType`, completeness reason `payment_type_mismatch`, or `WEBHOOK_PAYMENT_TYPE_UNKNOWN`.

## 6. Owner, tenant, and expense balances

| Outcome | Writer | Model |
| --- | --- | --- |
| Owner income | `recordIncomeFromPayment` | `PropertyAccount` income transaction, then `recalculateBalance` |
| Owner expense from a payment charge line | same function, category `configured_expense` | `PropertyAccount` |
| Manual property expense | `propertyAccountController.addExpense` | `propertyAccountService.addExpense` and `syncExpenseCreated` → journal |
| Owner payout | `createOwnerPayout` | `PropertyAccount.ownerPayouts` |
| Opening balance | `addOpeningBalanceAdjustment` | `PropertyAccount` |
| Tenant deposit | `ensureDepositLedgerFromPayment` | `RentalDeposit` |
| Pass-through / levy collected | `recordPassThroughCollection` | `PropertyAccount.passThroughAccounts` |
| Individual landlord entry | `individualAccountingService.postEntry` | `LandlordFinancialTransaction`, then a PropertyAccount projection |

## 7. Commission, VAT, levy

| Item | Where it is decided | Where it is stored |
| --- | --- | --- |
| Agency / agent / owner split | `CommissionService.calculate` at payment create, stored on `Payment.commissionDetails` | Payment is canonical; agent and company rows are projections |
| VAT on commission | Sale and rental create compute `vatOnCommission` onto the snapshot | Journal VAT metadata and tax services |
| Sale VAT on the price | `resolveSaleVatPolicy` inside `createSalesPaymentAccountant` | `Payment.vatAmount`; can open a tax review item |
| Levy | Charge lines and `combinedPaymentService` | Pass-through ledger and optional `LevyPayment` |
| CGT | Trust settlement inputs (`cgtAmount`, `cgtNotApplicable`) | Trust settlement, not the rental orchestrator |

## 8. Competing write paths

These can change money records without being the single live completion call to `ensurePaymentAccountingPosted`:

| Path | What it writes | How it is reached |
| --- | --- | --- |
| `databaseSyncService.handlePaymentChange` | Full `postPaymentAccounting` | Change stream, parallel to the controller ensure |
| `maintenanceJobQueueService` operation `sync_property_accounts` | `syncPropertyAccountsWithPayments` → direct `recordIncomeFromPayment`, then `migrateSalesLedgerForCompany` | Accountant sync endpoint queues it; `wait=true` runs it inline |
| `ensure_development_ledgers` job | `ensureDevelopmentLedgersAndBackfillPayments` | Same queue |
| `levyPaymentController` | Pass-through collection or payout | Direct |
| `propertyAccountController.addExpense` | Property expense + journal | Direct |
| `companyAccountController` | Company expense journal | Direct |
| `accountingController` → `accountingService.postTransaction` | Manual GL journal | Direct |
| `individualAccountingService.postEntry` | Landlord transaction + property projection | Direct |
| `emitPaymentConfirmedIfNeeded` | Trust account transaction, and creates a trust account if none exists | After rental and sale creates, status updates, and finalize |
| `accountingIntegrationService.backfillFromExistingData` | Direct `syncPaymentReceived` | Historical journal backfill |

Idempotency keys make a second owner-income push for the same payment a no-op on the same account. They do not stop the first push from landing on the wrong account, and they do not stop trust, company, and journal from using a different classification than the property ledger.

## 9. Report read path

`reporting/readModels` `getAccount` loads one `PropertyAccount` with:

```text
propertyId + isArchived != true + isActive != false
sort updatedAt descending
findOne
```

It does not filter `ledgerType`. If a rental account and a sale account both exist, the report uses whichever document was updated last.

Owner income that was archived by duplicate cleanup is invisible to this query.

## 10. Failure visibility

| Failure | Payment `status` | `accountingComplete` | User-visible owner income |
| --- | --- | --- | --- |
| Policy skip (deposit-only, provisional, suspense) | Stays `completed` when already saved that way | Not complete / not applicable | Absent, by policy |
| Owner income throws (mismatch, 409 duplicates) | Stays `completed` | `false`; orchestrator status `partial` or `failed` | Absent; retry event queued |
| `incomeAmount <= 0` | Stays `completed` | Depends on whether pass-through satisfied completeness | Absent; only a log line |
| All targets missing | Set `isInSuspense` | Subsequent posts skipped because suspense denies policy | Absent |
| Journal throws | Stays `completed` | `false` | Owner income may exist; GL does not; no ledger-event retry |
| Webhook ensure throws | Receipt can still be accepted | May stay false | Absent until a later retry |
| Change-stream post throws | Stays `completed` | Unchanged if ensure also failed | Absent; error logged |
