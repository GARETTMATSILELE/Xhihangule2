import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Paper, Typography } from '@mui/material';
import api from '../../api/axios';
import { apiService } from '../../api';
import PaynowBadge from '../../components/payments/PaynowBadge';

type DodoOutcome = 'success' | 'processing' | 'declined' | 'temporary' | 'uncertain';

function dodoMessage(outcome: DodoOutcome): string {
  if (outcome === 'success') return 'Payment successful. Continue to workspace setup.';
  if (outcome === 'declined') return 'Your payment was declined. You may try another payment method.';
  if (outcome === 'temporary') return 'Payment could not be completed. Please try again later.';
  if (outcome === 'uncertain') return 'We are checking your transaction. Please do not pay again.';
  return 'We are confirming your payment.';
}

const BillingReturn: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const reference = params.get('reference') || '';
  const provider = params.get('provider') || '';
  const paymentSessionId = params.get('paymentSessionId') || '';
  const browserCancelled = params.get('checkout') === 'cancelled';
  const dodoReturn = provider === 'dodo' || Boolean(paymentSessionId);
  const [paymentStatus, setPaymentStatus] = useState<'checking' | 'paid' | 'pending' | 'failed'>(browserCancelled ? 'failed' : 'checking');
  const [message, setMessage] = useState(browserCancelled
    ? 'Checkout was cancelled. You may try another payment method.'
    : dodoReturn ? 'We are confirming your payment.' : 'Confirming your Paynow payment.');

  useEffect(() => {
    if (dodoReturn) {
      if (!paymentSessionId) return undefined;
      let stopped = false;
      let attempts = 0;
      const check = async () => {
        attempts += 1;
        try {
          const reconciled = await apiService.reconcileDodoCheckout(paymentSessionId, params.get('payment_id') || undefined);
          const session = await apiService.getCheckoutSession(paymentSessionId);
          if (stopped) return;
          const state = String(session.data?.status || '');
          const outcome = String(reconciled.data?.outcome || '') as DodoOutcome;
          if (state === 'reconciled' || state === 'paid') {
            setPaymentStatus('paid');
            setMessage(dodoMessage('success'));
            return;
          }
          if (state === 'failed' || state === 'cancelled' || state === 'expired') {
            setPaymentStatus('failed');
            setMessage(outcome === 'uncertain' || outcome === 'processing'
              ? 'Your previous payment is still being verified. Please do not make another payment.'
              : dodoMessage('declined'));
            return;
          }
        } catch {
          if (stopped) return;
        }
        if (attempts >= 8) {
          setPaymentStatus('pending');
          setMessage(dodoMessage('uncertain'));
          return;
        }
        window.setTimeout(check, 2500);
      };
      if (!browserCancelled) check();
      return () => { stopped = true; };
    }

    let stopped = false;
    let attempts = 0;
    let activeReference = reference;

    const check = async () => {
      if (!activeReference) {
        try {
          const session = await apiService.getCheckoutSession('current');
          const recovered = String(session.data?.reference || '');
          const state = String(session.data?.status || '').toLowerCase();
          if (state === 'reconciled' || state === 'paid') {
            if (stopped) return;
            setPaymentStatus('paid');
            setMessage('Payment received. Your Mantis subscription is active.');
            return;
          }
          if (session.data?.provider === 'paynow' && recovered) activeReference = recovered;
        } catch {
          activeReference = '';
        }
      }
      if (!activeReference) {
        if (stopped) return;
        setPaymentStatus('pending');
        setMessage('You have returned from Paynow. If you completed payment, Mantis will finish activation when Paynow confirms it. Do not pay again.');
        return;
      }
      attempts += 1;
      try {
        const resp = await api.post('/paynow/confirm', { reference: activeReference });
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
  }, [reference, dodoReturn, paymentSessionId, browserCancelled]);

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h5" gutterBottom>{dodoReturn ? 'Card payment' : 'Paynow payment'}</Typography>
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
            <Button component={RouterLink} to="/workspace-setup" variant="contained">Continue to workspace setup</Button>
          )}
          {paymentStatus !== 'paid' && (
            <Button component={RouterLink} to="/billing/setup" variant="outlined">
              {dodoReturn
                ? (paymentStatus === 'failed' && message.startsWith('Your payment was declined') ? 'Choose a payment method' : 'Check payment status')
                : (paymentStatus === 'failed' ? 'Choose a payment method' : 'Return to checkout')}
            </Button>
          )}
        </Box>
        {!dodoReturn && <PaynowBadge />}
      </Paper>
    </Container>
  );
};

export default BillingReturn;
