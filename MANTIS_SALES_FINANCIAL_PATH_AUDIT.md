# MANTIS Sales Financial Path Audit

Phase 1. Audit of how a sale becomes money records, and how that path can enter or be entered by rental accounting.

No sales workflow was redesigned in this phase.

## Business rule this code actually implements

A property has one current accounting domain, taken from `Property.rentalType`:

| `rentalType` | Owner ledger |
| --- | --- |
| `management` | `rental` |
| `introduction` | `rental` |
| `sale` | `sale` |
| Development or DevelopmentUnit id (no Property row) | `sale` |

`propertyUse` may be `Rental`, `Sale`, `Both`, or `Internal`. The resolver never reads it. A property marked `Both` still has one live owner ledger.

A property can hold a rental account and a sale account at the same time because the identity key includes `ledgerType`. That is legitimate for a lifecycle change (rental stock later listed for sale, or the reverse). It is not a duplicate. A duplicate is two active accounts with the same `(propertyId, ledgerType)`.

The transaction's own domain is `Payment.paymentType` (`rental`, `introduction`, `sale`). Owner posting re-derives the ledger from the property's current `rentalType` at write time. It does not store a ledger snapshot on the payment. Company commission, the GL journal, and trust each decide independently.

Correct business rule for later phases, grounded in this split:

```text
The property may change workflow over time.
The payment keeps the domain it was created in.
Rental cash posts to rental accounting.
Sale cash posts to sales accounting.
Historical lines stay on the ledger they were posted to.
```

Current code re-reads the property on every post and reversal, so a later edit of `rentalType` changes where a retry or a reversal looks.

## Sales write path

```text
CLIENT
  SalesPaymentForm sends paymentType: 'sale'
        ↓
ROUTE
  POST /accountants/sales-payments
  accountantRoutes → createSalesPaymentAccountant
        ↓
CONTROLLER
  paymentController.createSalesPaymentAccountant
  Does not call resolveLedgerTypeForProperty.
  Requires an agent (derived from the property when omitted, except developments).
  Optional development / unit must belong to the company.
  Commission from the body, or CommissionService.calculate, with a 15% fallback.
  VAT policy via resolveSaleVatPolicy and resolveCommissionVatPolicy.
  validateSalePaymentCompleteness on amount and commission snapshot.
        ↓
MODEL
  Payment
    paymentType: 'sale'
    status: 'completed'
    propertyId: client id, or new mongoose.Types.ObjectId() when omitted
    tenantId: client id, or new mongoose.Types.ObjectId() when omitted
    developmentId / developmentUnitId / saleId when supplied
    commissionDetails.ownerAmount rewritten as
      taxableAmount - commission - vatOnCommission
        ↓
ORCHESTRATOR
  ensurePaymentAccountingPosted → postPaymentAccounting
        ↓
OWNER LEDGER
  recordIncomeFromPayment
  resolveLedgerTypeForProperty(payment.propertyId)
  Sale targets: unit, then development, else the property id
  category sale_income
  income amount = ownerAmount (pass-through is not subtracted on sales)
        ↓
AGENT
  agentAccountService.syncCommissionForPayment
        ↓
COMPANY
  postCompanyCommission source sales_commission
  because payment.paymentType === 'sale'
        ↓
JOURNAL
  syncPaymentReceived sourceModule 'sale'
  buildAgentReceiptJournal paymentType sale
        ↓
TRUST
  emitPaymentConfirmedIfNeeded('payment.create.sales')
  trustEventListener
  trustPaymentPostingService.postBuyerPaymentToTrust
  trustAccountService.recordBuyerPayment
  Creates a TrustAccount for the property when none exists
        ↓
REPORT
  Owner routes and reporting read models
  getAccount picks one non-archived account, newest updatedAt, any ledgerType
```

The function comment still says the sales create "paymentType fixed to `introduction`" and "no rental validations". The saved type is `sale`. The absence of rental-type validation matches the comment. The type in the comment does not match the code.

## Other sale entry points

| Entry | Behaviour |
| --- | --- |
| Webhook create | `resolveWebhookCreatedPaymentFinancials` reads `Property.rentalType`. `sale` becomes a sale payment. Unknown `rentalType` is rejected (`WEBHOOK_PAYMENT_TYPE_UNKNOWN`). Incomplete sale commission is rejected (`SALE_PAYMENT_INCOMPLETE`). |
| Accountant/agent rental form | If the property resolves to `sale`, a supplied rental type is HTTP 400. An omitted type is set to `sale`. |
| Change stream | Completed `paymentType: 'sale'` calls `postPaymentAccounting` again. Idempotent per account. |
| Trust reversal | `reverseBuyerPaymentInTrust` returns without posting unless `paymentType` is `sale`. The forward post does not have this check. |
| Maintenance `migrateSalesLedgerForCompany` | Moves `sale_income` lines by calling `getOrCreatePropertyAccount` on the entity. That follows current `rentalType`. A management property therefore receives the line on its rental account. |

