import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Container, MenuItem, Paper, TextField, Typography } from '@mui/material';
import api from '../../api';

type PaymentSide = {
  provider: string;
  providerReference: string;
  checkoutReference: string;
  amount: number;
  currency: string;
  paidAt: string | null;
};

type HistoryEntry = {
  at: string;
  adminUserId: string;
  resolution: string;
  notes: string;
  externalRefundReference: string;
};

type ReconciliationCase = {
  id: string;
  customerName: string;
  companyName: string;
  subscriptionId: string;
  status: string;
  original: PaymentSide;
  additional: PaymentSide;
  externalRefundReference: string;
  notes: string;
  history: HistoryEntry[];
};

const RESOLUTIONS = [
  { value: 'confirmed_duplicate', label: 'Confirmed duplicate' },
  { value: 'not_duplicate', label: 'Not a duplicate' },
  { value: 'resolved', label: 'Resolved' }
];

function money(side: PaymentSide) {
  return `${side.currency} ${Number(side.amount).toFixed(2)}`;
}

function when(value: string | null) {
  return value ? new Date(value).toISOString() : 'Not recorded';
}

const SubscriptionReconciliationPage: React.FC = () => {
  const [cases, setCases] = useState<ReconciliationCase[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { resolution: string; notes: string; externalRefundReference: string }>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/billing/reconciliation')
      .then(({ data }) => {
        const rows = (data.cases || []) as ReconciliationCase[];
        setCases(rows);
        setDrafts((current) => {
          const next = { ...current };
          rows.forEach((row) => {
            if (!next[row.id]) {
              next[row.id] = {
                resolution: row.status === 'open' ? 'confirmed_duplicate' : row.status,
                notes: '',
                externalRefundReference: row.externalRefundReference || ''
              };
            }
          });
          return next;
        });
        setMessage(rows.length ? null : { type: 'info', text: 'No subscription payments are waiting for reconciliation.' });
      })
      .catch((error) => {
        const denied = error?.response?.status === 403;
        setMessage({ type: 'error', text: denied ? 'Only a company administrator can review these payments.' : 'Reconciliation cases could not be loaded.' });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = (row: ReconciliationCase) => {
    const draft = drafts[row.id];
    api.post(`/billing/reconciliation/${row.id}/resolve`, draft)
      .then(() => {
        setMessage({ type: 'success', text: 'Reconciliation saved. No refund was sent to the payment provider.' });
        load();
      })
      .catch((error) => {
        const denied = error?.response?.status === 403;
        setMessage({ type: 'error', text: denied ? 'Only a company administrator can record a resolution.' : 'The resolution could not be saved.' });
      });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Subscription payment reconciliation</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Review a second successful payment for the same subscription purchase. Record the decision and any refund reference from the payment provider. Mantis does not send a refund.
      </Typography>
      {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}
      {loading && <Typography>Loading reconciliation cases.</Typography>}
      {cases.map((row) => {
        const draft = drafts[row.id] || { resolution: 'confirmed_duplicate', notes: '', externalRefundReference: '' };
        return (
          <Paper key={row.id} sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">{row.customerName || 'Customer'} · {row.companyName || 'Company'}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>Subscription {row.subscriptionId}</Typography>
            <Typography variant="body2">Status {row.status}</Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2">Original {row.original.provider} reference {row.original.providerReference}{row.original.checkoutReference ? ` · checkout ${row.original.checkoutReference}` : ''}</Typography>
              <Typography variant="body2">{money(row.original)} · {when(row.original.paidAt)}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>Additional {row.additional.provider} reference {row.additional.providerReference}{row.additional.checkoutReference ? ` · checkout ${row.additional.checkoutReference}` : ''}</Typography>
              <Typography variant="body2">{money(row.additional)} · {when(row.additional.paidAt)}</Typography>
            </Box>
            <TextField select label="Resolution" fullWidth margin="normal" value={draft.resolution} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, resolution: event.target.value } }))}>
              {RESOLUTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField label="External refund reference" fullWidth margin="normal" value={draft.externalRefundReference} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, externalRefundReference: event.target.value } }))} />
            <TextField label="Notes" fullWidth margin="normal" multiline minRows={2} value={draft.notes} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, notes: event.target.value } }))} />
            <Button variant="contained" onClick={() => save(row)}>Save resolution</Button>
            {row.history.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">History</Typography>
                {row.history.map((entry, index) => (
                  <Typography key={`${entry.at}-${index}`} variant="body2">
                    {when(entry.at)} · {entry.resolution} · administrator {entry.adminUserId}{entry.externalRefundReference ? ` · refund reference ${entry.externalRefundReference}` : ''}{entry.notes ? ` · ${entry.notes}` : ''}
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        );
      })}
    </Container>
  );
};

export default SubscriptionReconciliationPage;
