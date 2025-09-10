import { Request, Response } from 'express';
import { SalesOwner } from '../models/SalesOwner';

export const createSalesOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }

    const { email, password, firstName, lastName, phone } = req.body;
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await SalesOwner.findOne({ email, companyId: req.user.companyId });
    if (existing) {
      return res.status(400).json({ message: 'Sales owner with this email already exists' });
    }

    const owner = new SalesOwner({
      email,
      password,
      firstName,
      lastName,
      phone,
      companyId: req.user.companyId,
      creatorId: req.user.userId
    });
    await owner.save();
    const response = owner.toObject();
    delete (response as any).password;
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating sales owner:', error);
    res.status(500).json({ message: 'Error creating sales owner' });
  }
};

export const getSalesOwners = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }
    const owners = await SalesOwner.find({ companyId: req.user.companyId, creatorId: req.user.userId }).select('-password');
    res.json({ owners });
  } catch (error) {
    console.error('Error fetching sales owners:', error);
    res.status(500).json({ message: 'Error fetching sales owners' });
  }
};


