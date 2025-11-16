import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Deal } from '../models/Deal';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';
import SalesFile from '../models/SalesFile';
import { Property } from '../models/Property';
import { Lead } from '../models/Lead';
import { ALLOWED_DOCS_BY_STAGE, STAGES, STAGE_ORDER, SALES_DOC_TYPES, isValidTransition } from '../constants/salesDocs';
import archiver from 'archiver';
import { Readable } from 'stream';

export const listDeals = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    if (req.query.propertyId) {
      query.propertyId = new mongoose.Types.ObjectId(String(req.query.propertyId));
    }
    if (req.query.stage) {
      query.stage = String(req.query.stage);
    }

    const deals = await Deal.find(query).sort({ createdAt: -1 });
    res.json({ status: 'success', data: deals });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to fetch deals' });
  }
};

export const createDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { propertyId, buyerName, buyerEmail, buyerPhone, stage, offerPrice, closeDate, notes } = req.body;
    if (!propertyId || !buyerName || offerPrice == null) {
      throw new AppError('Missing required fields: propertyId, buyerName, offerPrice', 400);
    }

    const deal = await Deal.create({
      propertyId,
      buyerName,
      buyerEmail,
      buyerPhone,
      stage: stage || 'Offer',
      offerPrice,
      closeDate: closeDate || null,
      notes: notes || '',
      won: false,
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to create deal' });
  }
};

export const updateDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { id } = req.params;
    const updates = req.body || {};

    const deal = await Deal.findOneAndUpdate(
      { _id: id, companyId: req.user.companyId },
      updates,
      { new: true }
    );
    if (!deal) throw new AppError('Deal not found', 404);
    res.json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to update deal' });
  }
};

export const deleteDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { id } = req.params;
    const deal = await Deal.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!deal) throw new AppError('Deal not found', 404);
    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to delete deal' });
  }
};

export const progressDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const { toStage } = req.body as { toStage: string };
    if (!toStage) throw new AppError('toStage is required', 400);

    const deal = await Deal.findOne({ _id: id, companyId: req.user.companyId });
    if (!deal) throw new AppError('Deal not found', 404);

    if (!isValidTransition(deal.stage, toStage)) {
      throw new AppError(`Invalid transition from ${deal.stage} to ${toStage}`, 400);
    }

    deal.stage = toStage as any;
    if (toStage === STAGES.WON) {
      deal.won = true;
      if (!deal.closeDate) {
        deal.closeDate = new Date();
      }
    }
    await deal.save();

    // On Won, generate package file
    if (toStage === STAGES.WON) {
      const pkg = await generateWonPackageZip(deal._id.toString(), req.user.userId!, req.user.companyId!);
      // Store as SalesFile
      await SalesFile.create({
        propertyId: deal.propertyId,
        dealId: deal._id,
        companyId: req.user.companyId,
        fileName: `deal-${deal._id}-package.zip`,
        docType: SALES_DOC_TYPES.WON_PACKAGE,
        fileUrl: pkg.toString('base64'),
        uploadedBy: req.user.userId,
        stage: STAGES.WON
      });
    }

    res.json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to progress deal' });
  }
};

async function generateWonPackageZip(dealId: string, userId: string, companyId: string): Promise<Buffer> {
  const deal = await Deal.findOne({ _id: dealId, companyId }).lean();
  if (!deal) {
    throw new AppError('Deal not found for packaging', 404);
  }
  const property = await Property.findOne({ _id: deal.propertyId, companyId }).lean();
  const files = await SalesFile.find({ dealId, companyId }).lean();

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));

  const summary = {
    deal,
    property,
    documents: files.map(f => ({ id: f._id, docType: f.docType, fileName: f.fileName, stage: f.stage, uploadedAt: f.uploadedAt }))
  };

  archive.append(Buffer.from(JSON.stringify(summary, null, 2)), { name: 'summary.json' });

  for (const f of files) {
    try {
      const buf = Buffer.from(f.fileUrl, 'base64');
      const safeName = `${f.docType}/${f.fileName}`;
      archive.append(Readable.from(buf), { name: safeName });
    } catch {}
  }

  await archive.finalize();
  const result = Buffer.concat(chunks);
  return result;
}

export const dealsSummary = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const companyId = new mongoose.Types.ObjectId(req.user.companyId);
    const pipeline: any[] = [
      { $match: { companyId } },
      {
        $group: {
          _id: { stage: '$stage', ownerId: '$ownerId' },
          count: { $sum: 1 },
          totalOffer: { $sum: '$offerPrice' }
        }
      }
    ];
    const agg = await (mongoose.connection as any).collection('deals').aggregate(pipeline).toArray();
    res.json({ status: 'success', data: agg });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to summarize deals' });
  }
};

export const createDealFromLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { leadId, propertyId, offerPrice, notes } = req.body as any;
    if (!leadId || !propertyId || offerPrice == null) {
      throw new AppError('Missing required fields: leadId, propertyId, offerPrice', 400);
    }

    const lead = await Lead.findOne({ _id: leadId, companyId: req.user.companyId });
    if (!lead) throw new AppError('Lead not found', 404);

    const deal = await Deal.create({
      propertyId,
      leadId: lead._id,
      buyerName: lead.name,
      buyerEmail: lead.email,
      buyerPhone: lead.phone,
      stage: STAGES.OFFER,
      offerPrice: Number(offerPrice),
      notes: notes || '',
      won: false,
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });

    // Update lead status to Offer
    if (lead.status !== 'Offer') {
      lead.status = 'Offer';
      await lead.save();
    }

    res.status(201).json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to create deal from lead' });
  }
};


