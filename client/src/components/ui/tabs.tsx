import React from 'react';
import { Tabs as MuiTabs, Tab as MuiTab, TabsProps, TabProps, Box } from '@mui/material';

export const Tabs: React.FC<TabsProps> = (props) => <MuiTabs {...props} />;
export const Tab: React.FC<TabProps> = (props) => <MuiTab {...props} />;
export const TabsList: React.FC<TabsProps> = (props) => <MuiTabs {...props} />;
export const TabsTrigger: React.FC<TabProps> = (props) => <MuiTab {...props} />;
export const TabsContent: React.FC<{ children: React.ReactNode }> = ({ children }) => <Box>{children}</Box>;

export default Tabs; 