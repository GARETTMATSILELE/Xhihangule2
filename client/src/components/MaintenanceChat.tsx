import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  attachments?: string[];
}

interface MaintenanceChatProps {
  maintenanceId: string;
  onClose: () => void;
}

const MaintenanceChat: React.FC<MaintenanceChatProps> = ({
  maintenanceId,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Poll for new messages
    return () => clearInterval(interval);
  }, [maintenanceId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/maintenance/${maintenanceId}/messages`);
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && attachments.length === 0) return;

    const formData = new FormData();
    formData.append('text', newMessage);
    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    try {
      const response = await fetch(`/api/maintenance/${maintenanceId}/messages`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        setNewMessage('');
        setAttachments([]);
        fetchMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <List>
          {messages.map((message) => (
            <React.Fragment key={message.id}>
              <ListItem alignItems="flex-start">
                <ListItemAvatar>
                  <Avatar>{message.sender[0]}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography component="span" variant="subtitle2">
                        {message.sender}
                      </Typography>
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                      >
                        {message.timestamp}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                      >
                        {message.text}
                      </Typography>
                      {message.attachments && message.attachments.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          {message.attachments.map((attachment) => (
                            <Typography
                              key={attachment}
                              variant="caption"
                              color="primary"
                              sx={{ display: 'block' }}
                            >
                              {attachment}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </>
                  }
                />
              </ListItem>
              <Divider variant="inset" component="li" />
            </React.Fragment>
          ))}
          <div ref={messagesEndRef} />
        </List>
      </Paper>

      <Paper
        component="form"
        onSubmit={handleSendMessage}
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <input
          type="file"
          multiple
          id="file-attach"
          style={{ display: 'none' }}
          onChange={handleFileAttach}
        />
        <label htmlFor="file-attach">
          <IconButton component="span" color="primary">
            <AttachFileIcon />
          </IconButton>
        </label>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          size="small"
        />
        <IconButton
          color="primary"
          type="submit"
          disabled={!newMessage.trim() && attachments.length === 0}
        >
          <SendIcon />
        </IconButton>
      </Paper>
    </Box>
  );
};

export default MaintenanceChat; 