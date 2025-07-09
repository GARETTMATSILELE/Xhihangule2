import React from 'react';
import { TablePagination as MuiTablePagination, TablePaginationProps } from '@mui/material';

export const TablePagination: React.FC<TablePaginationProps> = (props) => <MuiTablePagination {...props} />;

export default TablePagination; 