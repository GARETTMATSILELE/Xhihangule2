import React from 'react';
import { Alert, Box, Paper, Typography } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCcMastercard, faCcVisa } from '@fortawesome/free-brands-svg-icons';
import PaynowBadge from './PaynowBadge';

export type PaymentProviderId = 'paynow' | 'dodo';

export type PaymentProviderOption = {
  id: PaymentProviderId;
  available: boolean;
  testMode: boolean;
  cycles: Array<'monthly' | 'quarterly' | 'yearly'>;
  cardBrands: Array<'visa' | 'mastercard'>;
};

type PaymentMethodChoiceProps = {
  providers: PaymentProviderOption[];
  value: PaymentProviderId | '';
  onChange: (provider: PaymentProviderId) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
};

const PaymentMethodChoice: React.FC<PaymentMethodChoiceProps> = ({
  providers,
  value,
  onChange,
  disabled = false,
  loading = false,
  error = ''
}) => {
  if (loading) {
    return <Alert severity="info" sx={{ mt: 2 }}>Loading payment methods…</Alert>;
  }
  if (error) {
    return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
  }
  if (!providers.length) {
    return <Alert severity="warning" sx={{ mt: 2 }}>No payment method is available for this registration.</Alert>;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        Choose your payment method
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {providers.map((item) => {
          const selected = value === item.id;
          const title = item.id === 'paynow' ? 'Paynow' : 'Dodo Payments';
          const description = item.id === 'paynow'
            ? 'Pay using EcoCash and other supported local payment methods.'
            : 'Pay securely using Visa and Mastercard.';
          return (
            <Paper
              key={item.id}
              component="button"
              type="button"
              variant="outlined"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(item.id)}
              sx={{
                p: 2,
                textAlign: 'left',
                width: '100%',
                cursor: disabled ? 'default' : 'pointer',
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'background.paper',
                color: 'text.primary'
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary">{description}</Typography>
              {item.id === 'paynow' ? (
                <Box sx={{ mt: 1.5, maxWidth: 280 }}>
                  <PaynowBadge />
                </Box>
              ) : (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1.5, fontSize: 28, color: 'text.primary' }} aria-label="Visa and Mastercard">
                  <FontAwesomeIcon icon={faCcVisa} title="Visa" />
                  <FontAwesomeIcon icon={faCcMastercard} title="Mastercard" />
                </Box>
              )}
              {item.testMode && <Alert severity="info" sx={{ mt: 1 }}>Test mode. No live card charge is sent.</Alert>}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
};

export function checkoutButtonLabel(provider: PaymentProviderId | '', registrationMode: 'trial' | 'paid'): string {
  if (registrationMode === 'trial') return 'Start 14-Day Free Trial';
  if (provider === 'paynow') return 'Continue to Paynow checkout';
  if (provider === 'dodo') return 'Continue to card checkout';
  return 'Choose a payment method';
}

export default PaymentMethodChoice;
