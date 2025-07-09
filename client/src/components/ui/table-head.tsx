import React from 'react';
import { TableHead as MuiTableHead, TableHeadProps } from '@mui/material';

export const TableHead: React.FC<TableHeadProps> = (props) => <MuiTableHead {...props} />;

export default TableHead; 