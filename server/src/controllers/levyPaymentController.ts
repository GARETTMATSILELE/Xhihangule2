import { Request, Response } from 'express';
import { LevyPayment } from '../models/LevyPayment';

export const createLevyPayment = async (req: Request, res: Response) => {
  try {
    const levyPayment = new LevyPayment(req.body);
    await levyPayment.save();
    res.status(201).json(levyPayment);
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Failed to create levy payment' });
  }
};

export const getLevyPayments = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.query.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    const levyPayments = await LevyPayment.find({ companyId }).sort({ paymentDate: -1 });
    res.status(200).json(levyPayments);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
  }
}; 