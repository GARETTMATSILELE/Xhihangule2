import { Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { getIo } from '../config/socket';

export const createNotification = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
    const { userId, title, message, link, payload } = req.body || {};
    if (!userId || !title || !message) return res.status(400).json({ message: 'Missing required fields' });
    const n = new Notification({ companyId, userId, title, message, link, payload, read: false });
    await n.save();

    // Emit real-time notification to the specific user room if socket is available
    try {
      const io = getIo();
      if (io) {
        io.to(`user-${String(userId)}`).emit('newNotification', n);
      }
    } catch (e) {
      // Non-fatal
    }
    res.status(201).json({ data: n });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to create notification', error: e.message });
  }
};

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const userId = (req.user as any)?.userId;
    if (!companyId || !userId) return res.status(400).json({ message: 'Company ID and user required' });
    const items = await Notification.find({ companyId, userId }).sort({ createdAt: -1 }).limit(100);
    res.json({ data: items });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to fetch notifications', error: e.message });
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const userId = (req.user as any)?.userId;
    if (!companyId || !userId) return res.status(400).json({ message: 'Company ID and user required' });
    await Notification.updateMany({ companyId, userId, read: false }, { $set: { read: true } });
    res.json({ message: 'Marked all as read' });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to update notifications', error: e.message });
  }
};

export const markRead = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const userId = (req.user as any)?.userId;
    const { id } = req.params;
    if (!companyId || !userId) return res.status(400).json({ message: 'Company ID and user required' });
    await Notification.updateOne({ _id: id, companyId, userId }, { $set: { read: true } });
    res.json({ message: 'Marked as read' });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to update notification', error: e.message });
  }
};


