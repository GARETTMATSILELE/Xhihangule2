import mongoose from 'mongoose';
import { TrustAccount, ITrustAccount, TrustWorkflowState } from '../models/TrustAccount';
import { TrustTransaction, TrustTransactionType } from '../models/TrustTransaction';
import { TaxRecord } from '../models/TaxRecord';
import { TrustSettlement } from '../models/TrustSettlement';
import { TrustAuditLog } from '../models/TrustAuditLog';
import taxEngine from './taxEngine';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';

const money = (n: number): number => Number(Number(n || 0).toFixed(2));
const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

const WORKFLOW_TRANSITIONS: Record<TrustWorkflowState, TrustWorkflowState[]> = {
  VALUED: ['LISTED'],
  LISTED: ['DEPOSIT_RECEIVED', 'TRUST_OPEN'],
  DEPOSIT_RECEIVED: ['TRUST_OPEN', 'TAX_PENDING'],
  TRUST_OPEN: ['TAX_PENDING', 'SETTLED'],
  TAX_PENDING: ['SETTLED'],
  SETTLED: ['TRANSFER_COMPLETE', 'TRUST_CLOSED'],
  TRANSFER_COMPLETE: ['TRUST_CLOSED'],
  TRUST_CLOSED: []
};

type PostTransactionInput = {
  companyId: string;
  trustAccountId: string;
  propertyId: string;
  type: TrustTransactionType;
  paymentId?: string;
  debit?: number;
  credit?: number;
  vatComponent?: number;
  reference?: string;
  sourceEvent?: string;
  createdBy?: string;
};

type CreateTrustAccountInput = {
  companyId: string;
  propertyId: string;
  buyerId?: string;
  sellerId?: string;
  dealId?: string;
  openingBalance?: number;
  initialWorkflowState?: TrustWorkflowState;
  createdBy?: string;
};

