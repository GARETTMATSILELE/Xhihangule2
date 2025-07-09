import { useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { initializeSocket, getSocket, disconnectSocket } from '../config/socket';

export const useSocket = (token: string) => {
  useEffect(() => {
    const socket = initializeSocket(token);

    return () => {
      disconnectSocket();
    };
  }, [token]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    const socket = getSocket();
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []);

  const emit = useCallback((event: string, data: any) => {
    const socket = getSocket();
    socket.emit(event, data);
  }, []);

  return {
    subscribe,
    emit
  };
}; 