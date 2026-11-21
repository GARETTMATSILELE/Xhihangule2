import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Tab, Tabs, TextField, Typography } from '@mui/material';
import { apiService } from '../../api';
import PaynowBadge from '../../components/payments/PaynowBadge';

type ProviderId = 'paynow' | 'dodo';
type ProviderOption = {
  id: ProviderId;
  available: boolean;
  testMode: boolean;
  cycles: Array<'monthly' | 'quarterly' | 'yearly'>;
  cardBrands: Array<'visa' | 'mastercard'>;
};

const BillingSetup: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [plan, setPlan] = useState<'INDIVIDUAL'|'SME'|'ENTERPRISE'>('SME');
  const [cycle, setCycle] = useState<'monthly'|'quarterly'|'yearly'>('monthly');
  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    apiService.getPaymentProviders()
      .then(({ data }) => setProviders((data.providers || []).filter((item: ProviderOption) => item.available)))
      .catch(() => setMessage({ type: 'error', text: 'Payment methods could not be loaded.' }));
  }, []);

  const selected = providers.find((item) => item.id === provider);
  const cycles = selected?.cycles?.length ? selected.cycles : ['monthly', 'yearly'];

  const handleCheckout = async () => {
    if (!provider) {
      setMessage({ type: 'info', text: 'Choose a payment method before continuing.' });
      return;
    }
    try {
      setLoading(true);
      setMessage(null);
      const { data } = await apiService.createCheckout({ plan, cycle, provider });
      if (!data.redirectUrl) {
        setMessage({ type: 'error', text: 'Checkout did not return a payment page.' });
        return;
      }
      window.location.href = data.redirectUrl;
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to start checkout' });
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    try {
      setLoading(true);
      setMessage(null);
      await apiService.redeemVoucher(code, pin);
      setMessage({ type: 'success', text: 'Voucher redeemed. Subscription active.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to redeem voucher' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" gutterBottom>Set up your subscription</Typography>
      {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }} variant="fullWidth">
        <Tab label="Pay now" />
        <Tab label="Voucher / Offline" />
      </Tabs>
      {tab === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>Choose your payment method</Typography>
          <Box sx={{ display: 'grid', gap: 2, mb: 2 }}>
            {providers.map((item) => (
              <Paper
                key={item.id}
                variant="outlined"
                onClick={() => {
                  setProvider(item.id);
                  if (!item.cycles.includes(cycle)) setCycle(item.cycles[0] || 'monthly');
                }}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  borderWidth: provider === item.id ? 2 : 1,
                  borderColor: provider === item.id ? 'primary.main' : 'divider'
                }}
              >
                <Typography variant="subtitle1">{item.id === 'paynow' ? 'Paynow' : 'Dodo Payments'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.id === 'paynow'
                    ? 'Pay using available local payment methods.'
                    : 'Pay securely using international debit and credit cards.'}
                </Typography>
                {item.id === 'dodo' && item.cardBrands.includes('visa') && item.cardBrands.includes('mastercard') && (
                  <Typography variant="body2" sx={{ mt: 1 }}>Visa · Mastercard</Typography>
                )}
                {item.testMode && <Alert severity="info" sx={{ mt: 1 }}>Test mode. No live card charge is sent.</Alert>}
              </Paper>
            ))}
            {!providers.length && <Alert severity="warning">No payment provider is available.</Alert>}
          </Box>
          <TextField fullWidth select SelectProps={{ native: true }} label="Plan" value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} sx={{ mb: 2 }}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="SME">SME</option>
            <option value="ENTERPRISE">Enterprise</option>
          </TextField>
          <TextField fullWidth select SelectProps={{ native: true }} label="Billing Cycle" value={cycles.includes(cycle) ? cycle : cycles[0]} onChange={(event) => setCycle(event.target.value as typeof cycle)} sx={{ mb: 2 }}>
            {cycles.includes('monthly') && <option value="monthly">Monthly</option>}
            {cycles.includes('quarterly') && <option value="quarterly">Quarterly</option>}
            {cycles.includes('yearly') && <option value="yearly">Annual</option>}
          </TextField>
          <Button variant="contained" fullWidth onClick={handleCheckout} disabled={loading || !provider}>
            {loading ? <CircularProgress size={20} /> : 'Continue to payment'}
          </Button>
          {provider === 'paynow' && (
            <Box sx={{ mt: 3 }}>
              <PaynowBadge />
            </Box>
          )}
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <TextField fullWidth label="Voucher Code" value={code} onChange={(event) => setCode(event.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth label="PIN" type="password" value={pin} onChange={(event) => setPin(event.target.value)} sx={{ mb: 2 }} />
          <Button variant="contained" onClick={handleRedeem} disabled={loading}>{loading ? <CircularProgress size={20} /> : 'Redeem Voucher'}</Button>
        </Box>
      )}
    </Container>
  );
};

export default BillingSetup;
