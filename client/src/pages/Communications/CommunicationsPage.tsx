import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Paper,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  CircularProgress,
  Card,
  CardContent,
  CardActionArea,
  Button,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { ChatList } from './components/ChatList';
import ContractorList from './components/ContractorList';
import { MaintenanceChat } from './components/MaintenanceChat';
import { useAuth } from '../../contexts/AuthContext';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import { useTenantService } from '../../services/tenantService';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';
import { Tenant } from '../../types/tenant';
import { PropertyOwner } from '../../services/propertyOwnerService';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: 'tenant' | 'propertyOwner';
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`communications-tabpanel-${index}`}
      aria-labelledby={`communications-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

const StyledTabs = styled(Tabs)({
  borderBottom: '1px solid #e8e8e8',
  '& .MuiTabs-indicator': {
    backgroundColor: '#1976d2',
  },
});

const StyledTab = styled(Tab)({
  textTransform: 'none',
  fontWeight: 500,
  fontSize: '1rem',
  minWidth: 0,
  padding: '12px 16px',
  '&.Mui-selected': {
    color: '#1976d2',
  },
});

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s',
  '&:hover': {
    transform: 'scale(1.02)',
  },
}));

const StyledCardContent = styled(CardContent)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '2rem',
});

const CommunicationsPage: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserType, setSelectedUserType] = useState<'tenant' | 'propertyOwner' | null>(null);
  const { user } = useAuth();
  const tenantService = useTenantService();
  const propertyOwnerService = usePropertyOwnerService();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        // Fetch tenants using tenantService
        const { tenants } = await tenantService.getAllPublic();
        console.log('Tenants Response:', tenants);
        
        const formattedTenants = tenants.map((tenant: Tenant) => ({
          id: tenant._id,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          email: tenant.email,
          phone: tenant.phone,
          type: 'tenant' as const,
        }));

        // Fetch property owners using propertyOwnerService
        const { owners } = await propertyOwnerService.getAllPublic();
        console.log('Owners Response:', owners);
        
        const formattedOwners = owners.map((owner: PropertyOwner) => ({
          id: owner._id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
          phone: owner.phone,
          type: 'propertyOwner' as const,
        }));

        setUsers([...formattedTenants, ...formattedOwners]);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsers([]); // Set empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
    setSelectedChat(null);
    setSelectedUserType(null);
  };

  const handleUserSelect = (userId: string) => {
    setSelectedChat(userId);
  };

  const handleUserTypeSelect = (type: 'tenant' | 'propertyOwner') => {
    setSelectedUserType(type);
  };

  const filteredUsers = users.filter(user => user.type === selectedUserType);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const renderUserSelection = () => {
    if (!selectedUserType) {
      return (
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <StyledCard>
              <CardActionArea onClick={() => handleUserTypeSelect('tenant')}>
                <StyledCardContent>
                  <PeopleIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h5" component="h2" gutterBottom>
                    Chat with Tenants
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Communicate with your property tenants
                  </Typography>
                </StyledCardContent>
              </CardActionArea>
            </StyledCard>
          </Grid>
          <Grid item xs={12} md={6}>
            <StyledCard>
              <CardActionArea onClick={() => handleUserTypeSelect('propertyOwner')}>
                <StyledCardContent>
                  <BusinessIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h5" component="h2" gutterBottom>
                    Chat with Property Owners
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Communicate with property owners
                  </Typography>
                </StyledCardContent>
              </CardActionArea>
            </StyledCard>
          </Grid>
        </Grid>
      );
    }

    return (
      <Grid container spacing={2} sx={{ height: 'calc(100vh - 250px)' }}>
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Button
              onClick={() => setSelectedUserType(null)}
              sx={{ mr: 2 }}
            >
              Back
            </Button>
            <Typography variant="h6">
              {selectedUserType === 'tenant' ? 'Tenants' : 'Property Owners'}
            </Typography>
          </Box>
          <List>
            {filteredUsers.map((user) => (
              <React.Fragment key={user.id}>
                <ListItem
                  button
                  selected={selectedChat === user.id}
                  onClick={() => handleUserSelect(user.id)}
                >
                  <ListItemAvatar>
                    <Avatar>
                      {user.firstName.charAt(0)}
                      {user.lastName.charAt(0)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${user.firstName} ${user.lastName}`}
                    secondary={user.email}
                  />
                </ListItem>
                <Divider variant="inset" component="li" />
              </React.Fragment>
            ))}
          </List>
        </Grid>
        <Grid item xs={12} md={8}>
          {selectedChat ? (
            <MaintenanceChat chatId={selectedChat} />
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography color="text.secondary">
                Select a user to start messaging
              </Typography>
            </Box>
          )}
        </Grid>
      </Grid>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Communications
      </Typography>

      <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <StyledTabs
          value={selectedTab}
          onChange={handleTabChange}
          aria-label="communications tabs"
        >
          <StyledTab label="Chats" />
          <StyledTab label="Maintenance" />
          <StyledTab label="Contractors" />
        </StyledTabs>

        <TabPanel value={selectedTab} index={0}>
          {renderUserSelection()}
        </TabPanel>

        <TabPanel value={selectedTab} index={1}>
          <MaintenanceChat chatId="maintenance" />
        </TabPanel>

        <TabPanel value={selectedTab} index={2}>
          <ContractorList />
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default CommunicationsPage; 