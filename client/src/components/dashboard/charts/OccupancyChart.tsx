import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './OccupancyChart.css';

interface OccupancyData {
  occupied: number;
  vacant: number;
}

interface OccupancyChartProps {
  data: OccupancyData;
}

export const OccupancyChart: React.FC<OccupancyChartProps> = ({ data }) => {
  const chartData = [
    { name: 'Occupied', value: data.occupied },
    { name: 'Vacant', value: data.vacant }
  ];

  const COLORS = ['#2ecc71', '#e74c3c'];

  return (
    <div className="occupancy-chart">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value}%`, '']}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}; 