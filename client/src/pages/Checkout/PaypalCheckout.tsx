import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Typography, Alert, CircularProgress, Button, ToggleButtonGroup, ToggleButton, TextField, Stack } from '@mui/material';
import api from '../../api/axios';
import PaynowBadge from '../../components/payments/PaynowBadge';

type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';

const PLAN_LABELS: Record<Plan, string> = {
  INDIVIDUAL: 'Landlord',
  SME: 'Property Manager',
  ENTERPRISE: 'Enterprise'
};

type CheckoutQuote = {
  paymentSessionId: string;
  plan: Plan;
  billingCycle: Cycle;
  amount: number;
  currency: string;
  status: string;
  awaitingConfirmation?: boolean;
};

const parseParams = (search: string) => {
  const params = new URLSearchParams(search);
  const planParam = (params.get('plan') || 'INDIVIDUAL').toUpperCase();
  const cycleParam = (params.get('cycle') || 'monthly').toLowerCase();
  const plan = (['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(planParam) ? planParam : 'INDIVIDUAL') as Plan;
  const cycle = (['monthly', 'yearly'].includes(cycleParam) ? cycleParam : 'monthly') as Cycle;
  const paymentSessionId = params.get('paymentSessionId') || undefined;
  return { plan, cycle, paymentSessionId };
};

const pendingWorkspaceStatuses = ['PENDING_SETUP', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'FAILED_SETUP'] as const;

const PaypalCheckout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, cycle, paymentSessionId } = useMemo(() => parseParams(location.search), [location.search]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [method, setMethod] = useState<'paynow' | 'cash'>('paynow');
  const [cashCode, setCashCode] = useState('');
  const [cashPin, setCashPin] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setQuoteLoading(true);
      try {
        const path = paymentSessionId
          ? `/billing/sessions/${encodeURIComponent(paymentSessionId)}`
          : '/billing/sessions/current';
        const response = await api.get(path);
        if (!cancelled) {
          setQuote(response.data);
          setMessage(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuote(null);
          setMessage({
            type: 'error',
            text: e?.response?.data?.message || 'Checkout details could not be loaded. Complete registration before paying.'
          });
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [paymentSessionId]);

  const displayPlan = quote?.plan || plan;
  const displayCycle = quote?.billingCycle || cycle;
  const amount = quote ? Number(quote.amount).toFixed(2) : null;

  const routeAfterActivation = async () => {
    // Checkout routes are "public" in the router, so we can't rely on ProtectedRoute to steer correctly.
    // After activation, fetch the user + company and choose the correct next step.
    try {
      const meResp = await api.get('/auth/me');
      const user = meResp.data?.user;
      if (!user) {
        navigate('/login', { state: { message: 'Please sign in to continue setup.' } });
        return;
      }

      let company: any = null;
      try {
        const cResp = await api.get('/companies/current');
        company = cResp.data?.status === 'success' ? cResp.data?.data : cResp.data?.data ?? cResp.data;
      } catch {
        company = null;
      }

      // Admin without company at all -> company setup
      if ((user.role === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'))) && !user.companyId && !company?._id) {
        navigate('/admin/company-setup', { replace: true });
        return;
      }

      // If company exists but onboarding isn't completed -> workspace setup
      if (company?._id && company?.onboardingCompleted === false) {
        const status = String(company?.onboardingStatus || '');
        if (pendingWorkspaceStatuses.includes(status as any)) {
          navigate('/workspace-setup', { replace: true });
          return;
        }
      }

      // Default: go to dashboard (admin for now; other roles will be handled by normal login routing)
      navigate('/admin-dashboard', { replace: true });
    } catch {
      navigate('/login', { state: { message: 'Please sign in to continue setup.' } });
    }
  };

  const handlePaynowCheckout = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const sessionId = quote?.paymentSessionId || paymentSessionId;
      if (!sessionId) {
        setMessage({ type: 'error', text: 'Checkout is not ready. Register the company again only if you have not already created it.' });
        return;
      }
      const resp = await api.post('/paynow/web/create', {
        paymentSessionId: sessionId,
        description: `Mantis ${displayPlan} ${displayCycle} subscription`
      });
      const redirectUrl = resp.data?.redirectUrl;
      if (!redirectUrl) {
        throw new Error(resp.data?.message || 'Paynow redirect URL not provided');
      }
      window.location.href = redirectUrl;
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const text = code === 'PAYMENT_ALREADY_COMPLETED'
        ? 'This payment is already confirmed. Sign in to continue.'
        : code === 'PAYMENT_AWAITING_CONFIRMATION'
          ? 'This payment is still being checked. Do not start another payment until it is confirmed.'
          : (e?.response?.data?.message || e?.message || 'Failed to start Paynow checkout.');
      setMessage({ type: code === 'PAYMENT_ALREADY_COMPLETED' ? 'info' : 'error', text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h5" gutterBottom>Checkout</Typography>
        <Typography variant="body2" sx={{ mb: 1, opacity: 0.9 }}>
          Plan: <strong>{PLAN_LABELS[displayPlan] || displayPlan}</strong> • Billing: <strong>{displayCycle}</strong>
        </Typography>
        <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>
          Total confirmed by Mantis
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 900, mb: 3 }}>
          {quoteLoading ? '…' : amount ? `${quote?.currency || 'USD'} ${amount}` : 'Unavailable'}
        </Typography>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>
        )}
        {!message && quote?.status === 'pending' && !quote.awaitingConfirmation && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Registration is not complete until payment is confirmed. You can leave and resume later with the same email address and password.
          </Alert>
        )}
        {!message && (quote?.status === 'cancelled' || quote?.status === 'failed' || quote?.status === 'expired') && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No successful payment has been confirmed. Retry checkout when you are ready. This registration is still saved.
          </Alert>
        )}
        {!message && (quote?.status === 'provider_created' || quote?.awaitingConfirmation) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This payment is still being checked. Continue the existing checkout instead of starting another payment.
          </Alert>
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
              disabled={loading || quoteLoading || !quote || quote.status === 'paid' || quote.status === 'reconciled' || (quote.awaitingConfirmation && quote.status === 'pending')}
            >
              {loading ? <CircularProgress size={20} /> : (quote?.status === 'cancelled' || quote?.status === 'failed' || quote?.status === 'expired') ? 'Retry checkout' : quote?.status === 'provider_created' ? 'Continue checkout' : 'Pay with Paynow'}
            </Button>
            <Typography variant="body2" sx={{ mt: 1, color: 'inherit', opacity: 0.9 }}>
              You will be redirected to Paynow to pay by Visa, Mastercard, EcoCash, Zimswitch or Telecash.
            </Typography>
            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff', borderRadius: 2, display: 'inline-block' }}>
              <PaynowBadge />
            </Box>
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
                  setTimeout(() => {
                    routeAfterActivation();
                  }, 700);
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


