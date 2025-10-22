import express from 'express';
import { createUser, getCurrentUser, updateUserById } from '../controllers/userController';
import { getUserCommissionSummary } from '../controllers/userController';
import { User } from '../models/User';
import { Request, Response, NextFunction } from 'express';
import { authWithCompany, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = express.Router();

// Debug middleware for user routes
router.use((req, res, next) => {
  console.log('User route accessed:', {
    method: req.method,
    path: req.path,
    body: req.body,
    headers: req.headers,
    cookies: req.cookies
  });
  next();
});

// Public endpoint for getting agents (for admin dashboard) - NO AUTH REQUIRED
router.get('/public/agents', async (req: Request, res: Response) => {
  try {
    console.log('Public agents request:', {
      query: req.query,
      headers: req.headers
    });

    // Get company ID from query params or headers (for admin dashboard)
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    const role = (req.query.role as string) || 'agent';
    
    let query: any = { role };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = companyId;
    }

    console.log('Public agents query:', query);

    const agents = await User.find(query)
      .select('firstName lastName email role companyId')
      .sort({ firstName: 1, lastName: 1 });

    console.log(`Found ${agents.length} agents`);

    res.json({
      status: 'success',
      data: agents,
      count: agents.length,
      companyId: companyId || null
    });
  } catch (error) {
    console.error('Error fetching agents (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching agents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Apply auth middleware to all routes below this point
router.use(authWithCompany);

// Test route to verify user routes are working
router.get('/test', (req, res) => {
  console.log('Test route hit');
  res.json({ message: 'User routes are working' });
});

// Get current user
router.get('/me', async (req: Request, res, next) => {
  console.log('GET /me route hit');
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }
    const user = await getCurrentUser(req.user.userId);
    console.log('Current user found:', user);
    res.json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Error in GET /me:', error);
    next(error);
  }
});

// Get all users - Admin only
router.get('/', authorize(['admin']), async (req: Request, res, next) => {
  try {
    console.log('GET / route hit');
    console.log('Fetching users with filters:', req.query);
    
    // Build query based on filters and enforce company scoping
    const query: any = { companyId: req.user?.companyId };
    if (req.query.role) {
      query.role = req.query.role;
    }
    
    const users = await User.find(query).select('-password');
    console.log('Found users:', users.length);
    res.json(users);
  } catch (error) {
    console.error('Error in GET /:', error);
    next(error);
  }
});

// Get agents for current company - Admin, Accountant, Agent, and Sales
router.get('/agents', authorize(['admin', 'accountant', 'agent', 'sales']), async (req: Request, res, next) => {
  try {
    console.log('GET /agents route hit');
    const role = (req.query.role as string) || 'agent';
    const query: any = { companyId: req.user?.companyId, role };
    const agents = await User.find(query).select('firstName lastName email role companyId');
    console.log('Found agents:', agents.length);
    res.json(agents);
  } catch (error) {
    console.error('Error in GET /agents:', error);
    next(error);
  }
});

// Commission summary for user (agent) - self, admin, accountant
router.get('/:id/commission', async (req: Request, res, next) => {
  try {
    // authWithCompany is already applied above; just delegate to controller
    await getUserCommissionSummary(req, res);
  } catch (error) {
    next(error);
  }
});

// Create new user - Admin only
router.post('/', authorize(['admin']), async (req: Request, res, next) => {
  console.log('POST / route hit');
  try {
    const payload = { ...req.body, companyId: req.user?.companyId };
    const user = await createUser(payload);
    console.log('User created:', user);
    res.status(201).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Error in POST /:', error);
    next(error);
  }
});

// Update user by ID - Admin only
router.put('/:id', authorize(['admin']), async (req: Request, res, next) => {
  try {
    const updated = await updateUserById(req.params.id, req.body, req.user?.companyId);
    res.json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
});

export default router; 