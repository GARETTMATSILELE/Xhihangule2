import React from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  useTheme
} from '@mui/material';
import {
  CheckCircle as ApprovedIcon,
  Cancel as RejectedIcon,
  Assignment as AssignedIcon,
  Comment as CommentIcon,
  AttachFile as AttachmentIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { MaintenanceRequest } from '../../types/maintenance';

interface MaintenanceAuditLogProps {
  request: MaintenanceRequest;
}

const MaintenanceAuditLog: React.FC<MaintenanceAuditLogProps> = ({ request }) => {
  const theme = useTheme();

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'approved':
        return <ApprovedIcon color="success" />;
      case 'rejected':
        return <RejectedIcon color="error" />;
      case 'assigned':
        return <AssignedIcon color="primary" />;
      case 'comment added':
        return <CommentIcon color="info" />;
      case 'attachment added':
        return <AttachmentIcon color="secondary" />;
      case 'updated':
        return <EditIcon color="action" />;
      case 'deleted':
        return <DeleteIcon color="error" />;
      default:
        return <EditIcon color="action" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'approved':
        return theme.palette.success.main;
      case 'rejected':
        return theme.palette.error.main;
      case 'assigned':
        return theme.palette.primary.main;
      case 'comment added':
        return theme.palette.info.main;
      case 'attachment added':
        return theme.palette.secondary.main;
      default:
        return theme.palette.text.primary;
    }
  };

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Audit Log
      </Typography>

      <List>
        {request.auditLog.map((log: { action: string; timestamp: Date; user: string; details?: string }, index) => (
          <React.Fragment key={index}>
            <ListItem>
              <ListItemIcon>
                {getActionIcon(log.action)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography
                      component="span"
                      variant="subtitle2"
                      sx={{ color: getActionColor(log.action) }}
                    >
                      {log.action}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary">
                      {format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}
                    </Typography>
                  </Box>
                }
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary">
                      {log.user}
                    </Typography>
                    {log.details && (
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        {log.details}
                      </Typography>
                    )}
                  </>
                }
              />
            </ListItem>
            {index < request.auditLog.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </List>
    </Paper>
  );
};

export default MaintenanceAuditLog; 