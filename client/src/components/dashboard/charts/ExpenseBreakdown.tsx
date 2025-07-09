import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './ExpenseBreakdown.css';

interface Expense {
  category: string;
  amount: number;
}

interface ExpenseBreakdownProps {
  data: Expense[];
}

export const ExpenseBreakdown: React.FC<ExpenseBreakdownProps> = ({ data }) => {
  const COLORS = ['#2ecc71', '#27ae60', '#16a085', '#1abc9c', '#3498db'];

  return (
    <div className="expense-breakdown">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="amount"
            nameKey="category"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}; 