Deal, SalesContract, and SalesFile link the CRM sale. They are not consulted when the ledger is chosen.

## Where rental cash enters sales records

| Path | What lands in a sales book | Guard |
| --- | --- | --- |
| Completed rental, introduction, or any confirmed payment | `emitPaymentConfirmedIfNeeded` emits `payment.confirmed`. `postBuyerPaymentToTrust` does not read `paymentType` or `shouldPostTrust`. `recordBuyerPayment` creates the trust account and posts the amount. | Policy sets `skipTrust` for non-sale inside the orchestrator. Nothing in the trust writer reads it. Reversal does check `sale`. |
| `paymentType: 'introduction'` while `Property.rentalType` is now `sale` | `recordIncomeFromPayment` skips the mismatch test for `introduction`, sets `isSale` from the ledger, and writes `sale_income` on the sale account. | Accountant/agent create would have rejected this pair at insert time. A property whose `rentalType` changed later, or an older row, still posts. |
| Report for a property that has both ledgers | `getAccount` returns the newest account of either type, so rental lines can render inside a sale account view and the reverse. | No ledger argument. |
| Property listing create forces `rentalType: 'sale'` | Later rental-shaped payments against that property are rejected at guarded creates, or thrown at owner post. Company/journal follow `paymentType` if a sale payment was used. | Does not migrate historical rental lines off the rental account. Those lines remain, which is correct. New resolution uses sale. |

## Where sale cash enters rental records

| Path | What lands in a rental book | Guard |
| --- | --- | --- |
| `createSalesPaymentAccountant` against `rentalType` `management` or `introduction` | Owner income throws and is not written to the rental account. Company commission is `sales_commission`. Journal `sourceModule` is `sale`. Trust still posts. | Owner ledger is protected. Company, GL, and trust are not. Payment remains `completed` with `accountingComplete` false. |
| `migrateSalesLedgerForCompany` while the property is still management | `getOrCreatePropertyAccount` resolves `rental` and the sale income line is applied there. | This is the historical repair path re-contaminating the rental ledger. |
| Journal builder | `paymentType` blank becomes `'rental'` in `syncPaymentReceived`. | A sale payment always sets the type, so this hits incomplete legacy documents. |
| `normalizeLedgerType` | Values other than `sale` become `rental` when legacy rows are interpreted. | Legacy null ledgers land in rental. |

`recordIncomeFromPayment` does throw before writing when `paymentType` is `sale` and the resolved ledger is `rental`. A sale payment does not silently become `rental_income` on the live owner writer. The contamination that still happens is company, journal, trust, migration, and report selection.

## Sale payment with no property

When `propertyId` is omitted, the controller stores a new random ObjectId. That id is not a Property, Development, or DevelopmentUnit. `resolveLedgerTypeForProperty` throws. The target loop counts it as not found, writes no owner income, and sets `isInSuspense: true`.

`postCompanyCommission` and `syncPaymentReceived` have already been attempted in the same orchestrator call and do not need a resolvable property to classify the row as a sale. The result is a completed sale receipt, possible company and GL sale entries, no owner income, and a suspense flag that blocks every later retry.

`tenantId` is minted the same way when omitted. Sales do not have a tenant. The random id is not a real buyer record.

## Commission, VAT, trust release

On this path, sale money is one completed `Payment`. The orchestrator posts owner income, commission, and the receipt journal immediately.

Trust settlement (`trustAccountService.calculateSettlement`) is a later, separate calculation. It can take commission, VAT, and a CGT amount or an explicit not-applicable flag. CGT is not assumed by the rental orchestrator. The settlement reads completed sale payments for the property.

The sales process required by the programme distinguishes:

```text
payment received / held in trust
        ≠
funds released to the seller
```

The current financial path collapses buyer receipt, owner income, commission, and VAT into the same completed-payment post. Trust receives a second copy of the receipt through the event. There is no separate "funds released" accounting event on this path that reverses the trust holding and recognises net seller proceeds.

That is a product gap for Phase 5. It is also a financial-classification gap now, because rental receipts share the trust event.

## What is already safe on the sales path

- Webhook will not invent `sale` from an unknown `rentalType`.
- Incomplete sale commission snapshots are rejected on webhook and on `validateSalePaymentCompleteness` before insert.
- Owner-income writer refuses `paymentType: 'sale'` against a rental ledger (except the introduction exemption, which is not a sale type).
- Sale income amount is `ownerAmount`, not `ownerAmount - passThrough`.
- Idempotency key `payment:{paymentId}` blocks a second income line for the same payment on the same account.
- VAT applicability can open a review item instead of silently inventing a rate when `reviewRequired` is set.

## What is not safe

- Sales create does not validate the property domain.
- Sales create invents property and tenant ids.
- Company and GL follow `paymentType` even when owner posting rejected the property.
- Trust follows the confirmation event for every payment type.
- Owner ledger follows today's `rentalType`, including on reversal and on the sales-ledger migration.
- Reports do not choose a ledger.
- A successful HTTP sales create returns after a warning when accounting is incomplete. The payment is already `completed`.
