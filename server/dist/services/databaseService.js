"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const circuitBreaker_1 = require("./circuitBreaker");
const databaseConfig_1 = require("../config/databaseConfig");
class DatabaseService {
    constructor() {
        this.circuitBreaker = circuitBreaker_1.CircuitBreaker.getInstance();
        this.config = databaseConfig_1.DatabaseConfig.getInstance();
    }
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.config.connect();
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.config.disconnect();
        });
    }
    executeWithRetry(operation_1) {
        return __awaiter(this, arguments, void 0, function* (operation, maxRetries = 3, delayMs = 1000) {
            return this.circuitBreaker.execute(() => __awaiter(this, void 0, void 0, function* () {
                let lastError = null;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        return yield operation();
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error : new Error(String(error));
                        if (this.shouldRetry(error) && attempt < maxRetries) {
                            yield this.delay(delayMs * attempt);
                            continue;
                        }
                        throw this.handleError(error);
                    }
                }
                throw lastError || new Error('Operation failed after retries');
            }));
        });
    }
    executeTransaction(operations) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield mongoose_1.default.startSession();
            session.startTransaction();
            try {
                const result = yield this.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                    const transactionResult = yield operations(session);
                    yield session.commitTransaction();
                    return transactionResult;
                }));
                return result;
            }
            catch (error) {
                yield session.abortTransaction();
                throw this.handleError(error);
            }
            finally {
                session.endSession();
            }
        });
    }
    shouldRetry(error) {
        if (error instanceof Error) {
            // Retry on network errors or MongoDB specific errors
            return (error.name === 'MongoNetworkError' ||
                error.name === 'MongoServerSelectionError' ||
                error.name === 'MongoTimeoutError' ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('ETIMEDOUT'));
        }
        return false;
    }
    handleError(error) {
        if (error instanceof Error) {
            // Add additional context to the error
            error.message = `Database operation failed: ${error.message}`;
            return error;
        }
        return new Error(`Database operation failed: ${String(error)}`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getConnectionStatus() {
        return this.config.getConnectionStatus();
    }
}
exports.DatabaseService = DatabaseService;
