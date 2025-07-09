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
exports.LeaseRepository = void 0;
const base_repository_1 = require("./base.repository");
const Lease_1 = require("../models/Lease");
class LeaseRepository extends base_repository_1.BaseRepository {
    constructor() {
        super(Lease_1.Lease);
    }
    static getInstance() {
        if (!LeaseRepository.instance) {
            LeaseRepository.instance = new LeaseRepository();
        }
        return LeaseRepository.instance;
    }
    findByCompanyId(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.find({ companyId });
        });
    }
    findByStatus(status) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.find({ status });
        });
    }
    findByDateRange(startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.find({
                startDate: { $gte: startDate },
                endDate: { $lte: endDate }
            });
        });
    }
    findActiveLeases() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            return this.find({
                startDate: { $lte: now },
                endDate: { $gte: now },
                status: 'active'
            });
        });
    }
    findExpiringLeases(daysThreshold) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
            return this.find({
                endDate: { $lte: thresholdDate },
                status: 'active'
            });
        });
    }
    updateLeaseStatus(id, status) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.update(id, { status });
        });
    }
    extendLease(id, newEndDate) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.update(id, { endDate: newEndDate });
        });
    }
    bulkUpdateStatus(ids, status) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.executeQuery(() => __awaiter(this, void 0, void 0, function* () {
                    yield this.model.updateMany({ _id: { $in: ids } }, { $set: { status } });
                }));
                return true;
            }
            catch (error) {
                console.error('Failed to bulk update lease status:', error);
                return false;
            }
        });
    }
    getLeaseStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const [total, active, expired, upcoming] = yield Promise.all([
                this.model.countDocuments(),
                this.model.countDocuments({
                    startDate: { $lte: now },
                    endDate: { $gte: now },
                    status: 'active'
                }),
                this.model.countDocuments({
                    endDate: { $lt: now },
                    status: 'active'
                }),
                this.model.countDocuments({
                    startDate: { $gt: now },
                    status: 'pending'
                })
            ]);
            return { total, active, expired, upcoming };
        });
    }
}
exports.LeaseRepository = LeaseRepository;
