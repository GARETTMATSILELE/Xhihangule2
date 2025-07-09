import React from 'react';
import './MaintenanceRequestsTable.css';

interface MaintenanceRequest {
  id: number;
  property: string;
  unit: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
}

interface MaintenanceRequestsTableProps {
  data: MaintenanceRequest[];
}

export const MaintenanceRequestsTable: React.FC<MaintenanceRequestsTableProps> = ({ data }) => {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Unit</th>
            <th>Description</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map(request => (
            <tr key={request.id}>
              <td>{request.property}</td>
              <td>{request.unit}</td>
              <td>{request.description}</td>
              <td>
                <span className={`priority-${request.priority}`}>
                  {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                </span>
              </td>
              <td>
                <span className={`status-${request.status}`}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 