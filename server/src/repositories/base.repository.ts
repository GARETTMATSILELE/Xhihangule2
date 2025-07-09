import mongoose from 'mongoose';
import { DatabaseService } from '../services/databaseService';
import { CircuitBreaker } from '../services/circuitBreaker';

export abstract class BaseRepository<T> {
  protected db: DatabaseService;
  protected circuitBreaker: CircuitBreaker;

  constructor(protected readonly model: mongoose.Model<T>) {
    this.db = DatabaseService.getInstance();
    this.circuitBreaker = CircuitBreaker.getInstance();
  }

  async findOne(query: mongoose.FilterQuery<T>, options: mongoose.QueryOptions = {}): Promise<T | null> {
    return this.executeQuery(() => this.model.findOne(query, null, options));
  }

  async find(query: mongoose.FilterQuery<T>, options: mongoose.QueryOptions = {}): Promise<T[]> {
    return this.executeQuery(() => this.model.find(query, null, options));
  }

  async findById(id: string, options: mongoose.QueryOptions = {}): Promise<T | null> {
    return this.executeQuery(() => this.model.findById(id, null, options));
  }

  async create(data: Partial<T>): Promise<T> {
    return this.executeQuery(() => this.model.create(data));
  }

  async update(id: string, data: Partial<T>, options: mongoose.QueryOptions = {}): Promise<T | null> {
    return this.executeQuery(() => 
      this.model.findByIdAndUpdate(id, data, { ...options, new: true })
    );
  }

  async delete(id: string, options: mongoose.QueryOptions = {}): Promise<boolean> {
    return this.executeQuery(async () => {
      const result = await this.model.findByIdAndDelete(id, options);
      return !!result;
    });
  }

  async exists(query: mongoose.FilterQuery<T>): Promise<boolean> {
    return this.executeQuery(async () => {
      const count = await this.model.countDocuments(query);
      return count > 0;
    });
  }

  protected async executeQuery<R>(operation: () => Promise<R>): Promise<R> {
    return this.circuitBreaker.execute(() => this.db.executeWithRetry(operation));
  }
} 