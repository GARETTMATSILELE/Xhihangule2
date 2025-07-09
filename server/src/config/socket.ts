import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { JWT_CONFIG } from './jwt';

config();

// Define types for socket data
interface SocketUser {
  id: string;
  email: string;
  role?: string;
}

interface SocketData {
  user: SocketUser;
}

// Create a custom socket type
type CustomSocket = Socket & {
  data: SocketData;
};

export const initializeSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Socket.IO authentication middleware
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET) as SocketUser;
      (socket as CustomSocket).data = { user: decoded };
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const customSocket = socket as CustomSocket;
    console.log('Client connected:', socket.id);

    // Join relevant rooms based on user role/permissions
    if (customSocket.data?.user) {
      socket.join(`user-${customSocket.data.user.id}`);
      if (customSocket.data.user.role) {
        socket.join(`role-${customSocket.data.user.role}`);
      }
    }

    // Handle errors
    socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('Client disconnected:', socket.id, 'Reason:', reason);
    });
  });

  return { io };
};

// Helper function to emit events to specific rooms
export const emitToRoom = <T>(io: Server, room: string, event: string, data: T): void => {
  io.to(room).emit(event, data);
};

// Helper function to emit events to all connected clients
export const emitToAll = <T>(io: Server, event: string, data: T): void => {
  io.emit(event, data);
}; 