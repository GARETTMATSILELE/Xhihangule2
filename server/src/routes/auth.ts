import express from 'express';
import { login, signup, getCurrentUser, refreshToken, requestPasswordReset, resetPassword, logout } from '../controllers/authController';
import { auth } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Logout route
router.post('/logout', logout);

// Test endpoint to verify authentication
router.get('/test', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  res.json({ 
    message: 'Auth routes are working',
    authenticated: Boolean(req.cookies?.accessToken || req.headers.authorization)
  });
});

// Protected routes
router.get('/me', auth, getCurrentUser);

export default router;
