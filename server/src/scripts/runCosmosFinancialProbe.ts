/**
 * Cosmos DB financial probe.
 * Runs only when COSMOS_FINANCIAL_TEST_URI points at an isolated test account.
 * Local MongoDB output is never reported as a Cosmos pass.
 */
import { COSMOS_UNVERIFIED_ASSUMPTIONS } from '../services/cosmosCompatibilityBoundary';

const uri = String(process.env.COSMOS_FINANCIAL_TEST_URI || '').trim();

function printUnverifiedAssumptions(): void {
  for (const item of COSMOS_UNVERIFIED_ASSUMPTIONS) {
    console.log(`UNVERIFIED ${item.id}: ${item.codePath}. ${item.consequence} Required test: ${item.requiredTest}`);
  }
}

function unverified(reason: string): never {
  console.log(`COSMOS_FINANCIAL_PROBE UNVERIFIED: ${reason}`);
  console.log('Not executed against production. Local MongoDB was not used as a substitute.');
  process.exit(2);
}

if (!uri) {
  printUnverifiedAssumptions();
  unverified('COSMOS_FINANCIAL_TEST_URI is not set. Unique indexes, null versus missing fields, partition keys, throttling, connection loss, and multi-document transactions were not executed on Cosmos DB.');
}
if (!/mantis-cosmos-probe|mantis_cosmos_probe/i.test(uri)) {
  unverified('The supplied URI does not name an isolated mantis-cosmos-probe database. The probe refused to run.');
}

console.log('COSMOS_FINANCIAL_PROBE UNVERIFIED: a named probe URI was present, but this run does not execute write tests unless COSMOS_FINANCIAL_PROBE_EXECUTE=1.');
if (process.env.COSMOS_FINANCIAL_PROBE_EXECUTE !== '1') {
  process.exit(2);
}

unverified('Execute mode is reserved for an isolated Cosmos account and was not run in this change.');
