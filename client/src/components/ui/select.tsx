import React from 'react';
import { Select as MuiSelect, SelectProps } from '@mui/material';

export const Select: React.FC<SelectProps> = (props) => <MuiSelect {...props} />;

export default Select; 