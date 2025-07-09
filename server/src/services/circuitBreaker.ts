export class CircuitBreaker {
  private static instance: CircuitBreaker;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private isOpen: boolean = false;

  private readonly maxFailures: number = 5;
  private readonly resetTimeout: number = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): CircuitBreaker {
    if (!CircuitBreaker.instance) {
      CircuitBreaker.instance = new CircuitBreaker();
    }
    return CircuitBreaker.instance;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      if (this.shouldReset()) {
        this.reset();
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.maxFailures) {
      this.isOpen = true;
    }
  }

  private shouldReset(): boolean {
    return Date.now() - this.lastFailureTime > this.resetTimeout;
  }

  private reset(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = 0;
  }

  getStatus(): { isOpen: boolean; failures: number; lastFailureTime: number } {
    return {
      isOpen: this.isOpen,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
} 