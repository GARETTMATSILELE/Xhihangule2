import React from 'react';
import { TablePagination as MuiTablePagination, TablePaginationProps } from '@mui/material';

export const TablePaginationActions: React.FC<TablePaginationProps> = (props) => <MuiTablePagination {...props} />;

export default TablePaginationActions; 