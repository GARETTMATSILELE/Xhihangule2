"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToAll = exports.emitToRoom = exports.initializeSocket = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = require("dotenv");
const jwt_1 = require("./jwt");
(0, dotenv_1.config)();
const initializeSocket = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });
    // Socket.IO authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_CONFIG.SECRET);
            socket.data = { user: decoded };
            next();
        }
        catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        var _a;
        const customSocket = socket;
        console.log('Client connected:', socket.id);
        // Join relevant rooms based on user role/permissions
        if ((_a = customSocket.data) === null || _a === void 0 ? void 0 : _a.user) {
            socket.join(`user-${customSocket.data.user.id}`);
            if (customSocket.data.user.role) {
                socket.join(`role-${customSocket.data.user.role}`);
            }
        }
        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
        socket.on('disconnect', (reason) => {
            console.log('Client disconnected:', socket.id, 'Reason:', reason);
        });
    });
    return { io };
};
exports.initializeSocket = initializeSocket;
// Helper function to emit events to specific rooms
const emitToRoom = (io, room, event, data) => {
    io.to(room).emit(event, data);
};
exports.emitToRoom = emitToRoom;
// Helper function to emit events to all connected clients
const emitToAll = (io, event, data) => {
    io.emit(event, data);
};
exports.emitToAll = emitToAll;
