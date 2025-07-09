import mongoose from 'mongoose';
import { CircuitBreaker } from './circuitBreaker';
import { DatabaseConfig } from '../config/databaseConfig';

export class DatabaseService {
  private static instance: DatabaseService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly config: DatabaseConfig;

  private constructor() {
    this.circuitBreaker = CircuitBreaker.getInstance();
    this.config = DatabaseConfig.getInstance();
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(): Promise<void> {
    await this.config.connect();
  }

  async disconnect(): Promise<void> {
    await this.config.disconnect();
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (this.shouldRetry(error) && attempt < maxRetries) {
            await this.delay(delayMs * attempt);
            continue;
          }
          
          throw this.handleError(error);
        }
      }
      
      throw lastError || new Error('Operation failed after retries');
    });
  }

  async executeTransaction<T>(
    operations: (session: mongoose.ClientSession) => Promise<T>
  ): Promise<T> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const result = await this.executeWithRetry(async () => {
        const transactionResult = await operations(session);
        await session.commitTransaction();
        return transactionResult;
      });

      return result;
    } catch (error) {
      await session.abortTransaction();
      throw this.handleError(error);
    } finally {
      session.endSession();
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof Error) {
      // Retry on network errors or MongoDB specific errors
      return (
        error.name === 'MongoNetworkError' ||
        error.name === 'MongoServerSelectionError' ||
        error.name === 'MongoTimeoutError' ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT')
      );
    }
    return false;
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      // Add additional context to the error
      error.message = `Database operation failed: ${error.message}`;
      return error;
    }
    return new Error(`Database operation failed: ${String(error)}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getConnectionStatus() {
    return this.config.getConnectionStatus();
  }
} 