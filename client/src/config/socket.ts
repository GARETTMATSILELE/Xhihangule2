import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let lastConnectErrorLogAt = 0;

export const initializeSocket = (token: string) => {
  if (!socket) {
    const isBrowser = typeof window !== 'undefined';
    const isLocalDev = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (window.location.port === '3000' || window.location.port === '5173');
    const defaultWsUrl = isLocalDev ? 'http://localhost:5000' : (isBrowser ? window.location.origin : 'http://localhost:5000');
    const wsUrl = process.env.REACT_APP_WS_URL || defaultWsUrl;
    socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 20000,
      randomizationFactor: 0.5,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('connect_error', (error) => {
      // Throttle noisy errors when backend is briefly unavailable.
      const now = Date.now();
      if (now - lastConnectErrorLogAt > 15000) {
        lastConnectErrorLogAt = now;
        console.error('WebSocket connection error:', error);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket server:', reason);
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error('Socket not initialized. Call initializeSocket first.');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}; 