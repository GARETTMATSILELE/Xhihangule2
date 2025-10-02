import { RetryOptions } from '../types/database';
import api from '../api/axios';

export class DatabaseService {
  private static instance: DatabaseService;
  private isConnected: boolean = false;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private failureCount: number = 0;
  private readonly MAX_FAILURES: number = 5;
  private readonly HEALTH_CHECK_INTERVAL: number = 30000; // 30 seconds
  private readonly INITIAL_RETRY_DELAY: number = 1000; // 1 second
  private readonly MAX_RETRY_DELAY: number = 30000; // 30 seconds
  private readonly HEALTH_CHECK_TIMEOUT: number = 5000; // 5 seconds

  private constructor() {
    this.startConnectionCheck();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async checkConnection(): Promise<void> {
    try {
      console.log('Checking database connection...');
      
      // Check if the server is reachable first
      const response = await api.get('health', {
        timeout: this.HEALTH_CHECK_TIMEOUT,
        validateStatus: (status) => status < 500 // Accept any status less than 500
      });
      
      if (response.data?.database?.isHealthy) {
        this.isConnected = true;
        this.failureCount = 0;
        console.log('Database connection is healthy:', response.data);
      } else {
        this.isConnected = false;
        this.failureCount++;
        console.warn('Database reported unhealthy state:', response.data);
        
        if (this.failureCount >= this.MAX_FAILURES) {
          this.handleConnectionLoss();
        }
      }
    } catch (error: any) {
      console.error('Database connection check failed:', error);
      this.isConnected = false;
      this.failureCount++;
      
      // Handle specific error types
      if (error.code === 'ERR_NETWORK') {
        console.error('Network error - Server might be down or unreachable');
      } else if (error.code === 'ECONNABORTED') {
        console.error('Connection timeout - Server is not responding');
      } else if (error.response?.status === 503) {
        console.error('Service unavailable - Database might be down');
      }
      
      if (this.failureCount >= this.MAX_FAILURES) {
        console.error('Database connection lost. Circuit breaker opened.');
        this.handleConnectionLoss();
      }
    }
  }

  private handleConnectionLoss(): void {
    // Clear existing interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    let retryDelay = this.INITIAL_RETRY_DELAY;

    const attemptReconnection = async () => {
      try {
        await this.checkConnection();
        if (this.isConnected) {
          console.log('Connection restored');
          this.startConnectionCheck(); // Resume normal health checks
          return;
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
      }

      // Exponential backoff with jitter
      retryDelay = Math.min(retryDelay * 1.5, this.MAX_RETRY_DELAY);
      const jitter = Math.random() * 0.1 + 0.95; // 0.95 to 1.05
      const nextDelay = retryDelay * jitter;

      console.log(`Next reconnection attempt in ${Math.round(nextDelay / 1000)} seconds`);
      setTimeout(attemptReconnection, nextDelay);
    };

    attemptReconnection();
  }

  private startConnectionCheck(): void {
    // Clear any existing interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    // Initial check
    this.checkConnection();

    // Set up periodic checks
    this.connectionCheckInterval = setInterval(() => {
      this.checkConnection();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = this.INITIAL_RETRY_DELAY,
      maxDelay = this.MAX_RETRY_DELAY,
      jitter = true
    } = options;

    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isConnected) {
          await this.checkConnection();
          if (!this.isConnected) {
            throw new Error('Database connection is not available');
          }
        }

        // If the operation itself sets a no-retry header, honor it
        const result = await operation();
        return result;
      } catch (error: any) {
        lastError = error;
        console.error(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
        
        // Respect per-request no-retry hint when available
        const noRetry = error?.config?.headers?.['x-no-retry'] === '1' || error?.config?.headers?.['x-no-retry'] === 1;
        if (noRetry) {
          break;
        }

        if (attempt === maxRetries) {
          break;
        }

        // Add jitter to avoid thundering herd problem
        const jitterFactor = jitter ? Math.random() * 0.1 + 0.95 : 1;
        const currentDelay = Math.min(delay * jitterFactor, maxDelay);
        
        console.log(`Retrying in ${Math.round(currentDelay / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        delay *= 2; // Exponential backoff
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  public async executeTransaction<T>(
    operations: (() => Promise<any>)[],
    options: RetryOptions = {}
  ): Promise<T> {
    if (!operations.length) {
      throw new Error('No operations provided for transaction');
    }

    return this.executeWithRetry(async () => {
      const results = await Promise.all(operations.map(op => op()));
      return results[results.length - 1] as T;
    }, options);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public resetFailureCount(): void {
    this.failureCount = 0;
  }

  public cleanup(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }
} 