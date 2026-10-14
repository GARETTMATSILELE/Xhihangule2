import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import api from '../../api/axios';

export const OwnerLettingDecisions: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvedRent, setApprovedRent] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/owners/letting/properties/${propertyId}/workspace`)
      .then((res) => {
        setData(res.data?.data);
        setApprovedRent(String(res.data?.data?.assessment?.recommendedRent ?? ''));
        setError('');
      })
      .catch((err) => setError(err?.response?.data?.message || 'Letting decisions could not be loaded'))
      .finally(() => setLoading(false));
  }, [propertyId]);
  useEffect(() => { load(); }, [load]);

  const decideAssessment = async (status: 'OWNER_APPROVED' | 'OWNER_REJECTED') => {
    if (!window.confirm(status === 'OWNER_APPROVED' ? 'Approve this rental price?' : 'Request changes to this assessment?')) return;
    setError('');
    try {
      await api.post(`/owners/letting/assessments/${data.assessment._id}/decision`, {
        status,
        approvedRent: Number(approvedRent || data.assessment.recommendedRent),
        reason: comment,
      });
      setComment('');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The decision was not saved');
    }
  };

  const decideApplicant = async (applicationId: string, decision: 'APPROVED' | 'DECLINED' | 'FURTHER') => {
    if (!window.confirm('Record this applicant decision?')) return;
    setError('');
    try {
      await api.post(`/owners/letting/applications/${applicationId}/decision`, { decision, reason: comment });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The applicant decision was not saved');
    }
  };

  if (loading) return <CircularProgress size={24} />;
  if (!data && error) return <Alert severity="info" sx={{ mb: 2 }}>{error}</Alert>;
  if (!data?.assessment && !(data?.shortlist || []).length) return null;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6">Letting decisions</Typography>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
      {data?.assessment && (
        <Box sx={{ mt: 1 }}>
          <Chip label={data.assessment.status === 'OWNER_REJECTED' ? 'Changes requested' : data.assessment.status} sx={{ mr: 1 }} />
          <Typography variant="body2">Recommended rent {data.assessment.recommendedRent}</Typography>
          {data.assessment.status === 'ASSESSMENT_SUBMITTED' && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              <TextField size="small" label="Approved rent" value={approvedRent} onChange={(e) => setApprovedRent(e.target.value)} />
              <TextField size="small" label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button variant="contained" onClick={() => decideAssessment('OWNER_APPROVED')}>Approve price</Button>
              <Button color="warning" onClick={() => decideAssessment('OWNER_REJECTED')}>Request changes</Button>
            </Box>
          )}
        </Box>
      )}
      {(data?.shortlist || []).map((application: any) => (
        <Box key={application._id} sx={{ mt: 2 }}>
          <Typography>{application.snapshot?.fullName || 'Applicant'} · {application.status}</Typography>
          <Typography variant="body2">
            {application.snapshot?.employer || application.snapshot?.employmentStatus || 'Employment not recorded'}
            {application.submittedAt ? ` · submitted ${new Date(application.submittedAt).toLocaleDateString()}` : ''}
          </Typography>
          {application.status === 'SENT_TO_OWNER' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={() => decideApplicant(application._id, 'APPROVED')}>Select</Button>
              <Button size="small" onClick={() => decideApplicant(application._id, 'FURTHER')}>Further consideration</Button>
              <Button size="small" color="warning" onClick={() => decideApplicant(application._id, 'DECLINED')}>Decline</Button>
            </Box>
          )}
        </Box>
      ))}
    </Paper>
  );
};
