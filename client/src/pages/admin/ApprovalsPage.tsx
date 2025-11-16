import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip } from '@mui/material';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';

const ApprovalsPage: React.FC = () => {
  const [items, setItems] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'approve' | 'reject'; id: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await paymentRequestService.getPaymentRequests({ page: 1, limit: 50 } as any);
      const pending = (resp.data || []).filter((r: any) => (r?.approval?.status || 'pending') === 'pending');
      // Show only sales-related payment requests (heuristic: disbursement report or sale-related reason)
      const salesOnly = pending.filter((r: any) => {
        const reason = String(r?.reason || '');
        return Boolean((r as any).reportHtml) || /disbursement|sale|commission/i.test(reason);
      });
      setItems(salesOnly);
    } catch (e: any) {
      setError(e?.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doAction = async () => {
    if (!confirm) return;
    try {
      setLoading(true);
      if (confirm.action === 'approve') {
        await paymentRequestService.approve(confirm.id);
      } else {
        await paymentRequestService.reject(confirm.id, notes);
      }
      setConfirm(null);
      setNotes('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Approval Requests</Typography>
      {loading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
      {error && <Typography variant="body2" color="error" sx={{ mb: 2 }}>{error}</Typography>}
      {items.length === 0 && !loading && (
        <Typography variant="body2" color="text.secondary">No pending approvals</Typography>
      )}
      <Box sx={{ display: 'grid', gap: 2 }}>
        {items.map((it) => (
          <Card key={it._id} variant="outlined">
            <CardHeader
              title={it.reason}
              subheader={(it.property as any)?.name || (it as any).propertyId?.name || ''}
              action={<Chip size="small" label="Pending" color="warning" />}
            />
            <CardContent>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Amount: {(it.currency || 'USD')} {Number(it.amount || 0).toLocaleString()}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" size="small" onClick={() => setPreviewHtml((it as any).reportHtml || null)}>
                  View Report
                </Button>
                <Button variant="contained" color="success" size="small" onClick={() => setConfirm({ action: 'approve', id: it._id })}>
                  Approve
                </Button>
                <Button variant="outlined" color="error" size="small" onClick={() => setConfirm({ action: 'reject', id: it._id })}>
                  Reject
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Dialog open={!!previewHtml} onClose={() => setPreviewHtml(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Company Disbursement Report</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {previewHtml ? (
            <Box sx={{ height: '80vh' }}>
              <iframe
                title="Company Disbursement Report"
                srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewHtml(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{confirm?.action === 'approve' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
        <DialogContent>
          {confirm?.action === 'reject' && (
            <TextField fullWidth multiline rows={3} label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" color={confirm?.action === 'approve' ? 'success' as any : 'error' as any} onClick={doAction}>
            {confirm?.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalsPage;


