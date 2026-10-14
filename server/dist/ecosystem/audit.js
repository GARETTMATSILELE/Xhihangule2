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
exports.ecosystemAudit = ecosystemAudit;
const auditService_1 = require("../services/auditService");
function ecosystemAudit(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        yield (0, auditService_1.recordAuditEvent)({
            req: params.req,
            userId: params.actor || ((_b = (_a = params.req) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.userId),
            companyId: (_d = (_c = params.req) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.companyId,
            action: params.action,
            entityType: params.entity,
            entityId: params.entityId,
            metadata: Object.assign({ previousState: params.previousState, newState: params.newState }, (params.metadata || {})),
        });
    });
}
