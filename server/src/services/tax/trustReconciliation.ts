import { roundMoney } from '../../utils/money';
import { GL } from './chartAccounts';

/**
 * Company-level trust recon remains PARTIAL. Sales trust subledgers and
 * off-book custody are not the same as GL 1003, so this is never marked FULL.
 *
 * Levy on new receipts is a third-party client liability (body corporate /
 * municipality), not owner residual. See allocateRentalReceipt.
 */
export const TRUST_RECON_SCOPE = 'PARTIAL' as const;

export const TRUST_RECON_INCLUDED_LEDGERS = [
  `${GL.OWNER_PAYABLE} Owner rental funds`,
  `${GL.SELLER_PAYABLE} Seller sale proceeds`,
  `${GL.ZIMRA_WITHHOLDING} Tax withheld (ZIMRA)`,
  `${GL.TENANT_DEPOSITS} Tenant deposits`,
  `${GL.LEVY_PAYABLE} Levies (third-party payable)`
] as const;

export const TRUST_RECON_EXCLUDED = [
  'Buyer deposits held only on sales trust subledgers (until reflected in GL 2104)',
  'Maintenance / reserve funds without a dedicated GL',
  'Unallocated client receipts not posted to a liability code',
  'Refundable balances beyond GL 2106',
  'Per-owner rental subledgers beyond GL 2103',
  'Off-book lawyer / escrow / developer custody'
] as const;

export const TRUST_RECON_CATEGORIES: Array<{
  category: string;
  gl?: string;
  inScope: boolean;
  controlScope: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'NOT_IMPLEMENTED' | 'REQUIRES_REVIEW';
  note: string;
}> = [
  { category: 'Owner rental funds', gl: GL.OWNER_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2103' },
  { category: 'Seller sale proceeds', gl: GL.SELLER_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2104' },
  { category: 'Tax withheld', gl: GL.ZIMRA_WITHHOLDING, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2105' },
  { category: 'Tenant deposits', gl: GL.TENANT_DEPOSITS, inScope: true, controlScope: 'IN_SCOPE', note: 'GL 2106' },
  { category: 'Levies', gl: GL.LEVY_PAYABLE, inScope: true, controlScope: 'IN_SCOPE', note: 'Third-party payable, GL 2107' },
  { category: 'Buyer deposits', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Sales trust subledger; not always a distinct GL' },
  { category: 'Maintenance funds', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'No dedicated GL' },
  { category: 'Other / unallocated client funds', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Not a single liability code' },
  { category: 'Off-book custody', inScope: false, controlScope: 'NOT_IMPLEMENTED', note: 'Lawyer, escrow, developer' }
];

export type TrustReconStatus = 'BALANCED_WITHIN_SCOPE' | 'RECONCILIATION_EXCEPTION';

export function trustReconciliationStatus(difference: number): TrustReconStatus {
  return Math.abs(roundMoney(difference)) <= 0.005 ? 'BALANCED_WITHIN_SCOPE' : 'RECONCILIATION_EXCEPTION';
}

export function buildTrustReconciliationReport(input: {
  trustBank: number;
  ownerPayable: number;
  sellerPayable: number;
  zimraWithholding: number;
  tenantDeposits: number;
  levyPayable: number;
}) {
  const trustBank = roundMoney(input.trustBank);
  const clientLiabilities = roundMoney(
    input.ownerPayable +
      input.sellerPayable +
      input.zimraWithholding +
      input.tenantDeposits +
      input.levyPayable
  );
  const difference = roundMoney(trustBank - clientLiabilities);
  return {
    scope: TRUST_RECON_SCOPE,
    trustBank,
    clientLiabilities,
    difference,
    status: trustReconciliationStatus(difference),
    includedLedgers: [...TRUST_RECON_INCLUDED_LEDGERS],
    excludedClientMoney: [...TRUST_RECON_EXCLUDED],
    categories: TRUST_RECON_CATEGORIES,
    note: 'PARTIAL: Trust bank (1003) compared only to in-scope GL client liabilities. A zero difference is balanced within scope, not a full trust-bank-to-all-client-money proof.'
  };
}
