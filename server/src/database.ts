import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/xhihangule';

let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export const connectDatabase = async (): Promise<void> => {
  try {
    if (isConnected) {
      console.log('MongoDB is already connected');
      return;
    }

    if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached. Please check your MongoDB connection.');
      process.exit(1);
    }

    console.log('Attempting to connect to MongoDB...');
    console.log('Connection URI:', MONGODB_URI);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    isConnected = true;
    connectionAttempts = 0;
    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
      connectionAttempts = 0;
    });

  } catch (error) {
    connectionAttempts++;
    console.error('MongoDB connection error:', error);
    console.log(`Connection attempt ${connectionAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
    
    if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached. Please check your MongoDB connection.');
      process.exit(1);
    }
    
    // Wait for 5 seconds before trying to reconnect
    await new Promise(resolve => setTimeout(resolve, 5000));
    return connectDatabase();
  }
};

export const getDatabaseHealth = async (): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> => {
  try {
    if (!isConnected) {
      return { status: 'unhealthy', message: 'Database is not connected' };
    }

    // Try to ping the database
    await mongoose.connection.db.admin().ping();
    return { status: 'healthy', message: 'Database connection is healthy' };
  } catch (error) {
    console.error('Database health check failed:', error);
    return { status: 'unhealthy', message: 'Database health check failed' };
  }
}; 