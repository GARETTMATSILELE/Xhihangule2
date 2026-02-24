"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTrustReconciliationJob = exports.startTrustReconciliationJob = exports.runTrustReconciliationOnce = void 0;
const cron_1 = require("cron");
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const TrustTransaction_1 = require("../models/TrustTransaction");
const TrustReconciliationResult_1 = require("../models/TrustReconciliationResult");
const eventBus_1 = require("../events/eventBus");
const trustAccountService_1 = __importDefault(require("../services/trustAccountService"));
let job = null;
const money = (n) => Number(Number(n || 0).toFixed(2));
const runCompanyReconciliation = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    const payments = yield Payment_1.Payment.find({
        companyId: new mongoose_1.default.Types.ObjectId(companyId),
        paymentType: 'sale',
        status: 'completed'
    })
        .select('_id propertyId amount referenceNumber paymentDate tenantId')
        .lean();
    let missingPostings = 0;
    let balanceMismatches = 0;
    let autoRepairs = 0;
    const details = [];
    for (const payment of payments) {
        const exists = yield TrustTransaction_1.TrustTransaction.findOne({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            paymentId: payment._id
        })
            .select('_id trustAccountId')
            .lean();
        if (!exists) {
            missingPostings += 1;
            details.push({ type: 'missing_posting', paymentId: String(payment._id) });
            try {
                yield (0, eventBus_1.emitEvent)('payment.confirmed', {
                    eventId: `payment.confirmed:${String(payment._id)}`,
                    paymentId: String(payment._id),
                    propertyId: String(payment.propertyId),
                    payerId: String(payment.tenantId || ''),
                    amount: Number(payment.amount || 0),
                    reference: String(payment.referenceNumber || ''),
                    date: new Date(payment.paymentDate || new Date()).toISOString(),
                    companyId
                });
                autoRepairs += 1;
            }
            catch (error) {
                details.push({ type: 'repair_failed', paymentId: String(payment._id), error: (error === null || error === void 0 ? void 0 : error.message) || 'emit failed' });
            }
        }
    }
    const trustAccounts = yield trustAccountService_1.default.listTrustAccounts(companyId, { page: 1, limit: 500 });
    for (const account of trustAccounts.items) {
        const rows = yield TrustTransaction_1.TrustTransaction.find({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            trustAccountId: account._id
        })
            .select('runningBalance')
            .sort({ createdAt: -1 })
            .limit(1)
            .lean();
        const expected = rows.length ? money(Number(rows[0].runningBalance || 0)) : 0;
        const actual = money(Number(account.runningBalance || 0));
        if (expected !== actual) {
            balanceMismatches += 1;
            details.push({ type: 'balance_mismatch', trustAccountId: String(account._id), expected, actual });
            // Safe repair: update only if account is not closed.
            if (String(account.status) !== 'CLOSED') {
                yield (yield Promise.resolve().then(() => __importStar(require('../models/TrustAccount')))).TrustAccount.updateOne({ _id: account._id, companyId: new mongoose_1.default.Types.ObjectId(companyId), status: { $ne: 'CLOSED' } }, { $set: { runningBalance: expected, closingBalance: expected } });
                autoRepairs += 1;
            }
        }
    }
    yield TrustReconciliationResult_1.TrustReconciliationResult.create({
        companyId: new mongoose_1.default.Types.ObjectId(companyId),
        runAt: new Date(),
        checkedPayments: payments.length,
        missingPostings,
        balanceMismatches,
        autoRepairs,
        details: { items: details.slice(0, 500) }
    });
});
const runTrustReconciliationOnce = () => __awaiter(void 0, void 0, void 0, function* () {
    const companyIds = yield Payment_1.Payment.distinct('companyId', { paymentType: 'sale' });
    for (const companyId of companyIds) {
        yield runCompanyReconciliation(String(companyId));
    }
});
exports.runTrustReconciliationOnce = runTrustReconciliationOnce;
const startTrustReconciliationJob = () => {
    if (job)
        return;
    // Run daily at 02:15 server time.
    job = new cron_1.CronJob('15 2 * * *', () => {
        void (0, exports.runTrustReconciliationOnce)();
    });
    job.start();
};
exports.startTrustReconciliationJob = startTrustReconciliationJob;
const stopTrustReconciliationJob = () => {
    if (job) {
        job.stop();
        job = null;
    }
};
exports.stopTrustReconciliationJob = stopTrustReconciliationJob;
