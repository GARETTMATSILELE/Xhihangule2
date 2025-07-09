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
exports.CircuitBreaker = void 0;
class CircuitBreaker {
    constructor() {
        this.failures = 0;
        this.lastFailureTime = 0;
        this.isOpen = false;
        this.maxFailures = 5;
        this.resetTimeout = 30000; // 30 seconds
    }
    static getInstance() {
        if (!CircuitBreaker.instance) {
            CircuitBreaker.instance = new CircuitBreaker();
        }
        return CircuitBreaker.instance;
    }
    execute(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isOpen) {
                if (this.shouldReset()) {
                    this.reset();
                }
                else {
                    throw new Error('Circuit breaker is open');
                }
            }
            try {
                const result = yield operation();
                this.onSuccess();
                return result;
            }
            catch (error) {
                this.onFailure();
                throw error;
            }
        });
    }
    onSuccess() {
        this.failures = 0;
        this.isOpen = false;
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.maxFailures) {
            this.isOpen = true;
        }
    }
    shouldReset() {
        return Date.now() - this.lastFailureTime > this.resetTimeout;
    }
    reset() {
        this.failures = 0;
        this.isOpen = false;
        this.lastFailureTime = 0;
    }
    getStatus() {
        return {
            isOpen: this.isOpen,
            failures: this.failures,
            lastFailureTime: this.lastFailureTime
        };
    }
}
exports.CircuitBreaker = CircuitBreaker;
