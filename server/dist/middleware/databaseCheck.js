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
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDatabaseConnection = void 0;
const database_1 = require("../config/database");
const checkDatabaseConnection = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const status = (0, database_1.getDatabaseHealth)();
        if (!status.isConnected || !status.isHealthy) {
            return res.status(503).json({
                status: 'error',
                message: 'Database connection is not available',
                details: status
            });
        }
        next();
    }
    catch (error) {
        console.error('Database connection check failed:', error);
        res.status(503).json({
            status: 'error',
            message: 'Database connection check failed',
            error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'
        });
    }
});
exports.checkDatabaseConnection = checkDatabaseConnection;
