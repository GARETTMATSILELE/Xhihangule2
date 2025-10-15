import React, { useState } from 'react';
import { Box, Button, Container, Tab, Tabs, TextField, Typography, Alert, CircularProgress } from '@mui/material';
import { apiService } from '../../api';

const BillingSetup: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [plan, setPlan] = useState<'INDIVIDUAL'|'SME'|'ENTERPRISE'>('SME');
  const [cycle, setCycle] = useState<'monthly'|'yearly'>('monthly');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const handleCheckout = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const { data } = await apiService.createCheckout({ plan, cycle });
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
      const { data } = await apiService.redeemVoucher(code, pin);
      setMessage({ type: 'success', text: 'Voucher redeemed. Subscription active.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to redeem voucher' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" gutterBottom>Set up your subscription</Typography>
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>
      )}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Card / EcoCash" />
        <Tab label="Voucher / Offline" />
      </Tabs>
      {tab === 0 && (
        <Box>
          <TextField fullWidth select SelectProps={{ native: true }} label="Plan" value={plan} onChange={e=>setPlan(e.target.value as any)} sx={{ mb: 2 }}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="SME">SME</option>
            <option value="ENTERPRISE">Enterprise</option>
          </TextField>
          <TextField fullWidth select SelectProps={{ native: true }} label="Billing Cycle" value={cycle} onChange={e=>setCycle(e.target.value as any)} sx={{ mb: 2 }}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </TextField>
          <Button variant="contained" onClick={handleCheckout} disabled={loading}>{loading ? <CircularProgress size={20} /> : 'Proceed to Paynow'}</Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            You will be redirected to Paynow to complete your payment.
          </Typography>
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <TextField fullWidth label="Voucher Code" value={code} onChange={e=>setCode(e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth label="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)} sx={{ mb: 2 }} />
          <Button variant="contained" onClick={handleRedeem} disabled={loading}>{loading ? <CircularProgress size={20} /> : 'Redeem Voucher'}</Button>
        </Box>
      )}
    </Container>
  );
};

export default BillingSetup;






