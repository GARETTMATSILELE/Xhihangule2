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
exports.DEFAULT_CHARGE_TYPES = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChargeType_1 = __importDefault(require("../models/ChargeType"));
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const Payment_1 = require("../models/Payment");
const errorHandler_1 = require("../middleware/errorHandler");
exports.DEFAULT_CHARGE_TYPES = [
    {
        name: 'Rent',
        code: 'RENT',
        category: 'PROPERTY_INCOME',
        ownerIncome: true,
        requiresPayout: true,
        requiresThirdPartyPayment: false,
        defaultLedger: 'Rental Income'
    },
    {
        name: 'Levy',
        code: 'LEVY',
        category: 'PASS_THROUGH',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: true,
        defaultLedger: 'Pass Through'
    },
    {
        name: 'Water',
        code: 'WATER',
        category: 'PASS_THROUGH',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: true,
        defaultLedger: 'Pass Through'
    },
    {
        name: 'Electricity',
        code: 'ELECTRICITY',
        category: 'PASS_THROUGH',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: true,
        defaultLedger: 'Pass Through'
    },
    {
        name: 'Rates',
        code: 'RATES',
        category: 'PASS_THROUGH',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: true,
        defaultLedger: 'Pass Through'
    },
    {
        name: 'Deposit',
        code: 'DEPOSIT',
        category: 'LIABILITY',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: false,
        defaultLedger: 'Security Deposit'
    },
    {
        name: 'Maintenance Recovery',
        code: 'MAINTENANCE_RECOVERY',
        category: 'PROPERTY_INCOME',
        ownerIncome: true,
        requiresPayout: true,
        requiresThirdPartyPayment: false,
        defaultLedger: 'Rental Income'
    },
    {
        name: 'Maintenance Expense',
        code: 'MAINTENANCE_EXPENSE',
        category: 'PROPERTY_EXPENSE',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: false,
        defaultLedger: 'Maintenance Expense'
    },
    {
        name: 'Owner Payout',
        code: 'OWNER_PAYOUT',
        category: 'OWNER_WITHDRAWAL',
        ownerIncome: false,
        requiresPayout: false,
        requiresThirdPartyPayment: false,
        defaultLedger: 'Owner Payouts'
    }
];
const VALID_CATEGORIES = new Set([
    'PROPERTY_INCOME',
    'PASS_THROUGH',
    'PROPERTY_EXPENSE',
    'LIABILITY',
    'OWNER_WITHDRAWAL',
    'SYSTEM'
]);
class ChargeTypeService {
    normalizeCode(code) {
        return String(code || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }
    companyFilter(companyId) {
        return companyId ? { companyId: new mongoose_1.default.Types.ObjectId(String(companyId)) } : { companyId: { $exists: false } };
    }
    validateInput(input) {
        var _a, _b;
        const code = this.normalizeCode(input.code);
        if (!((_a = input.name) === null || _a === void 0 ? void 0 : _a.trim()))
            throw new errorHandler_1.AppError('Charge type name is required', 400);
        if (!code)
            throw new errorHandler_1.AppError('Charge type code is required', 400);
        if (!VALID_CATEGORIES.has(input.category))
            throw new errorHandler_1.AppError('Invalid charge type category', 400);
        if (!((_b = input.defaultLedger) === null || _b === void 0 ? void 0 : _b.trim()))
            throw new errorHandler_1.AppError('Default ledger is required', 400);
        return Object.assign(Object.assign({}, input), { name: input.name.trim(), code, ownerIncome: Boolean(input.ownerIncome), requiresPayout: Boolean(input.requiresPayout), requiresThirdPartyPayment: Boolean(input.requiresThirdPartyPayment), defaultLedger: input.defaultLedger.trim(), active: input.active !== false });
    }
    seedDefaults(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = companyId ? new mongoose_1.default.Types.ObjectId(String(companyId)) : undefined;
            for (const input of exports.DEFAULT_CHARGE_TYPES) {
                const normalized = this.validateInput(input);
                yield ChargeType_1.default.updateOne(Object.assign(Object.assign({}, (companyObjectId ? { companyId: companyObjectId } : { companyId: { $exists: false } })), { code: normalized.code }), {
                    $setOnInsert: Object.assign(Object.assign(Object.assign({}, normalized), (companyObjectId ? { companyId: companyObjectId } : {})), { isSystemDefault: true })
                }, { upsert: true });
            }
        });
    }
    listChargeTypes(companyId_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, includeInactive = false) {
            yield this.seedDefaults(companyId);
            return ChargeType_1.default.find(Object.assign(Object.assign({}, this.companyFilter(companyId)), (includeInactive ? {} : { active: true }))).sort({ category: 1, name: 1 });
        });
    }
    getChargeTypeByCode(code_1, companyId_1) {
        return __awaiter(this, arguments, void 0, function* (code, companyId, opts = {}) {
            const normalizedCode = this.normalizeCode(code);
            if (!normalizedCode) {
                if (opts.throwIfMissing)
                    throw new errorHandler_1.AppError('Charge type code is required', 400);
                return null;
            }
            yield this.seedDefaults(companyId);
            const chargeType = yield ChargeType_1.default.findOne(Object.assign(Object.assign(Object.assign({}, this.companyFilter(companyId)), { code: normalizedCode }), (opts.includeInactive ? {} : { active: true })));
            if (!chargeType && opts.throwIfMissing) {
                throw new errorHandler_1.AppError(`Charge type ${normalizedCode} not found or inactive`, 400);
            }
            return chargeType;
        });
    }
    createChargeType(input, companyId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalized = this.validateInput(input);
            yield this.seedDefaults(companyId);
            const existing = yield ChargeType_1.default.findOne(Object.assign(Object.assign({}, this.companyFilter(companyId)), { code: normalized.code }));
            if (existing)
                throw new errorHandler_1.AppError(`Charge type code ${normalized.code} already exists`, 409);
            return ChargeType_1.default.create(Object.assign(Object.assign(Object.assign({}, normalized), (companyId ? { companyId: new mongoose_1.default.Types.ObjectId(String(companyId)) } : {})), { createdBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined, updatedBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined }));
        });
    }
    updateChargeType(id, input, companyId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            yield this.seedDefaults(companyId);
            const chargeType = yield ChargeType_1.default.findOne(Object.assign({ _id: id }, this.companyFilter(companyId)));
            if (!chargeType)
                throw new errorHandler_1.AppError('Charge type not found', 404);
            const next = this.validateInput({
                name: (_a = input.name) !== null && _a !== void 0 ? _a : chargeType.name,
                code: (_b = input.code) !== null && _b !== void 0 ? _b : chargeType.code,
                category: (_c = input.category) !== null && _c !== void 0 ? _c : chargeType.category,
                ownerIncome: (_d = input.ownerIncome) !== null && _d !== void 0 ? _d : chargeType.ownerIncome,
                requiresPayout: (_e = input.requiresPayout) !== null && _e !== void 0 ? _e : chargeType.requiresPayout,
                requiresThirdPartyPayment: (_f = input.requiresThirdPartyPayment) !== null && _f !== void 0 ? _f : chargeType.requiresThirdPartyPayment,
                defaultLedger: (_g = input.defaultLedger) !== null && _g !== void 0 ? _g : chargeType.defaultLedger,
                active: (_h = input.active) !== null && _h !== void 0 ? _h : chargeType.active
            });
            if (next.code !== chargeType.code) {
                yield this.assertNoReferences(chargeType.code, companyId);
                const existing = yield ChargeType_1.default.findOne(Object.assign(Object.assign({}, this.companyFilter(companyId)), { code: next.code, _id: { $ne: chargeType._id } }));
                if (existing)
                    throw new errorHandler_1.AppError(`Charge type code ${next.code} already exists`, 409);
            }
            chargeType.set(Object.assign(Object.assign({}, next), { updatedBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined }));
            yield chargeType.save();
            return chargeType;
        });
    }
    deactivateChargeType(id, companyId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.seedDefaults(companyId);
            const chargeType = yield ChargeType_1.default.findOne(Object.assign({ _id: id }, this.companyFilter(companyId)));
            if (!chargeType)
                throw new errorHandler_1.AppError('Charge type not found', 404);
            chargeType.active = false;
            if (userId)
                chargeType.updatedBy = new mongoose_1.default.Types.ObjectId(userId);
            yield chargeType.save();
            return chargeType;
        });
    }
    deleteChargeType(id, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chargeType = yield ChargeType_1.default.findOne(Object.assign({ _id: id }, this.companyFilter(companyId)));
            if (!chargeType)
                throw new errorHandler_1.AppError('Charge type not found', 404);
            yield this.assertNoReferences(chargeType.code, companyId);
            yield ChargeType_1.default.deleteOne({ _id: chargeType._id });
        });
    }
    assertNoReferences(code, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedCode = this.normalizeCode(code);
            const companyObjectId = companyId ? new mongoose_1.default.Types.ObjectId(String(companyId)) : undefined;
            const [paymentReference, ledgerReference] = yield Promise.all([
                Payment_1.Payment.exists(Object.assign(Object.assign({}, (companyObjectId ? { companyId: companyObjectId } : {})), { $or: [
                        { 'paymentLines.chargeTypeCode': normalizedCode },
                        { chargeTypeCode: normalizedCode },
                        { 'transactions.chargeTypeCode': normalizedCode }
                    ] })),
                PropertyAccount_1.default.exists({
                    $or: [
                        { 'transactions.chargeTypeCode': normalizedCode },
                        { 'passThroughAccounts.type': normalizedCode }
                    ]
                })
            ]);
            if (paymentReference || ledgerReference) {
                throw new errorHandler_1.AppError(`Charge type ${normalizedCode} is referenced by financial history and cannot be deleted or recoded`, 409);
            }
        });
    }
    getCompatibilityChargeLines(payment, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rawLines = Array.isArray(payment === null || payment === void 0 ? void 0 : payment.paymentLines) && payment.paymentLines.length > 0
                ? payment.paymentLines
                : this.legacyPaymentLines(payment);
            const resolved = [];
            for (const rawLine of rawLines) {
                const amount = Number((rawLine === null || rawLine === void 0 ? void 0 : rawLine.amount) || 0);
                if (amount <= 0)
                    continue;
                const code = this.normalizeCode((rawLine === null || rawLine === void 0 ? void 0 : rawLine.chargeTypeCode) || (rawLine === null || rawLine === void 0 ? void 0 : rawLine.code));
                const chargeType = yield this.getChargeTypeByCode(code, companyId || (payment === null || payment === void 0 ? void 0 : payment.companyId), { throwIfMissing: true });
                resolved.push({
                    chargeTypeCode: code,
                    amount,
                    description: rawLine === null || rawLine === void 0 ? void 0 : rawLine.description,
                    referenceId: rawLine === null || rawLine === void 0 ? void 0 : rawLine.referenceId,
                    metadata: rawLine === null || rawLine === void 0 ? void 0 : rawLine.metadata,
                    chargeType: chargeType
                });
            }
            return resolved;
        });
    }
    legacyPaymentLines(payment) {
        const lines = [];
        const depositAmount = Math.max(0, Number((payment === null || payment === void 0 ? void 0 : payment.depositAmount) || 0));
        const rentAllocated = Number((payment === null || payment === void 0 ? void 0 : payment.rentAllocated) || 0);
        const levyAllocated = Number((payment === null || payment === void 0 ? void 0 : payment.levyAllocated) || 0);
        const paymentType = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || '').toLowerCase();
        const amount = Math.max(0, Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0));
        if (rentAllocated > 0) {
            lines.push({ chargeTypeCode: 'RENT', amount: rentAllocated, description: 'Rent' });
        }
        if (levyAllocated > 0) {
            lines.push({ chargeTypeCode: 'LEVY', amount: levyAllocated, description: 'Levy' });
        }
        if (depositAmount > 0) {
            lines.push({ chargeTypeCode: 'DEPOSIT', amount: depositAmount, description: 'Deposit' });
        }
        if (lines.length === 0 && amount > 0 && paymentType !== 'sale') {
            lines.push({ chargeTypeCode: 'RENT', amount, description: 'Rent' });
        }
        return lines;
    }
}
exports.default = new ChargeTypeService();
