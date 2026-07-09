import { IndividualPropertyPerformance } from '../../../services/individualWorkspaceService';

export type HealthInputs = {
  occupancyPercent: number;
  collectionPercent: number;
  maintenanceOpen: number;
  leaseDaysRemaining: number | null;
  outstandingBills: number;
  netProfit: number;
  monthlyIncome: number;
};

export function computeHealthScore(input: HealthInputs): number {
  const occupancy = Math.min(100, Math.max(0, input.occupancyPercent));
  const collection = Math.min(100, Math.max(0, input.collectionPercent));
  const maintenanceScore = input.maintenanceOpen === 0 ? 100 : Math.max(0, 100 - input.maintenanceOpen * 25);
  let leaseScore = 100;
  if (input.leaseDaysRemaining !== null) {
    if (input.leaseDaysRemaining < 0) leaseScore = 20;
    else if (input.leaseDaysRemaining < 30) leaseScore = 40;
    else if (input.leaseDaysRemaining < 90) leaseScore = 70;
  }
  const billsScore = input.outstandingBills <= 0 ? 100 : Math.max(0, 100 - Math.min(100, input.outstandingBills / 100));
  const profitScore = input.netProfit >= 0
    ? 100
    : input.monthlyIncome > 0
      ? Math.max(0, 100 + Math.round((input.netProfit / input.monthlyIncome) * 100))
      : 30;

  const score = Math.round(
    occupancy * 0.2 +
    collection * 0.25 +
    maintenanceScore * 0.15 +
    leaseScore * 0.15 +
    billsScore * 0.15 +
    profitScore * 0.1
  );
  return Math.min(100, Math.max(0, score));
}

export function propertyHealthScore(
  property: IndividualPropertyPerformance,
  extras?: { maintenanceOpen?: number; leaseDaysRemaining?: number | null; outstandingBills?: number }
): number {
  return computeHealthScore({
    occupancyPercent: property.occupancyStatus === 'Occupied' ? 100 : 0,
    collectionPercent: property.collectionPercent,
    maintenanceOpen: extras?.maintenanceOpen ?? (property.maintenanceDue ? 1 : 0),
    leaseDaysRemaining: extras?.leaseDaysRemaining ?? null,
    outstandingBills: extras?.outstandingBills ?? 0,
    netProfit: property.netProfit,
    monthlyIncome: property.monthlyIncome
  });
}

export function portfolioHealthScore(
  properties: IndividualPropertyPerformance[],
  extrasByProperty?: Record<string, { maintenanceOpen?: number; leaseDaysRemaining?: number | null; outstandingBills?: number }>
): number {
  if (!properties.length) return 100;
  const scores = properties.map((p) =>
    propertyHealthScore(p, extrasByProperty?.[p.propertyId])
  );
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
