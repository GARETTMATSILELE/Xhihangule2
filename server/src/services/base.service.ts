import { DatabaseService } from './databaseService';
import { CircuitBreaker } from './circuitBreaker';

export abstract class BaseService {
  protected db: DatabaseService;
  protected circuitBreaker: CircuitBreaker;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.circuitBreaker = CircuitBreaker.getInstance();
  }

  protected async executeQuery<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.db.executeWithRetry(operation));
  }

  protected async executeTransaction<T>(operation: (session: any) => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.db.executeTransaction(operation));
  }

  protected handleError(error: any): never {
    console.error('Service error:', error);
    throw error;
  }
} 