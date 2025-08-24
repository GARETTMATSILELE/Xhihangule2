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
exports.getLevyReceiptDownload = exports.getLevyReceiptPublic = exports.getLevyPayments = exports.createLevyPayment = void 0;
const LevyPayment_1 = require("../models/LevyPayment");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const Tenant_1 = require("../models/Tenant");
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
            type: 'levy'
        };
        res.json({ status: 'success', data: receipt });
    }
    catch (error) {
        console.error('Error fetching levy receipt:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch levy receipt' });
    }
});
exports.getLevyReceiptPublic = getLevyReceiptPublic;
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
          .company-name { font-size: 22px; font-weight: bold; }
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
            <div class="company-name">Levy Payment Receipt</div>
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
