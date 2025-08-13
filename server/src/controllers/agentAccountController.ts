import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import agentAccountService from '../services/agentAccountService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Get agent account with summary
 */
export const getAgentAccount = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    
    console.log('getAgentAccount controller called with agentId:', agentId);
    console.log('User:', req.user);
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }

    // Validate agent ID format
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }

    console.log('Calling agentAccountService.getAgentAccount...');
    const account = await agentAccountService.getAgentAccount(agentId);
    console.log('Account retrieved successfully:', {
      agentId: account.agentId,
      agentName: account.agentName,
      commissionDataCount: account.commissionData?.length || 0,
      totalCommissions: account.totalCommissions
    });
    
    res.json({
      success: true,
      data: account,
      message: 'Agent account retrieved successfully'
    });
  } catch (error) {
    logger.error('Error in getAgentAccount:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get all agent accounts for the company
 */
export const getCompanyAgentAccounts = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError('Company ID not found', 404);
    }

    const accounts = await agentAccountService.getCompanyAgentAccounts(companyId);
    
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    logger.error('Error in getCompanyAgentAccounts:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Add penalty to agent account
 */
export const addPenalty = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { amount, date, description, reference, notes, category } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    const updatedAccount = await agentAccountService.addPenalty(agentId, {
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      description,
      reference,
      notes,
      category
    });
    
    res.json({
      success: true,
      data: updatedAccount,
      message: 'Penalty added successfully'
    });
  } catch (error) {
    logger.error('Error in addPenalty:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create agent payout
 */
export const createAgentPayout = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { amount, paymentMethod, recipientId, recipientName, notes } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }
    
    if (!recipientId || !recipientName) {
      return res.status(400).json({ message: 'Recipient information is required' });
    }

    const result = await agentAccountService.createAgentPayout(agentId, {
      amount: Number(amount),
      paymentMethod,
      recipientId,
      recipientName,
      notes
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Agent payout created successfully'
    });
  } catch (error) {
    logger.error('Error in createAgentPayout:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update payout status
 */
export const updatePayoutStatus = async (req: Request, res: Response) => {
  try {
    const { agentId, payoutId } = req.params;
    const { status } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }
    
    if (!payoutId) {
      return res.status(400).json({ message: 'Payout ID is required' });
    }
    
    if (!status || !['completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Valid status is required' });
    }

    const updatedAccount = await agentAccountService.updatePayoutStatus(agentId, payoutId, status);
    
    res.json({
      success: true,
      data: updatedAccount,
      message: `Payout status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error in updatePayoutStatus:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Sync agent accounts from payments
 */
export const syncAgentAccounts = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError('Company ID not found', 404);
    }

    await agentAccountService.syncFromPayments(companyId);
    
    res.json({
      success: true,
      message: 'Agent accounts synced successfully from payments'
    });
  } catch (error) {
    logger.error('Error in syncAgentAccounts:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Sync commission transactions for a specific agent
 */
export const syncAgentCommissions = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }

    // Validate agent ID format
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }

    await agentAccountService.syncCommissionTransactions(agentId);
    
    res.json({
      success: true,
      message: 'Agent commission transactions synced successfully'
    });
  } catch (error) {
    logger.error('Error in syncAgentCommissions:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get acknowledgement document
 */
export const getAcknowledgementDocument = async (req: Request, res: Response) => {
  try {
    const { agentId, payoutId } = req.params;
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }
    
    if (!payoutId) {
      return res.status(400).json({ message: 'Payout ID is required' });
    }

    const documentData = await agentAccountService.getAcknowledgementDocument(agentId, payoutId);
    
    res.json({
      success: true,
      data: documentData
    });
  } catch (error) {
    logger.error('Error in getAcknowledgementDocument:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


