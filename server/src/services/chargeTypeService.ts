import mongoose from 'mongoose';
import ChargeType, { ChargeTypeCategory, IChargeType } from '../models/ChargeType';
import PropertyAccount from '../models/PropertyAccount';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';

export interface ChargeTypeInput {
  name: string;
  code: string;
  category: ChargeTypeCategory;
  ownerIncome?: boolean;
  requiresPayout?: boolean;
  requiresThirdPartyPayment?: boolean;
  defaultLedger: string;
  active?: boolean;
}

export interface PaymentChargeLine {
  chargeTypeCode: string;
  amount: number;
  description?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
}

export const DEFAULT_CHARGE_TYPES: ChargeTypeInput[] = [
  {
    name: 'Rent',
    code: 'RENT',
    category: 'PROPERTY_INCOME',
    ownerIncome: true,
    requiresPayout: true,
    requiresThirdPartyPayment: false,
    defaultLedger: 'Rental Income'
  },
  {
    name: 'Levy',
    code: 'LEVY',
    category: 'PASS_THROUGH',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: true,
    defaultLedger: 'Pass Through'
  },
  {
    name: 'Water',
    code: 'WATER',
    category: 'PASS_THROUGH',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: true,
    defaultLedger: 'Pass Through'
  },
  {
    name: 'Electricity',
    code: 'ELECTRICITY',
    category: 'PASS_THROUGH',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: true,
    defaultLedger: 'Pass Through'
  },
  {
    name: 'Rates',
    code: 'RATES',
    category: 'PASS_THROUGH',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: true,
    defaultLedger: 'Pass Through'
  },
  {
    name: 'Deposit',
    code: 'DEPOSIT',
    category: 'LIABILITY',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: false,
    defaultLedger: 'Security Deposit'
  },
  {
    name: 'Maintenance Recovery',
    code: 'MAINTENANCE_RECOVERY',
    category: 'PROPERTY_INCOME',
    ownerIncome: true,
    requiresPayout: true,
    requiresThirdPartyPayment: false,
    defaultLedger: 'Rental Income'
  },
  {
    name: 'Maintenance Expense',
    code: 'MAINTENANCE_EXPENSE',
    category: 'PROPERTY_EXPENSE',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: false,
    defaultLedger: 'Maintenance Expense'
  },
  {
    name: 'Owner Payout',
    code: 'OWNER_PAYOUT',
    category: 'OWNER_WITHDRAWAL',
    ownerIncome: false,
    requiresPayout: false,
    requiresThirdPartyPayment: false,
    defaultLedger: 'Owner Payouts'
  }
];

const VALID_CATEGORIES = new Set<ChargeTypeCategory>([
  'PROPERTY_INCOME',
  'PASS_THROUGH',
  'PROPERTY_EXPENSE',
  'LIABILITY',
  'OWNER_WITHDRAWAL',
  'SYSTEM'
]);

