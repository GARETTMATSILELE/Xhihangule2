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
exports.recordAuditEvent = recordAuditEvent;
const AuditLog_1 = require("../models/AuditLog");
const logger_1 = require("../utils/logger");
function recordAuditEvent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const seam = process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' ? global : undefined;
        const failAction = seam === null || seam === void 0 ? void 0 : seam.__failAuditAction;
        if (failAction && input.action === failAction) {
            seam.__failAuditAction = undefined;
            logger_1.logger.error('audit_event_persist_failed', {
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                companyId: input.companyId,
                result: (_a = input.metadata) === null || _a === void 0 ? void 0 : _a.result
            });
            return false;
        }
        const failResult = seam === null || seam === void 0 ? void 0 : seam.__failAuditResult;
        if (failResult && input.action === 'ledger.retry' && ((_b = input.metadata) === null || _b === void 0 ? void 0 : _b.result) === failResult) {
            global.__failAuditResult = undefined;
            logger_1.logger.error('audit_event_persist_failed', {
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                companyId: input.companyId,
                result: (_c = input.metadata) === null || _c === void 0 ? void 0 : _c.result
            });
            return false;
        }
        try {
            yield AuditLog_1.AuditLog.create({
                userId: input.userId || ((_e = (_d = input.req) === null || _d === void 0 ? void 0 : _d.user) === null || _e === void 0 ? void 0 : _e.userId),
                companyId: input.companyId || ((_g = (_f = input.req) === null || _f === void 0 ? void 0 : _f.user) === null || _g === void 0 ? void 0 : _g.companyId),
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                ip: (_h = input.req) === null || _h === void 0 ? void 0 : _h.ip,
                userAgent: (_j = input.req) === null || _j === void 0 ? void 0 : _j.get('user-agent'),
                requestId: ((_k = input.req) === null || _k === void 0 ? void 0 : _k.get('x-request-id')) || ((_l = input.req) === null || _l === void 0 ? void 0 : _l.requestId),
                status: input.status || 'success',
                metadata: input.metadata
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error('audit_event_persist_failed', {
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                companyId: input.companyId,
                message: (error === null || error === void 0 ? void 0 : error.message) || String(error)
            });
            return false;
        }
    });
}
