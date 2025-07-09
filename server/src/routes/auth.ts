import express from 'express';
import { login, signup, getCurrentUser, refreshToken } from '../controllers/authController';
import { auth } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);

// Test endpoint to verify authentication
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth routes are working',
    cookies: req.cookies,
    headers: req.headers
  });
});

// Protected routes
router.get('/me', auth, getCurrentUser);

export default router;
