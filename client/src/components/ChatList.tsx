import React from 'react';
import { List, ListItem, ListItemText, ListItemAvatar, Avatar, Typography, Box } from '@mui/material';
import { Chat as ChatIcon } from '@mui/icons-material';

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

interface ChatListProps {
  chats: Chat[];
  onChatSelect: (chatId: string) => void;
}

const ChatList: React.FC<ChatListProps> = ({ chats, onChatSelect }) => {
  return (
    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {chats.map((chat) => (
        <ListItem
          key={chat.id}
          button
          onClick={() => onChatSelect(chat.id)}
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
        >
          <ListItemAvatar>
            <Avatar>
              <ChatIcon />
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography
                  component="span"
                  variant="subtitle1"
                  sx={{ fontWeight: chat.unread ? 'bold' : 'normal' }}
                >
                  {chat.title}
                </Typography>
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                >
                  {chat.timestamp}
                </Typography>
              </Box>
            }
            secondary={
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{
                  fontWeight: chat.unread ? 'bold' : 'normal',
                  color: chat.unread ? 'text.primary' : 'text.secondary',
                }}
              >
                {chat.lastMessage}
              </Typography>
            }
          />
        </ListItem>
      ))}
    </List>
  );
};

export default ChatList; 