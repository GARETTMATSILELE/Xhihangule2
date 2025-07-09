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
exports.BaseRepository = void 0;
const databaseService_1 = require("../services/databaseService");
const circuitBreaker_1 = require("../services/circuitBreaker");
class BaseRepository {
    constructor(model) {
        this.model = model;
        this.db = databaseService_1.DatabaseService.getInstance();
        this.circuitBreaker = circuitBreaker_1.CircuitBreaker.getInstance();
    }
    findOne(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, options = {}) {
            return this.executeQuery(() => this.model.findOne(query, null, options));
        });
    }
    find(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, options = {}) {
            return this.executeQuery(() => this.model.find(query, null, options));
        });
    }
    findById(id_1) {
        return __awaiter(this, arguments, void 0, function* (id, options = {}) {
            return this.executeQuery(() => this.model.findById(id, null, options));
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.executeQuery(() => this.model.create(data));
        });
    }
    update(id_1, data_1) {
        return __awaiter(this, arguments, void 0, function* (id, data, options = {}) {
            return this.executeQuery(() => this.model.findByIdAndUpdate(id, data, Object.assign(Object.assign({}, options), { new: true })));
        });
    }
    delete(id_1) {
        return __awaiter(this, arguments, void 0, function* (id, options = {}) {
            return this.executeQuery(() => __awaiter(this, void 0, void 0, function* () {
                const result = yield this.model.findByIdAndDelete(id, options);
                return !!result;
            }));
        });
    }
    exists(query) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.executeQuery(() => __awaiter(this, void 0, void 0, function* () {
                const count = yield this.model.countDocuments(query);
                return count > 0;
            }));
        });
    }
    executeQuery(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.circuitBreaker.execute(() => this.db.executeWithRetry(operation));
        });
    }
}
exports.BaseRepository = BaseRepository;
