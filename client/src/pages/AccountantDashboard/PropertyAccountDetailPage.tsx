import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardContent, Button, CircularProgress, TextField } from '@mui/material';
import { usePropertyService } from '../../services/propertyService';

const PropertyAccountDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { getProperties } = usePropertyService();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const props = await getProperties();
        const found = props.find((p: any) => p._id === propertyId);
        setProperty(found || null);
        const resp = await fetch(`/api/property-accounts/${propertyId}`);
        if (!resp.ok) throw new Error('Failed to fetch property account');
        const data = await resp.json();
        setLedger(data);
      } catch (err: any) {
        setError('Failed to fetch property or account data');
      } finally {
        setLoading(false);
      }
    };
    if (propertyId) fetchData();
  }, [propertyId, success]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(false);
    try {
      const resp = await fetch(`/api/property-accounts/${propertyId}/expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), date: date || new Date(), description })
      });
      if (!resp.ok) throw new Error('Failed to add expense');
      setAmount('');
      setDate('');
      setDescription('');
      setSuccess(true);
    } catch (err: any) {
      setSubmitError('Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  if (error || !property) return <Box color="error.main">{error || 'Property not found'}</Box>;

  // Prepare transactions with running balance
  let running = 0;
  const transactions = (ledger?.transactions || []).slice().sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((tx: any) => {
    running += tx.type === 'income' ? tx.amount : -tx.amount;
    return { ...tx, runningBalance: running };
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600}>{property.name}</Typography>
      <Typography variant="body1" color="text.secondary">{property.address}</Typography>
      <Box sx={{ mt: 4, mb: 2 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Ledger</Typography>
            {transactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No transactions found.</Typography>
            ) : (
              <Box>
                {transactions.map((tx: any, idx: number) => (
                  <Box key={idx} sx={{ mb: 1, p: 1, borderBottom: '1px solid #eee' }}>
                    <Typography variant="body2">
                      {tx.type === 'income' ? 'Income' : 'Expense'} | Date: {new Date(tx.date).toLocaleDateString()} | Amount: ${tx.amount?.toLocaleString()} | Balance: ${tx.runningBalance?.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {tx.description || (tx.type === 'income' ? 'Rental income' : 'Expenditure')}
                    </Typography>
                  </Box>
                ))}
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Current Balance: ${ledger.runningBalance?.toLocaleString()}</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
      {/* Add Expense Section */}
      <Box mt={4}>
        <Typography variant="h6">Add Expense</Typography>
        <form onSubmit={handleAddExpense} style={{ marginTop: 16 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                label="Amount"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button type="submit" variant="contained" color="primary" disabled={submitting} fullWidth>
                {submitting ? <CircularProgress size={24} /> : 'Add Expense'}
              </Button>
            </Grid>
          </Grid>
        </form>
        {submitError && <Typography color="error" mt={2}>{submitError}</Typography>}
        {success && <Typography color="success.main" mt={2}>Expense added successfully!</Typography>}
      </Box>
    </Box>
  );
};

export default PropertyAccountDetailPage; 