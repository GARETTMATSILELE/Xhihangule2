import { Request, Response } from 'express';
import mongoose from 'mongoose';
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
    // Admins/accountants should see all sales owners within the company.
    // Sales agents see only the owners they created.
    const filter: any = { companyId: req.user.companyId };
    const role = (req.user as any)?.role;
    if (!role || String(role).toLowerCase() === 'sales') {
      filter.creatorId = req.user.userId;
    }
    const owners = await SalesOwner.find(filter).select('-password');
    res.json({ owners });
  } catch (error) {
    console.error('Error fetching sales owners:', error);
    res.status(500).json({ message: 'Error fetching sales owners' });
  }
};

export const getSalesOwnerById = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: 'Sales owner ID is required' });
    }
    const role = (req.user as any)?.role;
    const filter: any = { _id: id, companyId: req.user.companyId };
    // Sales agents can only view owners they created
    if (!role || String(role).toLowerCase() === 'sales') {
      filter.creatorId = req.user.userId;
    }
    const owner = await SalesOwner.findOne(filter).select('-password');
    if (!owner) {
      return res.status(404).json({ message: 'Sales owner not found' });
    }
    res.json(owner);
  } catch (error) {
    console.error('Error fetching sales owner by id:', error);
    res.status(500).json({ message: 'Error fetching sales owner' });
  }
};

export const updateSalesOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: 'Sales owner ID is required' });
    }

    // Allow updating selected fields only
    const { firstName, lastName, email, phone, properties } = req.body || {};
    const update: any = {};
    if (typeof firstName === 'string') update.firstName = firstName;
    if (typeof lastName === 'string') update.lastName = lastName;
    if (typeof email === 'string') update.email = email;
    if (typeof phone === 'string') update.phone = phone;
    if (Array.isArray(properties)) update.properties = properties;

    const role = (req.user as any)?.role;
    const filter: any = { _id: id, companyId: req.user.companyId };
    // Sales agents can only update owners they created
    if (!role || String(role).toLowerCase() === 'sales') {
      filter.creatorId = req.user.userId;
    }

    const owner = await SalesOwner.findOneAndUpdate(
      filter,
      update,
      { new: true }
    ).select('-password');

    if (!owner) {
      return res.status(404).json({ message: 'Sales owner not found' });
    }

    res.json(owner);
  } catch (error) {
    console.error('Error updating sales owner:', error);
    res.status(500).json({ message: 'Error updating sales owner' });
  }
};

export const deleteSalesOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: 'Sales owner ID is required' });
    }
    const role = (req.user as any)?.role;
    const filter: any = { _id: id, companyId: req.user.companyId };
    // Sales agents can only delete owners they created
    if (!role || String(role).toLowerCase() === 'sales') {
      filter.creatorId = req.user.userId;
    }
    const owner = await SalesOwner.findOneAndDelete(filter);
    if (!owner) {
      return res.status(404).json({ message: 'Sales owner not found' });
    }
    res.json({ message: 'Sales owner deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales owner:', error);
    res.status(500).json({ message: 'Error deleting sales owner' });
  }
};

/**
 * Find a sales owner by property membership (non-development sale properties).
 * Matches the provided propertyId against the SalesOwner.properties array.
 */
export const getSalesOwnerByPropertyId = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }
    const { propertyId } = req.params as { propertyId: string };
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }
    const pid = new mongoose.Types.ObjectId(propertyId);
    const role = (req.user as any)?.role;
    const filter: any = { companyId: req.user.companyId, properties: pid };
    // Sales agents can only view owners they created
    if (!role || String(role).toLowerCase() === 'sales') {
      filter.creatorId = req.user.userId;
    }
    const owner = await SalesOwner.findOne(filter).select('-password');
    if (!owner) {
      return res.status(404).json({ message: 'Sales owner not found for this property' });
    }
    res.json(owner);
  } catch (error) {
    console.error('Error fetching sales owner by propertyId:', error);
    res.status(500).json({ message: 'Error fetching sales owner by propertyId' });
  }
};


