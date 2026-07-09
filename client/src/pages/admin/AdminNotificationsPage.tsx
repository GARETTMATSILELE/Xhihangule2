import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import notificationService, { AppNotification } from '../../services/notificationService';
import paymentRequestService from '../../services/paymentRequestService';
import { useAuth } from '../../contexts/AuthContext';

const AdminNotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const roles: string[] =
    Array.isArray((user as any)?.roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : [user?.role].filter(Boolean) as string[];
  const isPrincipalOrPrea = roles.some((r) => ['principal', 'prea'].includes(r));

  const [tab, setTab] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [notifs, resp] = await Promise.all([
        notificationService.list(),
        paymentRequestService.getPaymentRequests({ page: 1, limit: 50 } as any).catch(() => ({ data: [] })),
      ]);
      setNotifications(notifs);
      const list = Array.isArray(resp?.data) ? resp.data : [];
      setApprovals(list.filter((r: any) => (r?.approval?.status || 'pending') === 'pending'));
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    await notificationService.markAllRead();
    load();
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Notifications</Typography>
          <Typography variant="body2" color="text.secondary">
            Central notification hub — in-app delivery with email/SMS/WhatsApp-ready architecture
          </Typography>
        </Box>
        <Button variant="outlined" onClick={handleMarkAllRead}>Mark all read</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`In-App (${notifications.filter((n) => !n.read).length})`} />
        <Tab label={`Approvals (${approvals.length})`} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={1}>
          {notifications.length === 0 ? (
            <Alert severity="info">No notifications.</Alert>
          ) : (
            notifications.map((n) => (
              <Box
                key={n._id}
                onClick={() => n.link && navigate(n.link)}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: n.read ? 'transparent' : 'action.hover',
                  cursor: n.link ? 'pointer' : 'default',
                }}
              >
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle2" sx={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</Typography>
                  {!n.read && <Chip size="small" label="New" color="primary" />}
                </Stack>
                <Typography variant="body2" color="text.secondary">{n.message}</Typography>
              </Box>
            ))
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={1}>
          {approvals.length === 0 ? (
            <Alert severity="success">No pending approvals.</Alert>
          ) : (
            approvals.map((a) => (
              <Box key={a._id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{a.reason || 'Approval required'}</Typography>
                <Typography variant="body2" color="text.secondary">Amount: ${Number(a.amount || 0).toLocaleString()}</Typography>
              </Box>
            ))
          )}
          {isPrincipalOrPrea && (
            <Button sx={{ alignSelf: 'flex-start' }} onClick={() => navigate('/admin-dashboard/approvals')}>
              Open full approvals queue
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default AdminNotificationsPage;
