import React from 'react';
import { Card as MuiCard, CardContent as MuiCardContent, CardHeader as MuiCardHeader, CardActions as MuiCardActions, CardProps, CardContentProps, CardHeaderProps, CardActionsProps } from '@mui/material';

export const Card: React.FC<CardProps> = (props) => <MuiCard {...props} />;
export const CardContent: React.FC<CardContentProps> = (props) => <MuiCardContent {...props} />;
export const CardHeader: React.FC<CardHeaderProps> = (props) => <MuiCardHeader {...props} />;
export const CardActions: React.FC<CardActionsProps> = (props) => <MuiCardActions {...props} />;

export default Card; 