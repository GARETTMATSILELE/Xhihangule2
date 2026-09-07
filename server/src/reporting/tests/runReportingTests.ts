import { runReportingReconciliationTests } from './reconciliationTests';
import { runStatementPresentationTests } from './statementPresentationTests';

Promise.resolve()
  .then(() => runReportingReconciliationTests())
  .then(() => runStatementPresentationTests())
  .then(() => {
    console.log('Reporting reconciliation and statement presentation tests passed.');
  })
  .catch((error) => {
    console.error('Reporting tests failed:', error);
    process.exit(1);
  });

