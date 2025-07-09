import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './LeaseTimeline.css';

interface Lease {
  id: number;
  property: string;
  unit: string;
  tenant: string;
  startDate: string;
  endDate: string;
}

interface LeaseTimelineProps {
  data: Lease[];
}

export const LeaseTimeline: React.FC<LeaseTimelineProps> = ({ data }) => {
  // Process data to show lease durations
  const chartData = data.map(lease => ({
    name: lease.tenant,
    start: new Date(lease.startDate).getTime(),
    end: new Date(lease.endDate).getTime()
  }));

  return (
    <div className="lease-timeline">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis />
          <Tooltip
            formatter={(value: number) => [new Date(value).toLocaleDateString(), '']}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="start"
            name="Start Date"
            stroke="#2ecc71"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="end"
            name="End Date"
            stroke="#e74c3c"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 