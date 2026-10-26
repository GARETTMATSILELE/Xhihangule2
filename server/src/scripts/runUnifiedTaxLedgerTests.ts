import assert from 'assert';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import Module from 'module';
import { buildTaxPosition } from '../services/tax/taxPosition';

const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

const mergePath = path.resolve(__dirname, '../../../client/src/pages/AccountantDashboard/mergeTaxLedgers.ts');
const source = fs.readFileSync(mergePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2019 }
}).outputText;
const loaded = new Module(mergePath);
loaded.filename = mergePath;
loaded.paths = (Module as any)._nodeModulePaths(path.dirname(mergePath));
(loaded as any)._compile(compiled, mergePath);
const { buildUnifiedTaxAccounts } = loaded.exports as {
  buildUnifiedTaxAccounts: (input: any) => any[];
};

const canonical = {
  taxType: 'VAT_ON_COMMISSION',
  label: 'VAT on agency commission',
  recognised: 381.32,
  paid: 0,
  outstanding: 381.32,
  reversed: 41.85,
  properties: [
    {
      propertyId: 'unit-7',
      propertyName: 'Unit 7',
      recognised: 381.32,
      paid: 0,
      reversed: 41.85,
      outstanding: 381.32,
      lines: [
        { obligationId: 'obl-7', paymentId: 'pay-7', taxPeriod: '2026-10', status: 'PAYABLE', recognised: 381.32, paid: 0, outstanding: 381.32 }
      ]
    }
  ]
};
const outputVat = {
  taxType: 'VAT_OUTPUT',
  label: 'Output VAT',
  recognised: 0,
  paid: 0,
  outstanding: 0,
  reversed: 0,
  properties: []
};

const trustEntry = {
  entryId: 'opening-1',
  date: '2026-02-20T00:00:00.000Z',
  description: 'VAT on Commission payable opening balance',
  debit: 155,
  credit: 0,
  balance: 155,
  sourceType: 'opening' as const,
  reference: 'SETTLE-1'
};
const payoutEntry = {
  entryId: 'payout-1',
  date: '2026-03-19T00:00:00.000Z',
  description: 'VAT payout',
  debit: 0,
  credit: 40,
  balance: 115,
  sourceType: 'payout' as const,
  reference: 'ZIMRA',
  payoutId: 'payout-1'
};

const unified = buildUnifiedTaxAccounts({
  hasCanonicalPosition: true,
  canonicalAccounts: [canonical, outputVat],
  trustLedgers: {
    VAT_ON_COMMISSION: [
      {
        propertyId: 'mukwa',
        propertyName: '98 Mukwa',
        propertyAddress: '98 Mukwa',
        totalDebit: 155,
        totalCredit: 40,
        closingBalance: 115,
        entries: [trustEntry, payoutEntry]
      }
    ],
    VAT: []
  },
  discrepancies: [
    {
      kind: 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION',
      taxType: 'VAT_ON_COMMISSION',
      propertyId: 'mukwa',
      propertyName: '98 Mukwa',
      difference: -115,
      detail: 'Trust book is not rewritten.'
    },
    {
      kind: 'OBLIGATION_WITHOUT_TRUST_LEDGER',
      taxType: 'VAT_ON_COMMISSION',
      propertyId: 'unit-7',
      propertyName: 'Unit 7',
      difference: 381.32,
      detail: 'No trust ledger for this obligation.'
    },
    {
      kind: 'GL_MISMATCH',
      taxType: '2101',
      propertyId: 'UNALLOCATED',
      difference: 100,
      detail: 'Control account difference.'
    }
  ]
});

const commissionAccounts = unified.filter((account) => account.canonicalType === 'VAT_ON_COMMISSION');
check(commissionAccounts.length === 1, 'each tax account appears once');
check(unified.filter((account) => account.canonicalType === 'VAT_OUTPUT').length <= 1, 'output VAT is not repeated');
const commission = commissionAccounts[0];
check(commission.recognised === 381.32, `canonical recognised stays ${commission.recognised}`);
check(commission.paid === 0, `canonical paid stays ${commission.paid}`);
check(commission.outstanding === 381.32, `canonical outstanding stays ${commission.outstanding}`);
check(commission.reversed === 41.85, `reversed stays ${commission.reversed}`);
check(commission.trustOutstanding === 115, `trust outstanding stays ${commission.trustOutstanding}`);
check(commission.outstanding !== commission.trustOutstanding, 'trust outstanding is not added into canonical outstanding');

