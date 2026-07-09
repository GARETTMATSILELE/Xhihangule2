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
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            yield AuditLog_1.AuditLog.create({
                userId: input.userId || ((_b = (_a = input.req) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.userId),
                companyId: input.companyId || ((_d = (_c = input.req) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.companyId),
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                ip: (_e = input.req) === null || _e === void 0 ? void 0 : _e.ip,
                userAgent: (_f = input.req) === null || _f === void 0 ? void 0 : _f.get('user-agent'),
                requestId: ((_g = input.req) === null || _g === void 0 ? void 0 : _g.get('x-request-id')) || ((_h = input.req) === null || _h === void 0 ? void 0 : _h.requestId),
                status: input.status || 'success',
                metadata: input.metadata
            });
        }
        catch (error) {
            logger_1.logger.warn('Audit event write failed', {
                action: input.action,
                entityType: input.entityType,
                message: (error === null || error === void 0 ? void 0 : error.message) || String(error)
            });
        }
    });
}
