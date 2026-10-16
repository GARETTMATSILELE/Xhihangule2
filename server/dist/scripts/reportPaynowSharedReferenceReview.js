"use strict";
/**
 * Read-only query plan for PaymentSession rows that share a Paynow provider reference.
 * This script does not connect to a database and does not change sessions.
 */
const pipeline = [
    { $match: { provider: 'paynow', providerRef: { $type: 'string' } } },
    { $group: {
            _id: { provider: '$provider', providerRef: '$providerRef' },
            sessions: { $sum: 1 },
            companies: { $addToSet: '$companyId' },
            statuses: { $addToSet: '$status' }
        } },
    { $match: { sessions: { $gt: 1 } } },
    { $project: {
            _id: 0,
            provider: '$_id.provider',
            providerRef: '$_id.providerRef',
            sessions: 1,
            companyCount: { $size: '$companies' },
            statuses: 1
        } },
    { $sort: { sessions: -1 } }
];
console.log('PAYNOW_SHARED_REFERENCE_REVIEW');
console.log('Collection: payment_sessions. This index is not unique and must not be made unique until this review is approved.');
console.log('Review fields: _id, companyId, status, provider, providerRef, paidAt, createdAt, billingPaymentId.');
console.log('Do not include rawProviderResponse, poll URLs, hashes, or customer payment payloads.');
console.log('Status combinations that need a person: more than one session for the same providerRef, especially when statuses differ or companyIds differ.');
console.log('Do not choose a winning session. Do not rewrite historical sessions.');
console.log(JSON.stringify({ collection: 'payment_sessions', pipeline }, null, 2));
console.log('NOT EXECUTED. No database connection was opened.');
process.exit(2);
