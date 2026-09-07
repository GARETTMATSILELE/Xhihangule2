"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reconciliationTests_1 = require("./reconciliationTests");
const statementPresentationTests_1 = require("./statementPresentationTests");
Promise.resolve()
    .then(() => (0, reconciliationTests_1.runReportingReconciliationTests)())
    .then(() => (0, statementPresentationTests_1.runStatementPresentationTests)())
    .then(() => {
    console.log('Reporting reconciliation and statement presentation tests passed.');
})
    .catch((error) => {
    console.error('Reporting tests failed:', error);
    process.exit(1);
});
