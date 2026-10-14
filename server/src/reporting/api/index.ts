import express from 'express';
import mongoose from 'mongoose';
import { callerCanAccessProperty } from '../../utils/propertyAccess';
import { Company } from '../../models/Company';
import PropertyAccount from '../../models/PropertyAccount';
import { auth } from '../../middleware/auth';
import { ReportFormat, ReportPeriodDTO } from '../dto';
import { reportFactory } from '../reportFactory';

const router = express.Router();

const toPeriod = (period?: string): ReportPeriodDTO => {
  const now = new Date();
  const [yearRaw, monthRaw] = String(period || '').split('-');
  const year = yearRaw ? Number(yearRaw) : now.getUTCFullYear();
  const month = monthRaw ? Number(monthRaw) : now.getUTCMonth() + 1;
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));
  const label = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    label
  };
};

const toIsoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
};

const toStatementPeriod = (query: express.Request['query']): ReportPeriodDTO => {
  if (String(query.includeAllTransactions || '').toLowerCase() === 'true') {
    return {
      startDate: '1900-01-01',
      endDate: '9999-12-31',
      label: 'All Transactions'
    };
  }

  const from = toIsoDate(query.from);
  const to = toIsoDate(query.to);
  if (from && to) {
    return {
      startDate: from,
      endDate: to,
      label: `${from} - ${to}`
    };
  }

  return toPeriod(String(query.period || ''));
};

const isReportFormat = (value: string): value is ReportFormat =>
  ['pdf', 'excel', 'csv', 'json'].includes(value);

const getCompanyBrand = async (companyId: string): Promise<{ name?: string; logo?: string }> => {
  const company = await Company.findById(companyId).select('name tradingName logo').lean();
  return {
    name: String((company as any)?.tradingName || (company as any)?.name || '').trim() || undefined,
    logo: String((company as any)?.logo || '').trim() || undefined
  };
};

const resolveStatementPropertyId = async (propertyOrAccountId: string): Promise<string> => {
  if (!mongoose.isValidObjectId(propertyOrAccountId)) return propertyOrAccountId;
  const account = await PropertyAccount.findById(propertyOrAccountId).select('propertyId').lean();
  return account?.propertyId ? String(account.propertyId) : propertyOrAccountId;
};

router.get('/owner/:propertyId', auth, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
    const company = await getCompanyBrand(companyId);
    const propertyId = await resolveStatementPropertyId(String(req.params.propertyId));
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const ledgerType = String(req.query.ledger || req.query.ledgerType || '').toLowerCase();
    if (ledgerType !== 'rental' && ledgerType !== 'sale') {
      return res.status(400).json({
        code: 'LEDGER_REQUIRED',
        message: 'Owner statement requires ledger=rental or ledger=sale.'
      });
    }
    const dto = await reportFactory.createOwnerStatement({
      companyId,
      propertyId,
      ledgerType,
      period: toStatementPeriod(req.query),
      generatedBy: req.user?.userId,
      companyName: company.name,
      companyLogo: company.logo,
      correlationId: String((req as any).requestId || '')
    });
    return res.json(dto);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to create owner statement' });
  }
});

router.get('/owner/:propertyId/:format', auth, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
    const format = String(req.params.format || '').toLowerCase();
    if (!isReportFormat(format)) return res.status(400).json({ message: 'Unsupported report format' });
    const company = await getCompanyBrand(companyId);
    const propertyId = await resolveStatementPropertyId(String(req.params.propertyId));
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const ledgerType = String(req.query.ledger || req.query.ledgerType || '').toLowerCase();
    if (ledgerType !== 'rental' && ledgerType !== 'sale') {
      return res.status(400).json({
        code: 'LEDGER_REQUIRED',
        message: 'Owner statement requires ledger=rental or ledger=sale.'
      });
    }
    const result = await reportFactory.exportOwnerStatement(
      {
        companyId,
        propertyId,
        ledgerType,
        period: toStatementPeriod(req.query),
        generatedBy: req.user?.userId,
        companyName: company.name,
        companyLogo: company.logo,
        correlationId: String((req as any).requestId || '')
      },
      format
    );
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.buffer);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to export owner statement' });
  }
});

export default router;

