import React from 'react';
import { MaintenanceWorkspace } from './MaintenanceWorkspace';

interface CompanyInfo {
  _id: string;
  name: string;
}

interface MaintenanceProps {
  user?: any;
  company?: CompanyInfo;
  isAuthenticated: boolean;
  authLoading: boolean;
}

export const Maintenance: React.FC<MaintenanceProps> = (props) => {
  return <MaintenanceWorkspace {...props} />;
};
