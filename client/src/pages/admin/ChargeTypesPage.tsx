import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import chargeTypeService, { ChargeType, ChargeTypeCategory, ChargeTypePayload } from '../../services/chargeTypeService';

const CATEGORIES: ChargeTypeCategory[] = [
  'PROPERTY_INCOME',
  'PASS_THROUGH',
  'PROPERTY_EXPENSE',
  'LIABILITY',
  'OWNER_WITHDRAWAL',
  'SYSTEM'
];

const emptyForm: ChargeTypePayload = {
  name: '',
  code: '',
  category: 'PROPERTY_INCOME',
  ownerIncome: false,
  requiresPayout: false,
  requiresThirdPartyPayment: false,
  defaultLedger: '',
  active: true
};

const ChargeTypesPage: React.FC = () => {
  const [rows, setRows] = useState<ChargeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeType | null>(null);
  const [form, setForm] = useState<ChargeTypePayload>(emptyForm);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await chargeTypeService.list(true));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load charge types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: ChargeType) => {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      category: row.category,
      ownerIncome: row.ownerIncome,
      requiresPayout: row.requiresPayout,
      requiresThirdPartyPayment: row.requiresThirdPartyPayment,
      defaultLedger: row.defaultLedger,
      active: row.active
    });
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      setError(null);
      if (editing) {
        await chargeTypeService.update(editing._id, form);
        setSuccess('Charge type updated');
      } else {
        await chargeTypeService.create(form);
        setSuccess('Charge type created');
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save charge type');
    }
  };

  const deactivate = async (row: ChargeType) => {
    try {
      await chargeTypeService.deactivate(row._id);
      setSuccess('Charge type deactivated');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to deactivate charge type');
    }
  };

  const remove = async (row: ChargeType) => {
    try {
      await chargeTypeService.remove(row._id);
      setSuccess('Charge type deleted');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Charge type is referenced and cannot be deleted');
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Charge Types</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure how payment lines post into owner income, pass-through balances, liabilities, and expenses.
          </Typography>
        </Box>
        <Button variant="contained" onClick={openCreate}>New Charge Type</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Card>
        <CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Owner Income</TableCell>
                  <TableCell>Third Party Payment</TableCell>
                  <TableCell>Default Ledger</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell><Chip label={row.code} size="small" /></TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.ownerIncome ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.requiresThirdPartyPayment ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.defaultLedger}</TableCell>
                    <TableCell>
                      <Chip label={row.active ? 'Active' : 'Inactive'} color={row.active ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openEdit(row)}>Edit</Button>
                      {row.active && <Button size="small" color="warning" onClick={() => deactivate(row)}>Deactivate</Button>}
                      <Button size="small" color="error" onClick={() => remove(row)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>No charge types configured.</TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8}>Loading charge types...</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Edit Charge Type' : 'New Charge Type'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <TextField label="Name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Code" value={form.code} onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField select label="Category" value={form.category} onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value as ChargeTypeCategory }))} fullWidth>
                {CATEGORIES.map(category => <MenuItem key={category} value={category}>{category}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Default Ledger" value={form.defaultLedger} onChange={(e) => setForm(prev => ({ ...prev, defaultLedger: e.target.value }))} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel control={<Switch checked={form.ownerIncome} onChange={(e) => setForm(prev => ({ ...prev, ownerIncome: e.target.checked }))} />} label="Contributes to owner income" />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel control={<Switch checked={form.requiresPayout} onChange={(e) => setForm(prev => ({ ...prev, requiresPayout: e.target.checked }))} />} label="Requires owner payout" />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel control={<Switch checked={form.requiresThirdPartyPayment} onChange={(e) => setForm(prev => ({ ...prev, requiresThirdPartyPayment: e.target.checked }))} />} label="Requires third-party payment" />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))} />} label="Active" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChargeTypesPage;
