import express from 'express';
import { auth } from '../middleware/auth';
import { createNotification, listNotifications, markAllRead, markRead } from '../controllers/notificationController';

const router = express.Router();

router.post('/', auth, createNotification);
router.get('/', auth, listNotifications);
router.post('/read-all', auth, markAllRead);
router.post('/:id/read', auth, markRead);

export default router;


