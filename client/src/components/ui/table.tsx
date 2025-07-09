import React from 'react';
import { Table as MuiTable, TableProps } from '@mui/material';

export const Table: React.FC<TableProps> = (props) => <MuiTable {...props} />;

export default Table; 