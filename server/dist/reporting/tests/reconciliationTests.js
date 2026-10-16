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
exports.runReportingReconciliationTests = runReportingReconciliationTests;
const assert_1 = __importDefault(require("assert"));
const builders_1 = require("../builders");
const exports_1 = require("../exports");
const companyId = 'company-1';
const propertyId = 'property-1';
const currency = 'USD';
const entry = (input) => (Object.assign({ sourceSystem: 'property_account', sourceModel: 'PropertyAccount.transactions', sourceId: input.entryId, companyId,
    propertyId, direction: input.debit > 0 ? 'debit' : 'credit', amount: input.debit > 0 ? input.debit : input.credit, currency, status: 'completed' }, input));
const ledgerEntries = [
    entry({
        entryId: 'rent-1',
        eventType: 'RENT',
        debit: 0,
        credit: 1000,
        effectiveDate: new Date('2026-08-01T00:00:00.000Z'),
        metadata: { description: 'Rent received', referenceNumber: 'R-1' }
    }),
    entry({
        entryId: 'maintenance-1',
        eventType: 'MAINTENANCE',
        debit: 100,
        credit: 0,
        effectiveDate: new Date('2026-08-05T00:00:00.000Z'),
        metadata: { description: 'Maintenance repair', referenceNumber: 'M-1' }
    }),
    entry({
        entryId: 'payout-1',
        eventType: 'OWNER_PAYOUT',
        debit: 600,
        credit: 0,
        effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
        metadata: { description: 'Owner payout', referenceNumber: 'P-1' }
    })
];
const readModels = {
    owner: {
        getOwnerForProperty() {
            return __awaiter(this, void 0, void 0, function* () {
                return { id: 'owner-1', displayName: 'Owner One' };
            });
        }
    },
    property: {
        getProperty() {
            return __awaiter(this, void 0, void 0, function* () {
                return { id: propertyId, name: 'Test Property', address: '1 Test Road' };
            });
        }
    },
    ledger: {
        getLedgerEntries(_query) {
            return __awaiter(this, void 0, void 0, function* () {
                return ledgerEntries;
            });
        }
    },
    payment: {
        getPaymentTraceReferences() {
            return __awaiter(this, void 0, void 0, function* () {
                return {};
            });
        },
        getPropertyCommissionSnapshots() {
            return __awaiter(this, void 0, void 0, function* () {
                return [];
            });
        }
    },
    lease: {
        getLeaseContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { monthlyRent: 1000, nextDueDate: '2026-09-01' };
            });
        }
    },
    maintenance: {
        getMaintenanceContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { notes: ['Repair completed.'] };
            });
        }
    },
    inspection: {
        getInspectionContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { notes: ['No inspection issues.'] };
            });
        }
    },
    trust: {
        getTrustContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return undefined;
            });
        }
    }
};
function runReportingReconciliationTests() {
    return __awaiter(this, void 0, void 0, function* () {
        const builder = new builders_1.OwnerStatementBuilder(readModels);
        const dto = yield builder.build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'Mantis Test',
            generatedBy: 'tester',
            period: {
                startDate: '2026-08-01',
                endDate: '2026-08-31',
                label: '2026-08'
            }
        });
        assert_1.default.strictEqual(dto.executiveSummary.totalFundsReceived.amount, 1000, 'Executive summary funds received should equal ledger credits.');
        assert_1.default.strictEqual(dto.executiveSummary.totalDeductions.amount, 100, 'Executive summary deductions should equal non-payout ledger debits.');
        assert_1.default.strictEqual(dto.executiveSummary.ownerPaid.amount, 600, 'Owner paid should equal owner payout ledger debits.');
        assert_1.default.strictEqual(dto.executiveSummary.closingTrustBalance.amount, 300, 'Closing balance should equal credits less all debits.');
        assert_1.default.strictEqual(dto.cashFlow.closingBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'Cash flow and summary closing balance should match.');
        assert_1.default.strictEqual(dto.trustPosition.closingBalanceHeld.amount, dto.executiveSummary.closingTrustBalance.amount, 'Trust position must reconcile to summary closing balance.');
        assert_1.default.strictEqual(dto.trustLedger[dto.trustLedger.length - 1].runningBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'Final running balance must match closing balance.');
        assert_1.default.strictEqual(dto.reconciliation.status, 'passed', 'Report reconciliation should pass for balanced fixture.');
        const exportEngine = new exports_1.ExportEngine();
        const json = yield exportEngine.exportOwnerStatement(dto, 'json');
        const exportedDto = JSON.parse(json.buffer.toString('utf8'));
        assert_1.default.strictEqual(exportedDto.executiveSummary.closingTrustBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'JSON export totals must match DTO totals.');
        const csv = yield exportEngine.exportOwnerStatement(dto, 'csv');
        assert_1.default.ok(csv.buffer.toString('utf8').includes('Balance'), 'CSV export should contain ledger balance column.');
        assert_1.default.ok(csv.buffer.toString('utf8').includes('Total Amount Received'), 'CSV export should contain the total amount received column.');
        assert_1.default.ok(csv.buffer.toString('utf8').includes('Net Amount Due to Owner'), 'CSV export should contain the net amount due to owner column.');
        assert_1.default.ok(!csv.buffer.toString('utf8').includes('Status'), 'Printed statement CSV should not include a status column.');
        const excel = yield exportEngine.exportOwnerStatement(dto, 'excel');
        assert_1.default.ok(excel.buffer.toString('utf8').includes('Executive Summary'), 'Excel export should contain summary worksheet.');
        const pdf = yield exportEngine.exportOwnerStatement(dto, 'pdf');
        const { PDFDocument } = yield Promise.resolve().then(() => __importStar(require('pdf-lib')));
        const pdfDoc = yield PDFDocument.load(pdf.buffer);
        const { width, height } = pdfDoc.getPage(0).getSize();
        assert_1.default.ok(Math.abs(width - 841.89) < 1 && Math.abs(height - 595.28) < 1, `PDF page should be A4 landscape, got ${width} x ${height}`);
        assert_1.default.ok(pdfDoc.getPageCount() >= 1, 'PDF should contain the statement page.');
        const longDto = Object.assign(Object.assign({}, dto), { trustLedger: Array.from({ length: 40 }, () => dto.trustLedger).flat() });
        const longPdf = yield exportEngine.exportOwnerStatement(longDto, 'pdf');
        const longDoc = yield PDFDocument.load(longPdf.buffer);
        assert_1.default.ok(longDoc.getPageCount() > 1, `A long statement should continue onto another A4 page, got ${longDoc.getPageCount()}`);
        const longSize = longDoc.getPage(1).getSize();
        assert_1.default.ok(Math.abs(longSize.width - 841.89) < 1 && Math.abs(longSize.height - 595.28) < 1, 'Continuation pages should stay A4 landscape.');
    });
}