class ChargeTypeService {
  private normalizeCode(code: string): string {
    return String(code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private companyFilter(companyId?: string | mongoose.Types.ObjectId): Record<string, any> {
    return companyId ? { companyId: new mongoose.Types.ObjectId(String(companyId)) } : { companyId: { $exists: false } };
  }

  private validateInput(input: ChargeTypeInput): ChargeTypeInput {
    const code = this.normalizeCode(input.code);
    if (!input.name?.trim()) throw new AppError('Charge type name is required', 400);
    if (!code) throw new AppError('Charge type code is required', 400);
    if (!VALID_CATEGORIES.has(input.category)) throw new AppError('Invalid charge type category', 400);
    if (!input.defaultLedger?.trim()) throw new AppError('Default ledger is required', 400);
    return {
      ...input,
      name: input.name.trim(),
      code,
      ownerIncome: Boolean(input.ownerIncome),
      requiresPayout: Boolean(input.requiresPayout),
      requiresThirdPartyPayment: Boolean(input.requiresThirdPartyPayment),
      defaultLedger: input.defaultLedger.trim(),
      active: input.active !== false
    };
  }

  async seedDefaults(companyId?: string | mongoose.Types.ObjectId): Promise<void> {
    const companyObjectId = companyId ? new mongoose.Types.ObjectId(String(companyId)) : undefined;
    for (const input of DEFAULT_CHARGE_TYPES) {
      const normalized = this.validateInput(input);
      await ChargeType.updateOne(
        { ...(companyObjectId ? { companyId: companyObjectId } : { companyId: { $exists: false } }), code: normalized.code },
        {
          $setOnInsert: {
            ...normalized,
            ...(companyObjectId ? { companyId: companyObjectId } : {}),
            isSystemDefault: true
          }
        },
        { upsert: true }
      );
    }
  }

  async listChargeTypes(companyId?: string | mongoose.Types.ObjectId, includeInactive = false): Promise<IChargeType[]> {
    await this.seedDefaults(companyId);
    return ChargeType.find({
      ...this.companyFilter(companyId),
      ...(includeInactive ? {} : { active: true })
    }).sort({ category: 1, name: 1 });
  }

  async getChargeTypeByCode(
    code: string,
    companyId?: string | mongoose.Types.ObjectId,
    opts: { includeInactive?: boolean; throwIfMissing?: boolean } = {}
  ): Promise<IChargeType | null> {
    const normalizedCode = this.normalizeCode(code);
    if (!normalizedCode) {
      if (opts.throwIfMissing) throw new AppError('Charge type code is required', 400);
      return null;
    }
    await this.seedDefaults(companyId);
    const chargeType = await ChargeType.findOne({
      ...this.companyFilter(companyId),
      code: normalizedCode,
      ...(opts.includeInactive ? {} : { active: true })
    });
    if (!chargeType && opts.throwIfMissing) {
      throw new AppError(`Charge type ${normalizedCode} not found or inactive`, 400);
    }
    return chargeType;
  }

  async createChargeType(input: ChargeTypeInput, companyId?: string | mongoose.Types.ObjectId, userId?: string): Promise<IChargeType> {
    const normalized = this.validateInput(input);
    await this.seedDefaults(companyId);
    const existing = await ChargeType.findOne({ ...this.companyFilter(companyId), code: normalized.code });
    if (existing) throw new AppError(`Charge type code ${normalized.code} already exists`, 409);
    return ChargeType.create({
      ...normalized,
      ...(companyId ? { companyId: new mongoose.Types.ObjectId(String(companyId)) } : {}),
      createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined
    });
  }

  async updateChargeType(
    id: string,
    input: Partial<ChargeTypeInput>,
    companyId?: string | mongoose.Types.ObjectId,
    userId?: string
  ): Promise<IChargeType> {
    await this.seedDefaults(companyId);
    const chargeType = await ChargeType.findOne({ _id: id, ...this.companyFilter(companyId) });
    if (!chargeType) throw new AppError('Charge type not found', 404);
    const next = this.validateInput({
      name: input.name ?? chargeType.name,
      code: input.code ?? chargeType.code,
      category: input.category ?? chargeType.category,
      ownerIncome: input.ownerIncome ?? chargeType.ownerIncome,
      requiresPayout: input.requiresPayout ?? chargeType.requiresPayout,
      requiresThirdPartyPayment: input.requiresThirdPartyPayment ?? chargeType.requiresThirdPartyPayment,
      defaultLedger: input.defaultLedger ?? chargeType.defaultLedger,
      active: input.active ?? chargeType.active
    });
    if (next.code !== chargeType.code) {
      await this.assertNoReferences(chargeType.code, companyId);
      const existing = await ChargeType.findOne({ ...this.companyFilter(companyId), code: next.code, _id: { $ne: chargeType._id } });
      if (existing) throw new AppError(`Charge type code ${next.code} already exists`, 409);
    }
    chargeType.set({ ...next, updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined });
    await chargeType.save();
    return chargeType;
  }

  async deactivateChargeType(id: string, companyId?: string | mongoose.Types.ObjectId, userId?: string): Promise<IChargeType> {
    await this.seedDefaults(companyId);
    const chargeType = await ChargeType.findOne({ _id: id, ...this.companyFilter(companyId) });
    if (!chargeType) throw new AppError('Charge type not found', 404);
    chargeType.active = false;
    if (userId) chargeType.updatedBy = new mongoose.Types.ObjectId(userId);
    await chargeType.save();
    return chargeType;
  }

  async deleteChargeType(id: string, companyId?: string | mongoose.Types.ObjectId): Promise<void> {
    const chargeType = await ChargeType.findOne({ _id: id, ...this.companyFilter(companyId) });
    if (!chargeType) throw new AppError('Charge type not found', 404);
    await this.assertNoReferences(chargeType.code, companyId);
    await ChargeType.deleteOne({ _id: chargeType._id });
  }

  async assertNoReferences(code: string, companyId?: string | mongoose.Types.ObjectId): Promise<void> {
    const normalizedCode = this.normalizeCode(code);
    const companyObjectId = companyId ? new mongoose.Types.ObjectId(String(companyId)) : undefined;
    const [paymentReference, ledgerReference] = await Promise.all([
      Payment.exists({
        ...(companyObjectId ? { companyId: companyObjectId } : {}),
        $or: [
          { 'paymentLines.chargeTypeCode': normalizedCode },
          { chargeTypeCode: normalizedCode },
          { 'transactions.chargeTypeCode': normalizedCode }
        ] as any
      }),
      PropertyAccount.exists({
        $or: [
          { 'transactions.chargeTypeCode': normalizedCode },
          { 'passThroughAccounts.type': normalizedCode }
        ]
      })
    ]);
    if (paymentReference || ledgerReference) {
      throw new AppError(`Charge type ${normalizedCode} is referenced by financial history and cannot be deleted or recoded`, 409);
    }
  }

  async getCompatibilityChargeLines(payment: any, companyId?: string | mongoose.Types.ObjectId): Promise<Array<PaymentChargeLine & { chargeType: IChargeType }>> {
    const rawLines = Array.isArray(payment?.paymentLines) && payment.paymentLines.length > 0
      ? payment.paymentLines
      : this.legacyPaymentLines(payment);
    const resolved: Array<PaymentChargeLine & { chargeType: IChargeType }> = [];
    for (const rawLine of rawLines) {
      const amount = Number(rawLine?.amount || 0);
      if (amount <= 0) continue;
      const code = this.normalizeCode(rawLine?.chargeTypeCode || rawLine?.code);
      const chargeType = await this.getChargeTypeByCode(code, companyId || payment?.companyId, { throwIfMissing: true });
      resolved.push({
        chargeTypeCode: code,
        amount,
        description: rawLine?.description,
        referenceId: rawLine?.referenceId,
        metadata: rawLine?.metadata,
        chargeType: chargeType!
      });
    }
    return resolved;
  }

  legacyPaymentLines(payment: any): PaymentChargeLine[] {
    const lines: PaymentChargeLine[] = [];
    const depositAmount = Math.max(0, Number(payment?.depositAmount || 0));
    const rentAllocated = Number(payment?.rentAllocated || 0);
    const levyAllocated = Number(payment?.levyAllocated || 0);
    const paymentType = String(payment?.paymentType || '').toLowerCase();
    const amount = Math.max(0, Number(payment?.amount || 0));

    if (rentAllocated > 0) {
      lines.push({ chargeTypeCode: 'RENT', amount: rentAllocated, description: 'Rent' });
    }
    if (levyAllocated > 0) {
      lines.push({ chargeTypeCode: 'LEVY', amount: levyAllocated, description: 'Levy' });
    }
    if (depositAmount > 0) {
      lines.push({ chargeTypeCode: 'DEPOSIT', amount: depositAmount, description: 'Deposit' });
    }
    if (lines.length === 0 && amount > 0 && paymentType !== 'sale') {
      lines.push({ chargeTypeCode: 'RENT', amount, description: 'Rent' });
    }
    return lines;
  }
}

export default new ChargeTypeService();
