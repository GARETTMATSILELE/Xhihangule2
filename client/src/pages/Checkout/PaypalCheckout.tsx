import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Typography, Alert, CircularProgress, Button, ToggleButtonGroup, ToggleButton, TextField, Stack } from '@mui/material';
import api from '../../api/axios';
import PaymentMethodChoice, { checkoutButtonLabel, PaymentProviderId, PaymentProviderOption } from '../../components/payments/PaymentMethodChoice';

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
  provider?: PaymentProviderId;
  reference?: string;
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
  const [method, setMethod] = useState<'provider' | 'cash'>('provider');
  const [provider, setProvider] = useState<PaymentProviderId | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [phone, setPhone] = useState('');
  const [providers, setProviders] = useState<PaymentProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState('');
  const [cashCode, setCashCode] = useState('');
  const [cashPin, setCashPin] = useState('');

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
          const state = String(response.data?.status || '');
          if (state === 'paid' || state === 'reconciled') {
            routeAfterActivation();
          }
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

  useEffect(() => {
    let cancelled = false;
    api.get('/billing/providers')
      .then((response) => {
        if (cancelled) return;
        const methods = (response.data?.providers || []).filter((item: PaymentProviderOption) => item.available && item.cycles.includes(cycle));
        setProviders(methods);
      })
      .catch(() => {
        if (!cancelled) setProvidersError('Payment methods could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cycle]);

  useEffect(() => {
    if (provider || !providers.length) return;
    const preferred = quote?.provider && providers.some((item) => item.id === quote.provider) ? quote.provider : providers[0].id;
    setProvider(preferred);
    const methods = providers.find((item) => item.id === preferred)?.methods || [];
    if (methods.length === 1) setPaymentMethod(methods[0].id);
  }, [quote, provider, providers]);

  const displayPlan = quote?.plan || plan;
  const displayCycle = quote?.billingCycle || cycle;
  const amount = quote ? Number(quote.amount).toFixed(2) : null;

  const checkExistingPayment = async () => {
    if (quote?.provider === 'dodo') {
      setLoading(true);
      setMessage({ type: 'info', text: 'Checking this card payment. Do not pay again.' });
      try {
        await api.post('/billing/dodo/reconcile', { paymentSessionId: quote.paymentSessionId });
        const session = await api.get(`/billing/sessions/${quote.paymentSessionId}`);
        const state = String(session.data?.status || '').toLowerCase();
        if (state === 'reconciled' || state === 'paid') {
          await routeAfterActivation();
          return;
        }
        setMessage({ type: 'info', text: 'This card payment is still being confirmed. Do not pay again.' });
      } catch (e: any) {
        setMessage({ type: 'error', text: e?.response?.data?.message || 'Mantis could not check this payment yet. Do not pay again.' });
      } finally {
        setLoading(false);
      }
      return;
    }
    const reference = String(quote?.reference || '');
    if (!reference) {
      setMessage({ type: 'info', text: 'Mantis is still checking this payment. Do not pay again.' });
      return;
    }
    setLoading(true);
    setMessage({ type: 'info', text: 'Checking this payment with Paynow. Do not pay again.' });
    try {
      const confirmed = await api.post('/paynow/confirm', { reference });
      const state = String(confirmed.data?.paymentStatus || '').toLowerCase();
      if (state === 'reconciled' || confirmed.data?.activated === true || state === 'paid') {
        await routeAfterActivation();
        return;
      }
      if (state === 'failed' || state === 'cancelled' || state === 'expired') {
        setMessage({ type: 'error', text: 'Paynow did not confirm this payment. You have not been asked to pay again.' });
        return;
      }
      setMessage({ type: 'info', text: 'This payment is still processing. Mantis will finish activation when Paynow confirms it. Do not pay again.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Mantis could not check this payment yet. Do not pay again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleProviderCheckout = async () => {
    try {
      setLoading(true);
      setMessage(null);
      if (!provider) {
        setMessage({ type: 'info', text: 'Choose a payment method before continuing.' });
        return;
      }
      const sessionId = quote?.paymentSessionId || paymentSessionId;
      if (!sessionId) {
        setMessage({ type: 'error', text: 'Checkout is not ready. Register the company again only if you have not already created it.' });
        return;
      }
      const resp = await api.post('/billing/checkout', {
        plan: displayPlan,
        cycle: displayCycle,
        provider,
        paymentMethod: provider === 'paynow' ? paymentMethod : 'card',
        ...(provider === 'paynow' && paymentMethod === 'ecocash' ? { phone } : {})
      });
      const redirectUrl = resp.data?.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      const reference = String(resp.data?.reference || '');
      if (!reference) {
        throw new Error(resp.data?.message || 'Checkout did not return a payment page.');
      }
      setMessage({ type: 'info', text: resp.data?.instructions || 'Approve the EcoCash prompt on your phone. Mantis will confirm the payment.' });
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const confirmed = await api.post('/paynow/confirm', { reference });
        const state = String(confirmed.data?.paymentStatus || '').toLowerCase();
        if (state === 'reconciled' || confirmed.data?.activated === true || state === 'paid') {
          await routeAfterActivation();
          return;
        }
        if (state === 'failed' || state === 'cancelled' || state === 'expired') {
          setMessage({ type: 'error', text: 'EcoCash did not complete this payment. You have not been asked to pay again.' });
          return;
        }
      }
      setMessage({ type: 'info', text: 'EcoCash is still processing. You can leave this page. Mantis will finish activation when the payment is confirmed. Do not pay again.' });
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const text = code === 'PAYMENT_ALREADY_COMPLETED' || code === 'PAYMENT_AWAITING_CONFIRMATION' || code === 'PAYMENT_ATTEMPT_PENDING'
        ? (e?.response?.data?.message || 'This payment is still being checked. Do not start another payment.')
        : (e?.response?.data?.message || e?.message || 'Failed to start checkout.');
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
        {!message && quote?.status === 'pending' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Registration is not complete until payment is confirmed. You can leave and resume later with the same email address and password.
          </Alert>
        )}
        {!message && (quote?.status === 'cancelled' || quote?.status === 'failed' || quote?.status === 'expired') && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No successful payment has been confirmed. Retry checkout when you are ready. This registration is still saved.
          </Alert>
        )}
        {!message && quote?.status === 'provider_created' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This payment is still being checked. Use Check payment. Do not start another payment.
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            value={method}
            exclusive
            onChange={(_, v) => v && setMethod(v)}
            size="small"
          >
            <ToggleButton value="provider">Card or local payment</ToggleButton>
            <ToggleButton value="cash">Cash Code</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {method === 'provider' ? (
          <Box sx={{ mb: 2 }}>
            <PaymentMethodChoice
              providers={providers}
              value={provider}
              onChange={(next) => {
                setProvider(next);
                const methods = providers.find((item) => item.id === next)?.methods || [];
                setPaymentMethod(methods.length === 1 ? methods[0].id : '');
              }}
              method={paymentMethod}
              onMethodChange={setPaymentMethod}
              disabled={loading || quote?.status === 'provider_created'}
              loading={providersLoading}
              error={providersError}
            />
            {provider === 'paynow' && paymentMethod === 'ecocash' && (
              <TextField
                label="EcoCash number"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                size="small"
                fullWidth
                sx={{ mt: 2, bgcolor: 'background.paper' }}
                placeholder="077…"
                disabled={loading}
              />
            )}
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              sx={{ mt: 2 }}
              onClick={quote?.status === 'provider_created' ? checkExistingPayment : handleProviderCheckout}
              disabled={loading || quoteLoading || providersLoading || !quote || quote.status === 'paid' || quote.status === 'reconciled' || (quote.status !== 'provider_created' && (!provider || (provider === 'paynow' && paymentMethod === 'ecocash' && phone.trim().length < 9)))}
            >
              {loading ? <CircularProgress size={20} /> : quote?.status === 'provider_created' ? 'Check payment' : checkoutButtonLabel(provider, 'paid', paymentMethod)}
            </Button>
            <Typography variant="body2" sx={{ mt: 1, color: 'inherit', opacity: 0.9 }}>
              {provider === 'dodo'
                ? 'You will be redirected to a secure card page. Mantis activates the subscription only after Dodo confirms the payment.'
                : provider === 'paynow' && paymentMethod === 'ecocash'
                  ? 'Approve the prompt on your phone. Stay on this page while Mantis confirms the payment.'
                  : 'Select a provider. Checkout does not start until you continue.'}
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


