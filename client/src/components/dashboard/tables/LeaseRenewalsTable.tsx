import React from 'react';
import './LeaseRenewalsTable.css';

interface LeaseRenewal {
  id: number;
  tenant: string;
  property: string;
  currentEndDate: string;
  status: 'pending' | 'renewed' | 'expired';
}

interface LeaseRenewalsTableProps {
  data: LeaseRenewal[];
}

export const LeaseRenewalsTable: React.FC<LeaseRenewalsTableProps> = ({ data }) => {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property</th>
            <th>End Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map(renewal => (
            <tr key={renewal.id}>
              <td>{renewal.tenant}</td>
              <td>{renewal.property}</td>
              <td>{new Date(renewal.currentEndDate).toLocaleDateString()}</td>
              <td>
                <span className={`status-${renewal.status}`}>
                  {renewal.status.charAt(0).toUpperCase() + renewal.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 