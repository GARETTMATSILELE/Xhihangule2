import {
  countsAsCollectedReceipt,
  isPaymentReversible,
  mergeReversalRows,
  paymentDisplayStatus,
  reversalOutcomeIsSettled
} from '../client/src/utils/paymentReversalEligibility';

const failures: string[] = [];
function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

assert(isPaymentReversible({ postingStatus: 'posted', status: 'completed', amount: 1800 }) === true, 'undo stays available for an ordinary receipt');
assert(isPaymentReversible({ postingStatus: 'posted', status: 'completed', reversalOfPaymentId: 'o', amount: -1800 }) === false, 'undo is hidden for a reversal payment');
assert(isPaymentReversible({ postingStatus: 'posted', status: 'completed', reversalPaymentId: 'r', amount: 1800 }) === false, 'undo is hidden once an original has a reversal');
assert(isPaymentReversible({ postingStatus: 'posted', status: 'completed', reversalState: 'reversal_incomplete', amount: 1800 }) === false, 'undo is hidden while reversal accounting is incomplete');
assert(isPaymentReversible({ postingStatus: 'posted', status: 'completed', amount: -50 }) === false, 'undo is hidden for a negative payment');
assert(paymentDisplayStatus({ reversalState: 'reversal_incomplete', status: 'completed' }) === 'reversal incomplete', 'incomplete reversal has its own status');
assert(paymentDisplayStatus({ reversalOfPaymentId: 'o', amount: -1, status: 'completed' }) === 'reversal', 'a reversal row displays as a reversal');
assert(countsAsCollectedReceipt({ status: 'pending', amount: 1800 }) === false, 'a pending correction draft is not rent collected');
assert(countsAsCollectedReceipt({ status: 'completed', amount: -1800 }) === true, 'a completed negative reversal nets against collected rent');
const merged = mergeReversalRows(
  [{ _id: 'corr', reference: 'CORR-1' }, { _id: 'rev', reference: 'REV-1' }],
  [{ _id: 'rev', reference: 'REV-1' }, null]
);
assert(merged.length === 2 && merged.some((row) => row._id === 'corr'), 'an idempotent response does not drop the existing correction draft');
assert(reversalOutcomeIsSettled({ outcome: 'reversal_incomplete' }) === false, 'an incomplete reversal is not a success');
assert(reversalOutcomeIsSettled({ outcome: 'reversed' }) === true, 'a settled reversal is a success');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PASS payment reversal UI eligibility checks');
