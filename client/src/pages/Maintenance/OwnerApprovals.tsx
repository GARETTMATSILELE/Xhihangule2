import React from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Chip,
  useTheme
} from '@mui/material';
import { MaintenanceRequest, MaintenanceStatus } from '../../types/maintenance';
import { apiService } from '../../api';
import { Property } from '../../types/property';

interface OwnerApprovalsProps {
  requests: MaintenanceRequest[];
  onRequestUpdated: (request: MaintenanceRequest) => void;
  properties: Property[];
}

const OwnerApprovals: React.FC<OwnerApprovalsProps> = ({
  requests,
  onRequestUpdated,
  properties
}) => {
  const theme = useTheme();

  const handleApprove = async (requestId: string) => {
    try {
      const response = await apiService.approveMaintenanceRequest(requestId);
      onRequestUpdated(response.data);
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const response = await apiService.rejectMaintenanceRequest(requestId, 'Rejected by owner');
      onRequestUpdated(response.data);
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return theme.palette.success.main;
      case 'rejected':
        return theme.palette.error.main;
      default:
        return theme.palette.warning.main;
    }
  };

  const getPropertyName = (propertyId: string) => {
    const property = properties.find((p) => p._id === propertyId);
    return property ? property.name : propertyId;
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Owner Approvals
      </Typography>
      <List>
        {requests.map((request) => (
          <ListItem
            key={request._id}
            divider
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1
            }}
          >
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1">
                {getPropertyName(request.propertyId)}
              </Typography>
              <Chip
                label={request.ownerApprovalStatus}
                sx={{
                  backgroundColor: getStatusColor(request.ownerApprovalStatus || ''),
                  color: 'white'
                }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {request.description}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                variant="contained"
                color="success"
                size="small"
                onClick={() => { if (request._id) handleApprove(request._id); }}
                disabled={request.ownerApprovalStatus === 'approved' || !request._id}
              >
                Approve
              </Button>
              <Button
                variant="contained"
                color="error"
                size="small"
                onClick={() => { if (request._id) handleReject(request._id); }}
                disabled={request.ownerApprovalStatus === 'rejected' || !request._id}
              >
                Reject
              </Button>
            </Box>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export default OwnerApprovals; 