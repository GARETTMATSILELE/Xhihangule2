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
exports.BaseService = void 0;
const databaseService_1 = require("./databaseService");
const circuitBreaker_1 = require("./circuitBreaker");
class BaseService {
    constructor() {
        this.db = databaseService_1.DatabaseService.getInstance();
        this.circuitBreaker = circuitBreaker_1.CircuitBreaker.getInstance();
    }
    executeQuery(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.circuitBreaker.execute(() => this.db.executeWithRetry(operation));
        });
    }
    executeTransaction(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.circuitBreaker.execute(() => this.db.executeTransaction(operation));
        });
    }
    handleError(error) {
        console.error('Service error:', error);
        throw error;
    }
}
exports.BaseService = BaseService;
