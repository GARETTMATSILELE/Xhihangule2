import React from 'react';
import './RecentPaymentsTable.css';

interface Payment {
  id: number;
  tenant: string;
  property: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending' | 'overdue';
}

interface RecentPaymentsTableProps {
  data: Payment[];
}

export const RecentPaymentsTable: React.FC<RecentPaymentsTableProps> = ({ data }) => {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map(payment => (
            <tr key={payment.id}>
              <td>{payment.tenant || 'Unknown'}</td>
              <td>{payment.property || 'Unknown'}</td>
              <td>${(payment.amount || 0).toLocaleString()}</td>
              <td>{payment.date ? new Date(payment.date).toLocaleDateString() : 'No date'}</td>
              <td>
                <span className={`status-${payment.status || 'unknown'}`}>
                  {(payment.status || 'unknown').charAt(0).toUpperCase() + (payment.status || 'unknown').slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 