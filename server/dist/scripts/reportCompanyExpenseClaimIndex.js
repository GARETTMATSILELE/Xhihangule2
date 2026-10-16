"use strict";
/**
 * Read-only rollout plan for the company-expense claim unique index.
 * This script does not connect to a database and does not create an index.
 */
const queries = [
    {
        name: 'duplicate claims',
        collection: 'companyexpenseclaims',
        pipeline: [
            { $group: { _id: { companyId: '$companyId', idempotencyKey: '$idempotencyKey' }, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
            { $count: 'duplicateGroups' }
        ]
    },
    {
        name: 'missing or null claim keys',
        collection: 'companyexpenseclaims',
        filter: { $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }, { companyId: null }] }
    },
    {
        name: 'embedded expense keys that are duplicated inside one company account',
        collection: 'companyaccounts',
        pipeline: [
            { $unwind: '$transactions' },
            { $match: { 'transactions.idempotencyKey': { $type: 'string' } } },
            { $group: { _id: { companyId: '$companyId', idempotencyKey: '$transactions.idempotencyKey' }, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
            { $count: 'duplicateGroups' }
        ]
    }
];
console.log('COMPANY_EXPENSE_CLAIM_INDEX_REVIEW');
console.log('Index: { companyId: 1, idempotencyKey: 1 } unique on companyexpenseclaims, name company_expense_claim_identity.');
console.log('This index is declared in CompanyExpenseClaim and is not created at startup.');
console.log('The application does not create this index and does not enable keyed expenses on startup.');
console.log('Keyed expenses stay closed until COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified and the running process observes this unique index.');
console.log('Do not create it until all of the following are approved:');
console.log('1. Run the duplicate and null-key counts below against a read-only production connection.');
console.log('2. Confirm the Cosmos DB partition key. The unique index must be compatible with that key.');
console.log('3. Confirm this API version supports a unique compound index on those two fields.');
console.log('4. Review the dry-run counts. Do not delete or merge duplicates automatically.');
console.log('5. Create the index only in an approved change window.');
console.log(JSON.stringify(queries, null, 2));
console.log('NOT EXECUTED. No database connection was opened.');
process.exit(2);
