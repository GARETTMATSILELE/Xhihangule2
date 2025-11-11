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
exports.reconcileDuplicates = reconcileDuplicates;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const AgentAccount_1 = require("../models/AgentAccount");
function toObjectId(id) {
    try {
        return new mongoose_1.default.Types.ObjectId(id).toString();
    }
    catch (_a) {
        return String(id);
    }
}
function reconcileDuplicates() {
    return __awaiter(this, arguments, void 0, function* (dryRun = true) {
        const result = {
            payments: {
                duplicatesFound: 0,
                groupsAffected: 0,
                updates: []
            },
            agentCommissions: {
                duplicatesFound: 0,
                accountsAffected: 0,
                removals: []
            }
        };
        // 1) Payment reference duplicates per company
        const dupGroups = yield Payment_1.Payment.aggregate([
            {
                $match: {
                    referenceNumber: { $exists: true, $ne: '', $type: 'string' }
                }
            },
            {
                $group: {
                    _id: { companyId: '$companyId', referenceNumber: '$referenceNumber' },
                    count: { $sum: 1 },
                    ids: { $push: { _id: '$_id', createdAt: '$createdAt' } }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ]);
        for (const grp of dupGroups) {
            const companyId = toObjectId(grp._id.companyId);
            const referenceNumber = grp._id.referenceNumber;
            const ids = grp.ids || [];
            // keep earliest
            const sorted = [...ids].sort((a, b) => {
                const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return at - bt;
            });
            const keep = sorted[0];
            const dups = sorted.slice(1);
            result.payments.groupsAffected += 1;
            result.payments.duplicatesFound += dups.length;
            const updatedIds = [];
            if (!dryRun) {
                let idx = 1;
                for (const d of dups) {
                    const newRef = `${referenceNumber}-DUP-${idx++}`;
                    const update = yield Payment_1.Payment.updateOne({ _id: d._id }, { $set: { referenceNumber: newRef, notes: `Duplicate of ${referenceNumber}` } });
                    if (update.acknowledged) {
                        updatedIds.push(toObjectId(d._id));
                    }
                }
            }
            else {
                for (const d of dups) {
                    updatedIds.push(toObjectId(d._id));
                }
            }
            result.payments.updates.push({
                companyId,
                referenceNumber,
                keptId: toObjectId(keep._id),
                updatedIds
            });
        }
        // 2) Agent commission duplicates by reference within each AgentAccount
        const accounts = yield AgentAccount_1.AgentAccount.find({}).lean();
        for (const acct of accounts) {
            const txns = Array.isArray(acct.transactions) ? acct.transactions : [];
            const seen = new Map(); // ref -> txnId kept
            const duplicates = [];
            for (const t of txns) {
                if (t.type === 'commission' && t.reference && typeof t.reference === 'string' && t.reference.trim().length > 0) {
                    const ref = t.reference.trim();
                    const idStr = t._id ? toObjectId(t._id) : '';
                    if (!seen.has(ref)) {
                        seen.set(ref, idStr);
                    }
                    else {
                        duplicates.push({ keptId: seen.get(ref), removeId: idStr, reference: ref });
                    }
                }
            }
            if (duplicates.length === 0)
                continue;
            result.agentCommissions.accountsAffected += 1;
            result.agentCommissions.duplicatesFound += duplicates.length;
            const removedByRef = {};
            const keptByRef = {};
            for (const d of duplicates) {
                removedByRef[d.reference] = removedByRef[d.reference] || [];
                removedByRef[d.reference].push(d.removeId);
                keptByRef[d.reference] = d.keptId;
            }
            if (!dryRun) {
                // Remove duplicate transactions, keep first
                const toRemoveIds = duplicates.map(d => d.removeId).filter(Boolean);
                yield AgentAccount_1.AgentAccount.updateOne({ _id: acct._id }, { $pull: { transactions: { _id: { $in: toRemoveIds.map(id => new mongoose_1.default.Types.ObjectId(id)) } } } });
                // Recalculate totals
                const fresh = yield AgentAccount_1.AgentAccount.findById(acct._id);
                if (fresh) {
                    const tx = Array.isArray(fresh.transactions) ? fresh.transactions : [];
                    const totalCommissions = tx.filter(x => x.type === 'commission').reduce((s, x) => s + (x.amount || 0), 0);
                    const totalPayouts = tx.filter(x => x.type === 'payout').reduce((s, x) => s + (x.amount || 0), 0);
                    const totalPenalties = tx.filter(x => x.type === 'penalty').reduce((s, x) => s + (x.amount || 0), 0);
                    fresh.totalCommissions = totalCommissions;
                    fresh.totalPayouts = totalPayouts;
                    fresh.totalPenalties = totalPenalties;
                    fresh.runningBalance = totalCommissions - totalPayouts - totalPenalties;
                    const commissionDates = tx.filter(x => x.type === 'commission' && x.date).map(x => new Date(x.date).getTime());
                    if (commissionDates.length > 0) {
                        fresh.lastCommissionDate = new Date(Math.max(...commissionDates));
                    }
                    fresh.lastUpdated = new Date();
                    yield fresh.save();
                }
            }
            for (const ref of Object.keys(removedByRef)) {
                result.agentCommissions.removals.push({
                    agentId: toObjectId(acct.agentId),
                    reference: ref,
                    keptId: keptByRef[ref],
                    removedIds: removedByRef[ref]
                });
            }
        }
        return result;
    });
}
