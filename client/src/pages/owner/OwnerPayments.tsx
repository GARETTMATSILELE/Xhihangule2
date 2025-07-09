import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import { useCompany } from '../../contexts/CompanyContext';

interface Payment {
  id: string;
  amount: number;
  date: string;
  status: 'pending' | 'completed' | 'failed';
  propertyId: string;
  propertyName: string;
}

const OwnerPayments: React.FC = () => {
  const { company } = useCompany();
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    // TODO: Implement payment fetching
    const mockPayments: Payment[] = [
      {
        id: '1',
        amount: 1500,
        date: '2024-03-15',
        status: 'completed',
        propertyId: '1',
        propertyName: 'Sample Property 1'
      },
      {
        id: '2',
        amount: 2000,
        date: '2024-03-20',
        status: 'pending',
        propertyId: '2',
        propertyName: 'Sample Property 2'
      }
    ];
    setPayments(mockPayments);
  }, []);

  const getStatusColor = (status: Payment['status'] | 'unknown') => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'unknown':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Payments
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Property</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                <TableCell>{payment.propertyName}</TableCell>
                <TableCell>${(payment.amount || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Chip
                    label={payment.status || 'unknown'}
                    color={getStatusColor(payment.status || 'unknown')}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default OwnerPayments; 