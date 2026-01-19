import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Typography, Alert, CircularProgress, Button, ToggleButtonGroup, ToggleButton, TextField, Stack } from '@mui/material';
import api from '../../api/axios';

type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';

const PRICES: Record<Plan, { monthly: number; yearly: number }> = {
  INDIVIDUAL: { monthly: 10, yearly: 120 },
  SME: { monthly: 300, yearly: 3600 },
  ENTERPRISE: { monthly: 600, yearly: 7200 }
};

const parseParams = (search: string) => {
  const params = new URLSearchParams(search);
  const planParam = (params.get('plan') || 'INDIVIDUAL').toUpperCase();
  const cycleParam = (params.get('cycle') || 'monthly').toLowerCase();
  const plan = (['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(planParam) ? planParam : 'INDIVIDUAL') as Plan;
  const cycle = (['monthly', 'yearly'].includes(cycleParam) ? cycleParam : 'monthly') as Cycle;
  return { plan, cycle };
};

const PaypalCheckout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, cycle } = useMemo(() => parseParams(location.search), [location.search]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<'paynow' | 'cash'>('paynow');
  const [cashCode, setCashCode] = useState('');
  const [cashPin, setCashPin] = useState('');

  const amount = PRICES[plan][cycle].toFixed(2);

  const handlePaynowCheckout = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const reference = `SUBS-${plan}-${cycle}-${Date.now()}`;
      const resp = await api.post('/paynow/web/create', {
        amount: Number(amount),
        reference
      });
      const redirectUrl = resp.data?.redirectUrl;
      if (!redirectUrl) {
        throw new Error(resp.data?.message || 'Paynow redirect URL not provided');
      }
      window.location.href = redirectUrl;
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to start Paynow checkout.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h5" gutterBottom>Checkout</Typography>
        <Typography variant="body2" sx={{ mb: 1, opacity: 0.9 }}>
          Plan: <strong>{plan}</strong> • Billing: <strong>{cycle}</strong>
        </Typography>
        <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>
          Total
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 900, mb: 3 }}>
          USD {amount}
        </Typography>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            value={method}
            exclusive
            onChange={(_, v) => v && setMethod(v)}
            size="small"
          >
            <ToggleButton value="paynow">Paynow</ToggleButton>
            <ToggleButton value="cash">Cash Code</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {method === 'paynow' ? (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handlePaynowCheckout}
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} /> : 'Pay with Paynow (Visa/Mastercard)'}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              You will be redirected to Paynow to complete your payment (Visa/Mastercard, mobile wallets).
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Stack spacing={1.5} sx={{ mb: 1 }}>
              <TextField
                label="Cash Code"
                value={cashCode}
                onChange={(e) => setCashCode(e.target.value.toUpperCase())}
                size="small"
                placeholder="e.g. CASH-ABCD-1234"
                disabled={loading}
              />
              <TextField
                label="PIN"
                value={cashPin}
                onChange={(e) => setCashPin(e.target.value)}
                size="small"
                type="password"
                placeholder="6-digit PIN"
                disabled={loading}
              />
            </Stack>
            <Button
              variant="contained"
              color="success"
              disabled={loading || !cashCode || !cashPin}
              onClick={async () => {
                try {
                  setLoading(true);
                  setMessage(null);
                  const resp = await api.post('/billing/vouchers/redeem', { code: cashCode.trim(), pin: cashPin.trim() });
                  setMessage({ type: 'success', text: 'Cash code accepted. Your subscription has been updated. Redirecting…' });
                  setTimeout(() => navigate('/admin-dashboard'), 1200);
                  return resp.data;
                } catch (e: any) {
                  setMessage({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to redeem code.' });
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? <CircularProgress size={20} /> : 'Redeem & Activate'}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Enter the code and PIN provided by the system administrator after cash payment.
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {loading && <CircularProgress size={20} />}
          <Button variant="text" onClick={() => navigate(-1)} disabled={loading}>Back</Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default PaypalCheckout;


