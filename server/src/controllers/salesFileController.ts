import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import SalesFile from '../models/SalesFile';
import { Property } from '../models/Property';
import { Deal } from '../models/Deal';
import { ALLOWED_DOCS_BY_STAGE } from '../constants/salesDocs';

export const listSalesFiles = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.companyId) return res.status(401).json({ message: 'Authentication required' });
    const { propertyId, dealId, stage } = req.query as { propertyId?: string; dealId?: string; stage?: string };
    const query: any = { companyId: req.user.companyId };
    if (propertyId) query.propertyId = propertyId;
    if (dealId) query.dealId = dealId;
    if (stage) query.stage = stage;
    const files = await SalesFile.find(query).sort({ uploadedAt: -1 });
    res.json({ files });
  } catch (e) {
    res.status(500).json({ message: 'Failed to list sales files' });
  }
};

export const uploadSalesFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.companyId) return res.status(401).json({ message: 'Authentication required' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { propertyId, dealId, stage, docType } = req.body as { propertyId: string; dealId?: string; stage?: string; docType: string };
    if (!propertyId || !docType) return res.status(400).json({ message: 'Missing propertyId or docType' });
    const companyId = req.user.companyId;
    const prop = await Property.findOne({ _id: propertyId, companyId });
    if (!prop) return res.status(404).json({ message: 'Property not found' });

    // If uploading against a deal, validate ownership and stage/docType compatibility
    if (dealId) {
      const deal = await Deal.findOne({ _id: dealId, companyId });
      if (!deal) return res.status(404).json({ message: 'Deal not found' });
      if (stage) {
        const allowed = ALLOWED_DOCS_BY_STAGE[stage] || [];
        if (!allowed.includes(docType)) {
          return res.status(400).json({ message: `Doc type ${docType} not allowed for stage ${stage}` });
        }
      }
    }

    const rec = await SalesFile.create({
      propertyId,
      dealId,
      companyId,
      fileName: req.file.originalname,
      docType,
      fileUrl: req.file.buffer.toString('base64'),
      uploadedBy: req.user.userId,
      stage
    });
    res.status(201).json({ message: 'Uploaded', file: rec });
  } catch (e) {
    res.status(500).json({ message: 'Failed to upload sales file' });
  }
};

export const downloadSalesFile = async (req: AuthRequest, res: Response) => {
  try {
    const f = await SalesFile.findById(req.params.id);
    if (!f) return res.status(404).json({ message: 'File not found' });
    const buffer = Buffer.from(f.fileUrl, 'base64');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ message: 'Failed to download sales file' });
  }
};

export const deleteSalesFile = async (req: AuthRequest, res: Response) => {
  try {
    const f = await SalesFile.findById(req.params.id);
    if (!f) return res.status(404).json({ message: 'File not found' });
    await f.deleteOne();
    res.json({ message: 'File deleted successfully' });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete sales file' });
  }
};



