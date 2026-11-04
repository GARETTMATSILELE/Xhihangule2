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
/**
 * Read-only diagnosis for one Paynow subscription reference.
 * Prints status and the reason it is unreconciled. It does not update any record.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '.env') });
const mongoose_1 = __importDefault(require("mongoose"));
const PaymentSession_1 = require("../models/PaymentSession");
const AuditLog_1 = require("../models/AuditLog");
const Company_1 = require("../models/Company");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
function databaseUri() {
    const configured = [process.env.MONGODB_URI, process.env.MONGODB_URI_PROPERTY, process.env.CUSTOMCONNSTR_MONGODB_URI]
        .map((value) => String(value || '').trim())
        .find(Boolean);
    if (configured)
        return configured;
    if (process.env.NODE_ENV === 'production')
        throw new Error('MONGODB_URI is required');
    return 'mongodb://127.0.0.1:27017/property-management';
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const reference = String(process.argv[2] || '').trim();
        if (!reference) {
            console.error('Usage: npm run paynow:diagnose -- SUBS-reference');
            process.exit(1);
        }
        yield mongoose_1.default.connect(databaseUri(), { serverSelectionTimeoutMS: 8000 });
        const sessions = yield PaymentSession_1.PaymentSession.find({ provider: 'paynow', providerRef: reference })
            .select('status amount currency companyId metadata updatedAt rawProviderResponse')
            .lean();
        if (sessions.length > 1) {
            console.log(JSON.stringify({
                reference,
                database: mongoose_1.default.connection.name,
                classification: 'ambiguous',
                sessionCount: sessions.length,
                writeAllowed: false,
                reason: 'More than one session uses this reference. No session was changed.'
            }, null, 2));
            yield mongoose_1.default.disconnect();
            return;
        }
        const session = sessions[0];
        const verifiedAuditCount = session
            ? yield AuditLog_1.AuditLog.countDocuments({ entityId: String(session._id), action: 'payment.verified' })
            : 0;
        const company = session
            ? yield Company_1.Company.findById(session.companyId).select('onboardingStatus subscriptionStatus').lean()
            : null;
        const explanation = (0, registrationPaymentPolicy_1.explainUnreconciledPaynowSession)({
            found: Boolean(session),
            status: session === null || session === void 0 ? void 0 : session.status,
            verifiedAuditCount
        });
        const stored = session === null || session === void 0 ? void 0 : session.rawProviderResponse;
        console.log(JSON.stringify(Object.assign(Object.assign({ reference, database: mongoose_1.default.connection.name }, explanation), { status: (session === null || session === void 0 ? void 0 : session.status) || null, amount: (_a = session === null || session === void 0 ? void 0 : session.amount) !== null && _a !== void 0 ? _a : null, currency: (session === null || session === void 0 ? void 0 : session.currency) || null, paynowReference: (stored === null || stored === void 0 ? void 0 : stored.paynowReference) || null, paynowMode: ((_b = session === null || session === void 0 ? void 0 : session.metadata) === null || _b === void 0 ? void 0 : _b.paynowMode) || null, verifiedAuditCount, companyOnboardingStatus: (company === null || company === void 0 ? void 0 : company.onboardingStatus) || null, companySubscriptionStatus: (company === null || company === void 0 ? void 0 : company.subscriptionStatus) || null, updatedAt: (session === null || session === void 0 ? void 0 : session.updatedAt) || null }), null, 2));
        yield mongoose_1.default.disconnect();
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200));
    if (mongoose_1.default.connection.readyState !== 0)
        yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
