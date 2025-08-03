import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  useTheme
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Assignment as AssignIcon,
  AttachFile as AttachmentIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { MaintenanceRequest, MaintenanceStatus, MaintenancePriority, MaintenanceCategory, MaintenanceAttachment } from '../../types/maintenance';
import { apiService } from '../../api';
import MaintenanceComments from './MaintenanceComments';
import MaintenanceAuditLog from './MaintenanceAuditLog';

interface MaintenanceRequestDetailsProps {
  request: MaintenanceRequest;
  onRequestUpdated: (request: MaintenanceRequest) => void;
  onRequestDeleted: (requestId: string) => void;
  onClose: () => void;
}

const MaintenanceRequestDetails: React.FC<MaintenanceRequestDetailsProps> = ({
  request,
  onRequestUpdated,
  onRequestDeleted,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<MaintenanceAttachment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const theme = useTheme();

  const handleStatusChange = async (newStatus: MaintenanceStatus) => {
    if (!request._id) return;
    try {
      setLoading(true);
      const response = await apiService.updateMaintenanceStatus(request._id, newStatus);
      onRequestUpdated(response.data);
    } catch (err) {
      setError('Failed to update status');
      console.error('Error updating status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!request._id) return;
    try {
      setLoading(true);
      const response = await apiService.assignMaintenanceRequest(request._id, selectedVendor);
      onRequestUpdated(response.data);
      setShowAssignDialog(false);
    } catch (err) {
      setError('Failed to assign request');
      console.error('Error assigning request:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!request._id) return;
    try {
      setLoading(true);
      const response = await apiService.rejectMaintenanceRequest(request._id, rejectReason);
      onRequestUpdated(response.data);
      setShowRejectDialog(false);
    } catch (err) {
      setError('Failed to reject request');
      console.error('Error rejecting request:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!request._id) return;
    try {
      setLoading(true);
      const response = await apiService.approveMaintenanceRequest(request._id);
      onRequestUpdated(response.data);
    } catch (err) {
      setError('Failed to approve request');
      console.error('Error approving request:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!request._id) return;
    if (window.confirm('Are you sure you want to delete this request?')) {
      try {
        setLoading(true);
        await apiService.deleteMaintenanceRequest(request._id);
        onRequestDeleted(request._id);
      } catch (err) {
        setError('Failed to delete request');
        console.error('Error deleting request:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSendPaymentRequest = async () => {
    if (!file || !request._id) return;
    setUploading(true);
    try {
      // Upload file
      const formData = new FormData();
      formData.append('files', file);
      const uploadRes = await apiService.uploadFiles(formData);
      const uploaded = uploadRes.data[0];
      // Attach file to request and set status to pending_approval
      const updateRes = await apiService.updateMaintenanceRequest(request._id, {
        attachments: [uploaded],
        status: 'pending_approval',
      });
      setAttachment(uploaded);
      onRequestUpdated(updateRes.data);
      setFile(null);
    } catch (err) {
      setError('Failed to send payment request');
    } finally {
      setUploading(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!request._id) return;
    setLoading(true);
    try {
      const updateRes = await apiService.completeMaintenanceRequest(request._id);
      onRequestUpdated(updateRes.data);
    } catch (err) {
      setError('Failed to mark as completed');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: MaintenanceStatus) => {
    switch (status) {
      case MaintenanceStatus.PENDING:
        return theme.palette.warning.main;
      case MaintenanceStatus.APPROVED:
        return theme.palette.info.main;
      case MaintenanceStatus.IN_PROGRESS:
        return theme.palette.primary.main;
      case MaintenanceStatus.COMPLETED:
        return theme.palette.success.main;
      case MaintenanceStatus.REJECTED:
        return theme.palette.error.main;
      case MaintenanceStatus.CANCELLED:
        return theme.palette.grey[500];
      default:
        return theme.palette.text.primary;
    }
  };

  const getPriorityColor = (priority: MaintenancePriority) => {
    switch (priority) {
      case MaintenancePriority.URGENT:
        return theme.palette.error.main;
      case MaintenancePriority.HIGH:
        return theme.palette.warning.main;
      case MaintenancePriority.MEDIUM:
        return theme.palette.info.main;
      case MaintenancePriority.LOW:
        return theme.palette.success.main;
      default:
        return theme.palette.text.primary;
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">
              Maintenance Request Details
            </Typography>
            <Box>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => {/* TODO: Implement edit */}}
                sx={{ mr: 1 }}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Request Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Property
                </Typography>
                <Typography variant="body1">
                  {typeof request.propertyId === 'string' ? request.propertyId : ''}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Category
                </Typography>
                <Typography variant="body1">
                  {request.category}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Priority
                </Typography>
                <Chip
                  label={request.priority}
                  sx={{
                    backgroundColor: getPriorityColor(request.priority as any),
                    color: 'white'
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={request.status}
                  sx={{
                    backgroundColor: getStatusColor((request.status as any) || 'pending'),
                    color: 'white'
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Created By
                </Typography>
                <Typography variant="body1">
                  {request.createdByName}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Description
                </Typography>
                <Typography variant="body1">
                  {request.description}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Access Window
                </Typography>
                <Typography variant="body1">
                  {format(new Date(request.accessWindow.start), 'MMM d, yyyy')} -{' '}
                  {format(new Date(request.accessWindow.end), 'MMM d, yyyy')}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Estimated Cost
                </Typography>
                <Typography variant="body1">
                  ${request.estimatedCost ? request.estimatedCost.toFixed(2) : '0.00'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Actions
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {request.status === MaintenanceStatus.PENDING && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<ApproveIcon />}
                    onClick={handleApprove}
                    disabled={loading}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<RejectIcon />}
                    onClick={() => setShowRejectDialog(true)}
                    disabled={loading}
                  >
                    Reject
                  </Button>
                </>
              )}
              {request.status === MaintenanceStatus.APPROVED && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AssignIcon />}
                  onClick={() => setShowAssignDialog(true)}
                  disabled={loading}
                >
                  Assign to Vendor
                </Button>
              )}
              {request.status === MaintenanceStatus.IN_PROGRESS && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<ApproveIcon />}
                  onClick={() => handleStatusChange(MaintenanceStatus.COMPLETED)}
                  disabled={loading}
                >
                  Mark as Completed
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <MaintenanceComments
            requestId={request._id || ''}
            comments={request.comments}
            onCommentAdded={(comment) => {
              onRequestUpdated({
                ...request,
                comments: [...request.comments, comment]
              });
            }}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <MaintenanceAuditLog request={request} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Payment Request
            </Typography>
            {attachment ? (
              <Box sx={{ my: 2 }}>
                <Typography variant="subtitle2">Quotation Attachment</Typography>
                <Button
                  variant="outlined"
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<AttachmentIcon />}
                >
                  View/Download {attachment.name}
                </Button>
              </Box>
            ) : (
              <Box sx={{ my: 2 }}>
                <Button
                  variant="contained"
                  component="label"
                  disabled={uploading}
                >
                  Attach Quotation (PDF/Image)
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    hidden
                    onChange={handleFileChange}
                  />
                </Button>
                {file && (
                  <Typography variant="body2" sx={{ mt: 1 }}>{file.name}</Typography>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  sx={{ mt: 1, ml: 2 }}
                  onClick={handleSendPaymentRequest}
                  disabled={!file || uploading}
                >
                  {uploading ? 'Uploading...' : 'Send Payment Request'}
                </Button>
              </Box>
            )}
            {/* Status Chips */}
            {request.status === 'pending_approval' && (
              <Chip label="Pending Approval" color="warning" sx={{ mt: 2 }} />
            )}
            {request.status === 'approved' && (
              <Chip label="Approved" color="success" sx={{ mt: 2 }} />
            )}
            {request.status === 'pending_completion' && (
              <Chip label="Pending Completion" color="primary" sx={{ mt: 2 }} />
            )}
            {request.status === 'completed' && (
              <Chip label="Completed" color="success" sx={{ mt: 2 }} />
            )}
            {/* Mark as Completed Button */}
            {request.status === 'pending_completion' && (
              <Button
                variant="contained"
                color="success"
                sx={{ mt: 2, ml: 2 }}
                onClick={handleMarkCompleted}
                disabled={loading}
              >
                Mark as Completed
              </Button>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onClose={() => setShowAssignDialog(false)}>
        <DialogTitle>Assign to Vendor</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Select Vendor"
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            sx={{ mt: 2 }}
          >
            {/* TODO: Add vendor list */}
            <MenuItem value="vendor1">Vendor 1</MenuItem>
            <MenuItem value="vendor2">Vendor 2</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAssignDialog(false)}>Cancel</Button>
          <Button onClick={handleAssign} variant="contained" disabled={!selectedVendor}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)}>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Reason for Rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRejectDialog(false)}>Cancel</Button>
          <Button
            onClick={handleReject}
            variant="contained"
            color="error"
            disabled={!rejectReason.trim()}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MaintenanceRequestDetails; 