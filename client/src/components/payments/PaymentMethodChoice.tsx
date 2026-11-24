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
  methods?: Array<{ id: string; label: string }>;
};

type PaymentMethodChoiceProps = {
  providers: PaymentProviderOption[];
  value: PaymentProviderId | '';
  onChange: (provider: PaymentProviderId) => void;
  method?: string;
  onMethodChange?: (method: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
};

const PaymentMethodChoice: React.FC<PaymentMethodChoiceProps> = ({
  providers,
  value,
  onChange,
  method = '',
  onMethodChange,
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
        Choose a payment provider
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {providers.map((item) => {
          const selected = value === item.id;
          const title = item.id === 'paynow' ? 'Paynow' : 'Dodo Payments';
          const description = item.id === 'paynow'
            ? (item.methods?.length ? item.methods.map((entry) => entry.label).join(' · ') : 'EcoCash')
            : 'Visa and Mastercard';
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
              {selected && item.methods && item.methods.length > 1 && onMethodChange && (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }} onClick={(event) => event.stopPropagation()}>
                  {item.methods.map((entry) => (
                    <Box
                      key={entry.id}
                      component="button"
                      type="button"
                      onClick={() => onMethodChange(entry.id)}
                      sx={{
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: method === entry.id ? 'primary.main' : 'divider',
                        bgcolor: method === entry.id ? 'primary.main' : 'background.paper',
                        color: method === entry.id ? 'primary.contrastText' : 'text.primary',
                        cursor: 'pointer'
                      }}
                    >
                      {entry.label}
                    </Box>
                  ))}
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

export function checkoutButtonLabel(provider: PaymentProviderId | '', registrationMode: 'trial' | 'paid', method = ''): string {
  if (registrationMode === 'trial') return 'Start 14-Day Free Trial';
  if (provider === 'paynow' && method === 'ecocash') return 'Pay with EcoCash';
  if (provider === 'paynow') return 'Continue with Paynow';
  if (provider === 'dodo') return 'Continue to card checkout';
  return 'Choose a payment provider';
}

export default PaymentMethodChoice;
