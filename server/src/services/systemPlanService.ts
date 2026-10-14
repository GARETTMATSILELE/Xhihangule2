import { PLAN_CONFIG, Plan as PlanCode } from '../types/plan';
import { Plan, IPlan } from '../models/Plan';

const DEFAULT_DESCRIPTIONS: Record<PlanCode, string> = {
  INDIVIDUAL: 'For individual landlords and smaller portfolios.',
  SME: 'For growing property management teams.',
  ENTERPRISE: 'For high-volume agencies and enterprise operators.'
};

const DEFAULT_LIMITS: Record<PlanCode, Partial<IPlan['limits']>> = {
  INDIVIDUAL: { maxUsers: 3, maxProperties: PLAN_CONFIG.INDIVIDUAL.propertyLimit, maxTenants: 50, maxLeases: 50, maxStorage: 1024 },
  SME: { maxUsers: 15, maxProperties: PLAN_CONFIG.SME.propertyLimit, maxTenants: 500, maxLeases: 500, maxStorage: 10240 },
  ENTERPRISE: { maxUsers: null, maxProperties: null, maxTenants: null, maxLeases: null, maxStorage: null }
};

export async function seedDefaultPlans() {
  const codes = Object.keys(PLAN_CONFIG) as PlanCode[];
  await Promise.all(codes.map(async (code) => {
    const cfg = PLAN_CONFIG[code];
    await Plan.findOneAndUpdate(
      { code },
      {
        $setOnInsert: {
          code,
          name: code === 'SME' ? 'SME' : code.charAt(0) + code.slice(1).toLowerCase(),
          description: DEFAULT_DESCRIPTIONS[code],
          monthlyPrice: cfg.pricingUSD?.monthly || 0,
          annualPrice: cfg.pricingUSD?.yearly || 0,
          currency: 'USD',
          limits: DEFAULT_LIMITS[code],
          featureFlags: {
            maintenance: true,
            reports: true,
            ownersPortal: true,
            whatsappIntegration: code === 'ENTERPRISE',
            apiAccess: code === 'ENTERPRISE',
            ...cfg.featureFlags
          },
          isActive: true
        }
      },
      { upsert: true, new: true }
    );
  }));
}

export async function getPlanConfig(code: PlanCode) {
  const dbPlan = await Plan.findOne({ code, isActive: true }).lean();
  const fallback = PLAN_CONFIG[code];
  if (!dbPlan) {
    return {
      code,
      monthlyPrice: fallback.pricingUSD?.monthly || 0,
      annualPrice: fallback.pricingUSD?.yearly || 0,
      propertyLimit: fallback.propertyLimit,
      featureFlags: fallback.featureFlags
    };
  }

  return {
    code,
    monthlyPrice: Number(dbPlan.monthlyPrice || 0),
    annualPrice: Number(dbPlan.annualPrice || 0),
    currency: dbPlan.currency || 'USD',
    propertyLimit: dbPlan.limits?.maxProperties ?? fallback.propertyLimit,
    featureFlags: {
      ...fallback.featureFlags,
      ...(dbPlan.featureFlags || {})
    }
  };
}

/** Price for a public plan. Uses the system-admin plan record and does not substitute the other billing frequency. */
export async function chargeForPlan(code: string, cycle: 'monthly' | 'yearly'): Promise<number | null> {
  if (code !== 'INDIVIDUAL' && code !== 'SME' && code !== 'ENTERPRISE') return null;
  const dbPlan = await Plan.findOne({ code, isActive: true }).select('monthlyPrice annualPrice').lean();
  const fallback = PLAN_CONFIG[code]?.pricingUSD;
  const amount = dbPlan
    ? Number(cycle === 'yearly' ? dbPlan.annualPrice : dbPlan.monthlyPrice)
    : Number(cycle === 'yearly' ? fallback?.yearly : fallback?.monthly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export async function listDashboardPlans() {
  await seedDefaultPlans();
  const codes = ['INDIVIDUAL', 'SME', 'ENTERPRISE'] as PlanCode[];
  const names: Record<PlanCode, string> = {
    INDIVIDUAL: 'Landlord',
    SME: 'Property Manager',
    ENTERPRISE: 'Enterprise'
  };
  return Promise.all(codes.map(async (code) => {
    const saved = await Plan.findOne({ code }).lean();
    const cfg = await getPlanConfig(code);
    return {
      code,
      name: saved?.name || names[code],
      monthly: cfg.monthlyPrice > 0 ? cfg.monthlyPrice : null,
      yearly: cfg.annualPrice > 0 ? cfg.annualPrice : null,
      currency: saved?.currency || 'USD',
      isActive: saved ? saved.isActive !== false : true
    };
  }));
}