class TrustAccountService {
  private indexesEnsured = false;

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await Promise.all([
      TrustAccount.collection.createIndex({ companyId: 1, propertyId: 1, status: 1 }),
      TrustAccount.collection.createIndex({ companyId: 1, buyerId: 1, status: 1 }),
      TrustAccount.collection.createIndex({ companyId: 1, status: 1, createdAt: -1 }),
      TrustTransaction.collection.createIndex({ trustAccountId: 1, createdAt: -1 }),
      TrustTransaction.collection.createIndex({ companyId: 1, type: 1, createdAt: -1 }),
      TrustTransaction.collection.createIndex(
        { paymentId: 1 },
        { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } }
      ),
      TaxRecord.collection.createIndex({ companyId: 1, trustAccountId: 1, taxType: 1, createdAt: -1 }),
      TrustSettlement.collection.createIndex({ companyId: 1, trustAccountId: 1 }, { unique: true }),
      TrustAuditLog.collection.createIndex({ companyId: 1, entityType: 1, entityId: 1, timestamp: -1 })
    ]);
    this.indexesEnsured = true;
  }

  private async withOptionalTransaction<T>(work: (session?: mongoose.ClientSession) => Promise<T>): Promise<T> {
    let session: mongoose.ClientSession | null = null;
    try {
      session = await mongoose.startSession();
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session || undefined);
      });
      return result as T;
    } catch (error: any) {
      if (error?.code === 20 || /Transaction numbers are only allowed/.test(String(error?.message || ''))) {
        return work(undefined);
      }
      throw error;
    } finally {
      if (session) {
        try {
          session.endSession();
        } catch {
          // noop
        }
      }
    }
  }

  private async audit(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    action: string;
    sourceEvent?: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    performedBy?: string;
    session?: mongoose.ClientSession;
  }): Promise<void> {
    await TrustAuditLog.create(
      [
        {
          companyId: toObjectId(input.companyId),
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          sourceEvent: input.sourceEvent,
          oldValue: input.oldValue || null,
          newValue: input.newValue || null,
          performedBy: input.performedBy ? toObjectId(input.performedBy) : undefined,
          timestamp: new Date()
        }
      ],
      input.session ? { session: input.session } : undefined
    );
  }

  async createTrustAccount(input: CreateTrustAccountInput): Promise<ITrustAccount> {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const existing = await TrustAccount.findOne({
        companyId: toObjectId(input.companyId),
        propertyId: toObjectId(input.propertyId),
        status: { $in: ['OPEN', 'SETTLED'] }
      }).session(session || null);

      if (existing) return existing;

      const openingBalance = money(input.openingBalance || 0);
      const created = await TrustAccount.create(
        [
          {
            companyId: toObjectId(input.companyId),
            propertyId: toObjectId(input.propertyId),
            buyerId: input.buyerId ? toObjectId(input.buyerId) : undefined,
            sellerId: input.sellerId ? toObjectId(input.sellerId) : undefined,
            dealId: input.dealId,
            openingBalance,
            runningBalance: openingBalance,
            closingBalance: openingBalance,
            purchasePrice: 0,
            amountReceived: openingBalance,
            amountOutstanding: 0,
            status: 'OPEN',
            workflowState: input.initialWorkflowState || 'TRUST_OPEN'
          }
        ],
        session ? { session } : undefined
      );
      const trust = created[0];
      await this.audit({
        companyId: input.companyId,
        entityType: 'TRUST_ACCOUNT',
        entityId: String(trust._id),
        action: 'CREATED',
        sourceEvent: 'trust.account.created',
        newValue: trust.toObject(),
        performedBy: input.createdBy,
        session
      });
      return trust;
    });
  }

  async getByProperty(companyId: string, propertyId: string): Promise<ITrustAccount | null> {
    await this.ensureIndexes();
    return TrustAccount.findOne({
      companyId: toObjectId(companyId),
      propertyId: toObjectId(propertyId),
      status: { $in: ['OPEN', 'SETTLED', 'CLOSED'] }
    }).sort({ createdAt: -1 });
  }

  async getById(companyId: string, trustAccountId: string): Promise<ITrustAccount | null> {
    await this.ensureIndexes();
    return TrustAccount.findOne({
      _id: toObjectId(trustAccountId),
      companyId: toObjectId(companyId)
    });
  }

  async listTrustAccounts(companyId: string, params?: { status?: string; search?: string; page?: number; limit?: number }) {
    await this.ensureIndexes();
    const page = Math.max(1, Number(params?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(params?.limit || 20)));
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = { companyId: toObjectId(companyId) };
    if (params?.status && ['OPEN', 'SETTLED', 'CLOSED'].includes(params.status)) {
      query.status = params.status;
    }

    const list = await TrustAccount.find(query)
      .populate('propertyId', 'name address')
      .populate('buyerId', 'firstName lastName')
      .populate('sellerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await TrustAccount.countDocuments(query);

    const filtered = params?.search
      ? list.filter((row: any) => {
          const needle = String(params.search || '').toLowerCase();
          const name = String(row?.propertyId?.name || '').toLowerCase();
          const addr = String(row?.propertyId?.address || '').toLowerCase();
          return name.includes(needle) || addr.includes(needle);
        })
      : list;
    const propertyIds = filtered
      .map((row: any) => String(row?.propertyId?._id || row?.propertyId || '').trim())
      .filter((id) => id.length > 0);

    const paymentRows = propertyIds.length
      ? await Payment.find({
          companyId: toObjectId(companyId),
          propertyId: { $in: propertyIds.map((id) => toObjectId(id)) },
          paymentType: 'sale',
          status: 'completed',
          isProvisional: { $ne: true },
          isInSuspense: { $ne: true }
        })
          .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
          .select('propertyId buyerName sellerName')
          .lean()
      : [];

    const namesByProperty = new Map<string, { buyer: string; seller: string }>();
    for (const p of paymentRows as any[]) {
      const key = String(p?.propertyId || '');
      if (!key) continue;
      const existing = namesByProperty.get(key) || { buyer: '', seller: '' };
      const buyer = existing.buyer || String(p?.buyerName || '').trim();
      const seller = existing.seller || String(p?.sellerName || '').trim();
      namesByProperty.set(key, { buyer, seller });
    }

    const items = filtered.map((row: any) => {
      const propertyKey = String(row?.propertyId?._id || row?.propertyId || '');
      const partyNames = namesByProperty.get(propertyKey) || { buyer: '', seller: '' };
      return {
        ...row,
        partyNames
      };
    });

    return { items, total, page, limit };
  }

  async postTransaction(input: PostTransactionInput) {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const account = await TrustAccount.findOne({
        _id: toObjectId(input.trustAccountId),
        companyId: toObjectId(input.companyId)
      }).session(session || null);
      if (!account) throw new Error('Trust account not found');
      if (account.status === 'CLOSED') throw new Error('Trust account is closed');

      const settlement = await TrustSettlement.findOne({
        companyId: toObjectId(input.companyId),
        trustAccountId: account._id
      }).session(session || null);
      if (settlement?.locked) throw new Error('Trust settlement is locked');

      if (input.paymentId) {
        const existing = await TrustTransaction.findOne({
          companyId: toObjectId(input.companyId),
          paymentId: toObjectId(input.paymentId)
        }).session(session || null);
        if (existing) {
          await this.audit({
            companyId: input.companyId,
            entityType: 'TRUST_TRANSACTION',
            entityId: String(existing._id),
            action: 'DUPLICATE_IGNORED',
            sourceEvent: input.sourceEvent || 'payment.confirmed',
            oldValue: existing.toObject() as unknown as Record<string, unknown>,
            newValue: existing.toObject() as unknown as Record<string, unknown>,
            performedBy: input.createdBy,
            session
          });
          return { account, transaction: existing, duplicate: true };
        }
      }

      const debit = money(input.debit || 0);
      const credit = money(input.credit || 0);
      if (debit <= 0 && credit <= 0) throw new Error('Debit or credit amount is required');

      const existingTxCount = await TrustTransaction.countDocuments({
        companyId: toObjectId(input.companyId),
        trustAccountId: account._id
      }).session(session || null);

      const nextBalance = money(account.runningBalance + credit - debit);
      if (nextBalance < 0) throw new Error('Insufficient trust balance for this transaction');

      const tx = await TrustTransaction.create(
        [
          {
            companyId: toObjectId(input.companyId),
            trustAccountId: account._id,
            propertyId: toObjectId(input.propertyId),
            paymentId: input.paymentId ? toObjectId(input.paymentId) : undefined,
            type: input.type,
            debit,
            credit,
            vatComponent: money(input.vatComponent || 0),
            runningBalance: nextBalance,
            reference: input.reference,
            sourceEvent: input.sourceEvent,
            createdBy: input.createdBy ? toObjectId(input.createdBy) : undefined
          }
        ],
        session ? { session } : undefined
      ).catch(async (error: any) => {
        if (error?.code === 11000 && input.paymentId) {
          const existing = await TrustTransaction.findOne({
            companyId: toObjectId(input.companyId),
            paymentId: toObjectId(input.paymentId)
          }).session(session || null);
          if (existing) {
            await this.audit({
              companyId: input.companyId,
              entityType: 'TRUST_TRANSACTION',
              entityId: String(existing._id),
              action: 'DUPLICATE_KEY_IGNORED',
              sourceEvent: input.sourceEvent || 'payment.confirmed',
              oldValue: existing.toObject() as unknown as Record<string, unknown>,
              newValue: existing.toObject() as unknown as Record<string, unknown>,
              performedBy: input.createdBy,
              session
            });
            return [existing] as any;
          }
        }
        throw error;
      });

      const before = account.toObject();
      // Business rule: once first buyer funding is posted, opening balance becomes funded opening amount.
      if (
        existingTxCount === 0 &&
        Number(account.openingBalance || 0) === 0 &&
        input.type === 'BUYER_PAYMENT' &&
        credit > 0 &&
        debit === 0
      ) {
        account.openingBalance = nextBalance;
      }
      account.runningBalance = nextBalance;
      account.closingBalance = nextBalance;
      account.lastTransactionAt = new Date();
      if (input.type === 'BUYER_PAYMENT') {
        const property = await Property.findById(account.propertyId).select('price').lean();
        const purchasePrice = money(Number((property as any)?.price || account.purchasePrice || 0));
        const amountReceived = money((account.amountReceived || 0) + credit - debit);
        account.purchasePrice = purchasePrice;
        account.amountReceived = amountReceived;
        account.amountOutstanding = money(Math.max(0, purchasePrice - amountReceived));
      }
      if (input.type === 'BUYER_PAYMENT' && account.workflowState === 'LISTED') {
        account.workflowState = 'DEPOSIT_RECEIVED';
      }
      await account.save(session ? { session } : undefined);

      await this.audit({
        companyId: input.companyId,
        entityType: 'TRUST_TRANSACTION',
        entityId: String(tx[0]._id),
        action: 'POSTED',
        sourceEvent: input.sourceEvent,
        newValue: tx[0].toObject(),
        performedBy: input.createdBy,
        session
      });
      await this.audit({
        companyId: input.companyId,
        entityType: 'TRUST_ACCOUNT',
        entityId: String(account._id),
        action: 'BALANCE_UPDATED',
        sourceEvent: input.sourceEvent,
        oldValue: before as unknown as Record<string, unknown>,
        newValue: account.toObject() as unknown as Record<string, unknown>,
        performedBy: input.createdBy,
        session
      });

      return { account, transaction: tx[0] };
    });
  }

  async recordBuyerPayment(input: {
    companyId: string;
    propertyId: string;
    trustAccountId?: string;
    amount: number;
    reference?: string;
    paymentId?: string;
    sourceEvent?: string;
    createdBy?: string;
    buyerId?: string;
    sellerId?: string;
  }) {
    const trust =
      input.trustAccountId
        ? await TrustAccount.findOne({ _id: toObjectId(input.trustAccountId), companyId: toObjectId(input.companyId) })
        : await this.getByProperty(input.companyId, input.propertyId);
    const account =
      trust ||
      (await this.createTrustAccount({
        companyId: input.companyId,
        propertyId: input.propertyId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        createdBy: input.createdBy
      }));
    return this.postTransaction({
      companyId: input.companyId,
      trustAccountId: String(account._id),
      propertyId: input.propertyId,
      type: 'BUYER_PAYMENT',
      paymentId: input.paymentId,
      credit: input.amount,
      reference: input.reference,
      sourceEvent: input.sourceEvent || 'payment.confirmed',
      createdBy: input.createdBy
    });
  }

  async reverseBuyerPayment(input: {
    companyId: string;
    propertyId: string;
    trustAccountId?: string;
    amount: number;
    reference?: string;
    paymentId?: string;
    sourceEvent?: string;
    createdBy?: string;
    buyerId?: string;
    sellerId?: string;
  }) {
    const trust =
      input.trustAccountId
        ? await TrustAccount.findOne({ _id: toObjectId(input.trustAccountId), companyId: toObjectId(input.companyId) })
        : await this.getByProperty(input.companyId, input.propertyId);
    const account =
      trust ||
      (await this.createTrustAccount({
        companyId: input.companyId,
        propertyId: input.propertyId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        createdBy: input.createdBy
      }));
    return this.postTransaction({
      companyId: input.companyId,
      trustAccountId: String(account._id),
      propertyId: input.propertyId,
      type: 'BUYER_PAYMENT',
      paymentId: input.paymentId,
      debit: Math.abs(Number(input.amount || 0)),
      reference: input.reference,
      sourceEvent: input.sourceEvent || 'payment.reversed',
      createdBy: input.createdBy
    });
  }

  async calculateSettlement(input: {
    companyId: string;
    trustAccountId: string;
    salePrice?: number;
    commissionAmount?: number;
    applyVatOnSale?: boolean;
    cgtRate?: number;
    cgtAmount?: number;
    vatSaleRate?: number;
    vatOnCommissionRate?: number;
    createdBy?: string;
  }) {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const account = await TrustAccount.findOne({
        _id: toObjectId(input.trustAccountId),
        companyId: toObjectId(input.companyId)
      }).session(session || null);
      if (!account) throw new Error('Trust account not found');
      if (account.status === 'CLOSED') throw new Error('Trust account is closed');

      const settlementPayments = await Payment.find({
        companyId: toObjectId(input.companyId),
        propertyId: account.propertyId,
        paymentType: 'sale',
        status: 'completed',
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
      })
        .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
        .lean()
        .session(session || null);

      if (!settlementPayments.length) {
        throw new Error('No completed sale payments found for this property');
      }

      const derivedSalePrice = money(
        settlementPayments.reduce((sum, payment: any) => sum + Number(payment?.amount || 0), 0)
      );
      const derivedCommission = money(
        settlementPayments.reduce(
          (sum, payment: any) =>
            sum +
            Number(
              payment?.commissionDetails?.totalCommission ??
                payment?.totalCommission ??
                payment?.TotalCommission ??
                0
            ),
          0
        )
      );
      const derivedVatOnCommission = money(
        settlementPayments.reduce(
          (sum, payment: any) =>
            sum +
            Number(
              payment?.commissionDetails?.vatOnCommission ??
                payment?.vatOnCommission ??
                payment?.VATOnCommission ??
                payment?.['vat on commission'] ??
                0
            ),
          0
        )
      );
      const derivedVatOnSale = money(
        settlementPayments.reduce(
          (sum, payment: any) =>
            sum +
            Number(
              payment?.taxDetails?.vatOnSale ??
                payment?.vatOnSale ??
                payment?.vatAmount ??
                0
            ),
          0
        )
      );

      const resolvedCommission = derivedCommission > 0 ? derivedCommission : money(Number(input.commissionAmount || 0));
      const summaryBase = taxEngine.generateTaxSummary({
        salePrice: derivedSalePrice,
        commissionAmount: resolvedCommission,
        vatOnCommissionAmount: derivedVatOnCommission > 0 ? derivedVatOnCommission : undefined,
        applyVatOnSale: input.applyVatOnSale,
        cgtRate: input.cgtRate,
        vatSaleRate: input.vatSaleRate,
        vatOnCommissionRate: input.vatOnCommissionRate
      });
      const cgt = input.cgtAmount != null ? money(input.cgtAmount) : money(summaryBase.cgt);
      const vatOnSale = derivedVatOnSale > 0 ? derivedVatOnSale : money(summaryBase.vatOnSale);
      const vatOnCommission = derivedVatOnCommission > 0 ? derivedVatOnCommission : money(summaryBase.vatOnCommission);
      const commission = money(summaryBase.commission);
      const totalDeductions = money(cgt + commission + vatOnCommission + vatOnSale);
      const sellerNetPayout = money(Math.max(0, derivedSalePrice - totalDeductions));

      const deductions = [
        { type: 'CGT', amount: cgt },
        { type: 'COMMISSION', amount: commission },
        { type: 'VAT_ON_COMMISSION', amount: vatOnCommission },
        { type: 'VAT', amount: vatOnSale }
      ].filter((d) => d.amount > 0);

      const settlement = await TrustSettlement.findOneAndUpdate(
        { companyId: toObjectId(input.companyId), trustAccountId: account._id },
        {
          $set: {
            salePrice: derivedSalePrice,
            grossProceeds: derivedSalePrice,
            deductions,
            netPayout: sellerNetPayout,
            settlementDate: new Date()
          },
          $setOnInsert: { locked: false }
        },
        { upsert: true, new: true, session }
      );

      if (settlement) {
        await this.audit({
          companyId: input.companyId,
          entityType: 'TRUST_SETTLEMENT',
          entityId: String(settlement._id),
          action: 'CALCULATED',
          sourceEvent: 'trust.settlement.calculated',
          newValue: settlement.toObject() as unknown as Record<string, unknown>,
          performedBy: input.createdBy,
          session
        });
      }

      return {
        settlement,
        taxSummary: {
          ...summaryBase,
          cgt,
          vatOnSale,
          vatOnCommission,
          commission,
          totalDeductions,
          sellerNetPayout,
          breakdown: {
            ...(summaryBase.breakdown || {}),
            sourceOfTruth: {
              salePrice: 'payments.sum(amount)',
              commission: 'payments.sum(commissionDetails.totalCommission)',
              vatOnCommission: derivedVatOnCommission > 0 ? 'payments.sum(commissionDetails.vatOnCommission)' : 'tax-engine',
              vatOnSale: derivedVatOnSale > 0 ? 'payments.sum(vatOnSale)' : 'tax-engine'
            }
          }
        }
      };
    });
  }

  async applyTaxDeductions(input: {
    companyId: string;
    trustAccountId: string;
    createdBy?: string;
    zimraPaymentReference?: string;
  }) {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const account = await TrustAccount.findOne({
        _id: toObjectId(input.trustAccountId),
        companyId: toObjectId(input.companyId)
      }).session(session || null);
      if (!account) throw new Error('Trust account not found');

      const settlement = await TrustSettlement.findOne({
        companyId: toObjectId(input.companyId),
        trustAccountId: account._id
      }).session(session || null);
      if (!settlement) throw new Error('Settlement must be calculated first');
      if (settlement.locked) throw new Error('Settlement is locked');

      const taxItems = settlement.deductions.filter((d) =>
        ['CGT', 'VAT', 'VAT_ON_COMMISSION', 'COMMISSION'].includes(String(d.type || '').toUpperCase())
      );
      const settlementRefPrefix = `settlement:${settlement._id}:`;
      const existingSettlementDeductions = await TrustTransaction.find({
        companyId: toObjectId(input.companyId),
        trustAccountId: account._id,
        reference: { $regex: `^${settlementRefPrefix}` }
      })
        .select('type debit reference')
        .lean()
        .session(session || null);

      const appliedByType = existingSettlementDeductions.reduce<Record<string, number>>((acc, tx: any) => {
        const txType = String(tx?.type || '').toUpperCase();
        const deductionType =
          txType === 'CGT_DEDUCTION'
            ? 'CGT'
            : txType === 'VAT_DEDUCTION'
              ? 'VAT'
              : txType === 'VAT_ON_COMMISSION'
                ? 'VAT_ON_COMMISSION'
                : txType === 'COMMISSION_DEDUCTION'
                  ? 'COMMISSION'
                  : '';
        if (!deductionType) return acc;
        acc[deductionType] = money((acc[deductionType] || 0) + Number(tx?.debit || 0));
        return acc;
      }, {});

      let postedAnyDeduction = false;

      for (const d of taxItems) {
        const normalizedType = String(d.type || '').toUpperCase();
        const targetAmount = money(Number(d.amount || 0));
        const alreadyApplied = money(appliedByType[normalizedType] || 0);
        const deltaToApply = money(targetAmount - alreadyApplied);
        if (deltaToApply <= 0) continue;

        if (normalizedType === 'COMMISSION') {
          await this.postTransaction({
            companyId: input.companyId,
            trustAccountId: input.trustAccountId,
            propertyId: String(account.propertyId),
            type: 'COMMISSION_DEDUCTION',
            debit: deltaToApply,
            reference: `settlement:${settlement._id}:commission`,
            createdBy: input.createdBy
          });
          postedAnyDeduction = true;
          continue;
        }

        const taxType = normalizedType as 'CGT' | 'VAT' | 'VAT_ON_COMMISSION';
        await TaxRecord.create(
          [
            {
              companyId: toObjectId(input.companyId),
              trustAccountId: account._id,
              taxType,
              amount: deltaToApply,
              calculationBreakdown: {
                settlementId: String(settlement._id),
                deductionType: d.type,
                appliedDelta: deltaToApply
              },
              paidToZimra: false,
              paymentReference: input.zimraPaymentReference
            }
          ],
          session ? { session } : undefined
        );

        await this.postTransaction({
          companyId: input.companyId,
          trustAccountId: input.trustAccountId,
          propertyId: String(account.propertyId),
          type: taxType === 'CGT' ? 'CGT_DEDUCTION' : taxType === 'VAT' ? 'VAT_DEDUCTION' : 'VAT_ON_COMMISSION',
          debit: deltaToApply,
          reference: `settlement:${settlement._id}:${taxType.toLowerCase()}`,
          createdBy: input.createdBy
        });
        postedAnyDeduction = true;
      }

      if (!postedAnyDeduction) {
        return { success: true, alreadyApplied: true };
      }

      const before = account.toObject();
      account.workflowState = 'TAX_PENDING';
      await account.save(session ? { session } : undefined);
      await this.audit({
        companyId: input.companyId,
        entityType: 'TRUST_ACCOUNT',
        entityId: String(account._id),
        action: 'TAX_APPLIED',
        sourceEvent: 'trust.tax.applied',
        oldValue: before as unknown as Record<string, unknown>,
        newValue: account.toObject() as unknown as Record<string, unknown>,
        performedBy: input.createdBy,
        session
      });

      return { success: true };
    });
  }

  async transferToSeller(input: {
    companyId: string;
    trustAccountId: string;
    amount: number;
    createdBy?: string;
    reference?: string;
  }) {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const account = await TrustAccount.findOne({
        _id: toObjectId(input.trustAccountId),
        companyId: toObjectId(input.companyId)
      }).session(session || null);
      if (!account) throw new Error('Trust account not found');

      const settlement = await TrustSettlement.findOne({
        companyId: toObjectId(input.companyId),
        trustAccountId: account._id
      }).session(session || null);
      if (!settlement) throw new Error('Settlement must exist before transfer');
      if (settlement.locked) throw new Error('Settlement is locked');
      if (money(input.amount) > money(settlement.netPayout)) throw new Error('Transfer amount exceeds settlement net payout');

      await this.postTransaction({
        companyId: input.companyId,
        trustAccountId: String(account._id),
        propertyId: String(account.propertyId),
        type: 'TRANSFER_TO_SELLER',
        debit: input.amount,
        reference: input.reference || `settlement:${settlement._id}:seller-transfer`,
        createdBy: input.createdBy
      });

      account.status = 'SETTLED';
      account.workflowState = 'TRANSFER_COMPLETE';
      await account.save(session ? { session } : undefined);
      return { success: true };
    });
  }

  async closeTrustAccount(input: { companyId: string; trustAccountId: string; createdBy?: string; lockReason?: string }) {
    await this.ensureIndexes();
    return this.withOptionalTransaction(async (session) => {
      const account = await TrustAccount.findOne({
        _id: toObjectId(input.trustAccountId),
        companyId: toObjectId(input.companyId)
      }).session(session || null);
      if (!account) throw new Error('Trust account not found');
      if (account.runningBalance !== 0) throw new Error('Cannot close trust account with non-zero balance');

      const before = account.toObject();
      account.status = 'CLOSED';
      account.workflowState = 'TRUST_CLOSED';
      account.closedAt = new Date();
      account.lockReason = input.lockReason || 'Closed by accountant';
      await account.save(session ? { session } : undefined);

      await TrustSettlement.updateOne(
        { companyId: toObjectId(input.companyId), trustAccountId: account._id },
        { $set: { locked: true } },
        { session }
      );
      await this.audit({
        companyId: input.companyId,
        entityType: 'TRUST_ACCOUNT',
        entityId: String(account._id),
        action: 'CLOSED',
        sourceEvent: 'trust.account.closed',
        oldValue: before as unknown as Record<string, unknown>,
        newValue: account.toObject() as unknown as Record<string, unknown>,
        performedBy: input.createdBy,
        session
      });

      return account;
    });
  }

  async transitionWorkflowState(input: {
    companyId: string;
    trustAccountId: string;
    toState: TrustWorkflowState;
    createdBy?: string;
  }) {
    await this.ensureIndexes();
    const account = await TrustAccount.findOne({
      _id: toObjectId(input.trustAccountId),
      companyId: toObjectId(input.companyId)
    });
    if (!account) throw new Error('Trust account not found');
    const allowed = WORKFLOW_TRANSITIONS[account.workflowState] || [];
    if (!allowed.includes(input.toState)) {
      throw new Error(`Invalid workflow transition from ${account.workflowState} to ${input.toState}`);
    }
    const before = account.toObject();
    account.workflowState = input.toState;
    await account.save();
    await this.audit({
      companyId: input.companyId,
      entityType: 'TRUST_ACCOUNT',
      entityId: String(account._id),
      action: 'WORKFLOW_STATE_CHANGED',
      sourceEvent: 'trust.workflow.transition',
      oldValue: before as unknown as Record<string, unknown>,
      newValue: account.toObject() as unknown as Record<string, unknown>,
      performedBy: input.createdBy
    });
    return account;
  }

  async getLedger(companyId: string, trustAccountId: string, params?: { page?: number; limit?: number }) {
    await this.ensureIndexes();
    const page = Math.max(1, Number(params?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(params?.limit || 50)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      TrustTransaction.find({ companyId: toObjectId(companyId), trustAccountId: toObjectId(trustAccountId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TrustTransaction.countDocuments({ companyId: toObjectId(companyId), trustAccountId: toObjectId(trustAccountId) })
    ]);
    return { items, total, page, limit };
  }

  async verifyAndRepairAccountInvariants(input: {
    companyId: string;
    trustAccountId: string;
    performedBy?: string;
    sourceEvent?: string;
  }) {
    await this.ensureIndexes();
    const account = await TrustAccount.findOne({
      _id: toObjectId(input.trustAccountId),
      companyId: toObjectId(input.companyId)
    });
    if (!account) throw new Error('Trust account not found');

    const txs = await TrustTransaction.find({
      companyId: toObjectId(input.companyId),
      trustAccountId: toObjectId(input.trustAccountId)
    })
      .select('type debit credit runningBalance createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const oldest = txs.length ? txs[0] : null;
    const newest = txs.length ? txs[txs.length - 1] : null;
    const startsWithFundingCredit =
      !!oldest &&
      String((oldest as any).type || '') === 'BUYER_PAYMENT' &&
      Number((oldest as any).credit || 0) > 0 &&
      Number((oldest as any).debit || 0) === 0;

    const expectedOpening = oldest
      ? (
          startsWithFundingCredit
            ? money(Number(oldest.runningBalance || 0))
            : money(Number(oldest.runningBalance || 0) - Number(oldest.credit || 0) + Number(oldest.debit || 0))
        )
      : money(Number(account.openingBalance || 0));
    const expectedRunning = newest
      ? money(Number(newest.runningBalance || 0))
      : money(Number(account.openingBalance || 0));
    const expectedClosing = expectedRunning;
    const expectedLastTransactionAt = newest ? new Date(newest.createdAt) : undefined;

    const buyerFundsNet = money(
      txs
        .filter((row: any) => String(row?.type || '') === 'BUYER_PAYMENT')
        .reduce((sum: number, row: any) => sum + Number(row?.credit || 0) - Number(row?.debit || 0), 0)
    );
    const expectedAmountReceived = money(Math.max(0, buyerFundsNet));
    const expectedAmountOutstanding = money(Math.max(0, Number(account.purchasePrice || 0) - expectedAmountReceived));

    const patch: Record<string, any> = {};
    if (money(Number(account.openingBalance || 0)) !== expectedOpening) patch.openingBalance = expectedOpening;
    if (money(Number(account.runningBalance || 0)) !== expectedRunning) patch.runningBalance = expectedRunning;
    if (money(Number(account.closingBalance || 0)) !== expectedClosing) patch.closingBalance = expectedClosing;
    if (money(Number(account.amountReceived || 0)) !== expectedAmountReceived) patch.amountReceived = expectedAmountReceived;
    if (money(Number(account.amountOutstanding || 0)) !== expectedAmountOutstanding) patch.amountOutstanding = expectedAmountOutstanding;
    if (expectedLastTransactionAt) patch.lastTransactionAt = expectedLastTransactionAt;

    const repaired = Object.keys(patch).length > 0;
    if (!repaired) {
      return {
        repaired: false,
        expected: {
          openingBalance: expectedOpening,
          runningBalance: expectedRunning,
          closingBalance: expectedClosing,
          amountReceived: expectedAmountReceived,
          amountOutstanding: expectedAmountOutstanding
        }
      };
    }

    const before = account.toObject();
    account.set(patch);
    await account.save();

    await this.audit({
      companyId: input.companyId,
      entityType: 'TRUST_ACCOUNT',
      entityId: String(account._id),
      action: 'INVARIANT_AUTO_REPAIRED',
      sourceEvent: input.sourceEvent || 'trust.invariant.repair',
      oldValue: before as unknown as Record<string, unknown>,
      newValue: account.toObject() as unknown as Record<string, unknown>,
      performedBy: input.performedBy
    });

    return {
      repaired: true,
      expected: {
        openingBalance: expectedOpening,
        runningBalance: expectedRunning,
        closingBalance: expectedClosing,
        amountReceived: expectedAmountReceived,
        amountOutstanding: expectedAmountOutstanding
      }
    };
  }

  async getTaxSummary(companyId: string, trustAccountId: string) {
    const trustAccountObjectId = toObjectId(trustAccountId);
    const companyObjectId = toObjectId(companyId);

    const [records, account] = await Promise.all([
      TaxRecord.find({ companyId: companyObjectId, trustAccountId: trustAccountObjectId }).lean(),
      TrustAccount.findOne({ _id: trustAccountObjectId, companyId: companyObjectId }).select('propertyId').lean()
    ]);

    const cgt = money(records.filter((r) => r.taxType === 'CGT').reduce((s, r) => s + Number(r.amount || 0), 0));
    const vat = money(records.filter((r) => r.taxType === 'VAT').reduce((s, r) => s + Number(r.amount || 0), 0));
    const vatOnCommissionFromTaxRecords = money(
      records.filter((r) => r.taxType === 'VAT_ON_COMMISSION').reduce((s, r) => s + Number(r.amount || 0), 0)
    );
    let vatOnCommissionFromPayments: number | null = null;

    if (account?.propertyId) {
      const salePayments = await Payment.find({
        companyId: companyObjectId,
        propertyId: account.propertyId,
        paymentType: 'sale',
        status: 'completed',
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
      })
        .select('commissionDetails.vatOnCommission')
        .lean();

      vatOnCommissionFromPayments = money(
        salePayments.reduce((sum, payment: any) => sum + Number(payment?.commissionDetails?.vatOnCommission || 0), 0)
      );
    }

    const vatOnCommission =
      vatOnCommissionFromPayments !== null ? vatOnCommissionFromPayments : vatOnCommissionFromTaxRecords;

    return {
      cgt,
      vat,
      vatOnCommission,
      total: money(cgt + vat + vatOnCommission),
      paidToZimraCount: records.filter((r) => r.paidToZimra).length,
      records
    };
  }

  async getAuditLogs(companyId: string, trustAccountId: string, limit = 200) {
    return TrustAuditLog.find({
      companyId: toObjectId(companyId),
      $or: [{ entityId: trustAccountId }, { entityType: 'TRUST_ACCOUNT', entityId: trustAccountId }]
    })
      .sort({ timestamp: -1 })
      .limit(Math.min(500, Math.max(1, Number(limit || 200))))
      .lean();
  }

  async getReconciliation(companyId: string, trustAccountId: string) {
    const [account, txs, settlement] = await Promise.all([
      TrustAccount.findOne({ _id: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean(),
      TrustTransaction.find({ trustAccountId: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean(),
      TrustSettlement.findOne({ trustAccountId: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean()
    ]);
    if (!account) throw new Error('Trust account not found');

    const totalBuyerFundsHeld = money(
      txs
        .filter((t) => t.type === 'BUYER_PAYMENT')
        .reduce((sum, t) => sum + Number(t.credit || 0) - Number(t.debit || 0), 0)
    );
    const sellerLiability = money(settlement?.netPayout || 0);
    const trustBankBalance = money(account.runningBalance || 0);
    const variance = money(trustBankBalance - totalBuyerFundsHeld);

    return {
      trustBankBalance,
      totalBuyerFundsHeld,
      sellerLiability,
      variance,
      healthy: variance === 0
    };
  }
}

export default new TrustAccountService();
