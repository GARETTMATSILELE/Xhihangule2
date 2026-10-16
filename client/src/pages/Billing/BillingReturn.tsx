import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Paper, Typography } from '@mui/material';
import api from '../../api/axios';
import PaynowBadge from '../../components/payments/PaynowBadge';

const BillingReturn: React.FC = () => {
  const location = useLocation();
  const reference = new URLSearchParams(location.search).get('reference') || '';
  const [paymentStatus, setPaymentStatus] = useState<'checking' | 'paid' | 'pending' | 'failed'>('checking');
  const [message, setMessage] = useState('Confirming your Paynow payment.');

  useEffect(() => {
    if (!reference) {
      setPaymentStatus('pending');
      setMessage('You have returned from Paynow. If you completed payment, your subscription will activate shortly.');
      return;
    }

    let stopped = false;
    let attempts = 0;

    const check = async () => {
      attempts += 1;
      try {
        const resp = await api.post('/paynow/confirm', { reference });
        const state = String(resp.data?.paymentStatus || '').toLowerCase();
        if (stopped) return;
        if (state === 'reconciled' || resp.data?.activated === true) {
          setPaymentStatus('paid');
          setMessage('Payment received. Your Mantis subscription is active.');
          return;
        }
        if (state === 'paid') {
          if (attempts >= 8) {
            setPaymentStatus('pending');
            setMessage('Payment was received. Registration activation is still finishing.');
            return;
          }
          window.setTimeout(check, 2500);
          return;
        }
        if (state === 'cancelled' || state === 'failed' || state === 'refunded' || state === 'expired') {
          setPaymentStatus('failed');
          setMessage('No successful payment has been confirmed. You can retry checkout. This registration is still saved.');
          return;
        }
        if (attempts >= 8) {
          setPaymentStatus('pending');
          setMessage('Paynow is still confirming this payment. You can continue, and the subscription will activate once Paynow reports it as paid.');
          return;
        }
        window.setTimeout(check, 2500);
      } catch (e: any) {
        if (stopped) return;
        if (attempts >= 8) {
          setPaymentStatus('pending');
          setMessage(e?.response?.data?.message || 'We could not confirm the payment yet. It will activate once Paynow reports it as paid.');
          return;
        }
        window.setTimeout(check, 2500);
      }
    };

    check();
    return () => {
      stopped = true;
    };
  }, [reference]);

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h5" gutterBottom>Paynow payment</Typography>
        {paymentStatus === 'checking' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <CircularProgress size={22} />
            <Typography>{message}</Typography>
          </Box>
        )}
        {paymentStatus !== 'checking' && (
          <Alert severity={paymentStatus === 'paid' ? 'success' : paymentStatus === 'failed' ? 'error' : 'info'} sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
          {paymentStatus === 'paid' && (
            <Button component={RouterLink} to="/workspace-setup" variant="contained">Continue setup</Button>
          )}
          {paymentStatus !== 'paid' && (
            <Button component={RouterLink} to="/checkout/paypal" variant="outlined">{paymentStatus === 'failed' ? 'Retry checkout' : 'Return to checkout'}</Button>
          )}
        </Box>
        <PaynowBadge />
      </Paper>
    </Container>
  );
};

export default BillingReturn;
