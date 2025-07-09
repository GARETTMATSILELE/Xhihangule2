import React, { useState } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Typography,
  Box,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

interface ChatListProps {
  onSelectChat: (chatId: string) => void;
  selectedChat: string | null;
}

export const ChatList: React.FC<ChatListProps> = ({ onSelectChat, selectedChat }) => {
  const [chats] = useState<Chat[]>([
    {
      id: '1',
      name: 'John Doe',
      lastMessage: 'Hello, how can I help you?',
      timestamp: '10:30 AM',
      unread: true,
    },
    {
      id: '2',
      name: 'Jane Smith',
      lastMessage: 'The maintenance request has been approved',
      timestamp: 'Yesterday',
      unread: false,
    },
  ]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Chats</Typography>
        <IconButton color="primary">
          <AddIcon />
        </IconButton>
      </Box>
      <List>
        {chats.map((chat) => (
          <ListItem 
            key={chat.id} 
            button 
            onClick={() => onSelectChat(chat.id)}
            selected={selectedChat === chat.id}
          >
            <ListItemAvatar>
              <Avatar>{chat.name[0]}</Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={chat.name}
              secondary={
                <React.Fragment>
                  <Typography component="span" variant="body2" color="text.primary">
                    {chat.lastMessage}
                  </Typography>
                  {' — '}
                  {chat.timestamp}
                </React.Fragment>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}; 