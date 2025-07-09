import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './MonthlyRentChart.css';

interface MonthlyRentData {
  labels: string[];
  collected: number[];
  expected: number[];
}

interface MonthlyRentChartProps {
  data: MonthlyRentData;
}

export const MonthlyRentChart: React.FC<MonthlyRentChartProps> = ({ data }) => {
  const chartData = data.labels.map((label, index) => ({
    month: label,
    collected: data.collected[index],
    expected: data.expected[index]
  }));

  return (
    <div className="monthly-rent-chart">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
          />
          <Legend />
          <Bar dataKey="collected" name="Collected" fill="#2ecc71" />
          <Bar dataKey="expected" name="Expected" fill="#3498db" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}; 