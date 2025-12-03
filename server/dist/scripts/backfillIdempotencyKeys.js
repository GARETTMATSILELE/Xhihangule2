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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("../config/database");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const Property_1 = require("../models/Property");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const crypto_1 = __importDefault(require("crypto"));
const ENV_PATH = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
dotenv_1.default.config({ path: ENV_PATH });
function sha256Hex(input) {
    return crypto_1.default.createHash('sha256').update(input).digest('hex');
}
function txKey(t) {
    const dateMs = (t === null || t === void 0 ? void 0 : t.date) ? new Date(t.date).getTime() : 0;
    const parts = [
        String((t === null || t === void 0 ? void 0 : t.type) || ''),
        String(Number((t === null || t === void 0 ? void 0 : t.amount) || 0)),
        String(dateMs),
        String((t === null || t === void 0 ? void 0 : t.referenceNumber) || ''),
        String((t === null || t === void 0 ? void 0 : t.recipientId) || ''),
        String((t === null || t === void 0 ? void 0 : t.category) || '')
    ];
    return `tx:${sha256Hex(parts.join('|'))}`;
}
function payoutKey(p) {
    const dateMs = (p === null || p === void 0 ? void 0 : p.date) ? new Date(p.date).getTime() : 0;
    const parts = [
        String(Number((p === null || p === void 0 ? void 0 : p.amount) || 0)),
        String(dateMs),
        String((p === null || p === void 0 ? void 0 : p.referenceNumber) || ''),
        String((p === null || p === void 0 ? void 0 : p.recipientId) || ''),
        String((p === null || p === void 0 ? void 0 : p.recipientName) || '')
    ];
    return `payout:${sha256Hex(parts.join('|'))}`;
}
function parseArgs(argv) {
    const args = argv.slice(2);
    let companyId;
    let limit;
    for (const a of args) {
        if (a.startsWith('--company-id='))
            companyId = a.split('=')[1];
        else if (a.startsWith('--limit='))
            limit = Number(a.split('=')[1] || 0) || undefined;
        else if (!a.startsWith('--') && !companyId)
            companyId = a;
    }
    return { companyId, limit };
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const { companyId, limit } = parseArgs(process.argv);
        console.log(`[backfillIdempotencyKeys] Starting backfill for companyId=${companyId || '(all)'} limit=${limit || 'none'}`);
        const started = Date.now();
        try {
            yield (0, database_1.connectDatabase)();
            // Resolve property-like ids when companyId provided
            let filter = {};
            if (companyId) {
                const [props, devs] = yield Promise.all([
                    Property_1.Property.find({ companyId }).select('_id').lean(),
                    Development_1.Development.find({ companyId }).select('_id').lean()
                ]);
                const devIds = devs.map((d) => d._id);
                let unitIds = [];
                try {
                    unitIds = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: devIds } }).distinct('_id');
                }
                catch (_d) { }
                const ids = [...props.map(p => p._id), ...devIds, ...unitIds];
                filter.propertyId = { $in: ids };
            }
            const cursor = PropertyAccount_1.default.find(filter).cursor();
            let examined = 0;
            let updatedDocs = 0;
            try {
                for (var _e = true, _f = __asyncValues(cursor), _g; _g = yield _f.next(), _a = _g.done, !_a; _e = true) {
                    _c = _g.value;
                    _e = false;
                    const doc = _c;
                    examined++;
                    let changed = false;
                    // Backfill transactions
                    if (Array.isArray(doc.transactions)) {
                        for (const t of doc.transactions) {
                            if (!t.idempotencyKey || typeof t.idempotencyKey !== 'string' || t.idempotencyKey.trim() === '') {
                                if (t.paymentId) {
                                    t.idempotencyKey = `payment:${String(t.paymentId)}`;
                                }
                                else {
                                    t.idempotencyKey = txKey(t);
                                }
                                changed = true;
                            }
                        }
                    }
                    // Backfill payouts
                    if (Array.isArray(doc.ownerPayouts)) {
                        for (const p of doc.ownerPayouts) {
                            if (!p.idempotencyKey || typeof p.idempotencyKey !== 'string' || p.idempotencyKey.trim() === '') {
                                p.idempotencyKey = payoutKey(p);
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        try {
                            yield doc.save();
                            updatedDocs++;
                        }
                        catch (e) {
                            console.warn(`[backfillIdempotencyKeys] Save failed for account ${String(doc._id)}:`, (e === null || e === void 0 ? void 0 : e.message) || e);
                        }
                    }
                    if (limit && updatedDocs >= limit)
                        break;
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_1) throw e_1.error; }
            }
            console.log(`[backfillIdempotencyKeys] Examined: ${examined}, Updated: ${updatedDocs}, Duration: ${Date.now() - started}ms`);
            process.exit(0);
        }
        catch (e) {
            console.error('[backfillIdempotencyKeys] Failed:', (e === null || e === void 0 ? void 0 : e.message) || e);
            process.exit(1);
        }
        finally {
            try {
                yield (0, database_1.closeDatabase)();
            }
            catch (_h) { }
        }
    });
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
