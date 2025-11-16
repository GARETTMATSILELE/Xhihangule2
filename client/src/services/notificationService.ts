import api from '../api/axios';

export interface AppNotification {
  _id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt?: string;
  payload?: any;
}

class NotificationService {
  async list(): Promise<AppNotification[]> {
    const res = await api.get('/notifications');
    const data = (res.data?.data || res.data || []) as any[];
    return Array.isArray(data) ? data : [];
  }

  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all');
  }

  async markRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/read`);
  }
}

export const notificationService = new NotificationService();
export default notificationService;


