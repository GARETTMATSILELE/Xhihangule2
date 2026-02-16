import express from 'express';
import { createUser, deleteUserById, getCurrentUser, updateUserById } from '../controllers/userController';
import { getUserCommissionSummary } from '../controllers/userController';
import { User } from '../models/User';
import { Request, Response, NextFunction } from 'express';
import { auth, authWithCompany, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import multer from 'multer';
import { sendMail } from '../services/emailService';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
    
    let query: any = { $or: [{ role }, { roles: role }], isArchived: { $ne: true } };
    
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

// Multer for avatar uploads (images only, memory storage)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatar'));
    }
  }
});

// Update current user's own profile (no company required)
router.put('/me', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Whitelist updatable fields for self-update
    const {
      firstName,
      lastName,
      phone,
      language,
      timezone,
      notifications,
      twoFactorEnabled
    } = req.body || {};

    const updates: any = {};
    if (typeof firstName === 'string') updates.firstName = firstName;
    if (typeof lastName === 'string') updates.lastName = lastName;
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof language === 'string') updates.language = language;
    if (typeof timezone === 'string') updates.timezone = timezone;
    if (typeof twoFactorEnabled === 'boolean') updates.twoFactorEnabled = twoFactorEnabled;
    if (notifications && typeof notifications === 'object') updates.notifications = notifications;

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!updated) {
      throw new AppError('User not found', 404);
    }

    res.json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
});

// Upload/update current user's avatar
router.post('/me/avatar', auth, avatarUpload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError('No avatar file uploaded', 400);
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new AppError('Invalid file type. Only images are allowed.', 400);
    }
    const base64 = file.buffer.toString('base64');
    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { avatar: base64, avatarMimeType: file.mimetype } },
      { new: true }
    ).select('_id avatar avatarMimeType');
    if (!updated) {
      throw new AppError('User not found', 404);
    }
    const avatarUrl = `data:${updated.avatarMimeType || 'image/png'};base64,${updated.avatar}`;
    res.json({ status: 'success', data: { avatarUrl } });
  } catch (error) {
    // Handle Multer file size errors gracefully
    if ((error as any)?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ status: 'error', message: 'Avatar exceeds maximum size of 10MB. Please upload a smaller image.' });
    }
    next(error);
  }
});

// Update current user's password (no company required)
router.put('/me/password', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new AppError('Current and new passwords are required', 400);
    }
    const user = await User.findById(req.user.userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AppError('Current password is incorrect', 400);
    }
    user.password = newPassword;
    await user.save();
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
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
    const safe: any = typeof (user as any)?.toObject === 'function' ? (user as any).toObject() : user;
    if (safe?.avatar) {
      safe.avatarUrl = `data:${safe.avatarMimeType || 'image/png'};base64,${safe.avatar}`;
    }
    res.json({
      status: 'success',
      data: safe
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
    const query: any = { companyId: req.user?.companyId, isArchived: { $ne: true } };
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

// Get agents for current company - Admin, Accountant, Agent, Sales, Principal, PREA
router.get('/agents', authorize(['admin', 'accountant', 'agent', 'sales', 'principal', 'prea']), async (req: Request, res, next) => {
  try {
    console.log('GET /agents route hit');
    const role = (req.query.role as string) || 'agent';
    const query: any = {
      companyId: req.user?.companyId, 
      $or: [{ role }, { roles: role }],
      isArchived: { $ne: true }
    };
    const agents = await User.find(query).select('firstName lastName email role roles companyId');
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

    // Email the new user that their account has been created (non-fatal if email fails)
    let accountCreatedEmailSent = false;
    try {
      const to = String((user as any)?.email || '').trim();
      if (to) {
        const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
        const loginUrl = `${String(linkBase).replace(/\/+$/, '')}/login`;

        const fullName = [String((user as any)?.firstName || ''), String((user as any)?.lastName || '')]
          .filter((p) => p && p.trim())
          .join(' ')
          .trim();
        const greeting = fullName ? `Hi ${fullName},` : 'Hello,';

        const subject = 'Your account has been created';
        const plain = [
          greeting,
          '',
          'An administrator has created an account for you.',
          'Please log in to access your account.',
          '',
          `Login: ${loginUrl}`,
        ].join('\n');

        const html = [
          `<p>${escapeHtml(greeting)}</p>`,
          '<p>An administrator has created an account for you.</p>',
          '<p>Please log in to access your account.</p>',
          `<p><a href="${loginUrl}" target="_blank" rel="noopener noreferrer">Log in</a></p>`,
          `<p style="color:#6b7280;font-size:12px">If you did not expect this email, please ignore it or contact your administrator.</p>`,
        ].join('');

        await sendMail({ to, subject, html, text: plain });
        accountCreatedEmailSent = true;
      }
    } catch (e: any) {
      console.warn('[userRoutes] Failed to send account created email:', e?.message || e);
    }

    res.status(201).json({
      status: 'success',
      data: user,
      meta: { accountCreatedEmailSent }
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

// Archive (soft-delete) user by ID - Admin only
router.delete('/:id', authorize(['admin']), async (req: Request, res, next) => {
  try {
    const result = await deleteUserById(req.params.id, req.user?.userId, req.user?.companyId);
    res.json({
      status: 'success',
      message: (result as any).alreadyArchived ? 'User already archived' : 'User archived successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

export default router; 