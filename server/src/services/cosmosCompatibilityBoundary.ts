/**
 * Assumptions about Azure Cosmos DB for MongoDB that this codebase has not verified.
 * Local MongoDB results do not satisfy these tests. This module does not create indexes.
 */
export type CosmosUnverifiedAssumption = {
  id: string;
  codePath: string;
  consequence: string;
  requiredTest: string;
};

export const COSMOS_UNVERIFIED_ASSUMPTIONS: CosmosUnverifiedAssumption[] = [
  {
    id: 'unique-indexes',
    codePath: 'financialUniquenessRegistry.ts and the Mongoose schema index declarations',
    consequence: 'Concurrent inserts can create duplicate journals, obligations, VAT rows, or payments if the declared unique index is absent in production.',
    requiredTest: 'On an isolated Cosmos account, list the live indexes and attempt two concurrent inserts for each declared unique key.'
  },
  {
    id: 'partial-and-sparse-indexes',
    codePath: 'TaxObligation original partial index, payment idempotency partial index, journal source sparse index',
    consequence: 'A partial or sparse index that Cosmos rejects, or that treats missing fields differently, does not enforce the business invariant.',
    requiredTest: 'Create the declared partial and sparse indexes on disposable Cosmos data and insert documents with the field missing, null, and populated.'
  },
  {
    id: 'null-versus-missing',
    codePath: 'TaxObligation reversalOf: null partial filter and sparse journal source index',
    consequence: 'An original obligation stored without reversalOf, or with reversalOf null, may not collide with a second original.',
    requiredTest: 'Insert both shapes on Cosmos and confirm whether the second insert returns duplicate-key error 11000.'
  },
  {
    id: 'duplicate-key-metadata',
    codePath: 'journalDuplicateKey.ts matchingJournalIdentity and paynowCallbackService claimPaynowEvent',
    consequence: 'If Cosmos error 11000 omits keyPattern and keyValue, a retry fails closed instead of being treated as the same operation. That avoids a false success, and it leaves the operation incomplete until the conflict is inspected.',
    requiredTest: 'Force a known unique-index collision on Cosmos and record whether the driver error includes keyPattern and keyValue.'
  },
  {
    id: 'transactions',
    codePath: 'accountingService.postTransaction session.withTransaction, fallback when error code is 20',
    consequence: 'Journal lines, balances, and the VAT collection row commit together only when transactions are enabled and the documents share a partition. The tax obligation is written after that transaction. A Cosmos account without multi-document transactions uses the sequential fallback, where a crash can leave a journal without its VAT row.',
    requiredTest: 'Run postTransaction on isolated Cosmos with a failure injected after the journal insert and before the VAT upsert, and record whether both rows roll back.'
  },
  {
    id: 'partition-key',
    codePath: 'Every financial collection written by the posting pipeline',
    consequence: 'A transaction or unique index that is not aligned with the Cosmos partition key is rejected or enforced only inside one partition.',
    requiredTest: 'Read the production container partition keys without changing them, then compare each unique index prefix with that key.'
  },
  {
    id: 'throttle-16500',
    codePath: 'classifyOperationalFailure and ledgerEventService attempt limit',
    consequence: 'Error 16500 is classified as transient and retried up to eight times. Cosmos request-charge behaviour and the exact error shape were not observed.',
    requiredTest: 'Generate request-unit throttling on an isolated Cosmos account and confirm the driver code is 16500 and that the ledger event remains failed after eight attempts.'
  },
  {
    id: 'connection-loss',
    codePath: 'postPaymentAccounting stage catches and ledgerEventService',
    consequence: 'A dropped connection after a durable write must leave accounting incomplete and a later retry must not create a second journal or obligation.',
    requiredTest: 'Close the Cosmos connection after one posting stage and retry the same payment on a fresh connection.'
  },
  {
    id: 'expense-uniqueness-gate',
    codePath: 'companyAccountExpenseService.ts inspectCompanyExpenseUniqueness',
    consequence: 'Keyed company expenses stay closed unless COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified and listIndexes shows unique company_expense_claim_identity. Cosmos listIndexes shape and unique-index enforcement are unverified, so a successful local transaction does not open the gate.',
    requiredTest: 'On isolated Cosmos, create the unique index, set the attestation only in that process, and run two concurrent claim inserts. Then repeat with the attestation unset and confirm both requests write nothing.'
  },
  {
    id: 'embedded-array-idempotency',
    codePath: 'companyAccountExpenseService.ts CompanyExpenseClaim',
    consequence: 'A unique index on an embedded transactions.idempotencyKey array is not the company-expense lock. Cosmos DB may not enforce that multikey index the same way as MongoDB. Concurrent expense claims are safe only when the top-level companyexpenseclaims unique index exists and matches the partition key.',
    requiredTest: 'On isolated Cosmos, create only the declared companyexpenseclaims unique index and run two concurrent claim inserts for one company and key. Then repeat with the index absent and record whether both inserts succeed.'
  },
  {
    id: 'concurrent-posting',
    codePath: 'ensureJournal and upsertPaymentTaxObligation',
    consequence: 'Two workers can both pass the find-before-insert check. Uniqueness then depends on the database index, which is unverified.',
    requiredTest: 'Run two concurrent postPaymentAccounting calls for one payment against isolated Cosmos and count journals and obligations.'
  }
];
