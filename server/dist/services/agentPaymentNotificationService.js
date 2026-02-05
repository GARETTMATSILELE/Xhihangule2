"use strict";
/**
 * Sends an email to the agent associated with a payment, notifying them of the
 * payment and its details (e.g. rent payment for rental agent, sales payment for sales agent).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.sendAgentPaymentNotificationEmail = sendAgentPaymentNotificationEmail;
const User_1 = require("../models/User");
const emailService_1 = require("./emailService");
const PAYMENT_TYPE_LABELS = {
    rental: 'Rent',
    sale: 'Sale',
    introduction: 'Introduction',
};
/**
 * Send a single email to the agent associated with a payment. Fire-and-forget;
 * errors are logged and do not affect the caller.
 * Skips sending when:
 * - agentId equals tenantId (e.g. public tenant self-pay where tenant is stored as "agent")
 * - agent user has no email
 * - agent user is not in role agent/sales (avoids emailing tenants if stored as agentId)
 */
function sendAgentPaymentNotificationEmail(payment) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const agentId = payment.agentId;
            const tenantId = payment.tenantId;
            if (!agentId)
                return;
            // Skip when agentId is the tenant (e.g. public payment flow stores tenantId as agentId)
            if (tenantId && String(agentId) === String(tenantId))
                return;
            const agent = yield User_1.User.findById(agentId)
                .select('email firstName lastName role roles')
                .lean();
            if (!agent || !agent.email)
                return;
            const roles = Array.isArray(agent.roles) && agent.roles.length
                ? agent.roles.map((r) => String(r))
                : [String(agent.role || '')];
            const isAgentOrSales = roles.some((r) => r === 'agent' || r === 'sales');
            if (!isAgentOrSales)
                return;
            const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType] || payment.paymentType;
            const amount = Number(payment.amount);
            const currency = payment.currency || 'USD';
            const date = payment.paymentDate instanceof Date
                ? payment.paymentDate.toLocaleDateString()
                : new Date(payment.paymentDate).toLocaleDateString();
            // Fetch tenant name and property address for email details (fallback to manual fields)
            const propertyId = payment.propertyId;
            const tenantIdForFetch = payment.tenantId;
            const manualTenantName = payment.manualTenantName;
            const manualPropertyAddress = payment.manualPropertyAddress;
            let tenantName = typeof manualTenantName === 'string' && manualTenantName.trim() ? manualTenantName.trim() : '—';
            let propertyAddress = typeof manualPropertyAddress === 'string' && manualPropertyAddress.trim() ? manualPropertyAddress.trim() : '—';
            if (propertyId && propertyAddress === '—') {
                try {
                    const { Property } = yield Promise.resolve().then(() => __importStar(require('../models/Property')));
                    const prop = yield Property.findById(propertyId).select('address name').lean();
                    if (prop)
                        propertyAddress = prop.address || prop.name || '—';
                }
                catch (_) { }
            }
            if (tenantIdForFetch && tenantName === '—') {
                try {
                    const { Tenant } = yield Promise.resolve().then(() => __importStar(require('../models/Tenant')));
                    const tenant = yield Tenant.findById(tenantIdForFetch).select('firstName lastName').lean();
                    if (tenant) {
                        tenantName = [tenant.firstName, tenant.lastName].filter(Boolean).join(' ').trim() || '—';
                    }
                }
                catch (_) { }
            }
            const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(' ').trim();
            const greeting = fullName ? `Hi ${fullName},` : 'Hello,';
            const subject = `Payment recorded: ${typeLabel} – ${tenantName}`;
            const details = [
                `Type: ${typeLabel}`,
                `Amount: ${currency} ${amount.toLocaleString()}`,
                `Date: ${date}`,
                `Tenant: ${tenantName}`,
                `Property: ${propertyAddress}`,
            ];
            if (typeof payment.rentalPeriodMonth === 'number' &&
                typeof payment.rentalPeriodYear === 'number') {
                details.push(`Rental period: ${payment.rentalPeriodYear}-${String(payment.rentalPeriodMonth).padStart(2, '0')}`);
            }
            const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
            const url = `${linkBase}/sales-dashboard/notifications`;
            const plain = [
                greeting,
                '',
                `A ${typeLabel.toLowerCase()} payment associated with you has been recorded.`,
                '',
                details.join('\n'),
                '',
                `View details: ${url}`,
            ].join('\n');
            const html = [
                `<p>${greeting}</p>`,
                `<p>A ${typeLabel.toLowerCase()} payment associated with you has been recorded.</p>`,
                '<ul>',
                ...details.map((d) => `<li>${escapeHtml(d)}</li>`),
                '</ul>',
                `<p><a href="${url}" target="_blank" rel="noopener noreferrer">View details</a></p>`,
            ].join('');
            yield (0, emailService_1.sendMail)({ to: agent.email, subject, html, text: plain });
        }
        catch (e) {
            console.warn('[agentPaymentNotification] Failed to send agent payment email:', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    });
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
