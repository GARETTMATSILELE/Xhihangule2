import { Request, Response } from 'express';
import { MunicipalPayment } from '../models/MunicipalPayment';

export const createMunicipalPayment = async (req: Request, res: Response) => {
  try {
    const municipalPayment = new MunicipalPayment(req.body);
    await municipalPayment.save();
    res.status(201).json(municipalPayment);
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Failed to create municipal payment' });
  }
}; 