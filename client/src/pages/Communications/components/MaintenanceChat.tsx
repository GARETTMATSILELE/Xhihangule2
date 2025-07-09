import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Avatar,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  isOwn: boolean;
}

interface MaintenanceChatProps {
  chatId: string;
}

export const MaintenanceChat: React.FC<MaintenanceChatProps> = ({ chatId }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello, I have a maintenance request for the kitchen sink.',
      sender: 'John Doe',
      timestamp: '10:30 AM',
      isOwn: false,
    },
    {
      id: '2',
      text: 'I can help you with that. What seems to be the issue?',
      sender: 'Maintenance Team',
      timestamp: '10:31 AM',
      isOwn: true,
    },
  ]);
  const [newMessage, setNewMessage] = useState('');

  const handleSend = () => {
    if (newMessage.trim()) {
      const message: Message = {
        id: Date.now().toString(),
        text: newMessage,
        sender: 'You',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOwn: true,
      };
      setMessages([...messages, message]);
      setNewMessage('');
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <List>
          {messages.map((message) => (
            <ListItem
              key={message.id}
              sx={{
                flexDirection: message.isOwn ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
              }}
            >
              <Avatar sx={{ mr: message.isOwn ? 0 : 1, ml: message.isOwn ? 1 : 0 }}>
                {message.sender[0]}
              </Avatar>
              <Box
                sx={{
                  maxWidth: '70%',
                  bgcolor: message.isOwn ? 'primary.main' : 'grey.100',
                  color: message.isOwn ? 'white' : 'text.primary',
                  p: 1,
                  borderRadius: 1,
                }}
              >
                <Typography variant="body1">{message.text}</Typography>
                <Typography variant="caption" color={message.isOwn ? 'white' : 'text.secondary'}>
                  {message.timestamp}
                </Typography>
              </Box>
            </ListItem>
          ))}
        </List>
      </Paper>
      <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <IconButton color="primary" onClick={handleSend}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}; 