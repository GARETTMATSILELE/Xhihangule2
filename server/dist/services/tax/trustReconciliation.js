"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUST_RECON_CATEGORIES = exports.TRUST_RECON_EXCLUDED = exports.TRUST_RECON_INCLUDED_LEDGERS = exports.TRUST_RECON_SCOPE = void 0;
exports.trustReconciliationStatus = trustReconciliationStatus;
exports.buildTrustReconciliationReport = buildTrustReconciliationReport;
const money_1 = require("../../utils/money");
const chartAccounts_1 = require("./chartAccounts");
/**
 * Company-level trust recon remains PARTIAL. Sales trust subledgers and
 * off-book custody are not the same as GL 1003, so this is never marked FULL.
 *
 * Levy on new receipts is a third-party client liability (body corporate /
 * municipality), not owner residual. See allocateRentalReceipt.
 */
exports.TRUST_RECON_SCOPE = 'PARTIAL';
exports.TRUST_RECON_INCLUDED_LEDGERS = [
    `${chartAccounts_1.GL.OWNER_PAYABLE} Owner rental funds`,
    `${chartAccounts_1.GL.SELLER_PAYABLE} Seller sale proceeds`,
    `${chartAccounts_1.GL.ZIMRA_WITHHOLDING} Tax withheld (ZIMRA)`,
    `${chartAccounts_1.GL.TENANT_DEPOSITS} Tenant deposits`,
    `${chartAccounts_1.GL.LEVY_PAYABLE} Levies (third-party payable)`
];
exports.TRUST_RECON_EXCLUDED = [
    'Buyer deposits held only on sales trust subledgers (until reflected in GL 2104)',
    'Maintenance / reserve funds without a dedicated GL',
    'Unallocated client receipts not posted to a liability code',
    'Refundable balances beyond GL 2106',
    'Per-owner rental subledgers beyond GL 2103',
    'Off-book lawyer / escrow / developer custody'
];
exports.TRUST_RECON_CATEGORIES = [
    { category: 'Owner rental funds', gl: chartAccounts_1.GL.OWNER_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2103' },
    { category: 'Seller sale proceeds', gl: chartAccounts_1.GL.SELLER_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2104' },
    { category: 'Tax withheld', gl: chartAccounts_1.GL.ZIMRA_WITHHOLDING, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2105' },
    { category: 'Tenant deposits', gl: chartAccounts_1.GL.TENANT_DEPOSITS, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2106' },
    { category: 'Levies', gl: chartAccounts_1.GL.LEVY_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'Third-party payable, GL 2107' },
    { category: 'Buyer deposits', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Sales trust subledger; not always a distinct GL' },
    { category: 'Maintenance funds', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'No dedicated GL' },
    { category: 'Other / unallocated client funds', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Not a single liability code' },
    { category: 'Off-book custody', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Lawyer, escrow, developer' }
];
function trustReconciliationStatus(difference) {
    return Math.abs((0, money_1.roundMoney)(difference)) <= 0.005 ? 'BALANCED_WITHIN_SCOPE' : 'RECONCILIATION_EXCEPTION';
}
function buildTrustReconciliationReport(input) {
    const trustBank = (0, money_1.roundMoney)(input.trustBank);
    const clientLiabilities = (0, money_1.roundMoney)(input.ownerPayable +
        input.sellerPayable +
        input.zimraWithholding +
        input.tenantDeposits +
        input.levyPayable);
    const difference = (0, money_1.roundMoney)(trustBank - clientLiabilities);
    return {
        scope: exports.TRUST_RECON_SCOPE,
        trustBank,
        clientLiabilities,
        difference,
        status: trustReconciliationStatus(difference),
        includedLedgers: [...exports.TRUST_RECON_INCLUDED_LEDGERS],
        excludedClientMoney: [...exports.TRUST_RECON_EXCLUDED],
        categories: exports.TRUST_RECON_CATEGORIES,
        note: 'PARTIAL: Trust bank (1003) compared only to in-scope GL client liabilities. A zero difference is balanced within scope, not a full trust-bank-to-all-client-money proof.'
    };
}
