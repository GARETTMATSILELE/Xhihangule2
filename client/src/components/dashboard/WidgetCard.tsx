import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faUsers, faMoneyBill, faDoorOpen } from '@fortawesome/free-solid-svg-icons';
import './WidgetCard.css';

interface WidgetCardProps {
  title: string;
  value: string | number;
  icon: 'building' | 'users' | 'money' | 'door';
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const iconMap = {
  building: faBuilding,
  users: faUsers,
  money: faMoneyBill,
  door: faDoorOpen
};

const WidgetCard: React.FC<WidgetCardProps> = ({ title, value, icon, trend }) => {
  return (
    <Card className="widget-card">
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" color="textSecondary">
              {title}
            </Typography>
            <Typography variant="h4">
              {value}
            </Typography>
            {trend && (
              <Typography
                variant="body2"
                color={trend.isPositive ? 'success.main' : 'error.main'}
              >
                {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
              </Typography>
            )}
          </Box>
          <Box className="icon-container">
            <FontAwesomeIcon icon={iconMap[icon]} size="2x" />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WidgetCard; 