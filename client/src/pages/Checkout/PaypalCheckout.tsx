import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { Box, Container, Paper, Typography, Alert, CircularProgress, Button } from '@mui/material';
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

  const clientId = (
    // Prefer Vite-style env if available
    ((typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_PAYPAL_CLIENT_ID) as string | undefined) ||
    // CRA fallback (DefinePlugin inlines this at build-time)
    (process.env.REACT_APP_PAYPAL_CLIENT_ID as unknown as string | undefined)
  );
  const amount = PRICES[plan][cycle].toFixed(2);

  useEffect(() => {
    if (!clientId) {
      setMessage({ type: 'error', text: 'PayPal client ID not configured. Please set VITE_PAYPAL_CLIENT_ID or REACT_APP_PAYPAL_CLIENT_ID.' });
    }
  }, [clientId]);

  const initialOptions = useMemo(
    () => ({
      clientId: (clientId || '').trim(),
      currency: 'USD',
      intent: 'capture',
      components: 'buttons'
    }),
    [clientId]
  );

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

        {!clientId ? (
          <Alert severity="error">PayPal is not available. Contact support.</Alert>
        ) : (
          <PayPalScriptProvider options={initialOptions}>
            <Box sx={{ mb: 2 }}>
              <PayPalButtons
                style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                createOrder={async () => {
                  try {
                    setLoading(true);
                    const resp = await api.post('/paypal/create-order', { plan, cycle });
                    return resp.data.id;
                  } catch (e: any) {
                    setMessage({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to create PayPal order.' });
                    throw e;
                  } finally {
                    setLoading(false);
                  }
                }}
                onApprove={async (data: any) => {
                  try {
                    setLoading(true);
                    const resp = await api.post('/paypal/capture-order', { orderID: data?.orderID });
                    setMessage({ type: 'success', text: 'Congratulations! Payment successful. Redirecting to your dashboard...' });
                    setTimeout(() => {
                      navigate('/admin-dashboard');
                    }, 1500);
                    return resp.data;
                  } catch (e: any) {
                    setMessage({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to capture payment.' });
                  } finally {
                    setLoading(false);
                  }
                }}
                onError={(err: any) => {
                  setMessage({ type: 'error', text: err?.message || 'PayPal error occurred.' });
                  setLoading(false);
                }}
                onCancel={() => {
                  setMessage({ type: 'info', text: 'Payment was cancelled.' });
                  setLoading(false);
                }}
                disabled={loading}
                forceReRender={[amount, plan, cycle]}
              />
            </Box>
          </PayPalScriptProvider>
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


