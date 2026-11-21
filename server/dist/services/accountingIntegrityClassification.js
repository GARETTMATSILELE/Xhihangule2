"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptExplainedByCommissionSnapshot = receiptExplainedByCommissionSnapshot;
exports.legitimateZeroOwnerIncome = legitimateZeroOwnerIncome;
exports.commissionRateDisagrees = commissionRateDisagrees;
exports.classifyAccountingIntegrityRow = classifyAccountingIntegrityRow;
const money_1 = require("../utils/money");
const MONEY_TOLERANCE = 0.05;
function receiptExplainedByCommissionSnapshot(payment) {
    var _a, _b, _c, _d;
    const details = payment === null || payment === void 0 ? void 0 : payment.commissionDetails;
    if (!details || typeof details !== 'object')
        return false;
    const amount = (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0));
    if (amount <= 0)
        return false;
    const owner = (0, money_1.roundMoney)(Number(details.ownerAmount || 0));
    const commission = (0, money_1.roundMoney)(Number(details.totalCommission != null
        ? details.totalCommission
        : Number(details.agentShare || 0) + Number(details.agencyShare || 0) + Number(details.preaFee || 0)));
    const vat = (0, money_1.roundMoney)(Number((_b = (_a = details.vatOnCommission) !== null && _a !== void 0 ? _a : details.vatAmount) !== null && _b !== void 0 ? _b : 0));
    const treatment = String(details.vatTreatment || '').toLowerCase();
    const vatOutside = treatment === 'inclusive' ? 0 : vat;
    const levy = (0, money_1.roundMoney)(Number((_d = (_c = details.levy) !== null && _c !== void 0 ? _c : payment === null || payment === void 0 ? void 0 : payment.levyAllocated) !== null && _d !== void 0 ? _d : 0));
    const explained = (0, money_1.roundMoney)(owner + commission + vatOutside);
    return Math.abs(explained - amount) <= MONEY_TOLERANCE
        || Math.abs((0, money_1.roundMoney)(explained + levy) - amount) <= MONEY_TOLERANCE;
}
function legitimateZeroOwnerIncome(payment) {
    var _a;
    const amount = (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0));
    const owner = (0, money_1.roundMoney)(Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0));
    return amount > 0 && owner <= 0 && receiptExplainedByCommissionSnapshot(payment);
}
function commissionRateDisagrees(payment, propertyCommission) {
    var _a, _b, _c;
    const snapshotRate = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.commissionPercentage) !== null && _b !== void 0 ? _b : (_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.commissionRate;
    if (snapshotRate == null || propertyCommission == null || propertyCommission === '')
        return false;
    const stored = Number(propertyCommission);
    const snapshot = Number(snapshotRate);
    if (!Number.isFinite(stored) || !Number.isFinite(snapshot))
        return false;
    return Math.abs(stored - snapshot) > 0.01;
}
function classifyAccountingIntegrityRow(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const payment = input.payment || {};
    const component = String(input.component || '');
    const text = `${component} ${input.issue || ''} ${input.missingRecord || ''}`.toLowerCase();
    const presence = input.presence || null;
    const reference = String(payment.referenceNumber || payment._id || 'this receipt');
    const period = payment.rentalPeriodYear || payment.rentalPeriodMonth
        ? `${payment.rentalPeriodYear || '?'}-${payment.rentalPeriodMonth || '?'}`
        : 'unspecified';
    const zeroOwner = legitimateZeroOwnerIncome(payment);
    const rateDisagrees = commissionRateDisagrees(payment, input.propertyCommission);
    const rentalType = String(input.rentalType || ((_a = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _a === void 0 ? void 0 : _a.rentalType) || (payment === null || payment === void 0 ? void 0 : payment.rentalType) || '').toLowerCase();
    const confirmedIntroduction = rentalType === 'introduction' && !rateDisagrees && zeroOwner;
    const confirmedText = confirmedIntroduction
        ? `Commercial arrangement: confirmed. Commission rate ${Number((_c = (_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionPercentage) !== null && _c !== void 0 ? _c : (_d = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _d === void 0 ? void 0 : _d.commissionRate)}%. Commission ${(0, money_1.roundMoney)(Number(((_e = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _e === void 0 ? void 0 : _e.totalCommission) || 0)).toFixed(2)}. Owner income is not applicable (0.00). Agent commission ${(0, money_1.roundMoney)(Number(((_f = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _f === void 0 ? void 0 : _f.agentShare) || 0)).toFixed(2)}. Company commission ${(0, money_1.roundMoney)(Number(((_g = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _g === void 0 ? void 0 : _g.agencyShare) || 0)).toFixed(2)}.`
        : '';
    const ownerExpected = (0, money_1.roundMoney)(Number(((_h = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _h === void 0 ? void 0 : _h.ownerAmount) || 0)) > 0;
    const agentExpected = (0, money_1.roundMoney)(Number(((_j = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _j === void 0 ? void 0 : _j.agentShare) || 0)) > 0;
    const companyExpected = (0, money_1.roundMoney)(Number(((_k = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _k === void 0 ? void 0 : _k.agencyShare) || 0)) > 0;
    const ownerPosted = Boolean(presence === null || presence === void 0 ? void 0 : presence.ownerIncome);
    const agentPosted = Boolean(presence === null || presence === void 0 ? void 0 : presence.agentCommission);
    const companyPosted = Boolean(presence === null || presence === void 0 ? void 0 : presence.companyCommission);
    const journalPosted = Boolean(presence === null || presence === void 0 ? void 0 : presence.journal);
    const ownerMissing = ownerExpected && presence != null && !ownerPosted;
    const agentMissing = agentExpected && presence != null && !agentPosted;
    const companyMissing = companyExpected && presence != null && !companyPosted;
    const journalMissing = presence != null && !journalPosted && (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0)) > 0;
    const projectionsMissing = ownerMissing || agentMissing || companyMissing;
    let ownerIncomeDisposition = 'POSTED';
    if (rateDisagrees && (0, money_1.roundMoney)(Number(((_l = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _l === void 0 ? void 0 : _l.ownerAmount) || 0)) <= 0) {
        ownerIncomeDisposition = 'INCORRECT';
    }
    else if (zeroOwner) {
        ownerIncomeDisposition = 'NOT_APPLICABLE';
    }
    else if (ownerMissing || (ownerExpected && presence == null && text.includes('owner'))) {
        ownerIncomeDisposition = 'MISSING';
    }
    else if (!ownerExpected) {
        ownerIncomeDisposition = zeroOwner ? 'NOT_APPLICABLE' : 'MISSING';
    }
    const artifactNowPresent = presence != null && (((component === 'MISSING_JOURNAL' || component === 'HISTORICAL_JOURNAL_GAP') && journalPosted)
        || ((component === 'OWNER_INCOME_PROJECTION_MISSING' || component === 'ownerIncome') && ownerPosted));
    if (artifactNowPresent && !projectionsMissing && !journalMissing && !rateDisagrees) {
        return {
            classification: 'STALE EXCEPTION',
            explanation: `Payment ${reference} now has the accounting record this exception was opened for. The stored exception is waiting for the next detection cycle. No historical amount was rewritten.`,
            ownerIncomeDisposition
        };
    }
    if (text.includes('vat_configuration') || text.includes('vat configuration') || component === 'VAT_CONFIGURATION_INCOMPLETE' || text.includes('vat_category') || text.includes('vat_treatment')) {
        return {
            classification: 'VAT CONFIGURATION REVIEW',
            explanation: `VAT was not applied to ${reference}. Company VAT registration, category, or the property VAT treatment is incomplete. No VAT record or tax obligation is created until that configuration is complete.`,
            ownerIncomeDisposition
        };
    }
    if (component === 'MISSING_TAX_OBLIGATION' || text.includes('tax obligation') || text.includes('vat obligation')) {
        const vat = (0, money_1.roundMoney)(Number((_q = (_o = (_m = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _m === void 0 ? void 0 : _m.vatOnCommission) !== null && _o !== void 0 ? _o : (_p = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _p === void 0 ? void 0 : _p.vatAmount) !== null && _q !== void 0 ? _q : 0));
        return {
            classification: 'VAT OBLIGATION MISSING',
            explanation: `Payment ${reference} deducted VAT of ${vat.toFixed(2)} but has no matching tax obligation. The historical obligation is not created by this check.`,
            ownerIncomeDisposition
        };
    }
    if (journalMissing && projectionsMissing) {
        const gaps = [
            `Rental receipt exists (${reference}, period ${period}).`,
            ownerMissing ? 'Owner income posting missing.' : (zeroOwner ? 'Owner income is not applicable under the stored snapshot.' : ''),
            agentMissing ? 'Agent commission posting missing.' : '',
            companyMissing ? 'Company commission posting missing.' : '',
            'Receipt journal missing.'
        ].filter(Boolean);
        return {
            classification: 'UNPOSTED RENTAL',
            explanation: gaps.join(' '),
            ownerIncomeDisposition: ownerMissing ? 'MISSING' : ownerIncomeDisposition
        };
    }
    if (rateDisagrees) {
        return {
            classification: 'RATE REVIEW',
            explanation: `Payment ${reference} used commission ${Number((_s = (_r = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _r === void 0 ? void 0 : _r.commissionPercentage) !== null && _s !== void 0 ? _s : (_t = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _t === void 0 ? void 0 : _t.commissionRate)}% but the property is configured at ${Number(input.propertyCommission)}%. The stored snapshot is not rewritten.`,
            ownerIncomeDisposition: 'INCORRECT'
        };
    }
    if (journalMissing && !projectionsMissing) {
        const tracked = payment.accountingComplete != null || Boolean(payment.accountingStatus);
        return Object.assign({ classification: tracked && payment.accountingComplete === false ? 'INCOMPLETE' : 'HISTORICAL JOURNAL GAP', explanation: confirmedIntroduction
                ? `${confirmedText} The receipt journal is still missing and is reported independently. This receipt is not accounting-complete while that journal is absent.`
                : zeroOwner
                    ? `Receipt ${reference} has a calculated owner income of 0.00 because the stored introduction commission consumes the receipt. Commission ${(0, money_1.roundMoney)(Number(((_u = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _u === void 0 ? void 0 : _u.totalCommission) || 0)).toFixed(2)}, agent ${(0, money_1.roundMoney)(Number(((_v = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _v === void 0 ? void 0 : _v.agentShare) || 0)).toFixed(2)}, company ${(0, money_1.roundMoney)(Number(((_w = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _w === void 0 ? void 0 : _w.agencyShare) || 0)).toFixed(2)}. Owner income is not applicable. The receipt journal is still missing and is not reconstructed.`
                    : `Receipt ${reference} has its expected subledgers and is missing only the receipt journal. This is a historical journal gap, not a current posting of that journal.`, ownerIncomeDisposition }, (confirmedIntroduction ? { commercialArrangement: 'confirmed' } : {}));
    }
    if (zeroOwner && !journalMissing) {
        const agent = (0, money_1.roundMoney)(Number(((_x = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _x === void 0 ? void 0 : _x.agentShare) || 0));
        const company = (0, money_1.roundMoney)(Number(((_y = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _y === void 0 ? void 0 : _y.agencyShare) || 0));
        const commission = (0, money_1.roundMoney)(Number(((_z = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _z === void 0 ? void 0 : _z.totalCommission) || 0));
        return Object.assign({ classification: 'ZERO OWNER INCOME', explanation: confirmedIntroduction
                ? `${confirmedText} ${journalPosted ? 'The receipt journal is present.' : 'A missing journal is reported separately.'}`
                : `Owner income is not applicable. The stored snapshot calculates owner income 0.00 from commission ${commission.toFixed(2)} (agent ${agent.toFixed(2)}, company ${company.toFixed(2)}). ${journalPosted ? 'The receipt journal is present.' : 'A missing journal is reported separately.'}`, ownerIncomeDisposition: 'NOT_APPLICABLE' }, (confirmedIntroduction ? { commercialArrangement: 'confirmed' } : {}));
    }
    if (String(input.status || '').toUpperCase() === 'VALID' || String(input.status || '').toUpperCase() === 'COMPLETE') {
        return {
            classification: 'COMPLETE',
            explanation: `Payment ${reference} has the required accounting records.`,
            ownerIncomeDisposition
        };
    }
    return {
        classification: 'INCOMPLETE',
        explanation: input.issue || `Payment ${reference} is missing a required accounting posting.`,
        ownerIncomeDisposition
    };
}
