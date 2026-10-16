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
exports.AUDIT_OPERATION_POLICY = void 0;
exports.noteMissingAudit = noteMissingAudit;
const financialOperationVisibility_1 = require("./financialOperationVisibility");
const operationalSignal_1 = require("./operationalSignal");
/**
 * Category A must be persisted before the effect starts.
 * Category B records a gap after the effect and does not repeat it.
 * Category C is diagnostic. A failed insert is logged and the caller continues.
 */
exports.AUDIT_OPERATION_POLICY = [
    {
        action: 'ledger.retry',
        category: 'A_BEFORE_EFFECT',
        rule: 'The started audit is required before the ledger event is claimed. A missing completion audit keeps the financial outcome and records AUDIT_EVENT_MISSING.'
    },
    {
        action: 'payment.verified',
        category: 'A_BEFORE_EFFECT',
        rule: 'Subscription activation does not start when this audit event cannot be stored. The callback receipt stays failed so a later delivery can retry.'
    },
    {
        action: 'checkout.failed',
        category: 'B_AFTER_EFFECT',
        rule: 'The session is already failed. A missing audit does not select another session or reactivate this one.'
    },
    {
        action: 'checkout.cancelled',
        category: 'B_AFTER_EFFECT',
        rule: 'The session is already cancelled. A missing audit does not reactivate it.'
    },
    {
        action: 'registration.expired',
        category: 'B_AFTER_EFFECT',
        rule: 'The company archive is already saved. A missing audit does not restore the company.'
    },
    {
        action: 'registration.archived',
        category: 'B_AFTER_EFFECT',
        rule: 'The archive is already saved. A missing audit does not repeat the archive.'
    },
    {
        action: 'registration.email_released',
        category: 'B_AFTER_EFFECT',
        rule: 'The email release is already saved. A missing audit does not repeat it.'
    },
    {
        action: 'auth.login',
        category: 'C_DIAGNOSTIC',
        rule: 'Login already succeeded. A missing audit is logged and does not undo the session.'
    },
    {
        action: 'auth.logout',
        category: 'C_DIAGNOSTIC',
        rule: 'Logout continues when the audit insert fails.'
    },
    {
        action: 'auth.signup',
        category: 'C_DIAGNOSTIC',
        rule: 'The user row is already saved. A missing audit does not delete it.'
    },
    {
        action: 'maintenance.work_order.create',
        category: 'C_DIAGNOSTIC',
        rule: 'The work order is already saved. A missing audit does not delete it.'
    },
    {
        action: 'owner.document.upload',
        category: 'C_DIAGNOSTIC',
        rule: 'The document is already saved. A missing audit does not delete it.'
    }
];
const FINANCIAL_AUDIT_ACTIONS = new Set(['checkout.failed', 'checkout.cancelled', 'ledger.retry']);
/**
 * One review row for a financial action whose effect is already stored.
 * A failed review write is logged once. This does not post accounting again.
 */
function noteMissingAudit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        (0, operationalSignal_1.signalOperationalFailure)('AUDIT_EVENT_MISSING', {
            action: input.action,
            companyId: input.companyId,
            entityId: input.entityId,
            operationId: input.operationId
        });
        if (!input.companyId || !FINANCIAL_AUDIT_ACTIONS.has(input.action))
            return;
        try {
            yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                companyId: input.companyId,
                component: 'AUDIT_EVENT_MISSING',
                operationId: input.operationId,
                paymentId: input.paymentId,
                missingRecord: `${input.action} audit event`,
                issueType: 'missing',
                recommendedReview: `${input.action} kept its stored outcome and the audit event was not stored. Do not repeat the financial operation.`
            });
        }
        catch (error) {
            (0, operationalSignal_1.signalOperationalFailure)('audit_gap_unpersisted', {
                action: input.action,
                companyId: input.companyId,
                operationId: input.operationId,
                error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200)
            });
        }
    });
}
