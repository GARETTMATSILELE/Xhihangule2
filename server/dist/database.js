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
exports.getDatabaseHealth = exports.connectDatabase = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/xhihangule';
let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const connectDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (isConnected) {
            console.log('MongoDB is already connected');
            return;
        }
        if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('Max reconnection attempts reached. Please check your MongoDB connection.');
            process.exit(1);
        }
        console.log('Attempting to connect to MongoDB...');
        console.log('Connection URI:', MONGODB_URI);
        yield mongoose_1.default.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        });
        isConnected = true;
        connectionAttempts = 0;
        console.log('MongoDB connected successfully');
        mongoose_1.default.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            isConnected = false;
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            isConnected = false;
        });
        mongoose_1.default.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
            isConnected = true;
            connectionAttempts = 0;
        });
    }
    catch (error) {
        connectionAttempts++;
        console.error('MongoDB connection error:', error);
        console.log(`Connection attempt ${connectionAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
        if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('Max reconnection attempts reached. Please check your MongoDB connection.');
            process.exit(1);
        }
        // Wait for 5 seconds before trying to reconnect
        yield new Promise(resolve => setTimeout(resolve, 5000));
        return (0, exports.connectDatabase)();
    }
});
exports.connectDatabase = connectDatabase;
const getDatabaseHealth = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!isConnected) {
            return { status: 'unhealthy', message: 'Database is not connected' };
        }
        // Try to ping the database
        yield mongoose_1.default.connection.db.admin().ping();
        return { status: 'healthy', message: 'Database connection is healthy' };
    }
    catch (error) {
        console.error('Database health check failed:', error);
        return { status: 'unhealthy', message: 'Database health check failed' };
    }
});
exports.getDatabaseHealth = getDatabaseHealth;
