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
exports.DatabaseConfig = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const healthCheckService_1 = require("../services/healthCheckService");
class DatabaseConfig {
    constructor() {
        this.healthCheck = healthCheckService_1.HealthCheckService.getInstance();
        this.setupConnectionHandlers();
    }
    static getInstance() {
        if (!DatabaseConfig.instance) {
            DatabaseConfig.instance = new DatabaseConfig();
        }
        return DatabaseConfig.instance;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    autoIndex: true,
                    maxPoolSize: 10,
                    serverSelectionTimeoutMS: 5000,
                    socketTimeoutMS: 45000,
                    family: 4
                };
                yield mongoose_1.default.connect(process.env.MONGODB_URI || '', options);
                console.log('Database connected successfully');
                // Start health checks after successful connection
                this.healthCheck.startHealthChecks();
            }
            catch (error) {
                console.error('Database connection failed:', error);
                throw error;
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield mongoose_1.default.disconnect();
                console.log('Database disconnected successfully');
                // Stop health checks after disconnection
                this.healthCheck.stopHealthChecks();
            }
            catch (error) {
                console.error('Database disconnection failed:', error);
                throw error;
            }
        });
    }
    setupConnectionHandlers() {
        mongoose_1.default.connection.on('connected', () => {
            console.log('Mongoose connected to MongoDB');
        });
        mongoose_1.default.connection.on('error', (err) => {
            console.error('Mongoose connection error:', err);
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.log('Mongoose disconnected from MongoDB');
        });
        process.on('SIGINT', () => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.disconnect();
                process.exit(0);
            }
            catch (error) {
                console.error('Error during graceful shutdown:', error);
                process.exit(1);
            }
        }));
    }
    getConnectionStatus() {
        return {
            readyState: mongoose_1.default.connection.readyState,
            host: mongoose_1.default.connection.host,
            name: mongoose_1.default.connection.name,
            port: mongoose_1.default.connection.port
        };
    }
}
exports.DatabaseConfig = DatabaseConfig;
