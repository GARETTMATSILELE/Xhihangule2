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
exports.runStatementPresentationTests = runStatementPresentationTests;
const assert_1 = __importDefault(require("assert"));
const builders_1 = require("../builders");
const rentalPeriod_1 = require("../rentalPeriod");
const statementRent_1 = require("../statementRent");
const companyId = 'company-1';
const propertyId = 'property-1';
const currency = 'USD';
const entry = (input) => (Object.assign({ sourceSystem: input.sourceSystem || 'property_account', sourceModel: input.sourceModel || 'PropertyAccount.transactions', sourceId: input.entryId, companyId,
    propertyId, direction: input.debit > 0 ? 'debit' : 'credit', amount: input.debit > 0 ? input.debit : input.credit, currency, status: 'completed' }, input));
const createReadModels = (ledgerEntries, snapshots = []) => ({
    owner: {
        getOwnerForProperty() {
            return __awaiter(this, void 0, void 0, function* () {
                return { id: 'owner-1', displayName: 'Joseph Mapuvire' };
            });
        }
    },
    property: {
        getProperty() {
            return __awaiter(this, void 0, void 0, function* () {
                return { id: propertyId, name: 'Make up By Gamu', address: 'Share 12, 27 Lanark Road, Avondale, Harare' };
            });
        }
    },
    ledger: {
        getLedgerEntries(_query) {
            return __awaiter(this, void 0, void 0, function* () {
                return ledgerEntries.filter((item) => {
                    if (_query.from && item.effectiveDate < _query.from)
                        return false;
                    if (_query.to && item.effectiveDate > _query.to)
                        return false;
                    return true;
                });
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
                return snapshots;
            });
        }
    },
    lease: {
        getLeaseContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { monthlyRent: 1100 };
            });
        }
    },
    maintenance: {
        getMaintenanceContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { notes: [] };
            });
        }
    },
    inspection: {
        getInspectionContext() {
            return __awaiter(this, void 0, void 0, function* () {
                return { notes: [] };
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
});
function runStatementPresentationTests() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6;
        assert_1.default.strictEqual((0, rentalPeriod_1.formatRentPeriodDescription)({ rentalPeriodMonth: 7, rentalPeriodYear: 2026 }), 'July 2026 Rent');
        assert_1.default.strictEqual((0, rentalPeriod_1.formatRentPeriodDescription)({
            rentalPeriodMonth: 7,
            rentalPeriodYear: 2026,
            advanceMonthsPaid: 3,
            advancePeriodStart: { month: 7, year: 2026 },
            advancePeriodEnd: { month: 9, year: 2026 }
        }), 'July–September 2026 Rent');
        assert_1.default.strictEqual((0, rentalPeriod_1.formatRentPeriodDescription)({ rentalPeriodMonth: 11, rentalPeriodYear: 2026, advanceMonthsPaid: 3 }), 'November 2026–January 2027 Rent');
        assert_1.default.strictEqual((0, rentalPeriod_1.formatRentPeriodDescription)({}), undefined, 'Missing rental-period metadata must not be invented from a payment date.');
        assert_1.default.strictEqual((0, rentalPeriod_1.cleanStatementDescription)('Rental income - REF-1765198259150-5'), 'Rental Income');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ rentUsed: 1100, advanceMonthsPaid: 1, rentAllocated: 1100, commissionBase: 1100 }), 1100, 'Rent Amount must be the property rent, not cash received plus levy.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ rentUsed: 1100, advanceMonthsPaid: 3 }), 3300, 'Multi-month rent should use rentUsed x months paid.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ rentAllocated: 1100, commissionBase: 1000 }), 1100, 'rentAllocated is the stored rent portion and must be preferred over commissionBase.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ commissionBase: 1100 }), 1100, 'commissionBase alone is a stored rent snapshot when levy is absent; do not invent a levy.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ commissionBase: 1000, levy: 100 }), 1100, 'When only commissionBase is stored, restore the stored levy so Rent Amount is the rental charge, not commission + owner amount.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ amount: 2500 }), 2500, 'When rent snapshot fields are absent, use the stored rental payment amount rather than leaving Rent Amount blank.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({ rentUsed: 1100, amount: 2500 }), 1100, 'Stored rentUsed must be preferred over payment.amount.');
        assert_1.default.strictEqual((0, statementRent_1.resolveStatementRentAmount)({}), undefined, 'Missing rent fields must not invent a Rent Amount.');
        const snapshots = [
            {
                paymentId: 'pay-july',
                paymentDate: new Date('2026-08-02T00:00:00.000Z'),
                grossRent: 1100,
                levy: 100,
                commission: 100,
                vatOnCommission: 15.5,
                vatRate: 0.155,
                vatTreatment: 'exclusive',
                ownerPayable: 884.5,
                rentalPeriodMonth: 7,
                rentalPeriodYear: 2026
            },
            {
                paymentId: 'pay-multi',
                paymentDate: new Date('2026-09-02T00:00:00.000Z'),
                grossRent: 3300,
                levy: 300,
                commission: 300,
                vatOnCommission: 46.5,
                vatRate: 0.155,
                ownerPayable: 2653.5,
                advanceMonthsPaid: 3,
                advancePeriodStart: { month: 7, year: 2026 },
                advancePeriodEnd: { month: 9, year: 2026 }
            }
        ];
        const ledgerEntries = [
            entry({
                entryId: 'opening-1',
                eventType: 'OPENING_BALANCE',
                debit: 0,
                credit: 425,
                effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
                metadata: { description: 'Opening balance' }
            }),
            entry({
                entryId: 'rent-july',
                eventType: 'RENT',
                debit: 0,
                credit: 884.5,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { description: 'Rental income - REF-1765198259150-5', paymentId: 'pay-july' }
            }),
            entry({
                entryId: 'payout-1',
                eventType: 'OWNER_PAYOUT',
                sourceSystem: 'owner_payout',
                sourceModel: 'PropertyAccount.ownerPayouts',
                debit: 500,
                credit: 0,
                effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
                metadata: { description: 'Owner payout - Joseph Mapuvire', referenceNumber: 'PAYOUT-1' }
            }),
            entry({
                entryId: 'rent-multi',
                eventType: 'income',
                debit: 0,
                credit: 2653.5,
                effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
                metadata: { description: 'Rental income - REF-MULTI', paymentId: 'pay-multi' }
            }),
            entry({
                entryId: 'legacy-rent',
                eventType: 'income',
                debit: 0,
                credit: 990,
                effectiveDate: new Date('2026-09-15T00:00:00.000Z'),
                metadata: { description: 'Rental income - REF-LEGACY' }
            }),
            entry({
                entryId: 'pass-through-levy',
                eventType: 'PASS_THROUGH_LEVY_COLLECTION',
                sourceSystem: 'pass_through',
                debit: 0,
                credit: 100,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { description: 'Levy collected' }
            })
        ];
        const builder = new builders_1.OwnerStatementBuilder(createReadModels(ledgerEntries, snapshots));
        const dto = yield builder.build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            generatedBy: 'tester',
            period: {
                startDate: '2026-07-01',
                endDate: '2026-09-30',
                label: '2026-07-01 - 2026-09-30'
            }
        });
        assert_1.default.strictEqual((_a = dto.statementSummary) === null || _a === void 0 ? void 0 : _a.openingBalance.amount, 425, 'Opening balance should come from pre-period ledger net, not a frontend recalculation.');
        assert_1.default.ok(!dto.trustLedger.some((row) => row.rowType === 'Income' && /opening/i.test(row.description)), 'Opening balance must not appear as a table row.');
        assert_1.default.ok(!dto.trustLedger.some((row) => /PASS_THROUGH/i.test(row.id) || /levy collected/i.test(row.description)), 'Pass-through levy collections must not appear as separate statement rows.');
        const july = dto.trustLedger.find((row) => row.id.includes('rent-july'));
        assert_1.default.ok(july, 'July rental income row should be present.');
        assert_1.default.strictEqual(july === null || july === void 0 ? void 0 : july.rowType, 'Income');
        assert_1.default.strictEqual(july === null || july === void 0 ? void 0 : july.description, 'July 2026 Rent');
        assert_1.default.strictEqual((_b = july === null || july === void 0 ? void 0 : july.rentAmount) === null || _b === void 0 ? void 0 : _b.amount, 1100);
        assert_1.default.strictEqual((_c = july === null || july === void 0 ? void 0 : july.commission) === null || _c === void 0 ? void 0 : _c.amount, 100);
        assert_1.default.strictEqual((_d = july === null || july === void 0 ? void 0 : july.vatOnCommission) === null || _d === void 0 ? void 0 : _d.amount, 15.5);
        assert_1.default.strictEqual((_e = july === null || july === void 0 ? void 0 : july.levies) === null || _e === void 0 ? void 0 : _e.amount, 100);
        assert_1.default.strictEqual((_f = july === null || july === void 0 ? void 0 : july.ownerAmount) === null || _f === void 0 ? void 0 : _f.amount, 884.5);
        assert_1.default.strictEqual(july === null || july === void 0 ? void 0 : july.runningBalance.amount, 1309.5, 'First income running balance should start from the opening balance.');
        assert_1.default.ok(!/REF-1765198259150-5/.test((july === null || july === void 0 ? void 0 : july.description) || ''), 'Payment reference must not be the primary description.');
        const payout = dto.trustLedger.find((row) => row.rowType === 'Payout');
        assert_1.default.ok(payout, 'Owner payouts should appear in the same chronological table.');
        assert_1.default.strictEqual(payout === null || payout === void 0 ? void 0 : payout.description, 'Owner payout - Joseph Mapuvire');
        assert_1.default.strictEqual(payout === null || payout === void 0 ? void 0 : payout.rentAmount, undefined);
        assert_1.default.strictEqual((_g = payout === null || payout === void 0 ? void 0 : payout.ownerAmount) === null || _g === void 0 ? void 0 : _g.amount, -500);
        assert_1.default.strictEqual(payout === null || payout === void 0 ? void 0 : payout.runningBalance.amount, 809.5);
        const multi = dto.trustLedger.find((row) => row.id.includes('rent-multi'));
        assert_1.default.strictEqual(multi === null || multi === void 0 ? void 0 : multi.description, 'July–September 2026 Rent');
        assert_1.default.strictEqual((_h = multi === null || multi === void 0 ? void 0 : multi.rentAmount) === null || _h === void 0 ? void 0 : _h.amount, 3300);
        assert_1.default.strictEqual((_j = multi === null || multi === void 0 ? void 0 : multi.vatOnCommission) === null || _j === void 0 ? void 0 : _j.amount, 46.5);
        const legacy = dto.trustLedger.find((row) => row.id.includes('legacy-rent'));
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.description, 'Rental Income', 'Legacy rows without rental-period metadata should fall back to a clean description.');
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.rentAmount, undefined, 'Legacy rows must not invent rent/commission/VAT/levy figures.');
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.vatOnCommission, undefined);
        assert_1.default.strictEqual((_k = legacy === null || legacy === void 0 ? void 0 : legacy.ownerAmount) === null || _k === void 0 ? void 0 : _k.amount, 990);
        const balances = dto.trustLedger.map((row) => row.runningBalance.amount);
        const summedBalances = balances.reduce((sum, value) => sum + value, 0);
        assert_1.default.notStrictEqual((_l = dto.statementSummary) === null || _l === void 0 ? void 0 : _l.closingBalance.amount, summedBalances, 'Closing balance must be the final running balance, never the sum of the balance column.');
        assert_1.default.strictEqual((_m = dto.statementSummary) === null || _m === void 0 ? void 0 : _m.closingBalance.amount, dto.trustLedger[dto.trustLedger.length - 1].runningBalance.amount);
        assert_1.default.strictEqual((_o = dto.statementSummary) === null || _o === void 0 ? void 0 : _o.totalRent.amount, 4400);
        assert_1.default.strictEqual((_p = dto.statementSummary) === null || _p === void 0 ? void 0 : _p.totalCommission.amount, 400);
        assert_1.default.strictEqual((_q = dto.statementSummary) === null || _q === void 0 ? void 0 : _q.totalVat.amount, 62);
        assert_1.default.strictEqual((_r = dto.statementSummary) === null || _r === void 0 ? void 0 : _r.totalLevies.amount, 400);
        assert_1.default.strictEqual((_s = dto.statementSummary) === null || _s === void 0 ? void 0 : _s.totalPayouts.amount, 500);
        assert_1.default.ok(!dto.statementNumber.includes(propertyId), 'Statement identifier should not expose internal database IDs.');
        const vatOffSnapshots = [{
                paymentId: 'pay-vat-off',
                paymentDate: new Date('2026-08-02T00:00:00.000Z'),
                grossRent: 1100,
                levy: 0,
                commission: 110,
                vatOnCommission: 0,
                ownerPayable: 990,
                rentalPeriodMonth: 7,
                rentalPeriodYear: 2026
            }];
        const vatOffDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'rent-vat-off',
                eventType: 'income',
                debit: 0,
                credit: 990,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { description: 'Rental income', paymentId: 'pay-vat-off' }
            })
        ], vatOffSnapshots)).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        assert_1.default.strictEqual((_t = vatOffDto.trustLedger[0].commission) === null || _t === void 0 ? void 0 : _t.amount, 110);
        assert_1.default.strictEqual((_u = vatOffDto.trustLedger[0].vatOnCommission) === null || _u === void 0 ? void 0 : _u.amount, 0);
        assert_1.default.strictEqual((_v = vatOffDto.trustLedger[0].ownerAmount) === null || _v === void 0 ? void 0 : _v.amount, 990);
        const inclusiveSnapshots = [{
                paymentId: 'pay-inclusive',
                paymentDate: new Date('2026-08-02T00:00:00.000Z'),
                grossRent: 1100,
                levy: 100,
                commission: 86.58,
                vatOnCommission: 13.42,
                vatRate: 0.155,
                vatTreatment: 'inclusive',
                ownerPayable: 900,
                rentalPeriodMonth: 8,
                rentalPeriodYear: 2026
            }];
        const inclusiveDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'rent-inclusive',
                eventType: 'income',
                debit: 0,
                credit: 900,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { paymentId: 'pay-inclusive', description: 'Rental income' }
            })
        ], inclusiveSnapshots)).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        assert_1.default.strictEqual((_w = inclusiveDto.trustLedger[0].commission) === null || _w === void 0 ? void 0 : _w.amount, 86.58, 'Inclusive VAT commission must use the stored transaction amount.');
        assert_1.default.strictEqual((_x = inclusiveDto.trustLedger[0].vatOnCommission) === null || _x === void 0 ? void 0 : _x.amount, 13.42);
        assert_1.default.strictEqual(inclusiveDto.trustLedger[0].description, 'August 2026 Rent');
        const referenceJoinDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'rent-by-ref',
                eventType: 'income',
                debit: 0,
                credit: 884.5,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { description: 'Rental income', referenceNumber: 'REF-JULY' }
            })
        ], [{
                paymentId: 'pay-by-ref',
                paymentDate: new Date('2026-08-02T00:00:00.000Z'),
                referenceNumber: 'REF-JULY',
                grossRent: 1100,
                levy: 100,
                commission: 100,
                vatOnCommission: 15.5,
                vatRate: 0.155,
                vatTreatment: 'exclusive',
                ownerPayable: 884.5,
                rentalPeriodMonth: 7,
                rentalPeriodYear: 2026
            }])).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        assert_1.default.strictEqual((_y = referenceJoinDto.trustLedger[0].rentAmount) === null || _y === void 0 ? void 0 : _y.amount, 1100, 'Rent Amount should still resolve when the ledger row is joined by payment reference.');
        assert_1.default.strictEqual(referenceJoinDto.trustLedger[0].description, 'July 2026 Rent');
        assert_1.default.strictEqual((_z = referenceJoinDto.trustLedger[0].ownerAmount) === null || _z === void 0 ? void 0 : _z.amount, 884.5);
        assert_1.default.ok(!('ownerShare' in referenceJoinDto.trustLedger[0]), 'Statement rows must not expose a second owner figure.');
        const expenseDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'rent-before-expense',
                eventType: 'income',
                debit: 0,
                credit: 884.5,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { paymentId: 'pay-july', description: 'Rental income' }
            }),
            entry({
                entryId: 'expense-cleaning',
                eventType: 'EXPENSE',
                debit: 60,
                credit: 0,
                effectiveDate: new Date('2026-08-27T00:00:00.000Z'),
                metadata: { description: 'Cleaning' }
            })
        ], [snapshots[0]])).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        const expenseRow = expenseDto.trustLedger.find((row) => row.id.includes('expense-cleaning'));
        assert_1.default.strictEqual(expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.rowType, 'Expense');
        assert_1.default.strictEqual(expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.description, 'Cleaning');
        assert_1.default.strictEqual(expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.rentAmount, undefined);
        assert_1.default.strictEqual(expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.commission, undefined);
        assert_1.default.strictEqual((_0 = expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.ownerAmount) === null || _0 === void 0 ? void 0 : _0.amount, -60);
        assert_1.default.strictEqual(expenseRow === null || expenseRow === void 0 ? void 0 : expenseRow.runningBalance.amount, 824.5);
        const noLevyVatDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'rent-no-levy-vat',
                eventType: 'income',
                debit: 0,
                credit: 884.5,
                effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
                metadata: { paymentId: 'pay-no-levy-vat', description: 'Rental income' }
            })
        ], [{
                paymentId: 'pay-no-levy-vat',
                paymentDate: new Date('2026-08-02T00:00:00.000Z'),
                grossRent: 1000,
                levy: 0,
                commission: 100,
                vatOnCommission: 15.5,
                vatRate: 0.155,
                vatTreatment: 'exclusive',
                ownerPayable: 884.5,
                rentalPeriodMonth: 8,
                rentalPeriodYear: 2026
            }])).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        assert_1.default.strictEqual((_1 = noLevyVatDto.trustLedger[0].rentAmount) === null || _1 === void 0 ? void 0 : _1.amount, 1000);
        assert_1.default.strictEqual((_2 = noLevyVatDto.trustLedger[0].commission) === null || _2 === void 0 ? void 0 : _2.amount, 100);
        assert_1.default.strictEqual((_3 = noLevyVatDto.trustLedger[0].vatOnCommission) === null || _3 === void 0 ? void 0 : _3.amount, 15.5);
        assert_1.default.strictEqual((_4 = noLevyVatDto.trustLedger[0].levies) === null || _4 === void 0 ? void 0 : _4.amount, 0);
        assert_1.default.strictEqual((_5 = noLevyVatDto.trustLedger[0].ownerAmount) === null || _5 === void 0 ? void 0 : _5.amount, 884.5);
        const namedPayoutDto = yield new builders_1.OwnerStatementBuilder(createReadModels([
            entry({
                entryId: 'payout-named',
                eventType: 'OWNER_PAYOUT',
                sourceSystem: 'owner_payout',
                debit: 250,
                credit: 0,
                effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
                metadata: { recipientName: 'John Doe' }
            })
        ])).build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            companyName: 'The Benjamins Realty',
            period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
        });
        assert_1.default.strictEqual(namedPayoutDto.trustLedger[0].rowType, 'Payout');
        assert_1.default.strictEqual(namedPayoutDto.trustLedger[0].description, 'Owner payout - John Doe');
        assert_1.default.strictEqual(namedPayoutDto.trustLedger[0].rentAmount, undefined);
        assert_1.default.strictEqual((_6 = namedPayoutDto.trustLedger[0].ownerAmount) === null || _6 === void 0 ? void 0 : _6.amount, -250);
    });
}
