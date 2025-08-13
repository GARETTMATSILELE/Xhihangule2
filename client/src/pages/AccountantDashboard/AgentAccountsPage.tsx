import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { AgentAccount } from '../../services/agentAccountService';
import { agentAccountService } from '../../services/agentAccountService';

const AgentAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agentAccounts, setAgentAccounts] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgentAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const accounts = await agentAccountService.getCompanyAgentAccounts();
        setAgentAccounts(accounts);
        
      } catch (err: any) {
        console.error('Error fetching agent accounts:', err);
        setError('Failed to fetch agent accounts');
      } finally {
        setLoading(false);
      }
    };
    fetchAgentAccounts();
  }, []);

  const handleAgentClick = (agentId: string) => {
    navigate(`/accountant-dashboard/agent-accounts/${agentId}`);
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  }
  if (error) {
    return <Box color="error.main">{error}</Box>;
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>Agent Accounts</Typography>
      <Grid container spacing={3}>
        {agentAccounts.map((account) => (
          <Grid item xs={12} md={6} lg={4} key={account._id}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => handleAgentClick(account.agentId)}>
              <CardContent>
                <Typography variant="h6">{account.agentName}</Typography>
                <Typography variant="body2" color="text.secondary">{account.agentEmail}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>Current Balance: {agentAccountService.formatCurrency(account.runningBalance)}</Typography>
                <Typography variant="body2">Total Commissions: {agentAccountService.formatCurrency(account.totalCommissions)}</Typography>
                <Typography variant="body2">Total Payouts: {agentAccountService.formatCurrency(account.totalPayouts)}</Typography>
                <Typography variant="body2">Total Penalties: {agentAccountService.formatCurrency(account.totalPenalties)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default AgentAccountsPage;


