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
  Divider
} from '@mui/material';
import { Comment } from '../../types/maintenance';
import { apiService } from '../../api';

interface CommentThreadProps {
  requestId: string;
  comments: Comment[];
  onCommentAdded: (comment: Comment) => void;
}

const CommentThread: React.FC<CommentThreadProps> = ({
  requestId,
  comments,
  onCommentAdded
}) => {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const response = await apiService.addMaintenanceComment(requestId, newComment);
      onCommentAdded(response.data);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Comments
      </Typography>
      <List>
        {comments.map((comment) => (
          <React.Fragment key={comment.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar>{comment.createdByName?.[0] || 'U'}</Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography component="span" variant="subtitle2">
                      {comment.createdByName}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary">
                      {new Date(comment.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                }
                secondary={comment.content}
              />
            </ListItem>
            <Divider variant="inset" component="li" />
          </React.Fragment>
        ))}
      </List>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          sx={{ mt: 1 }}
          disabled={!newComment.trim()}
        >
          Add Comment
        </Button>
      </Box>
    </Paper>
  );
};

export default CommentThread; 