import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';

interface MaintenanceRequest {
  _id: string;
  propertyId: {
    _id: string;
    name: string;
    address: string;
  };
  title: string;
  description: string;
  priority: string;
  status: string;
  estimatedCost: number;
  createdAt: string;
  messages: {
    sender: {
      _id: string;
      firstName: string;
      lastName: string;
    };
    content: string;
    timestamp: string;
  }[];
}

const MaintenanceRequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [statusUpdate, setStatusUpdate] = useState({
    status: '',
    message: ''
  });
  const [openStatusDialog, setOpenStatusDialog] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get(`/owners/maintenance-requests/${requestId}`);
        setRequest(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Error fetching maintenance request details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [requestId]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const response = await api.post(`/owners/maintenance-requests/${requestId}/messages`, {
        content: newMessage
      });
      setRequest(response.data);
      setNewMessage('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error sending message');
    }
  };

  const handleStatusUpdate = async () => {
    try {
      const response = await api.patch(`/owners/maintenance-requests/${requestId}`, {
        status: statusUpdate.status,
        message: statusUpdate.message
      });
      setRequest(response.data);
      setOpenStatusDialog(false);
      setStatusUpdate({ status: '', message: '' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error updating status');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!request) {
    return (
      <Container>
        <Alert severity="error">Maintenance request not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h4" component="h1">
              Maintenance Request Details
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/owner/dashboard')}>
              Back to Dashboard
            </Button>
          </Box>
        </Grid>

        {error && (
          <Grid item xs={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        )}

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Request Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle1">Title</Typography>
                <Typography variant="body1">{request.title}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1">Description</Typography>
                <Typography variant="body1">{request.description}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Property</Typography>
                <Typography variant="body1">{request.propertyId.name}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {request.propertyId.address}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Priority</Typography>
                <Chip
                  label={request.priority}
                  color={
                    request.priority === 'high' ? 'error' :
                    request.priority === 'medium' ? 'warning' : 'success'
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Status</Typography>
                <Chip
                  label={request.status}
                  color={
                    request.status === 'completed' ? 'success' :
                    request.status === 'in_progress' ? 'primary' : 'default'
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Estimated Cost</Typography>
                <Typography variant="body1">${request.estimatedCost}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={() => setOpenStatusDialog(true)}
                  sx={{ mt: 2 }}
                >
                  Update Status
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Communication
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                label="New Message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                sx={{ mb: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
              >
                Send Message
              </Button>
            </Box>
            <Divider sx={{ my: 2 }} />
            <List>
              {request.messages.map((message, index) => (
                <React.Fragment key={index}>
                  <ListItem>
                    <ListItemText
                      primary={`${message.sender.firstName} ${message.sender.lastName}`}
                      secondary={
                        <>
                          <Typography component="span" variant="body2" color="text.primary">
                            {message.content}
                          </Typography>
                          <br />
                          {new Date(message.timestamp).toLocaleString()}
                        </>
                      }
                    />
                  </ListItem>
                  {index < request.messages.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={openStatusDialog} onClose={() => setOpenStatusDialog(false)}>
        <DialogTitle>Update Maintenance Request Status</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Status"
            value={statusUpdate.status}
            onChange={(e) => setStatusUpdate({ ...statusUpdate, status: e.target.value })}
            sx={{ mt: 2 }}
          >
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </TextField>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Message"
            value={statusUpdate.message}
            onChange={(e) => setStatusUpdate({ ...statusUpdate, message: e.target.value })}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStatusDialog(false)}>Cancel</Button>
          <Button
            onClick={handleStatusUpdate}
            variant="contained"
            disabled={!statusUpdate.status}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default MaintenanceRequestDetails; 