import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import { ChartData } from '../models/ChartData';

// Function to update chart metrics
export const updateChartMetrics = async (companyId: string) => {
  try {
    const properties = await Property.find({ companyId });
    
    // Calculate occupancy metrics
    const totalUnits = properties.reduce((sum, property) => sum + (property.units || 0), 0);
    const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // Calculate financial metrics
    const totalRent = properties.reduce((sum, property) => sum + (property.rent || 0), 0);
    const totalCollected = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
    const totalArrears = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);

    // Initialize revenue chart data
    const revenueData = {
      type: 'revenue',
      data: [
        { month: 'Jan', USD: 0, ZWL: 0 },
        { month: 'Feb', USD: 0, ZWL: 0 },
        { month: 'Mar', USD: 0, ZWL: 0 },
        { month: 'Apr', USD: 0, ZWL: 0 },
        { month: 'May', USD: 0, ZWL: 0 },
        { month: 'Jun', USD: 0, ZWL: 0 },
        { month: 'Jul', USD: 0, ZWL: 0 },
        { month: 'Aug', USD: 0, ZWL: 0 },
        { month: 'Sep', USD: 0, ZWL: 0 },
        { month: 'Oct', USD: 0, ZWL: 0 },
        { month: 'Nov', USD: 0, ZWL: 0 },
        { month: 'Dec', USD: 0, ZWL: 0 }
      ],
      companyId,
      lastUpdated: new Date()
    };

    // Initialize commission chart data
    const commissionData = {
      type: 'commission',
      data: [
        { name: 'Agent 1', commission: 0 },
        { name: 'Agent 2', commission: 0 },
        { name: 'Agent 3', commission: 0 }
      ],
      companyId,
      lastUpdated: new Date()
    };

    // Update or create chart data
    await Promise.all([
      ChartData.findOneAndUpdate(
        { type: 'revenue', companyId },
        revenueData,
        { upsert: true, new: true }
      ),
      ChartData.findOneAndUpdate(
        { type: 'commission', companyId },
        commissionData,
        { upsert: true, new: true }
      ),
      ChartData.findOneAndUpdate(
        { type: 'metrics', companyId },
        {
          type: 'metrics',
          companyId,
          occupancyRate,
          totalUnits,
          occupiedUnits,
          totalRent,
          totalCollected,
          totalArrears,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      )
    ]);
  } catch (error) {
    console.error('Error updating chart metrics:', error);
    throw error;
  }
};

// Initialize chart data
export const initializeChartData = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      console.log('No company ID found in request');
      return res.status(401).json({ message: 'Company ID not found' });
    }

    console.log('Initializing chart data for company:', req.user.companyId);
    console.log('User data:', req.user);
    
    await updateChartMetrics(req.user.companyId);
    console.log('Chart metrics updated successfully');
    
    // Fetch the initialized data
    const [revenueData, commissionData] = await Promise.all([
      ChartData.findOne({ type: 'revenue', companyId: req.user.companyId }),
      ChartData.findOne({ type: 'commission', companyId: req.user.companyId })
    ]);

    console.log('Fetched initialized data:', { revenueData, commissionData });

    if (!revenueData || !commissionData) {
      console.log('Failed to fetch initialized data');
      return res.status(500).json({ message: 'Failed to initialize chart data' });
    }

    console.log('Sending successful response');
    res.json({
      message: 'Chart data initialized successfully',
      revenue: revenueData,
      commission: commissionData
    });
  } catch (error) {
    console.error('Error initializing chart data:', error);
    res.status(500).json({ message: 'Error initializing chart data' });
  }
};

// Get chart data by type
export const getChartData = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }

    const { type } = req.params;
    console.log('Fetching chart data for type:', type, 'companyId:', req.user.companyId);

    const chartData = await ChartData.findOne({ 
      type, 
      companyId: req.user.companyId 
    });
    
    if (!chartData) {
      console.log('No chart data found, initializing...');
      // If no chart data exists, initialize it
      await updateChartMetrics(req.user.companyId);
      const newChartData = await ChartData.findOne({ 
        type, 
        companyId: req.user.companyId 
      });
      
      if (!newChartData) {
        return res.status(404).json({ 
          message: 'Failed to initialize chart data',
          type,
          companyId: req.user.companyId
        });
      }
      
      return res.json(newChartData);
    }

    res.json(chartData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ message: 'Error fetching chart data' });
  }
};

// Update chart data
export const updateChartData = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }

    const { type } = req.params;
    const { data } = req.body;

    const chartData = await ChartData.findOneAndUpdate(
      { type, companyId: req.user.companyId },
      { data },
      { new: true, upsert: true }
    );

    res.json(chartData);
  } catch (error) {
    console.error('Error updating chart data:', error);
    res.status(500).json({ message: 'Error updating chart data' });
  }
};

export const getPropertyMetrics = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const properties = await Property.find({ ownerId: userId });

    const totalUnits = properties.reduce((sum: number, property: IProperty) => sum + (property.units || 0), 0);
    const occupiedUnits = properties.reduce((sum: number, property: IProperty) => sum + (property.occupiedUnits || 0), 0);
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    const totalRent = properties.reduce((sum: number, property: IProperty) => sum + (property.rent || 0), 0);
    const totalCollected = properties.reduce((sum: number, property: IProperty) => sum + (property.totalRentCollected || 0), 0);
    const totalArrears = properties.reduce((sum: number, property: IProperty) => sum + (property.currentArrears || 0), 0);

    res.json({
      occupancyRate,
      totalRent,
      totalCollected,
      totalArrears
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching property metrics', 500);
  }
};