const propertyIds = commission.properties.map((row: any) => row.propertyId);
check(new Set(propertyIds).size === propertyIds.length, 'each property appears once inside the account');
const historical = commission.properties.find((row: any) => row.propertyId === 'mukwa');
const canonicalOnly = commission.properties.find((row: any) => row.propertyId === 'unit-7');
check(Boolean(historical), 'historical-only property remains visible');
check(Boolean(canonicalOnly), 'canonical-only property remains visible');
check(historical.canRecordPayout === true, 'historical trust balance can use the existing payout action');
check(canonicalOnly.canRecordPayout === false, 'canonical-only property has no trust payout');
check(historical.trustEntries[0].description === trustEntry.description, 'historical description is unchanged');
check(historical.trustEntries[1].balance === 115, 'historical running balance is unchanged');
check(historical.trustEntries[1].reference === 'ZIMRA', 'payout reference remains visible');
check(historical.outstanding === 0, 'a trust payout does not create canonical outstanding');
check(canonicalOnly.outstanding === 381.32, 'canonical outstanding is unchanged by the trust payout');
check(historical.status === 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION', `historical status ${historical.status}`);
check(canonicalOnly.status === 'OBLIGATION_WITHOUT_TRUST_LEDGER', `canonical-only status ${canonicalOnly.status}`);
check(historical.discrepancies.length === 1, 'property reconciliation stays on that property');
check(!commission.properties.some((row: any) => row.discrepancies.some((item: any) => item.kind === 'GL_MISMATCH')), 'general ledger difference is not copied onto every property');

const separated = buildTaxPosition({
  obligations: [{
    id: 'obl-7',
    taxType: 'VAT_ON_COMMISSION',
    propertyId: 'unit-7',
    propertyName: 'Unit 7',
    paymentId: 'pay-7',
    taxPeriod: '2026-10',
    taxAmount: 381.32,
    status: 'PAYABLE'
  }],
  payments: [],
  legacyRecords: [{ id: 'rec-1', taxType: 'VAT_ON_COMMISSION', propertyId: 'mukwa', propertyName: '98 Mukwa', amount: 155 }],
  legacyPayouts: [{ id: 'pay-legacy', taxType: 'VAT_ON_COMMISSION', propertyId: 'mukwa', propertyName: '98 Mukwa', amount: 40 }]
});
const separatedAccount = separated.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION');
check(separatedAccount?.outstanding === 381.32, `trust payout does not reduce canonical outstanding (${separatedAccount?.outstanding})`);
check(separatedAccount?.legacyOutstanding === 115, `partial trust payout leaves trust outstanding 115 (${separatedAccount?.legacyOutstanding})`);
check(separated.discrepancies.some((item) => item.kind === 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION'), 'legacy difference stays visible');
check(separated.discrepancies.some((item) => item.kind === 'OBLIGATION_WITHOUT_TRUST_LEDGER'), 'missing trust ledger stays visible');

const page = fs.readFileSync(path.resolve(__dirname, '../../../client/src/pages/AccountantDashboard/TaxAccountsPage.tsx'), 'utf8');
const compliance = fs.readFileSync(path.resolve(__dirname, '../../../client/src/pages/AccountantDashboard/TaxCompliancePage.tsx'), 'utf8');
const controller = fs.readFileSync(path.resolve(__dirname, '../controllers/accountantController.ts'), 'utf8');
const routes = fs.readFileSync(path.resolve(__dirname, '../routes/accountantRoutes.ts'), 'utf8');
const payoutStart = controller.indexOf('export const createTaxPayout');
const payoutEnd = controller.indexOf('export const', payoutStart + 20);
const payoutFn = controller.slice(payoutStart, payoutEnd);
const ledgerStart = controller.indexOf('export const getTaxLedgers');
const ledgerFn = controller.slice(ledgerStart, controller.indexOf('export const', ledgerStart + 20));

check(page.includes('accountantService.createTaxPayout'), 'record payout still calls the existing payout API');
check(page.includes('Record Payout'), 'record payout action remains in the unified ledger');
check(!page.includes('/tax-payouts-v2') && !page.includes('createCanonicalTaxPayout'), 'no second payout endpoint is called');
check(compliance.includes('<TaxAccountsPage position={taxPosition}'), 'property ledgers receive the shared tax position');
check(!compliance.includes('TaxPositionPanel'), 'the standalone tax-position account list is not rendered again');
check(payoutFn.includes('TaxPayout.create'), 'payout writes a TaxPayout');
check(!payoutFn.includes('TaxPayment') && !payoutFn.includes('JournalEntry') && !payoutFn.includes('TaxObligation'), 'payout does not create a canonical payment, obligation, or journal');
check(payoutFn.includes('if (!companyId || !userId)'), 'payout rejects a request without a company');
check(payoutFn.includes('companyId: companyObjectId'), 'payout is stored against the caller company');
check(payoutFn.includes('payoutAmount <= 0'), 'a non-positive payout is rejected');
check(payoutFn.includes('outstanding <= 0'), 'a payout against a zero trust balance is rejected');
check(payoutFn.includes('payoutAmount - outstanding > 0.0001'), 'a payout above the trust balance is rejected');
check(!payoutFn.includes('payoutAmount !== outstanding') && !payoutFn.includes('payoutAmount < outstanding'), 'a partial payout below the trust balance is allowed');
check(routes.includes("router.post('/tax-payouts', isAccountant, createTaxPayout)"), 'payout route keeps the accountant authorisation check');
check(ledgerFn.includes('companyId: companyObjectId'), 'tax ledgers are loaded for the caller company');
check(ledgerFn.includes('TaxRecord.find({ companyId: companyObjectId'), 'trust debits are company scoped');
check(ledgerFn.includes('TaxPayout.find({ companyId: companyObjectId'), 'trust payouts are company scoped');

assert.strictEqual(failures.length, 0, failures.join('\n'));
console.log('Unified tax ledger tests passed.');
