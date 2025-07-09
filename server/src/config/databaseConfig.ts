import mongoose from 'mongoose';
import { HealthCheckService } from '../services/healthCheckService';

export class DatabaseConfig {
  private static instance: DatabaseConfig;
  private readonly healthCheck: HealthCheckService;

  private constructor() {
    this.healthCheck = HealthCheckService.getInstance();
    this.setupConnectionHandlers();
  }

  static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  async connect(): Promise<void> {
    try {
      const options: mongoose.ConnectOptions = {
        autoIndex: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
      };

      await mongoose.connect(process.env.MONGODB_URI || '', options);
      console.log('Database connected successfully');
      
      // Start health checks after successful connection
      this.healthCheck.startHealthChecks();
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      console.log('Database disconnected successfully');
      
      // Stop health checks after disconnection
      this.healthCheck.stopHealthChecks();
    } catch (error) {
      console.error('Database disconnection failed:', error);
      throw error;
    }
  }

  private setupConnectionHandlers(): void {
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected from MongoDB');
    });

    process.on('SIGINT', async () => {
      try {
        await this.disconnect();
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });
  }

  getConnectionStatus(): {
    readyState: number;
    host: string;
    name: string;
    port: number;
  } {
    return {
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      port: mongoose.connection.port
    };
  }
} 