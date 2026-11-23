import { describe, expect, it } from 'vitest';
import { derivePortfolioRentStatus, derivePropertyRentStatus } from './rentCollectionStatus';

const property = { _id: 'prop-1', name: 'Unit 16, Constantia avenue, Strathaven, Harare' } as any;
const tenant = { _id: 'tenant-1', firstName: 'Makandidza', lastName: 'Matore' } as any;
const asOf = new Date(2026, 10, 23);

function lease(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'lease-1',
    propertyId: 'prop-1',
    tenantId: 'tenant-1',
    status: 'active',
    startDate: '2026-10-31',
    endDate: '2027-10-30',
    rentAmount: 1000,
    rentDueDay: 1,
    ...overrides
  };
}

function novemberPayment(amount: number) {
  return {
    _id: 'pay-1',
    propertyId: 'prop-1',
    tenantId: 'tenant-1',
    leaseId: 'lease-1',
    amount,
    status: 'completed',
    paymentType: 'rental',
    paymentDate: '2026-11-21',
    rentalPeriodMonth: 11,
    rentalPeriodYear: 2026
  };
}

describe('rent collection status after a payment', () => {
  it('marks the lease paid when rent is paid and the lease started after that month’s due day', () => {
    const status = derivePropertyRentStatus(
      lease(),
      [novemberPayment(1100)],
      [property],
      [tenant],
      asOf
    );

    expect(status.status).toBe('paid_up_to_date');
    expect(status.statusLabel).toBe('Paid up to date');
    expect(status.outstandingTotal).toBe(0);
    expect(status.overduePeriods).toEqual([]);
    expect(status.periods.map((period) => period.key)).toEqual(['2026-11']);
    expect(status.periods[0].status).toBe('paid');
  });

  it('updates the portfolio status from overdue to paid up to date', () => {
    const portfolio = derivePortfolioRentStatus(
      [lease()],
      [novemberPayment(1100)],
      [property],
      [tenant],
      asOf
    );

    expect(portfolio.label).toBe('Paid up to date');
    expect(portfolio.color).toBe('success');
    expect(portfolio.outstandingTotal).toBe(0);
    expect(portfolio.overdueProperties).toEqual([]);
  });

  it('keeps an earlier month overdue when that month’s rent was not paid', () => {
    const status = derivePropertyRentStatus(
      lease({ startDate: '2026-10-01' }),
      [novemberPayment(1000)],
      [property],
      [tenant],
      asOf
    );

    expect(status.status).toBe('overdue');
    expect(status.outstandingTotal).toBe(1000);
    expect(status.overduePeriods.map((period) => period.key)).toEqual(['2026-10']);
    expect(status.periods.find((period) => period.key === '2026-11')?.status).toBe('paid');
  });

  it('applies an overpayment to the oldest unpaid month', () => {
    const status = derivePropertyRentStatus(
      lease({ startDate: '2026-10-01' }),
      [novemberPayment(2000)],
      [property],
      [tenant],
      asOf
    );

    expect(status.status).toBe('paid_up_to_date');
    expect(status.outstandingTotal).toBe(0);
    expect(status.periods.every((period) => period.status === 'paid')).toBe(true);
  });
});
