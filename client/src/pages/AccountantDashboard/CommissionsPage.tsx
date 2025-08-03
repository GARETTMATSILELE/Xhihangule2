import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface CommissionData {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    agentId: string;
    agentName: string;
    commission: number;
    properties: {
      propertyId: string;
      propertyName: string;
      rent: number;
      commission: number;
    }[];
  }[];
}

interface AgencyCommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    propertyId: string;
    propertyName: string;
    rent: number;
    commission: number;
  }[];
}

interface PREACommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    propertyId: string;
    propertyName: string;
    rent: number;
    commission: number;
  }[];
}

const CommissionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [agentCommissions, setAgentCommissions] = useState<CommissionData | null>(null);
  const [agencyCommission, setAgencyCommission] = useState<AgencyCommission | null>(null);
  const [preaCommission, setPREACommission] = useState<PREACommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommissionData = async () => {
      try {
        setLoading(true);
        setError(null);

        const fetchWithErrorHandling = async (url: string) => {
          try {
            const response = await fetch(url, {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error(`Invalid response type: ${contentType}`);
            }

            return await response.json();
          } catch (err) {
            console.error(`Error fetching ${url}:`, err);
            return null;
          }
        };

        const [agentData, agencyData, preaData] = await Promise.all([
          fetchWithErrorHandling('/api/accountants/agent-commissions'),
          fetchWithErrorHandling('/api/accountants/agency-commission'),
          fetchWithErrorHandling('/api/accountants/prea-commission')
        ]);

        setAgentCommissions(agentData);
        setAgencyCommission(agencyData);
        setPREACommission(preaData);
      } catch (err) {
        console.error('Error fetching commission data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching commission data');
      } finally {
        setLoading(false);
      }
    };

    fetchCommissionData();
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];

    doc.text(title, 14, 15);

    if (data) {
      const tableData: any[] = [];
      const headers: string[] = [];

      if (activeTab === 0 && 'details' in data) {
        headers.push('Agent Name', 'Monthly', 'Yearly', 'Total');
        data.details.forEach((detail: any) => {
          tableData.push([
            detail.agentName,
            `R${detail.commission.toFixed(2)}`,
            `R${(detail.commission * 12).toFixed(2)}`,
            `R${(detail.commission * 12).toFixed(2)}`
          ]);
        });
      } else if ('details' in data) {
        headers.push('Property Name', 'Monthly', 'Yearly', 'Total');
        data.details.forEach((detail: any) => {
          tableData.push([
            detail.propertyName,
            `R${detail.commission.toFixed(2)}`,
            `R${(detail.commission * 12).toFixed(2)}`,
            `R${(detail.commission * 12).toFixed(2)}`
          ]);
        });
      }

      (doc as any).autoTable({
        head: [headers],
        body: tableData,
        startY: 25
      });
    }

    doc.save(`${title.toLowerCase().replace(' ', '_')}.pdf`);
  };

  const downloadExcel = () => {
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];

    if (data) {
      const worksheet = XLSX.utils.json_to_sheet(
        'details' in data ? data.details.map((detail: any) => ({
          Name: detail.agentName || detail.propertyName,
          Monthly: detail.commission,
          Yearly: detail.commission * 12,
          Total: detail.commission * 12
        })) : []
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, title);
      XLSX.writeFile(workbook, `${title.toLowerCase().replace(' ', '_')}.xlsx`);
    }
  };

  const printReport = () => {
    window.print();
  };

  const renderTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Box p={3}>
          <Alert severity="error">{error}</Alert>
        </Box>
      );
    }

    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];
    if (!data) {
      return (
        <Box p={3}>
          <Alert severity="info">No data available for this commission type.</Alert>
        </Box>
      );
    }

    return (
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{activeTab === 0 ? 'Agent Name' : 'Property Name'}</TableCell>
              <TableCell align="right">Monthly</TableCell>
              <TableCell align="right">Yearly</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.details.map((detail: any) => (
              <TableRow key={detail.agentId || detail.propertyId}>
                <TableCell>{detail.agentName || detail.propertyName}</TableCell>
                <TableCell align="right">R{detail.commission.toFixed(2)}</TableCell>
                <TableCell align="right">R{(detail.commission * 12).toFixed(2)}</TableCell>
                <TableCell align="right">R{(detail.commission * 12).toFixed(2)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell><strong>Total</strong></TableCell>
              <TableCell align="right"><strong>R{data.monthly.toFixed(2)}</strong></TableCell>
              <TableCell align="right"><strong>R{data.yearly.toFixed(2)}</strong></TableCell>
              <TableCell align="right"><strong>R{data.total.toFixed(2)}</strong></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Commission Reports
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Button 
            variant="contained" 
            onClick={downloadPDF}
            disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
          >
            Download PDF
          </Button>
          <Button 
            variant="contained" 
            onClick={downloadExcel}
            disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
          >
            Download Excel
          </Button>
          <Button 
            variant="contained" 
            onClick={printReport}
            disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
          >
            Print Report
          </Button>
        </Box>
      </Box>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label="Agent Commissions" />
          <Tab label="Agency Commission" />
          <Tab label="PREA Commission" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {renderTable()}
        </Box>
      </Paper>
    </Container>
  );
};

export default CommissionsPage; 