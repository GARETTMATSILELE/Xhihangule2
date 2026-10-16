"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_UNIQUENESS = void 0;
exports.uniquenessLimitations = uniquenessLimitations;
exports.FINANCIAL_UNIQUENESS = [
    {
        collection: 'taxobligations',
        index: { companyId: 1, paymentId: 1, taxType: 1 },
        options: {
            name: 'companyId_1_paymentId_1_taxType_1_original',
            unique: true,
            partialFilterExpression: { reversalOf: null, paymentId: { $type: 'objectId' } }
        },
        invariant: 'One original tax obligation per company, payment, and tax type.',
        declaredIn: 'TaxObligation schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'Partial unique indexes are declared in the schema. Cosmos DB creation and enforcement of this partial index have not been verified. Application check-then-insert is not the guarantee.'
    },
    {
        collection: 'taxobligations',
        index: { companyId: 1, paymentId: 1, taxType: 1, reversalOf: 1 },
        options: { unique: true, sparse: true },
        invariant: 'One reversal obligation per original obligation identity.',
        declaredIn: 'TaxObligation schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'Sparse unique indexes treat missing fields differently from explicit null. Cosmos DB behaviour for this index is unverified. A duplicate is accepted only when keyPattern names this identity and the reversal row is reloaded.'
    },
    {
        collection: 'journalentries',
        index: { companyId: 1, sourceModule: 1, sourceId: 1 },
        options: { unique: true, sparse: true },
        invariant: 'One journal per company, source module, and source id, including payment and reversal source ids.',
        declaredIn: 'JournalEntry schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'accountingService.ensureIndexes() does not create this index. Whether production Cosmos DB has it is unverified. Posting code must not treat an unspecified duplicate-key error as success.'
    },
    {
        collection: 'journalentries',
        index: { companyId: 1, reference: 1 },
        options: { unique: true },
        invariant: 'Journal references are unique within a company.',
        declaredIn: 'JournalEntry schema and accountingService.ensureIndexes()',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'A reference collision is the same reversal only when the stored journal has this operation source id. A reference owned by a different journal is an error.'
    },
    {
        collection: 'vatrecords',
        index: { companyId: 1, transactionId: 1, sourceType: 1 },
        options: { unique: true },
        invariant: 'One VAT collection record per company, payment, and source type.',
        declaredIn: 'VatRecord schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'Upsert is used for the VAT collection record. Unique enforcement on Cosmos DB is unverified, so a missing record remains an integrity exception rather than an assumed singleton.'
    },
    {
        collection: 'payments',
        index: { companyId: 1, idempotencyKey: 1 },
        options: { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } },
        invariant: 'A client idempotency key cannot create two payments in one company.',
        declaredIn: 'Payment schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'Payments without an idempotency key are outside this index. Cosmos DB partial-index enforcement is unverified.'
    },
    {
        collection: 'payments',
        index: { companyId: 1, externalProvider: 1, externalTransactionId: 1 },
        options: {
            unique: true,
            partialFilterExpression: {
                externalProvider: { $exists: true, $type: 'string', $gt: '' },
                externalTransactionId: { $exists: true, $type: 'string', $gt: '' }
            }
        },
        invariant: 'One payment per company and external provider transaction id.',
        declaredIn: 'Payment schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'This is the payment posting key for external collections. Production enforcement is unverified.'
    },
    {
        collection: 'payments',
        index: { reversalOfPaymentId: 1 },
        options: {
            name: 'one_full_reversal_per_payment',
            unique: true,
            partialFilterExpression: { reversalOfPaymentId: { $exists: true }, amount: { $lt: 0 } }
        },
        invariant: 'One negative reversal payment document per original payment.',
        declaredIn: 'Payment schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'Does not by itself make journal, VAT, and tax reversal rows atomic. Partial reversal remains an explicit reversal_incomplete state.'
    },
    {
        collection: 'webhookeventreceipts',
        index: { provider: 1, eventId: 1 },
        options: { unique: true },
        invariant: 'One stored Paynow callback receipt per provider event id.',
        declaredIn: 'WebhookEventReceipt schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'eventId is the Paynow hash, poll URL, or reference. A retry that changes the hash is a different event id and is not collapsed by this index.'
    },
    {
        collection: 'payment_sessions',
        index: { provider: 1, providerRef: 1 },
        options: { sparse: true, unique: false },
        invariant: 'Paynow provider references should identify one checkout session.',
        declaredIn: 'PaymentSession schema',
        productionEnforcement: 'NOT_ENFORCED',
        limitation: 'The provider and providerRef index is not unique. A repeated callback is identified by the webhook receipt. When more than one session shares a provider reference, activation is refused and a review is recorded. Do not add a unique index until production duplicates have been analysed.'
    },
    {
        collection: 'propertyaccounts',
        index: { propertyId: 1, ledgerType: 1 },
        options: { unique: true, partialFilterExpression: { isArchived: false } },
        invariant: 'One active property ledger per property and ledger type.',
        declaredIn: 'PropertyAccount schema',
        productionEnforcement: 'DECLARED_UNVERIFIED_ON_COSMOS',
        limitation: 'The partial unique index is declared. Startup does not create or rebuild it. A duplicate-key error is treated as the existing ledger only when the reported key is this index and the reloaded account matches the property, ledger, and company.'
    },
    {
        collection: 'companyexpenseclaims',
        index: { companyId: 1, idempotencyKey: 1 },
        options: { unique: true, name: 'company_expense_claim_identity' },
        invariant: 'One company-expense claim per company and idempotency key.',
        declaredIn: 'CompanyExpenseClaim schema. Not included in startup createIndexes().',
        productionEnforcement: 'NOT_ENFORCED',
        limitation: 'The claim is a top-level document because a unique index on an embedded transaction array is not treated as Cosmos-compatible proof. Concurrent keyed requests can both append until this unique index exists. A request without a key is a separate operation. Do not create the index until the read-only rollout review is approved. The review must count duplicate companyId plus idempotencyKey values, count missing and null keys, confirm the Cosmos partition key, and confirm the index type. No automatic merge or delete.'
    }
];
function uniquenessLimitations() {
    return exports.FINANCIAL_UNIQUENESS.map((row) => `${row.collection} ${JSON.stringify(row.index)}: ${row.productionEnforcement}. ${row.limitation}`);
}
