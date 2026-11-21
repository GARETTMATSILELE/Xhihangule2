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
exports.listTaxPayments = exports.getComplianceMigrationReport = exports.runCompanyTaxIntegrity = exports.resolveTaxReview = exports.listTaxReviews = exports.patchVatReturn = exports.listCompanyVatReturns = exports.prepareCompanyVatReturn = exports.uploadZimraPaymentReceipt = exports.postZimraPayment = exports.getTaxReconciliation = exports.listTaxObligations = exports.getTaxPosition = exports.getTaxComplianceDashboard = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxObligation_1 = require("../models/TaxObligation");
const TaxPayment_1 = require("../models/TaxPayment");
const TaxReviewItem_1 = require("../models/TaxReviewItem");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const vatReturnService_1 = require("../services/vatReturnService");
const zimraPaymentService_1 = require("../services/zimraPaymentService");
const taxComplianceReviewService_1 = require("../services/taxComplianceReviewService");
const taxIntegrityService_1 = require("../services/taxIntegrityService");
const taxRateService_1 = require("../services/taxRateService");
const taxObligationService_1 = require("../services/taxObligationService");
const taxTypes_1 = require("../services/tax/taxTypes");
const chartAccounts_1 = require("../services/tax/chartAccounts");
const money_1 = require("../utils/money");
const errorHandler_1 = require("../middleware/errorHandler");
const trustReconciliation_1 = require("../services/tax/trustReconciliation");
const taxDashboardRead_1 = require("../services/tax/taxDashboardRead");
const taxDashboard_1 = require("../services/tax/taxDashboard");
const companyIdOf = (req) => {
    var _a;
    const id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
    if (!id)
        throw new errorHandler_1.AppError('Company ID required', 400);
    return String(id);
};
function loadLinkedProperties(companyId, links) {
    return __awaiter(this, void 0, void 0, function* () {
        const paymentIds = links.map((link) => link.paymentId).filter(Boolean);
        const payments = paymentIds.length
            ? yield Payment_1.Payment.find({ companyId, _id: { $in: paymentIds } }).select('referenceNumber propertyId').lean()
            : [];
        const paymentById = new Map(payments.map((row) => [String(row._id), row]));
        const propertyIds = Array.from(new Set(links.map((link) => {
            const payment = link.paymentId ? paymentById.get(String(link.paymentId)) : undefined;
            return (0, taxDashboard_1.resolveLinkedPropertyId)({
                obligationPropertyId: link.propertyId ? String(link.propertyId) : null,
                paymentPropertyId: (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : null
            });
        }).filter((id) => Boolean(id))));
        const properties = propertyIds.length
            ? yield Property_1.Property.find({ companyId, _id: { $in: propertyIds } }).select('name address').lean()
            : [];
        const propertyById = new Map(properties.map((row) => [String(row._id), row]));
        const viewFor = (link) => {
            const payment = link.paymentId ? paymentById.get(String(link.paymentId)) : undefined;
            const propertyId = (0, taxDashboard_1.resolveLinkedPropertyId)({
                obligationPropertyId: link.propertyId ? String(link.propertyId) : null,
                paymentPropertyId: (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : null
            });
            const property = propertyId ? propertyById.get(propertyId) : undefined;
            return Object.assign({ propertyId,
                payment }, (0, taxDashboard_1.presentObligationProperty)({
                propertyId,
                propertyName: (property === null || property === void 0 ? void 0 : property.name) || null,
                propertyAddress: (0, taxDashboard_1.formatPropertyAddress)(property === null || property === void 0 ? void 0 : property.address)
            }));
        };
        return { viewFor };
    });
}
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.getTaxComplianceDashboard = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const companyId = companyIdOf(req);
    const rows = yield TaxObligation_1.TaxObligation.find({ companyId, status: { $ne: 'REVERSED' } }).lean();
    const byType = {};
    for (const row of rows) {
        const key = row.taxType;
        if (!byType[key])
            byType[key] = { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
        byType[key].calculated = (0, money_1.roundMoney)(byType[key].calculated + Number(row.taxAmount || 0));
        if (row.status === 'WITHHELD')
            byType[key].withheld = (0, money_1.roundMoney)(byType[key].withheld + Number(row.taxAmount || 0));
        if (row.status === 'PAID' || row.status === 'RECONCILED') {
            byType[key].paid = (0, money_1.roundMoney)(byType[key].paid + Number(row.taxAmount || 0));
        }
        else if (row.status !== 'ACCOUNTANT_REVIEW') {
            byType[key].payable = (0, money_1.roundMoney)(byType[key].payable + Number(row.taxAmount || 0));
            const outstanding = yield (0, taxObligationService_1.outstandingForObligation)(String(row._id));
            byType[key].outstanding = (0, money_1.roundMoney)(byType[key].outstanding + outstanding);
        }
    }
    const openReviews = yield TaxReviewItem_1.TaxReviewItem.countDocuments({ companyId, status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] } });
    const vat = byType.VAT_ON_COMMISSION || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
    const output = byType.VAT_OUTPUT || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
    const cgt = byType.CAPITAL_GAINS_TAX || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
    const cgwt = byType.CAPITAL_GAINS_WITHHOLDING_TAX || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
    const glRows = yield ChartOfAccount_1.ChartOfAccount.find({
        companyId,
        code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE] },
        isDeleted: { $ne: true }
    }).select('code name balance').lean();
    const glBalance = (code) => { var _a; return (0, money_1.roundMoney)(Number(((_a = glRows.find((r) => r.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
    const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
        trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
        ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
        sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
        zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
        tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
        levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
    });
    const trustBank = trust.trustBank;
    const clientLedgers = trust.clientLiabilities;
    const trustDifference = trust.difference;
    const vatRateReview = yield (0, taxRateService_1.detectVatRateReview)(companyId);
    const fiscal = yield (0, taxIntegrityService_1.fiscalisationSummary)(companyId);
    const vatUnpaidPeriods = yield TaxObligation_1.TaxObligation.distinct('taxPeriod', {
        companyId,
        taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
        status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
    });
    const cgtReviews = yield TaxReviewItem_1.TaxReviewItem.countDocuments({
        companyId,
        kind: { $in: ['CGT_MISSING_ACQUISITION_COST', 'CGT_RATE_NOT_CONFIGURED', 'LEGACY_CGT_ON_GROSS_SALE_PRICE', 'CGT_SETTLEMENT_REVIEW_REQUIRED', 'LEGACY_CGT_CALCULATION'] },
        status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
    });
    const cgwtReviews = yield TaxReviewItem_1.TaxReviewItem.countDocuments({
        companyId,
        kind: { $in: ['CGWT_MISSING', 'CGWT_RATE_NOT_CONFIGURED', 'CGWT_RATE_MISSING', 'CGWT_APPLICABILITY_UNDECIDED'] },
        status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
    });
    const categories = {
        VAT: {
            periodsRequireReview: vatRateReview ? 1 : 0,
            periodsUnpaid: vatUnpaidPeriods.length,
            outstanding: (0, money_1.roundMoney)(vat.outstanding + output.outstanding)
        },
        CGT: {
            historicalCalculationsRequireReview: cgtReviews,
            outstanding: cgt.outstanding
        },
        CGWT: {
            missingApplicability: cgwtReviews,
            outstanding: cgwt.outstanding
        },
        TRUST: {
            reconciliationDifferences: Math.abs(trustDifference) > 0.005 ? 1 : 0,
            scope: 'PARTIAL'
        },
        FISCALISATION: {
            invoicesNotFiscalised: fiscal.notFiscalised
        },
        HISTORICAL_DATA: {
            openReviews
        }
    };
    const allClear = categories.VAT.periodsUnpaid === 0 &&
        categories.VAT.periodsRequireReview === 0 &&
        categories.CGT.historicalCalculationsRequireReview === 0 &&
        categories.CGWT.missingApplicability === 0 &&
        categories.TRUST.reconciliationDifferences === 0 &&
        openReviews === 0;
    return res.json({
        status: 'success',
        data: {
            vatPayable: (0, money_1.roundMoney)(vat.outstanding + output.outstanding),
            vatPaid: (0, money_1.roundMoney)(vat.paid + output.paid),
            vatOutstanding: (0, money_1.roundMoney)(vat.outstanding + output.outstanding),
            cgtCalculated: cgt.calculated,
            cgtOutstanding: cgt.outstanding,
            cgwtWithheld: cgwt.withheld || cgwt.calculated,
            cgwtRemitted: cgwt.paid,
            cgwtOutstanding: cgwt.outstanding,
            trustTaxOutstanding: (0, money_1.roundMoney)(cgwt.outstanding + (((_a = byType.VAT_OUTPUT) === null || _a === void 0 ? void 0 : _a.outstanding) || 0)),
            openReviews,
            byType,
            categories,
            allClear,
            complianceLabel: allClear ? 'Controls passed' : 'Attention required',
            vatRateReview,
            modes: taxTypes_1.TAX_TYPE_MODE,
            labels: taxTypes_1.TAX_TYPE_LABEL,
            paye: { status: 'EXTERNAL', note: 'PAYE is not calculated in this application.' },
            corporateTax: { status: 'EXTERNAL', note: 'Corporate income tax is not calculated in this application.' },
            companyAccountVsGl: (0, taxIntegrityService_1.companyAccountVsGlNote)(),
            trust: {
                trustBank,
                ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
                sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
                zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
                tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
                levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE),
                clientLedgers,
                difference: trustDifference,
                status: trust.status,
                scope: 'PARTIAL',
                includedLedgers: trust.includedLedgers,
                excludedClientMoney: trust.excludedClientMoney,
                categories: trust.categories,
                note: trust.note
            }
        }
    });
}));
exports.getTaxPosition = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const asOfRaw = req.query.asOf ? String(req.query.asOf) : '';
    let asOf;
    if (asOfRaw) {
        asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
            ? new Date(`${asOfRaw}T23:59:59.999Z`)
            : new Date(asOfRaw);
        if (Number.isNaN(asOf.getTime())) {
            return res.status(400).json({ message: 'asOf must be a valid date' });
        }
    }
    const taxPeriod = req.query.taxPeriod ? String(req.query.taxPeriod).trim() : '';
    if (taxPeriod && (taxPeriod.length > 32 || /[^\w-]/.test(taxPeriod))) {
        return res.status(400).json({ message: 'taxPeriod is not a valid filing period' });
    }
    const data = yield (0, taxDashboardRead_1.loadTaxPositionResponse)(companyIdOf(req), asOf, taxPeriod || undefined);
    return res.json({ status: 'success', data });
}));
exports.listTaxObligations = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const companyId = companyIdOf(req);
    const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
    const taxType = req.query.taxType ? String(req.query.taxType) : undefined;
    const period = req.query.period ? String(req.query.period) : undefined;
    const rows = yield TaxObligation_1.TaxObligation.find(Object.assign(Object.assign({ companyId }, (taxType ? { taxType } : {})), (period ? { taxPeriod: period } : {})))
        .sort({ transactionDate: -1 })
        .limit(500)
        .lean();
    const obligationIds = rows.map((row) => row._id);
    const [paidRows, linked] = yield Promise.all([
        obligationIds.length
            ? TaxPayment_1.TaxPayment.aggregate([
                { $match: { companyId: companyObjectId, status: 'POSTED', 'allocations.taxObligationId': { $in: obligationIds } } },
                { $unwind: '$allocations' },
                { $match: { 'allocations.taxObligationId': { $in: obligationIds } } },
                { $group: { _id: '$allocations.taxObligationId', total: { $sum: '$allocations.amount' } } }
            ])
            : [],
        loadLinkedProperties(companyId, rows)
    ]);
    const paidById = new Map(paidRows.map((row) => [String(row._id), Number(row.total || 0)]));
    const withOutstanding = rows.map((row) => {
        var _a;
        const propertyView = linked.viewFor(row);
        const amounts = (0, taxDashboard_1.presentObligationAmounts)({
            taxType: String(row.taxType),
            taxAmount: Number(row.taxAmount || 0),
            status: String(row.status || ''),
            reversalOf: row.reversalOf ? String(row.reversalOf) : null,
            allocatedPaid: paidById.get(String(row._id)) || 0
        });
        return Object.assign(Object.assign({}, row), { propertyId: propertyView.propertyId || row.propertyId || null, outstanding: amounts.outstanding, amountPaid: amounts.amountPaid, paymentStatus: amounts.paymentStatus, categoryKey: amounts.categoryKey, categoryLabel: amounts.categoryLabel, label: taxTypes_1.TAX_TYPE_LABEL[row.taxType] || row.taxType, propertyName: propertyView.propertyAvailable ? propertyView.propertyLabel : null, propertyAddress: propertyView.propertyAddress || null, propertyAvailable: propertyView.propertyAvailable, propertyLabel: propertyView.propertyLabel, sourcePaymentReference: ((_a = propertyView.payment) === null || _a === void 0 ? void 0 : _a.referenceNumber) || row.paymentReference || null });
    });
    return res.json({ status: 'success', data: withOutstanding });
}));
exports.getTaxReconciliation = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const companyId = companyIdOf(req);
    const period = String(req.query.period || '');
    const match = { companyId, status: { $ne: 'REVERSED' } };
    if (period)
        match.taxPeriod = period;
    const rows = yield TaxObligation_1.TaxObligation.find(match).lean();
    const grouped = {};
    for (const row of rows) {
        const p = row.taxPeriod;
        const t = row.taxType;
        if (!grouped[p])
            grouped[p] = {};
        if (!grouped[p][t])
            grouped[p][t] = { calculated: 0, withheld: 0, payable: 0, submitted: 0, paid: 0, outstanding: 0 };
        grouped[p][t].calculated = (0, money_1.roundMoney)(grouped[p][t].calculated + Number(row.taxAmount || 0));
        if (row.status === 'WITHHELD')
            grouped[p][t].withheld += Number(row.taxAmount || 0);
        if (row.status === 'RETURN_SUBMITTED')
            grouped[p][t].submitted += Number(row.taxAmount || 0);
        if (row.status === 'PAID' || row.status === 'RECONCILED')
            grouped[p][t].paid += Number(row.taxAmount || 0);
        grouped[p][t].outstanding = yield (0, taxObligationService_1.outstandingForObligation)(String(row._id)).then((n) => (0, money_1.roundMoney)(grouped[p][t].outstanding + n));
    }
    return res.json({ status: 'success', data: grouped });
}));
exports.postZimraPayment = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const companyId = companyIdOf(req);
    const createdBy = String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || '');
    const result = yield (0, zimraPaymentService_1.recordZimraPayment)({
        companyId,
        createdBy,
        amount: Number(((_b = req.body) === null || _b === void 0 ? void 0 : _b.amount) || 0),
        paymentDate: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.paymentDate) ? new Date(req.body.paymentDate) : new Date(),
        bankAccountCode: (_d = req.body) === null || _d === void 0 ? void 0 : _d.bankAccountCode,
        zimraReference: (_e = req.body) === null || _e === void 0 ? void 0 : _e.zimraReference,
        paymentReference: (_f = req.body) === null || _f === void 0 ? void 0 : _f.paymentReference,
        notes: (_g = req.body) === null || _g === void 0 ? void 0 : _g.notes,
        allocations: Array.isArray((_h = req.body) === null || _h === void 0 ? void 0 : _h.allocations) ? req.body.allocations : [],
        unallocatedAmount: ((_j = req.body) === null || _j === void 0 ? void 0 : _j.unallocatedAmount) != null ? Number(req.body.unallocatedAmount) : undefined,
        unallocatedReason: (_k = req.body) === null || _k === void 0 ? void 0 : _k.unallocatedReason
    });
    return res.status(201).json({ status: 'success', data: result });
}));
exports.uploadZimraPaymentReceipt = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const companyId = companyIdOf(req);
    if (!req.file)
        return res.status(400).json({ message: 'No file uploaded' });
    yield (0, zimraPaymentService_1.attachTaxPaymentReceipt)({
        companyId,
        paymentId: String(req.params.paymentId),
        uploadedBy: String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || ''),
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        data: req.file.buffer
    });
    return res.json({ status: 'success' });
}));
exports.prepareCompanyVatReturn = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const companyId = companyIdOf(req);
    const filingPeriod = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.filingPeriod) || req.query.filingPeriod || '');
    const row = yield (0, vatReturnService_1.prepareVatReturn)(companyId, filingPeriod, (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId);
    return res.json({ status: 'success', data: row });
}));
exports.listCompanyVatReturns = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield (0, vatReturnService_1.listVatReturns)(companyIdOf(req));
    return res.json({ status: 'success', data: rows });
}));
exports.patchVatReturn = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const row = yield (0, vatReturnService_1.updateVatReturnStatus)({
        companyId: companyIdOf(req),
        filingPeriod: String(req.params.filingPeriod),
        status: (_a = req.body) === null || _a === void 0 ? void 0 : _a.status,
        zimraReturnReference: (_b = req.body) === null || _b === void 0 ? void 0 : _b.zimraReturnReference,
        paymentReference: (_c = req.body) === null || _c === void 0 ? void 0 : _c.paymentReference,
        paymentDate: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.paymentDate) ? new Date(req.body.paymentDate) : undefined,
        amountSubmitted: (_e = req.body) === null || _e === void 0 ? void 0 : _e.amountSubmitted,
        notes: (_f = req.body) === null || _f === void 0 ? void 0 : _f.notes,
        reviewedBy: (_g = req.user) === null || _g === void 0 ? void 0 : _g.userId
    });
    return res.json({ status: 'success', data: row });
}));
exports.listTaxReviews = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield TaxReviewItem_1.TaxReviewItem.find({
        companyId: companyIdOf(req),
        status: req.query.status
            ? String(req.query.status)
            : { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
    })
        .sort({ detectedAt: -1 })
        .limit(200)
        .lean();
    return res.json({ status: 'success', data: rows });
}));
exports.resolveTaxReview = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const row = yield TaxReviewItem_1.TaxReviewItem.findOne({ _id: req.params.id, companyId: companyIdOf(req) });
    if (!row)
        return res.status(404).json({ message: 'Review item not found' });
    const allowed = ['OPEN', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'CORRECTED_MANUALLY', 'NO_ACTION_REQUIRED', 'resolved', 'ignored'];
    const requested = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || 'ACKNOWLEDGED');
    if (!allowed.includes(requested)) {
        return res.status(400).json({ message: 'Invalid review status' });
    }
    if (!String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.resolution) || '').trim()) {
        return res.status(400).json({ message: 'A review note is required' });
    }
    row.status = requested;
    row.resolution = String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.resolution) || '');
    row.resolvedAt = new Date();
    row.resolvedBy = (_d = req.user) === null || _d === void 0 ? void 0 : _d.userId;
    yield row.save();
    return res.json({ status: 'success', data: row });
}));
exports.runCompanyTaxIntegrity = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const report = yield (0, taxIntegrityService_1.runTaxIntegrityChecks)(companyIdOf(req));
    return res.json({ status: 'success', data: report });
}));
exports.getComplianceMigrationReport = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const report = yield (0, taxComplianceReviewService_1.buildComplianceMigrationReport)(companyIdOf(req));
    return res.json({ status: 'success', data: report });
}));
exports.listTaxPayments = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const companyId = companyIdOf(req);
    const rows = yield TaxPayment_1.TaxPayment.find({ companyId })
        .select('-receiptData')
        .sort({ paymentDate: -1 })
        .limit(100)
        .lean();
    const obligationIds = rows.flatMap((row) => (row.allocations || []).map((allocation) => allocation.taxObligationId)).filter(Boolean);
    const obligations = obligationIds.length
        ? yield TaxObligation_1.TaxObligation.find({ companyId, _id: { $in: obligationIds } }).select('taxType taxPeriod propertyId paymentId').lean()
        : [];
    const linked = yield loadLinkedProperties(companyId, obligations);
    const obligationById = new Map(obligations.map((row) => [String(row._id), row]));
    const data = rows.map((row) => {
        const summary = (0, taxDashboard_1.summariseTaxPayment)({
            status: String(row.status || ''),
            amount: Number(row.amount || 0),
            unallocatedAmount: Number(row.unallocatedAmount || 0),
            allocations: (row.allocations || []).map((allocation) => ({
                amount: Number(allocation.amount || 0),
                taxType: allocation.taxType ? String(allocation.taxType) : undefined
            }))
        });
        const settledObligations = (row.allocations || []).map((allocation) => {
            const obligation = obligationById.get(String(allocation.taxObligationId));
            const propertyView = obligation
                ? linked.viewFor(obligation)
                : (0, taxDashboard_1.presentObligationProperty)({ propertyId: null, propertyName: null, propertyAddress: null });
            const taxType = String(allocation.taxType || (obligation === null || obligation === void 0 ? void 0 : obligation.taxType) || '');
            return {
                taxObligationId: String(allocation.taxObligationId),
                taxType,
                taxPeriod: allocation.taxPeriod || (obligation === null || obligation === void 0 ? void 0 : obligation.taxPeriod) || '',
                amount: Number(allocation.amount || 0),
                label: taxTypes_1.TAX_TYPE_LABEL[taxType] || taxType,
                propertyLabel: propertyView.propertyLabel,
                propertyAddress: propertyView.propertyAddress
            };
        });
        return Object.assign(Object.assign({}, row), { allocatedAmount: summary.allocatedAmount, unallocatedAmount: summary.unallocatedAmount, confirmedPaidAmount: summary.confirmedPaidAmount, categories: summary.categories, settledObligations });
    });
    return res.json({ status: 'success', data });
}));
