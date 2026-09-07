import { RetryOptions } from '../types/database';

export class DatabaseService {
  private static instance: DatabaseService;
  private isConnected: boolean = true;
  private failureCount: number = 0;
  private readonly INITIAL_RETRY_DELAY: number = 1000; // 1 second
  private readonly MAX_RETRY_DELAY: number = 30000; // 30 seconds

  private constructor() {
    // No periodic health polling. Operation retries handle transient API failures.
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
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
        const result = await operation();
        this.isConnected = true;
        this.failureCount = 0;
        return result;
      } catch (error: any) {
        lastError = error;
        this.isConnected = false;
        this.failureCount++;
        console.error(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

        const noRetry = error?.config?.headers?.['x-no-retry'] === '1' || error?.config?.headers?.['x-no-retry'] === 1;
        if (noRetry) {
          break;
        }

        if (attempt === maxRetries) {
          break;
        }

        const jitterFactor = jitter ? Math.random() * 0.1 + 0.95 : 1;
        const currentDelay = Math.min(delay * jitterFactor, maxDelay);

        await new Promise(resolve => setTimeout(resolve, currentDelay));
        delay *= 2;
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
    // No interval to clear; retained for callers that previously stopped health polling.
  }
}
