import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import accountingService from '../../services/accountingService';

const STATUS_LABELS: Record<string, string> = {
  awaiting_recognition: 'Historical VAT awaiting recognition',
  approved: 'Historical VAT approved for recognition',
  recognised: 'Historical VAT recognised',
  review: 'Historical VAT requiring further review',
  rejected: 'Historical VAT rejected',
  existing_obligation: 'Existing VAT obligation'
};

type ScheduleRow = {
  paymentId: string;
  reference: string;
  property: string;
  tenant: string;
  receiptDate: string | null;
  rentalPeriod: string;
  gross: number;
  commissionPercent: number | null;
  commission: number;
  vatRate: number;
  vat: number;
  ownerAfterVat: number;
  vatRecordRate: number | null;
  obligationAmount: number | null;
  receiptJournalPresent: boolean;
  vatPayableAmount: number;
  periodClass: 'before_registration' | 'on_or_after_registration';
  recognitionStatus: string;
  blockedReason: string;
  duplicateRecognitionBlocked: boolean;
};

function money(value: number): string {
  return `USD ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HistoricalVatSchedule: React.FC = () => {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [reason, setReason] = useState('');
  const [physicalBookReference, setPhysicalBookReference] = useState('');
  const [taxTreatmentBasis, setTaxTreatmentBasis] = useState('');
  const [septemberApproved, setSeptemberApproved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const schedule = await accountingService.getHistoricalVatSchedule();
      setRows(schedule.rows || []);
      setCounts(schedule.counts || {});
      setMessage(null);
    } catch (error: any) {
      const status = error?.response?.status;
      setMessage(status === 403
        ? 'Historical VAT recognition is limited to an accountant. It is not an ordinary agent action.'
        : (error?.response?.data?.message || 'The historical VAT schedule could not be loaded.'));
    }
  };

  useEffect(() => { void load(); }, []);

  const close = () => {
    setSelected(null);
    setReason('');
    setPhysicalBookReference('');
    setTaxTreatmentBasis('');
    setSeptemberApproved(false);
    setConfirm(false);
  };

  const recognise = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await accountingService.recogniseHistoricalVat(selected.paymentId, {
        confirm,
        reason,
        physicalBookReference,
        septemberTaxTreatmentApproved: septemberApproved,
        taxTreatmentBasis
      });
      setMessage(result.duplicatePrevented
        ? `${selected.reference} was already recognised. Duplicate recognition was prevented.`
        : `${selected.reference}: ${STATUS_LABELS[result.status] || result.status}. ${result.reason || ''}`);
      close();
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.reason || error?.response?.data?.message || 'Recognition was not posted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Historical VAT recognition</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        September and October receipts are listed one at a time. Nothing in this list is recognised automatically, and a repair does not approve it.
        Awaiting {counts.awaiting_recognition || 0}. Approved {counts.approved || 0}. Recognised {counts.recognised || 0}. Further review {counts.review || 0}. Rejected {counts.rejected || 0}. Existing obligation {counts.existing_obligation || 0}.
      </Typography>
      {message && <Alert severity="info" sx={{ mb: 1 }}>{message}</Alert>}
      {rows.length === 0 ? (
        <Typography variant="body2">No September or October receipts with stored commission VAT are waiting in this company.</Typography>
      ) : rows.map((row) => (
        <Box key={row.paymentId} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2">
            {row.reference} · {row.property || 'Property'} · {money(row.vat)} · {STATUS_LABELS[row.recognitionStatus] || row.recognitionStatus}
            {row.duplicateRecognitionBlocked ? ' · Duplicate recognition blocked' : ''}
            {row.blockedReason ? ` · ${row.blockedReason}` : ''}
          </Typography>
          <Button size="small" onClick={() => setSelected(row)}>Review</Button>
        </Box>
      ))}
      <Dialog open={Boolean(selected)} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Recognise historical VAT</DialogTitle>
        <DialogContent>
          {selected && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {selected.reference}. Receipt {selected.receiptDate ? new Date(selected.receiptDate).toLocaleDateString() : '—'}. Period {selected.rentalPeriod || '—'}. Gross {money(selected.gross)}. Commission {selected.commissionPercent ?? '—'}% / {money(selected.commission)}. VAT {money(selected.vat)} at {selected.vatRate}. Owner income after VAT {money(selected.ownerAfterVat)}.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                VAT record rate {selected.vatRecordRate ?? 'none'}. Obligation {selected.obligationAmount == null ? 'none' : money(selected.obligationAmount)}. Receipt journal {selected.receiptJournalPresent ? 'present' : 'absent'}. VAT payable already posted {money(selected.vatPayableAmount)}.
              </Typography>
              <Alert severity="warning" sx={{ mb: 1 }}>
                {selected.periodClass === 'before_registration'
                  ? 'This receipt is before the VAT registration effective date. It needs a separate documented tax-treatment basis. Approval does not replace missing evidence.'
                  : 'October recognition still requires registration, category, exclusive treatment, the stored calculation, and the physical-book reference.'}
              </Alert>
              <TextField fullWidth required label="Recognition reason" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ mb: 1 }} />
              <TextField fullWidth required label="Physical-book reference" value={physicalBookReference} onChange={(event) => setPhysicalBookReference(event.target.value)} sx={{ mb: 1 }} />
              {selected.periodClass === 'before_registration' && (
                <>
                  <TextField fullWidth required multiline minRows={2} label="September tax-treatment basis" value={taxTreatmentBasis} onChange={(event) => setTaxTreatmentBasis(event.target.value)} sx={{ mb: 1 }} />
                  <FormControlLabel control={<Checkbox checked={septemberApproved} onChange={(event) => setSeptemberApproved(event.target.checked)} />} label="I approve the September tax treatment" />
                </>
              )}
              <FormControlLabel control={<Checkbox checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />} label="I confirm this one receipt" />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Close</Button>
          <Button color="inherit" disabled={busy || reason.trim().length < 10} onClick={() => {
            if (!selected) return;
            setBusy(true);
            void accountingService.rejectHistoricalVat(selected.paymentId, { reason })
              .then((result) => setMessage(`${selected.reference}: ${result.reason || result.status}`))
              .catch((error) => setMessage(error?.response?.data?.message || 'Rejection was not recorded.'))
              .finally(() => { setBusy(false); close(); void load(); });
          }}>Reject</Button>
          <Button variant="contained" disabled={busy || !confirm} onClick={() => void recognise()}>Recognise this receipt</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default HistoricalVatSchedule;
