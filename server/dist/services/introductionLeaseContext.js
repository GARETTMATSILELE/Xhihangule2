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
exports.INTRODUCTION_APPLICABLE_LEASE_STATUSES = exports.INTRODUCTION_LEASE_NOT_APPLICABLE = exports.INTRODUCTION_CONTEXT_MISMATCH = exports.INTRODUCTION_CONTEXT_INCOMPLETE = exports.INTRODUCTION_LEASE_REQUIRED = void 0;
exports.introductionContextErrorResponse = introductionContextErrorResponse;
exports.logIntroductionContextFailure = logIntroductionContextFailure;
exports.introductionTargetFromLease = introductionTargetFromLease;
exports.resolveIntroductionLeaseContext = resolveIntroductionLeaseContext;
/**
 * Introduction identity is tenant + property + lease.
 * Do not guess a lease. Do not use payerId as the Introduction key.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const logger_1 = require("../utils/logger");
exports.INTRODUCTION_LEASE_REQUIRED = 'INTRODUCTION_LEASE_REQUIRED';
exports.INTRODUCTION_CONTEXT_INCOMPLETE = 'INTRODUCTION_CONTEXT_INCOMPLETE';
exports.INTRODUCTION_CONTEXT_MISMATCH = 'INTRODUCTION_CONTEXT_MISMATCH';
exports.INTRODUCTION_LEASE_NOT_APPLICABLE = 'INTRODUCTION_LEASE_NOT_APPLICABLE';
exports.INTRODUCTION_APPLICABLE_LEASE_STATUSES = [
    'active',
    'expiring_soon',
    'pending_settlement'
];
const sameId = (a, b) => String(a || '') === String(b || '');
const incomplete = (missing) => ({
    ok: false,
    code: exports.INTRODUCTION_CONTEXT_INCOMPLETE,
    message: 'Introduction payment requires tenant, property, and lease.',
    missing
});
function introductionContextErrorResponse(error) {
    return Object.assign(Object.assign({ status: 'error', success: false, code: error.code, message: error.message }, (error.missing ? { missing: error.missing } : {})), (error.mismatches ? { mismatches: error.mismatches } : {}));
}
function logIntroductionContextFailure(input) {
    logger_1.logger.warn('Introduction payment context rejected', {
        paymentId: input.paymentId || null,
        tenantId: input.tenantId || null,
        propertyId: input.propertyId || null,
        leaseId: input.leaseId != null ? String(input.leaseId) : null,
        companyId: input.companyId != null ? String(input.companyId) : null,
        code: input.code,
        missing: input.missing || [],
        mismatches: input.mismatches || [],
        attemptedAllocation: input.attemptedAllocation || null
    });
}
function introductionTargetFromLease(lease, property) {
    const fromLease = Number((lease === null || lease === void 0 ? void 0 : lease.rentAmount) || (lease === null || lease === void 0 ? void 0 : lease.monthlyRent) || 0);
    if (fromLease > 0)
        return fromLease;
    return Number((property === null || property === void 0 ? void 0 : property.rent) || 0);
}
function resolveIntroductionLeaseContext(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const missing = [];
        const tenantId = input.tenantId != null && String(input.tenantId).trim() && !String(input.tenantId).startsWith('manual_')
            ? String(input.tenantId)
            : '';
        const propertyId = input.propertyId != null && String(input.propertyId).trim() && !String(input.propertyId).startsWith('manual_')
            ? String(input.propertyId)
            : '';
        const leaseIdRaw = input.leaseId != null && String(input.leaseId).trim() ? String(input.leaseId) : '';
        if (!tenantId || !mongoose_1.default.Types.ObjectId.isValid(tenantId))
            missing.push('tenantId');
        if (!propertyId || !mongoose_1.default.Types.ObjectId.isValid(propertyId))
            missing.push('propertyId');
        if (missing.length) {
            if (!leaseIdRaw)
                missing.push('leaseId');
            const error = incomplete(missing);
            logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing }));
            return error;
        }
        const companyId = new mongoose_1.default.Types.ObjectId(String(input.companyId));
        if (leaseIdRaw) {
            if (!mongoose_1.default.Types.ObjectId.isValid(leaseIdRaw)) {
                const error = {
                    ok: false,
                    code: exports.INTRODUCTION_LEASE_REQUIRED,
                    message: 'Introduction payment requires an unambiguous lease.',
                    missing: ['leaseId']
                };
                logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing }));
                return error;
            }
            const lease = yield Lease_1.Lease.findOne({
                _id: new mongoose_1.default.Types.ObjectId(leaseIdRaw),
                companyId
            }).lean();
            if (!lease) {
                const error = {
                    ok: false,
                    code: exports.INTRODUCTION_LEASE_NOT_APPLICABLE,
                    message: 'Introduction lease was not found for this company.',
                    missing: ['leaseId']
                };
                logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing }));
                return error;
            }
            const mismatches = [];
            if (!sameId(lease.tenantId, tenantId))
                mismatches.push('tenantId');
            if (!sameId(lease.propertyId, propertyId))
                mismatches.push('propertyId');
            if (mismatches.length) {
                const error = {
                    ok: false,
                    code: exports.INTRODUCTION_CONTEXT_MISMATCH,
                    message: 'Introduction payment tenant/property does not match the selected lease.',
                    mismatches
                };
                logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, mismatches }));
                return error;
            }
            const status = String(lease.status || '').toLowerCase();
            if (!exports.INTRODUCTION_APPLICABLE_LEASE_STATUSES.includes(status)) {
                const error = {
                    ok: false,
                    code: exports.INTRODUCTION_LEASE_NOT_APPLICABLE,
                    message: 'Introduction lease is not applicable (terminated, expired, or otherwise inactive).'
                };
                logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, leaseId: leaseIdRaw, code: error.code }));
                return error;
            }
            return {
                ok: true,
                lease,
                tenantId,
                propertyId,
                leaseId: String(lease._id)
            };
        }
        const candidates = yield Lease_1.Lease.find({
            companyId,
            tenantId: new mongoose_1.default.Types.ObjectId(tenantId),
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            status: { $in: [...exports.INTRODUCTION_APPLICABLE_LEASE_STATUSES] }
        }).select('_id tenantId propertyId rentAmount monthlyRent status startDate endDate').lean();
        if (candidates.length === 1) {
            return {
                ok: true,
                lease: candidates[0],
                tenantId,
                propertyId,
                leaseId: String(candidates[0]._id)
            };
        }
        const error = {
            ok: false,
            code: exports.INTRODUCTION_LEASE_REQUIRED,
            message: 'Introduction payment requires an unambiguous lease.',
            missing: ['leaseId']
        };
        logIntroductionContextFailure(Object.assign(Object.assign({}, input), { tenantId, propertyId, code: error.code, missing: error.missing }));
        return error;
    });
}
