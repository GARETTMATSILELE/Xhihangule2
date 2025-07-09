import React from 'react';
import './DataTable.css';

interface Column {
  key: string;
  header: string;
  render?: (value: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  emptyMessage?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  emptyMessage = 'No data available'
}) => {
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-message">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={index}>
                {columns.map(column => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(row[column.key])
                      : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}; 