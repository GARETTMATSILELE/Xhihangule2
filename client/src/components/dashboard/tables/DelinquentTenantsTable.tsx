import React from 'react';
import './DelinquentTenantsTable.css';

interface DelinquentTenant {
  id: number;
  tenant: string;
  property: string;
  amount: number;
  daysOverdue: number;
}

interface DelinquentTenantsTableProps {
  data: DelinquentTenant[];
}

export const DelinquentTenantsTable: React.FC<DelinquentTenantsTableProps> = ({ data }) => {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property</th>
            <th>Amount</th>
            <th>Days Overdue</th>
          </tr>
        </thead>
        <tbody>
          {data.map(tenant => (
            <tr key={tenant.id}>
              <td>{tenant.tenant}</td>
              <td>{tenant.property}</td>
              <td>${tenant.amount.toLocaleString()}</td>
              <td>
                <span className={tenant.daysOverdue > 30 ? 'status-overdue' : 'status-pending'}>
                  {tenant.daysOverdue} days
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 