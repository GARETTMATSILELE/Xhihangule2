import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
} from '@mui/icons-material';

interface Contractor {
  id: string;
  name: string;
  company: string;
  specialty: string[];
  phone: string;
  email: string;
  rating: number;
  status: 'active' | 'inactive';
}

const ContractorList: React.FC = () => {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [formData, setFormData] = useState<Partial<Contractor>>({
    name: '',
    company: '',
    specialty: [],
    phone: '',
    email: '',
    status: 'active',
  });

  useEffect(() => {
    // TODO: Fetch contractors from API
    const mockContractors: Contractor[] = [
      {
        id: '1',
        name: 'Mike Johnson',
        company: 'Johnson Plumbing',
        specialty: ['Plumbing', 'HVAC'],
        phone: '(555) 123-4567',
        email: 'mike@johnsonplumbing.com',
        rating: 4.5,
        status: 'active',
      },
      {
        id: '2',
        name: 'Sarah Williams',
        company: 'Williams Electrical',
        specialty: ['Electrical', 'Security Systems'],
        phone: '(555) 234-5678',
        email: 'sarah@williamselectrical.com',
        rating: 4.8,
        status: 'active',
      },
    ];
    setContractors(mockContractors);
  }, []);

  const handleOpenDialog = (contractor?: Contractor) => {
    if (contractor) {
      setSelectedContractor(contractor);
      setFormData(contractor);
    } else {
      setSelectedContractor(null);
      setFormData({
        name: '',
        company: '',
        specialty: [],
        phone: '',
        email: '',
        status: 'active',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedContractor(null);
    setFormData({
      name: '',
      company: '',
      specialty: [],
      phone: '',
      email: '',
      status: 'active',
    });
  };

  const handleSaveContractor = () => {
    if (selectedContractor) {
      // TODO: Update contractor
      setContractors(contractors.map(c =>
        c.id === selectedContractor.id ? { ...c, ...formData } : c
      ));
    } else {
      // TODO: Create new contractor
      const newContractor: Contractor = {
        ...formData as Contractor,
        id: Date.now().toString(),
        rating: 0,
      };
      setContractors([...contractors, newContractor]);
    }
    handleCloseDialog();
  };

  const handleDeleteContractor = (id: string) => {
    // TODO: Delete contractor
    setContractors(contractors.filter(c => c.id !== id));
  };

  return (
    <Box sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Contractors</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Contractor
        </Button>
      </Box>

      <Paper>
        <List>
          {contractors.map((contractor) => (
            <React.Fragment key={contractor.id}>
              <ListItem
                secondaryAction={
                  <Box>
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleOpenDialog(contractor)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleDeleteContractor(contractor.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemAvatar>
                  <Avatar>{contractor.name.charAt(0)}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1">{contractor.name}</Typography>
                      <Chip
                        size="small"
                        label={contractor.status}
                        color={contractor.status === 'active' ? 'success' : 'default'}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {contractor.company}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        {contractor.specialty.map((spec) => (
                          <Chip
                            key={spec}
                            label={spec}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <PhoneIcon fontSize="small" />
                          {contractor.phone}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <EmailIcon fontSize="small" />
                          {contractor.email}
                        </Typography>
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedContractor ? 'Edit Contractor' : 'Add New Contractor'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Specialties"
                value={formData.specialty?.join(', ')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    specialty: e.target.value.split(',').map((s) => s.trim()),
                  })
                }
                helperText="Separate specialties with commas"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveContractor} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContractorList; 