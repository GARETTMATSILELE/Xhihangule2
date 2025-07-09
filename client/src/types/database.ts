export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

export interface DatabaseConnectionStatus {
  isConnected: boolean;
  failureCount: number;
  lastError?: Error;
}

export interface DatabaseOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount: number;
} 