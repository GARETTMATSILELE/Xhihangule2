import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Divider,
  useTheme
} from '@mui/material';
import { Send as SendIcon, AttachFile as AttachFileIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { MaintenanceComment, MaintenanceAttachment } from '../../types/maintenance';
import { apiService } from '../../api';

interface MaintenanceCommentsProps {
  requestId: string;
  comments: MaintenanceComment[];
  onCommentAdded: (comment: MaintenanceComment) => void;
}

const MaintenanceComments: React.FC<MaintenanceCommentsProps> = ({
  requestId,
  comments,
  onCommentAdded
}) => {
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewComment(event.target.value);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachments(Array.from(event.target.files));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newComment.trim() && attachments.length === 0) return;

    try {
      setLoading(true);
      let uploadedAttachments: MaintenanceAttachment[] = [];

      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach(file => {
          formData.append('files', file);
        });
        const uploadResponse = await apiService.uploadFiles(formData);
        uploadedAttachments = uploadResponse.data;
      }

      const response = await apiService.addMaintenanceComment(requestId, {
        content: newComment,
        attachments: uploadedAttachments
      });

      onCommentAdded(response.data);
      setNewComment('');
      setAttachments([]);
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Comments
      </Typography>

      <List sx={{ flexGrow: 1, overflow: 'auto', mb: 2 }}>
        {comments.map((comment, index) => (
          <React.Fragment key={comment.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar>{comment.userName[0]}</Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography component="span" variant="subtitle2">
                      {comment.userName}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary">
                      {format(new Date(comment.timestamp), 'MMM d, yyyy h:mm a')}
                    </Typography>
                  </Box>
                }
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.primary"
                      sx={{ display: 'block', mt: 1 }}
                    >
                      {comment.content}
                    </Typography>
                    {comment.attachments && comment.attachments.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        {comment.attachments.map((attachment, idx) => (
                          <Button
                            key={idx}
                            size="small"
                            startIcon={<AttachFileIcon />}
                            href={attachment.url}
                            target="_blank"
                            sx={{ mr: 1 }}
                          >
                            {attachment.name}
                          </Button>
                        ))}
                      </Box>
                    )}
                  </>
                }
              />
            </ListItem>
            {index < comments.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))}
      </List>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 'auto' }}>
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Add a comment..."
          value={newComment}
          onChange={handleCommentChange}
          disabled={loading}
          sx={{ mb: 1 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <input
            accept="image/*,.pdf,.doc,.docx"
            style={{ display: 'none' }}
            id="comment-file-upload"
            type="file"
            multiple
            onChange={handleFileSelect}
          />
          <label htmlFor="comment-file-upload">
            <IconButton
              component="span"
              color="primary"
              disabled={loading}
            >
              <AttachFileIcon />
            </IconButton>
          </label>
          {attachments.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {attachments.length} file(s) selected
            </Typography>
          )}
          <Button
            type="submit"
            variant="contained"
            endIcon={<SendIcon />}
            disabled={loading || (!newComment.trim() && attachments.length === 0)}
            sx={{ ml: 'auto' }}
          >
            Send
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default MaintenanceComments; 