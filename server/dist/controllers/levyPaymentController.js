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
exports.getLevyReceiptDownload = exports.getLevyPayoutAcknowledgement = exports.initiateLevyPayout = exports.getLevyReceiptPublic = exports.getLevyPayments = exports.createLevyPayment = void 0;
const LevyPayment_1 = require("../models/LevyPayment");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const Tenant_1 = require("../models/Tenant");
const Company_1 = require("../models/Company");
const createLevyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId)) {
            throw new errorHandler_1.AppError('User ID not found. Please ensure you are properly authenticated.', 400);
        }
        // Validate required fields
        const { propertyId, paymentDate, paymentMethod, amount, currency = 'USD' } = req.body;
        // Optional incoming period and advance fields (allow rentalPeriod* aliases for consistency)
        const incomingMonth = Number(req.body.levyPeriodMonth || req.body.rentalPeriodMonth);
        const incomingYear = Number(req.body.levyPeriodYear || req.body.rentalPeriodYear);
        const advanceMonthsPaid = Number(req.body.advanceMonthsPaid || 1);
        const incomingAdvanceStart = req.body.advancePeriodStart;
        const incomingAdvanceEnd = req.body.advancePeriodEnd;
        if (!propertyId) {
            throw new errorHandler_1.AppError('Property ID is required', 400);
        }
        if (!paymentDate) {
            throw new errorHandler_1.AppError('Payment date is required', 400);
        }
        if (!paymentMethod) {
            throw new errorHandler_1.AppError('Payment method is required', 400);
        }
        if (!amount || amount <= 0) {
            throw new errorHandler_1.AppError('Valid amount is required', 400);
        }
        const levyPaymentData = Object.assign(Object.assign({}, req.body), { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), processedBy: new mongoose_1.default.Types.ObjectId(req.user.userId), paymentType: 'levy', status: 'completed' // Set as completed for accountant dashboard payments
         });
        // Normalize and set levy period (month/year)
        // If explicitly provided, use those; otherwise derive from paymentDate
        try {
            const baseDate = paymentDate ? new Date(paymentDate) : new Date();
            if (Number.isFinite(incomingMonth) && incomingMonth >= 1 && incomingMonth <= 12) {
                levyPaymentData.levyPeriodMonth = incomingMonth;
            }
            else if (levyPaymentData.levyPeriodMonth == null) {
                levyPaymentData.levyPeriodMonth = baseDate.getMonth() + 1;
            }
            if (Number.isFinite(incomingYear) && incomingYear >= 1900 && incomingYear <= 2100) {
                levyPaymentData.levyPeriodYear = incomingYear;
            }
            else if (levyPaymentData.levyPeriodYear == null) {
                levyPaymentData.levyPeriodYear = baseDate.getFullYear();
            }
            // Advance coverage: if client indicates multiple months, set start/end
            if (advanceMonthsPaid > 1) {
                const sMonth = Number((incomingAdvanceStart === null || incomingAdvanceStart === void 0 ? void 0 : incomingAdvanceStart.month) || levyPaymentData.levyPeriodMonth);
                const sYear = Number((incomingAdvanceStart === null || incomingAdvanceStart === void 0 ? void 0 : incomingAdvanceStart.year) || levyPaymentData.levyPeriodYear);
                let eMonth;
                let eYear;
                try {
                    const start = new Date(sYear, sMonth - 1, 1);
                    const end = new Date(start);
                    end.setMonth(start.getMonth() + (advanceMonthsPaid - 1));
                    eMonth = end.getMonth() + 1;
                    eYear = end.getFullYear();
                }
                catch (_c) {
                    eMonth = sMonth;
                    eYear = sYear;
                }
                levyPaymentData.advanceMonthsPaid = advanceMonthsPaid;
                levyPaymentData.advancePeriodStart = { month: sMonth, year: sYear };
                levyPaymentData.advancePeriodEnd = { month: Number((incomingAdvanceEnd === null || incomingAdvanceEnd === void 0 ? void 0 : incomingAdvanceEnd.month) || eMonth), year: Number((incomingAdvanceEnd === null || incomingAdvanceEnd === void 0 ? void 0 : incomingAdvanceEnd.year) || eYear) };
            }
            else {
                levyPaymentData.advanceMonthsPaid = 1;
            }
        }
        catch (_d) { }
        const levyPayment = new LevyPayment_1.LevyPayment(levyPaymentData);
        yield levyPayment.save();
        // Populate the created levy payment for response
        const populatedLevyPayment = yield LevyPayment_1.LevyPayment.findById(levyPayment._id)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        res.status(201).json(populatedLevyPayment);
    }
    catch (error) {
        console.error('Error creating levy payment:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to create levy payment' });
    }
});
exports.createLevyPayment = createLevyPayment;
const getLevyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const levyPayments = yield LevyPayment_1.LevyPayment.find({ companyId })
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email')
            .sort({ paymentDate: -1 });
        res.status(200).json(levyPayments);
    }
    catch (error) {
        console.error('Error fetching levy payments:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
    }
});
exports.getLevyPayments = getLevyPayments;
// Public endpoint for getting a levy payment receipt (for printing)
const getLevyReceiptPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const query = { _id: id };
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        const levy = yield LevyPayment_1.LevyPayment.findOne(query)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        if (!levy) {
            return res.status(404).json({ status: 'error', message: 'Payment not found' });
        }
        // Resolve tenant name via active lease (fallback: any tenant linked by propertyId)
        let tenantName = '';
        try {
            const lease = yield Lease_1.Lease.findOne({ propertyId: levy.propertyId, status: 'active' })
                .populate('tenantId', 'firstName lastName');
            if (lease && lease.tenantId) {
                tenantName = `${lease.tenantId.firstName || ''} ${lease.tenantId.lastName || ''}`.trim();
            }
            else {
                const tenant = yield Tenant_1.Tenant.findOne({ propertyId: levy.propertyId }).select('firstName lastName');
                if (tenant)
                    tenantName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
            }
        }
        catch (_a) { }
        // Load company details for header/logo
        let company = null;
        try {
            if (levy.companyId) {
                company = yield Company_1.Company.findById(levy.companyId).select('name address phone email website registrationNumber tinNumber vatNumber logo description');
            }
        }
        catch (_b) { }
        const receipt = {
            receiptNumber: levy.referenceNumber || String(levy._id),
            paymentDate: levy.paymentDate,
            amount: levy.amount,
            currency: levy.currency || 'USD',
            paymentMethod: levy.paymentMethod,
            status: levy.status,
            property: levy.propertyId,
            tenantName,
            processedBy: levy.processedBy,
            notes: levy.notes,
            createdAt: levy.createdAt,
            type: 'levy',
            company: company ? {
                name: company.name,
                address: company.address,
                phone: company.phone,
                email: company.email,
                website: company.website,
                registrationNumber: company.registrationNumber,
                tinNumber: company.tinNumber,
                logo: company.logo
            } : undefined
        };
        res.json({ status: 'success', data: receipt });
    }
    catch (error) {
        console.error('Error fetching levy receipt:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch levy receipt' });
    }
});
exports.getLevyReceiptPublic = getLevyReceiptPublic;
const initiateLevyPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId)) {
            throw new errorHandler_1.AppError('Authentication and company required', 401);
        }
        const { id } = req.params;
        const { paidToName, paidToAccount, paidToContact, payoutDate, payoutMethod, payoutReference, notes } = req.body;
        const levy = yield LevyPayment_1.LevyPayment.findOne({ _id: id, companyId: req.user.companyId });
        if (!levy)
            throw new errorHandler_1.AppError('Levy payment not found', 404);
        const normalizedMethod = typeof payoutMethod === 'string'
            ? payoutMethod.trim().toLowerCase().replace(/\s+/g, '_')
            : undefined;
        const allowedMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque'];
        const methodToSave = normalizedMethod && allowedMethods.includes(normalizedMethod) ? normalizedMethod : undefined;
        levy.set('payout', Object.assign(Object.assign({}, (levy.get('payout') || {})), { paidOut: true, paidToName,
            paidToAccount,
            paidToContact, payoutDate: payoutDate ? new Date(payoutDate) : new Date(), payoutMethod: methodToSave, payoutReference,
            notes, processedBy: req.user.userId }));
        // Update top-level status to paid_out for easier filtering
        levy.set('status', 'paid_out');
        yield levy.save();
        const populated = yield LevyPayment_1.LevyPayment.findById(levy._id)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        res.json(populated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error initiating levy payout:', error);
        throw new errorHandler_1.AppError('Error initiating levy payout', 500);
    }
});
exports.initiateLevyPayout = initiateLevyPayout;
const getLevyPayoutAcknowledgement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        const levy = yield LevyPayment_1.LevyPayment.findOne(Object.assign({ _id: id }, (companyId ? { companyId } : {})))
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        if (!levy)
            throw new errorHandler_1.AppError('Levy payment not found', 404);
        const company = levy.companyId ? yield Company_1.Company.findById(levy.companyId).select('name address phone email logo') : null;
        const html = `<!DOCTYPE html>
      <html>
      <head><meta charset="utf-8" /><title>Levy Payout Acknowledgement - ${levy.referenceNumber || levy._id}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: Arial, sans-serif; color: #333; }
        .wrap { max-width: 720px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 18px; }
        .logo { max-width: 160px; max-height: 70px; object-fit: contain; display:block; margin:0 auto 8px; }
        .title { font-size: 22px; font-weight: bold; }
        .line { font-size: 12px; color: #555; }
        .section { margin-top: 16px; }
        .row { display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: 600; color:#666; min-width: 180px; }
        .value { text-align:right; }
        .ack { margin-top: 24px; padding-top: 16px; border-top: 2px solid #333; }
        .sig-line { margin-top: 32px; }
        .sig { border-top: 1px solid #333; display:inline-block; min-width: 260px; padding-top: 4px; text-align:center; }
        .note { margin-top: 12px; font-size: 12px; color: #666; }
        @media print { .no-print { display:none; } }
      </style></head>
      <body>
        <div class="wrap">
          <div class="header">
            ${(company === null || company === void 0 ? void 0 : company.logo) ? `<img class="logo" src="data:image/png;base64,${company.logo}" alt="Logo"/>` : ''}
            <div class="title">Levy Payout Acknowledgement</div>
            ${(company === null || company === void 0 ? void 0 : company.name) ? `<div class="line">${company.name}</div>` : ''}
            ${(company === null || company === void 0 ? void 0 : company.address) ? `<div class="line">${company.address}</div>` : ''}
            ${((company === null || company === void 0 ? void 0 : company.phone) || (company === null || company === void 0 ? void 0 : company.email)) ? `<div class="line">${company.phone || ''} ${company.phone && company.email ? ' | ' : ''} ${company.email || ''}</div>` : ''}
          </div>
          <div class="section">
            <div class="row"><div class="label">Payout Reference</div><div class="value">${((_b = levy.payout) === null || _b === void 0 ? void 0 : _b.payoutReference) || '-'}</div></div>
            <div class="row"><div class="label">Payout Date</div><div class="value">${((_c = levy.payout) === null || _c === void 0 ? void 0 : _c.payoutDate) ? new Date(levy.payout.payoutDate).toLocaleDateString() : new Date().toLocaleDateString()}</div></div>
            <div class="row"><div class="label">Property</div><div class="value">${((_d = levy.propertyId) === null || _d === void 0 ? void 0 : _d.name) || 'N/A'}</div></div>
            <div class="row"><div class="label">Amount</div><div class="value">${levy.currency || 'USD'} ${(levy.amount || 0).toFixed(2)}</div></div>
            <div class="row"><div class="label">Payment Method</div><div class="value">${((_e = levy.payout) === null || _e === void 0 ? void 0 : _e.payoutMethod) || '-'}</div></div>
          </div>
          <div class="section">
            <div class="row"><div class="label">Paid To (Association)</div><div class="value">${((_f = levy.payout) === null || _f === void 0 ? void 0 : _f.paidToName) || '-'}</div></div>
            ${((_g = levy.payout) === null || _g === void 0 ? void 0 : _g.paidToAccount) ? `<div class="row"><div class="label">Account</div><div class="value">${levy.payout.paidToAccount}</div></div>` : ''}
            ${((_h = levy.payout) === null || _h === void 0 ? void 0 : _h.paidToContact) ? `<div class="row"><div class="label">Contact</div><div class="value">${levy.payout.paidToContact}</div></div>` : ''}
          </div>
          ${((_j = levy.payout) === null || _j === void 0 ? void 0 : _j.notes) ? `<div class="section"><div class="label">Notes</div><div class="value">${levy.payout.notes}</div></div>` : ''}
          <div class="ack">
            <p>We acknowledge receipt of the above payout.</p>
            <div class="sig-line">
              <div class="sig">Payee Signature</div>
            </div>
            <div class="sig-line" style="margin-top: 24px;">
              <div class="sig">Printed Name & Date</div>
            </div>
          </div>
          <div class="no-print" style="text-align:center; margin-top:16px;">
            <button onclick="window.print()" style="padding:8px 16px; background:#1976d2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Print</button>
          </div>
        </div>
      </body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error generating payout acknowledgement:', error);
        throw new errorHandler_1.AppError('Failed to generate payout acknowledgement', 500);
    }
});
exports.getLevyPayoutAcknowledgement = getLevyPayoutAcknowledgement;
// Public: Download levy receipt as HTML (formatted for A4 print/PDF)
const getLevyReceiptDownload = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const query = { _id: id };
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        const levy = yield LevyPayment_1.LevyPayment.findOne(query)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        if (!levy) {
            return res.status(404).send('Levy payment not found');
        }
        // Resolve tenant name for display
        let tenantName = '';
        try {
            const lease = yield Lease_1.Lease.findOne({ propertyId: levy.propertyId, status: 'active' })
                .populate('tenantId', 'firstName lastName');
            if (lease && lease.tenantId) {
                tenantName = `${lease.tenantId.firstName || ''} ${lease.tenantId.lastName || ''}`.trim();
            }
            else {
                const tenant = yield Tenant_1.Tenant.findOne({ propertyId: levy.propertyId }).select('firstName lastName');
                if (tenant)
                    tenantName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
            }
        }
        catch (_d) { }
        // Load company details for header/logo
        let company = null;
        try {
            if (levy.companyId) {
                company = yield Company_1.Company.findById(levy.companyId).select('name address phone email website registrationNumber tinNumber vatNumber logo description');
            }
        }
        catch (_e) { }
        const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Levy Receipt - ${levy.referenceNumber || levy._id}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, sans-serif; color: #333; }
          .receipt { max-width: 700px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-logo { max-width: 180px; max-height: 80px; display: block; margin: 0 auto 8px auto; object-fit: contain; }
          .company-name { font-size: 22px; font-weight: bold; }
          .company-line { margin: 2px 0; font-size: 12px; color: #555; }
          .receipt-number { font-size: 16px; font-weight: bold; margin-top: 10px; }
          .amount { font-size: 26px; font-weight: bold; color: #2e7d32; text-align: center; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
          .details { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 6px; }
          .label { font-weight: bold; color: #666; min-width: 140px; }
          .value { color: #333; text-align: right; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            ${(company === null || company === void 0 ? void 0 : company.logo) ? `<img class=\"company-logo\" src=\"data:image/png;base64,${company.logo}\" alt=\"Company Logo\" />` : ''}
            <div class="company-name">${(company === null || company === void 0 ? void 0 : company.name) || 'Levy Payment Receipt'}</div>
            ${(company === null || company === void 0 ? void 0 : company.address) ? `<div class=\"company-line\">${company.address}</div>` : ''}
            ${((company === null || company === void 0 ? void 0 : company.phone) || (company === null || company === void 0 ? void 0 : company.email)) ? `<div class=\"company-line\">${company.phone ? 'Phone: ' + company.phone : ''}${(company.phone && company.email) ? ' | ' : ''}${company.email ? 'Email: ' + company.email : ''}</div>` : ''}
            ${(company === null || company === void 0 ? void 0 : company.website) ? `<div class=\"company-line\">Website: ${company.website}</div>` : ''}
            ${((company === null || company === void 0 ? void 0 : company.registrationNumber) || (company === null || company === void 0 ? void 0 : company.tinNumber)) ? `<div class=\"company-line\">${company.registrationNumber ? 'Reg. No: ' + company.registrationNumber : ''}${(company.registrationNumber && company.tinNumber) ? ' | ' : ''}${company.tinNumber ? 'Tax No: ' + company.tinNumber : ''}</div>` : ''}
            <div class="receipt-number">Receipt #${levy.referenceNumber || levy._id}</div>
          </div>
          <div class="amount">${(levy.currency || 'USD')} ${(levy.amount || 0).toFixed(2)}</div>
          <div class="details">
            <div class="row"><div class="label">Date:</div><div class="value">${new Date(levy.paymentDate).toLocaleDateString()}</div></div>
            <div class="row"><div class="label">Method:</div><div class="value">${String(levy.paymentMethod).replace('_', ' ').toUpperCase()}</div></div>
            <div class="row"><div class="label">Status:</div><div class="value">${String(levy.status).toUpperCase()}</div></div>
            <div class="row"><div class="label">Property:</div><div class="value">${((_a = levy.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'N/A'}</div></div>
            <div class="row"><div class="label">Tenant:</div><div class="value">${tenantName || 'N/A'}</div></div>
            <div class="row"><div class="label">Processed By:</div><div class="value">${(((_b = levy.processedBy) === null || _b === void 0 ? void 0 : _b.firstName) || '')} ${(((_c = levy.processedBy) === null || _c === void 0 ? void 0 : _c.lastName) || '')}</div></div>
            ${levy.notes ? `<div class="row"><div class="label">Notes:</div><div class="value">${levy.notes}</div></div>` : ''}
          </div>
          <div class="footer">
            <p>Thank you!</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
          <div class="no-print" style="text-align:center; margin-top:12px;">
            <button onclick="window.print()" style="padding:8px 16px; background:#1976d2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Print</button>
          </div>
        </div>
      </body>
      </html>`;
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="levy-receipt-${levy.referenceNumber || levy._id}.html"`);
        res.send(html);
    }
    catch (error) {
        console.error('Error generating levy receipt download:', error);
        res.status(500).send('Failed to generate levy receipt');
    }
});
exports.getLevyReceiptDownload = getLevyReceiptDownload;
