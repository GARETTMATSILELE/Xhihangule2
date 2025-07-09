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
exports.HealthCheckService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const circuitBreaker_1 = require("./circuitBreaker");
class HealthCheckService {
    constructor(circuitBreaker) {
        this.circuitBreaker = circuitBreaker;
        this.checkInterval = null;
        this.checkIntervalMs = 30000; // 30 seconds
    }
    static getInstance() {
        if (!HealthCheckService.instance) {
            HealthCheckService.instance = new HealthCheckService(circuitBreaker_1.CircuitBreaker.getInstance());
        }
        return HealthCheckService.instance;
    }
    startHealthChecks() {
        if (this.checkInterval) {
            return;
        }
        this.checkInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            yield this.performHealthCheck();
        }), this.checkIntervalMs);
    }
    stopHealthChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    performHealthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check database connection
                const dbStatus = yield this.checkDatabaseConnection();
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
            }
            catch (error) {
                console.error('Health check failed:', error);
            }
        });
    }
    checkDatabaseConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const isConnected = mongoose_1.default.connection.readyState === 1;
                return {
                    status: isConnected ? 'healthy' : 'unhealthy',
                    details: {
                        connected: isConnected,
                        readyState: mongoose_1.default.connection.readyState
                    }
                };
            }
            catch (error) {
                return {
                    status: 'unhealthy',
                    details: {
                        connected: false,
                        readyState: mongoose_1.default.connection.readyState,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
            }
        });
    }
    emitHealthStatus(status) {
        // Implement event emission logic here if needed
        // This could be used to notify other parts of the application
        // or external monitoring systems about the health status
    }
}
exports.HealthCheckService = HealthCheckService;
