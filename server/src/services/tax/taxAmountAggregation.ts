import { roundMoney } from '../../utils/money';

/**
 * Sum tax projection amounts without converting NOT_CALCULATED (null) into 0.
 * If any applicable row is missing an amount, the total is null.
 */
export function sumCompleteTaxAmounts<T extends { calculationStatus?: string | null }>(
  rows: T[],
  getAmount: (row: T) => number | null | undefined
): number | null {
  const applicable = (rows || []).filter((row) => {
    const status = String(row.calculationStatus || '');
    return status !== 'NOT_APPLICABLE';
  });
  if (!applicable.length) return null;
  const amounts = applicable.map((row) => getAmount(row));
  if (amounts.some((value) => value == null)) return null;
  return roundMoney((amounts as number[]).reduce((sum, value) => sum + Number(value), 0));
}

export function netFromNullable(left: number | null, right: number | null): number | null {
  if (left == null && right == null) return null;
  if (left == null || right == null) return null;
  return roundMoney(left - right);
}
