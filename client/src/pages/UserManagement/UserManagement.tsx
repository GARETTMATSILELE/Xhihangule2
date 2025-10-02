import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  SelectChangeEvent,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../../api/axios';
import { AdminSidebar } from '../../components/Layout/AdminSidebar';
import { Header } from '../../components/Layout/Header';
import { useAuth } from '../../contexts/AuthContext';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'agent' | 'accountant' | 'owner' | 'sales';
  status: 'active' | 'inactive';
}

interface Role {
  id: string;
  name: 'admin' | 'agent' | 'accountant' | 'owner' | 'sales';
  description: string;
}

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'agent' | 'accountant' | 'owner' | 'sales';
  password: string;
}

const ROLES: Role[] = [
  {
    id: 'admin',
    name: 'admin',
    description: 'Administrator with full system access'
  },
  {
    id: 'agent',
    name: 'agent',
    description: 'Property agent with property management access'
  },
  {
    id: 'accountant',
    name: 'accountant',
    description: 'Accountant with financial management access'
  },
  {
    id: 'owner',
    name: 'owner',
    description: 'Property owner with owner-specific access'
  },
  {
    id: 'sales',
    name: 'sales',
    description: 'Sales agent with CRM and sales property management access'
  }
];

interface UserManagementProps {
  embedded?: boolean;
}

export const UserManagement: React.FC<UserManagementProps> = ({ embedded = false }) => {
  const { user, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'agent',
    password: '',
  });
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(7); // 7 is the index for User Management in AdminSidebar

  useEffect(() => {
    // Restore authentication check for user management
    if (isAuthenticated && user) {
      fetchUsers();
    }
  }, [isAuthenticated, user]);

  const fetchUsers = async () => {
    try {
      // Use authenticated API for user management
      const response = await api.get('/users');
      const mapped: User[] = (Array.isArray(response.data) ? response.data : []).map((u: any): User => ({
        id: String(u._id || u.id),
        firstName: String(u.firstName || ''),
        lastName: String(u.lastName || ''),
        email: String(u.email || ''),
        role: (u.role || 'agent') as User['role'],
        status: (u.isActive ? 'active' : 'inactive') as User['status'],
      }));
      setUsers(mapped);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({
        type: 'error',
        text: 'Failed to fetch users',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        password: '',
      });
    } else {
      setSelectedUser(null);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        role: 'agent',
        password: '',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      role: 'agent',
      password: '',
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRoleChange = (e: SelectChangeEvent) => {
    setFormData(prev => ({
      ...prev,
      role: e.target.value as UserFormData['role'],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('Submitting form data:', formData);
      
      if (selectedUser) {
        await api.put(`/users/${selectedUser.id}`, formData);
        setMessage({
          type: 'success',
          text: 'User updated successfully',
        });
      } else {
        const response = await api.post('/users', formData);
        const createdRaw = response.data?.data || response.data;
        const created: User = {
          id: createdRaw._id || createdRaw.id,
          firstName: createdRaw.firstName,
          lastName: createdRaw.lastName,
          email: createdRaw.email,
          role: createdRaw.role,
          status: createdRaw.isActive ? 'active' : 'inactive',
        };
        setUsers(prevUsers => [...prevUsers, created]);
        setMessage({
          type: 'success',
          text: 'User created successfully',
        });
      }
      handleCloseDialog();
      fetchUsers();
    } catch (error: any) {
      console.error('Error saving user:', error);
      const errorMessage = error.response?.data?.message || error.message || (selectedUser ? 'Failed to update user' : 'Failed to create user');
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: errorMessage
      });
      setMessage({
        type: 'error',
        text: errorMessage,
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        setMessage({
          type: 'error',
          text: 'User deletion is not supported',
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        setMessage({
          type: 'error',
          text: 'Failed to delete user',
        });
      }
    }
  };

  if (loading) {
    if (embedded) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <CircularProgress />
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <Box sx={{ flexGrow: 1 }}>
          <Header />
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <CircularProgress />
          </Box>
        </Box>
      </Box>
    );
  }

  // Check if user is authenticated and has admin role
  if (!isAuthenticated || !user) {
    if (embedded) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Typography variant="h6" color="error">Please log in to access User Management</Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <Box sx={{ flexGrow: 1 }}>
          <Header />
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Typography variant="h6" color="error">
              Please log in to access User Management
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  if (user.role !== 'admin') {
    if (embedded) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Typography variant="h6" color="error">Admin access required for User Management</Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <Box sx={{ flexGrow: 1 }}>
          <Header />
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Typography variant="h6" color="error">
              Admin access required for User Management
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  if (embedded) {
    return (
      <Box sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            User Management
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add User
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id || user.email}>
                  <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.status}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpenDialog(user)} color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteUser(user.id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle>
            {selectedUser ? 'Edit User' : 'Add New User'}
          </DialogTitle>
          <form onSubmit={handleSubmit}>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  name="firstName"
                  label="First Name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  fullWidth
                />
                <TextField
                  name="lastName"
                  label="Last Name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  fullWidth
                />
                <TextField
                  name="email"
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  fullWidth
                />
                <FormControl fullWidth required>
                  <InputLabel>Role</InputLabel>
                  <Select
                    name="role"
                    value={formData.role}
                    onChange={handleRoleChange}
                    label="Role"
                  >
                    {ROLES.map((role) => (
                      <MenuItem key={role.id} value={role.name}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {!selectedUser && (
                  <TextField
                    name="password"
                    label="Password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    fullWidth
                  />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button type="submit" variant="contained">
                {selectedUser ? 'Update' : 'Create'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        <Snackbar
          open={!!message}
          autoHideDuration={6000}
          onClose={() => setMessage(null)}
        >
          <Alert
            onClose={() => setMessage(null)}
            severity={message?.type}
            sx={{ width: '100%' }}
          >
            {message?.text}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ mt: 8, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1">
              User Management
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add User
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id || user.email}>
                    <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.status}</TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => handleOpenDialog(user)} color="primary">
                        <EditIcon />
                      </IconButton>
                      <IconButton onClick={() => handleDeleteUser(user.id)} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
            <DialogTitle>
              {selectedUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    name="firstName"
                    label="First Name"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                    fullWidth
                  />
                  <TextField
                    name="lastName"
                    label="Last Name"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                    fullWidth
                  />
                  <TextField
                    name="email"
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    fullWidth
                  />
                  <FormControl fullWidth required>
                    <InputLabel>Role</InputLabel>
                    <Select
                      name="role"
                      value={formData.role}
                      onChange={handleRoleChange}
                      label="Role"
                    >
                      {ROLES.map((role) => (
                        <MenuItem key={role.id} value={role.name}>
                          {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {!selectedUser && (
                    <TextField
                      name="password"
                      label="Password"
                      type="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      fullWidth
                    />
                  )}
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button type="submit" variant="contained">
                  {selectedUser ? 'Update' : 'Create'}
                </Button>
              </DialogActions>
            </form>
          </Dialog>

          <Snackbar
            open={!!message}
            autoHideDuration={6000}
            onClose={() => setMessage(null)}
          >
            <Alert
              onClose={() => setMessage(null)}
              severity={message?.type}
              sx={{ width: '100%' }}
            >
              {message?.text}
            </Alert>
          </Snackbar>
        </Box>
      </Box>
    </Box>
  );
}; 