import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardContent, Tabs, Tab, Button, CircularProgress, TextField, MenuItem } from '@mui/material';
import { usePropertyService } from '../../services/propertyService';
import paymentService from '../../services/paymentService';
import { Property } from '../../types/property';
import { useMemo } from 'react';
import { useRef } from 'react';
import { useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';
import { useLeaseService } from '../../services/leaseService';
import { useTenantService } from '../../services/tenantService';

const PropertyAccountDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [tab, setTab] = useState<'income' | 'expenditure'>('income');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [incomeTransactions, setIncomeTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payRecipient, setPayRecipient] = useState('');
  const [payRecipientType, setPayRecipientType] = useState<'owner' | 'contractor'>('owner');
  const [payReason, setPayReason] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerFullName, setOwnerFullName] = useState<string>('Owner');
  const propertyOwnerService = usePropertyOwnerService();
  const { getAllPublic: getAllLeases } = useLeaseService();
  const { getAllPublic: getAllTenants } = useTenantService();
  const [tenantName, setTenantName] = useState<string>('Tenant Name');
  const { getProperties } = usePropertyService();

  useEffect(() => {
    const fetchProperty = async () => {
      setLoading(true);
      try {
        const props = await getProperties();
        const found = props.find((p) => p._id === propertyId);
        setProperty(found || null);
        // Fetch property owner details
        if (found && found._id) {
          try {
            const resp = await fetch(`/api/property-owners/by-property/${found._id}`);
            if (resp.ok) {
              const owner = await resp.json();
              if (owner && (owner.firstName || owner.lastName)) {
                setOwnerFullName(`${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email || 'Owner');
              } else if (owner && owner.email) {
                setOwnerFullName(owner.email);
              } else {
                setOwnerFullName('Owner not found');
              }
            } else {
              setOwnerFullName('Owner not found');
            }
          } catch (e) {
            setOwnerFullName('Owner not found');
          }
        } else {
          setOwnerFullName('Owner not found');
        }
        // Fetch current tenant for this property
        if (propertyId) {
          const leases = await getAllLeases();
          const tenantsResp = await getAllTenants();
          const tenants = tenantsResp.tenants || tenantsResp;
          // Find active lease for this property
          const lease = leases.find((l: any) => {
            let leasePropId = l.propertyId;
            if (typeof leasePropId === 'object' && leasePropId !== null && '_id' in leasePropId) {
              leasePropId = (leasePropId as { _id: string })._id;
            }
            return leasePropId === propertyId && l.status === 'active';
          });
          if (lease && lease.tenantId) {
            let leaseTenantId = lease.tenantId;
            if (typeof leaseTenantId === 'object' && leaseTenantId !== null && '_id' in leaseTenantId) {
              leaseTenantId = (leaseTenantId as { _id: string })._id;
            }
            const tenant = tenants.find((t: any) => t._id === leaseTenantId);
            if (tenant) {
              setTenantName(`${tenant.firstName} ${tenant.lastName}`);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProperty();
  }, [propertyId]);

  useEffect(() => {
    if (property && property.ownerId) {
      propertyOwnerService.getById(property.ownerId)
        .then(owner => setOwnerName(owner?.name || null))
        .catch(() => setOwnerName(null));
    }
  }, [property]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!propertyId) return;
      setLoading(true);
      setError(null);
      try {
        // FIX: Remove 'type' from filter, filter results in frontend
        const allPayments = await paymentService.getPayments({ propertyId });
        const filtered = allPayments.filter((p: any) => p.type === tab);
        setTransactions(filtered);
        if (tab === 'income') {
          setIncomeTransactions(filtered);
        }
      } catch (err: any) {
        setError('Failed to fetch transactions');
        console.error('Error fetching payments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [propertyId, tab]);

  // Add Payment form submit handler
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLoading(true);
    setPayError(null);
    setPaySuccess(false);
    try {
      const paymentData = {
        amount: Number(payAmount),
        recipientId: payRecipient,
        recipientType: payRecipientType,
        reason: payReason,
      };
      const payment = await paymentService.createPropertyPayment(propertyId!, paymentData);
      setLastPaymentId(payment._id);
      setPaySuccess(true);
      setPayAmount('');
      setPayRecipient('');
      setPayReason('');
      // Refresh expenditure tab if selected
      if (tab === 'expenditure') {
        const data = await paymentService.getPropertyTransactions(propertyId!, 'expenditure');
        setTransactions(data);
      }
    } catch (err: any) {
      setPayError('Failed to add payment');
    } finally {
      setPayLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  if (!property) return <Box color="error.main">Property not found</Box>;

  // Owner display logic
  const owner = ownerFullName;
  const tenant = tenantName;

  return (
    <Box sx={{ p: 3 }}>
      <Grid container justifyContent="space-between" alignItems="flex-start">
        <Grid item xs={12} md={6}>
          <Typography variant="h5" fontWeight={600}>{property.name}</Typography>
          <Typography variant="body1" color="text.secondary">{property.address}</Typography>
        </Grid>
        <Grid item xs={12} md={6} textAlign="right">
          <Typography variant="subtitle2">Property Owner</Typography>
          <Typography variant="body1" fontWeight={500}>{owner}</Typography>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Tenant</Typography>
          <Typography variant="body1" fontWeight={500}>{tenant}</Typography>
        </Grid>
      </Grid>
      <Box sx={{ mt: 4, mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField label="Search" size="small" sx={{ minWidth: 200 }} />
        <Button variant="outlined">Filter</Button>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ ml: 2 }}>
          <Tab label="Income" value="income" />
          <Tab label="Expenditure" value="expenditure" />
        </Tabs>
      </Box>
      <Box sx={{ mb: 4 }}>
        {/* Transaction list placeholder */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {tab === 'income' ? 'Income Transactions' : 'Expenditure Transactions'}
            </Typography>
            {tab === 'income' ? (
              incomeTransactions.length > 0 ? (
                <>
                  {incomeTransactions.map((tx: any) => (
                    <Box key={tx._id} sx={{ mb: 1 }}>
                      <Typography variant="body2">
                        Date: {new Date(tx.date).toLocaleDateString()} | Amount: ${tx.amount?.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tx.description || 'Rental income'}
                      </Typography>
                    </Box>
                  ))}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No rental income found for this property.</Typography>
              )
            ) : (
              <Typography variant="body2" color="text.secondary">
                All payments made from this property account.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
      {/* Add Payment Section */}
      <Box mt={4}>
        <Typography variant="h6">Add Payment</Typography>
        <form onSubmit={handleAddPayment} style={{ marginTop: 16 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                label="Amount"
                type="number"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Recipient ID"
                value={payRecipient}
                onChange={e => setPayRecipient(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <TextField
                select
                label="Recipient Type"
                value={payRecipientType}
                onChange={e => setPayRecipientType(e.target.value as 'owner' | 'contractor')}
                fullWidth
              >
                <MenuItem value="owner">Owner</MenuItem>
                <MenuItem value="contractor">Contractor</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Reason"
                value={payReason}
                onChange={e => setPayReason(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={1}>
              <Button type="submit" variant="contained" color="primary" disabled={payLoading} fullWidth>
                {payLoading ? <CircularProgress size={24} /> : 'Pay'}
              </Button>
            </Grid>
          </Grid>
        </form>
        {payError && <Typography color="error" mt={2}>{payError}</Typography>}
        {paySuccess && lastPaymentId && (
          <Box mt={2}>
            <Typography color="success.main">Payment successful!</Typography>
            <Button
              variant="outlined"
              sx={{ mr: 2, mt: 1 }}
              onClick={async () => {
                const doc = await paymentService.getPaymentRequestDocument(propertyId!, lastPaymentId);
                // For now, just download as JSON
                const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `payment-request-${lastPaymentId}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download Payment Request
            </Button>
            <Button
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={async () => {
                const doc = await paymentService.getAcknowledgementDocument(propertyId!, lastPaymentId);
                // For now, just download as JSON
                const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `acknowledgement-${lastPaymentId}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download Acknowledgement
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default PropertyAccountDetailPage; 