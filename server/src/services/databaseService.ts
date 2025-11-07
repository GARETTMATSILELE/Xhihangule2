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

  public shouldRetry(error: unknown): boolean {
    const err: any = error;
    const name: string | undefined = err?.name;
    const code: number | string | undefined = err?.code;
    const message: string = (err?.message ?? '').toString();
    const labels: string[] = Array.isArray(err?.errorLabels) ? err.errorLabels : [];

    // Mongo retryable labels
    if (labels.includes('TransientTransactionError') || labels.includes('RetryableWriteError')) {
      return true;
    }

    // Common network and timeout conditions
    if (
      name === 'MongoNetworkError' ||
      name === 'MongoServerSelectionError' ||
      name === 'MongoTopologyClosedError' ||
      name === 'MongoTimeoutError' ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('EHOSTUNREACH') ||
      message.includes('ENETUNREACH')
    ) {
      return true;
    }

    // Selected server codes typically considered transient
    const retryableCodes: Array<number | string> = [6, 7, 89, 91, 189, 11600, 13435, 13436];
    if (retryableCodes.includes(code as any)) {
      return true;
    }

    // Write concern timeouts are retriable
    if (name === 'MongoWriteConcernError' || message.includes('WriteConcern')) {
      return true;
    }

    // Duplicate key (11000) should NOT retry
    if (code === 11000 || message.includes('E11000')) {
      return false;
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