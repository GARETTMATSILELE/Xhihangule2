import mongoose from 'mongoose';
import { CircuitBreaker } from './circuitBreaker';

export class HealthCheckService {
  private static instance: HealthCheckService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number = 30000; // 30 seconds

  private constructor(
    private readonly circuitBreaker: CircuitBreaker
  ) {}

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService(
        CircuitBreaker.getInstance()
      );
    }
    return HealthCheckService.instance;
  }

  startHealthChecks(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.checkIntervalMs);
  }

  stopHealthChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check database connection
      const dbStatus = await this.checkDatabaseConnection();
      
      // Check circuit breaker status
      const circuitBreakerStatus = this.circuitBreaker.getStatus();

      // Log health status
      console.log('Health Check Results:', {
        timestamp: new Date().toISOString(),
        database: dbStatus,
        circuitBreaker: circuitBreakerStatus
      });

      // Emit health status event if needed
      this.emitHealthStatus({
        database: dbStatus,
        circuitBreaker: circuitBreakerStatus
      });
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private async checkDatabaseConnection(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      readyState: number;
      error?: string;
    };
  }> {
    try {
      const isConnected = mongoose.connection.readyState === 1;
      
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        details: {
          connected: isConnected,
          readyState: mongoose.connection.readyState
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          readyState: mongoose.connection.readyState,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private emitHealthStatus(status: {
    database: {
      status: 'healthy' | 'unhealthy';
      details: {
        connected: boolean;
        readyState: number;
        error?: string;
      };
    };
    circuitBreaker: {
      isOpen: boolean;
      failures: number;
      lastFailureTime: number;
    };
  }): void {
    // Implement event emission logic here if needed
    // This could be used to notify other parts of the application
    // or external monitoring systems about the health status
  }
} 