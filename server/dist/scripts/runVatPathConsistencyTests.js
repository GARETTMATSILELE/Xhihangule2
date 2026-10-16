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
/**
 * Agent and accountant VAT paths on an isolated database.
 * Does not open the application database.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Payment_1 = require("../models/Payment");
const TaxObligation_1 = require("../models/TaxObligation");
const agentController_1 = require("../controllers/agentController");
const paymentController_1 = require("../controllers/paymentController");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const taxIntegrityService_1 = require("../services/taxIntegrityService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const database_1 = require("../config/database");
const DB = process.env.VAT_PATH_DB || 'mongodb://127.0.0.1:27017/vat_path_consistency_test';
const ACCOUNTING_DB = process.env.VAT_PATH_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/vat_path_consistency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const PRIOR_DATE = new Date('2025-06-15T10:00:00.000Z');
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
    return res;
}
function view(payment) {
    const details = (payment === null || payment === void 0 ? void 0 : payment.commissionDetails) || {};
    return {
        apply: Boolean(payment === null || payment === void 0 ? void 0 : payment.applyVatOnCommission),
        rate: Number((payment === null || payment === void 0 ? void 0 : payment.vatOnCommissionRate) || 0),
        treatment: (payment === null || payment === void 0 ? void 0 : payment.vatCommissionTreatment) || null,
        commission: Number(details.totalCommission || 0),
        vat: Number(details.vatOnCommission || 0),
        owner: Number(details.ownerAmount || 0),
        complete: (payment === null || payment === void 0 ? void 0 : payment.accountingComplete) === true
    };
}
function callPath(kind, user, body) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const req = {
            user: {
                userId: String(user._id),
                companyId: String(user.companyId),
                role: user.role,
                roles: [user.role]
            },
            headers: {},
            body,
            params: {}
        };
        const res = mockRes();
        if (kind === 'agent')
            yield (0, agentController_1.createAgentPayment)(req, res);
        else
            yield (0, paymentController_1.createPaymentAccountant)(req, res);
        const id = ((_b = (_a = res.body) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b._id) || ((_d = (_c = res.body) === null || _c === void 0 ? void 0 : _c.payment) === null || _d === void 0 ? void 0 : _d._id);
        const saved = id ? yield Payment_1.Payment.findById(id).lean() : null;
        return { status: res.statusCode, body: res.body, saved };
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        process.env.MANTIS_TEST_SEAM = '1';
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        const agent = yield User_1.User.create({
            email: 'vat-path-agent@example.test',
            password: 'test-pass-1',
            firstName: 'Path',
            lastName: 'Agent',
            role: 'agent',
            roles: ['agent'],
            isActive: true,
            sessionVersion: 1
        });
        const accountant = yield User_1.User.create({
            email: 'vat-path-accountant@example.test',
            password: 'test-pass-1',
            firstName: 'Path',
            lastName: 'Accountant',
            role: 'accountant',
            roles: ['accountant'],
            isActive: true,
            sessionVersion: 1
        });
        function company(name_1, registered_1) {
            return __awaiter(this, arguments, void 0, function* (name, registered, country = 'Zimbabwe') {
                const row = yield Company_1.Company.create({
                    name,
                    address: '1 Test Street',
                    phone: '0770000099',
                    email: `${name.replace(/\s+/g, '-').toLowerCase()}@example.test`,
                    registrationNumber: `REG-${name}`,
                    tinNumber: `TIN-${name}`,
                    country,
                    ownerId: agent._id,
                    taxProfile: registered
                        ? { vatRegistered: true, vatNumber: 'ZW-PATH', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
                        : { vatRegistered: false }
                });
                agent.companyId = row._id;
                accountant.companyId = row._id;
                yield agent.save();
                yield accountant.save();
                return row;
            });
        }
        const registered = yield company('Path Registered', true);
        const unregistered = yield company('Path Unregistered', false);
        const noRate = yield company('Path No Rate', true, 'France');
        function property(companyId, name, commission, vatOn, treatment) {
            return __awaiter(this, void 0, void 0, function* () {
                return Property_1.Property.create({
                    companyId,
                    ownerId: agent._id,
                    agentId: agent._id,
                    name,
                    address: `${name} Road`,
                    rentalType: 'management',
                    rent: 1800,
                    commission,
                    vatOnCommission: vatOn,
                    vatCommissionTreatment: treatment
                });
            });
        }
        const exclusive = yield property(registered._id, 'Exclusive 15', 15, true, 'exclusive');
        const inclusive = yield property(registered._id, 'Inclusive 10', 10, true, 'inclusive');
        const otherRate = yield property(registered._id, 'Exclusive 12', 12, true, 'exclusive');
        const disabled = yield property(registered._id, 'VAT Off', 15, false);
        const unregisteredProperty = yield property(unregistered._id, 'Unregistered', 15, true, 'exclusive');
        const noRateProperty = yield property(noRate._id, 'No Rate', 15, true, 'exclusive');
        function tenant(companyId, email) {
            return __awaiter(this, void 0, void 0, function* () {
                return Tenant_1.Tenant.create({
                    firstName: 'Test',
                    lastName: 'Tenant',
                    email,
                    phone: '0771111111',
                    companyId,
                    ownerId: agent._id,
                    status: 'Active'
                });
            });
        }
        const registeredTenant = yield tenant(registered._id, 'path-tenant@example.test');
        const unregisteredTenant = yield tenant(unregistered._id, 'path-unreg-tenant@example.test');
        const noRateTenant = yield tenant(noRate._id, 'path-norate-tenant@example.test');
        let month = 1;
        function base(user, propertyId, tenantId, extra = {}) {
            const period = month++;
            return Object.assign({ propertyId: String(propertyId), tenantId: String(tenantId), agentId: String(agent._id), amount: 1800, depositAmount: 0, paymentDate: PAYMENT_DATE.toISOString(), paymentMethod: 'bank_transfer', paymentType: 'rental', propertyType: 'residential', rentalPeriodMonth: ((period - 1) % 12) + 1, rentalPeriodYear: 2026 + Math.floor((period - 1) / 12), idempotencyKey: `path:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra);
        }
        function pair(companyUserCompanyId_1, propertyId_1, tenantId_1) {
            return __awaiter(this, arguments, void 0, function* (companyUserCompanyId, propertyId, tenantId, extra = {}) {
                agent.companyId = companyUserCompanyId;
                accountant.companyId = companyUserCompanyId;
                const agentCall = yield callPath('agent', agent, base(agent, propertyId, tenantId, extra));
                const accountantCall = yield callPath('accountant', accountant, base(accountant, propertyId, tenantId, extra));
                return { agentCall, accountantCall };
            });
        }
        const registeredPair = yield pair(registered._id, exclusive._id, registeredTenant._id);
        assert(registeredPair.agentCall.status === 201, `agent registered create status ${registeredPair.agentCall.status} ${(_a = registeredPair.agentCall.body) === null || _a === void 0 ? void 0 : _a.message}`);
        assert(registeredPair.accountantCall.status === 201, `accountant registered create status ${registeredPair.accountantCall.status} ${(_b = registeredPair.accountantCall.body) === null || _b === void 0 ? void 0 : _b.message}`);
        const agentRegistered = view(registeredPair.agentCall.saved);
        const accountantRegistered = view(registeredPair.accountantCall.saved);
        assert(JSON.stringify(agentRegistered) === JSON.stringify(accountantRegistered), `registered paths differ ${JSON.stringify(agentRegistered)} vs ${JSON.stringify(accountantRegistered)}`);
        assert(agentRegistered.apply === true && agentRegistered.vat === 41.85 && agentRegistered.commission === 270 && agentRegistered.owner === 1488.15, `registered snapshot ${JSON.stringify(agentRegistered)}`);
        assert(agentRegistered.complete === true, 'registered agent payment is accounting complete');
        const third = yield callPath('agent', agent, base(agent, exclusive._id, registeredTenant._id));
        assert(view(third.saved).vat === 41.85, 'a later payment resolves VAT on its own and is not copied from the first');
        const unregisteredPair = yield pair(unregistered._id, unregisteredProperty._id, unregisteredTenant._id);
        assert(unregisteredPair.agentCall.status === 201 && unregisteredPair.accountantCall.status === 201, 'unregistered creates succeed');
        const agentUnregistered = view(unregisteredPair.agentCall.saved);
        const accountantUnregistered = view(unregisteredPair.accountantCall.saved);
        assert(JSON.stringify(agentUnregistered) === JSON.stringify(accountantUnregistered), `unregistered paths differ ${JSON.stringify(agentUnregistered)} vs ${JSON.stringify(accountantUnregistered)}`);
        assert(agentUnregistered.apply === false && agentUnregistered.vat === 0 && agentUnregistered.commission === 270 && agentUnregistered.owner === 1530, `unregistered snapshot ${JSON.stringify(agentUnregistered)}`);
        const unregisteredObligations = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: { $in: [(_c = unregisteredPair.agentCall.saved) === null || _c === void 0 ? void 0 : _c._id, (_d = unregisteredPair.accountantCall.saved) === null || _d === void 0 ? void 0 : _d._id] }, taxType: 'VAT_ON_COMMISSION' });
        assert(unregisteredObligations === 0, 'unregistered payments do not create VAT obligations');
        const disabledPair = yield pair(registered._id, disabled._id, registeredTenant._id);
        assert(view(disabledPair.agentCall.saved).vat === 0 && view(disabledPair.accountantCall.saved).vat === 0, 'VAT disabled withholds VAT on both paths');
        const inclusivePair = yield pair(registered._id, inclusive._id, registeredTenant._id);
        assert(view(inclusivePair.agentCall.saved).vat === 24.16 && view(inclusivePair.accountantCall.saved).vat === 24.16, `inclusive VAT is 24.16 on both paths, got ${view(inclusivePair.agentCall.saved).vat} and ${view(inclusivePair.accountantCall.saved).vat}`);
        assert(view(inclusivePair.agentCall.saved).treatment === 'inclusive', 'inclusive treatment is stored');
        const ratePair = yield pair(registered._id, otherRate._id, registeredTenant._id);
        assert(view(ratePair.agentCall.saved).commission === 216 && view(ratePair.agentCall.saved).vat === 33.48, `12% exclusive VAT is 33.48, got ${JSON.stringify(view(ratePair.agentCall.saved))}`);
        assert(JSON.stringify(view(ratePair.agentCall.saved)) === JSON.stringify(view(ratePair.accountantCall.saved)), '12% paths differ');
        const priorPair = yield pair(registered._id, exclusive._id, registeredTenant._id, { paymentDate: PRIOR_DATE.toISOString(), rentalPeriodYear: 2025 });
        assert(view(priorPair.agentCall.saved).rate === 0.15 && view(priorPair.agentCall.saved).vat === 40.5, `2025 rate gives VAT 40.50, got ${JSON.stringify(view(priorPair.agentCall.saved))}`);
        assert(view(priorPair.accountantCall.saved).vat === 40.5, 'accountant prior-rate VAT matches');
        const advance = yield pair(registered._id, exclusive._id, registeredTenant._id, { amount: 3600, advanceMonthsPaid: 2 });
        assert(view(advance.agentCall.saved).commission === 540 && view(advance.agentCall.saved).vat === 83.7, `advance VAT is 83.70, got ${JSON.stringify(view(advance.agentCall.saved))}`);
        assert(view(advance.accountantCall.saved).vat === 83.7, 'accountant advance VAT matches');
        const deposit = yield pair(registered._id, exclusive._id, registeredTenant._id, { amount: 0, depositAmount: 500 });
        assert(view(deposit.agentCall.saved).vat === 0 && view(deposit.agentCall.saved).commission === 0, 'deposit-only agent receipt has no commission VAT');
        assert(view(deposit.accountantCall.saved).vat === 0 && view(deposit.accountantCall.saved).commission === 0, 'deposit-only accountant receipt has no commission VAT');
        const beforeMissing = yield Payment_1.Payment.countDocuments({ companyId: noRate._id });
        const missingAgent = yield callPath('agent', Object.assign(Object.assign({}, agent.toObject()), { companyId: noRate._id, role: 'agent' }), base(agent, noRateProperty._id, noRateTenant._id));
        const missingAccountant = yield callPath('accountant', Object.assign(Object.assign({}, accountant.toObject()), { companyId: noRate._id, role: 'accountant' }), base(accountant, noRateProperty._id, noRateTenant._id));
        assert(missingAgent.status === 400 && missingAccountant.status === 400, `missing central rate is rejected, agent ${missingAgent.status} accountant ${missingAccountant.status}`);
        const afterMissing = yield Payment_1.Payment.countDocuments({ companyId: noRate._id });
        assert(afterMissing === beforeMissing, 'missing central rate does not save a payment');
        const repeatBody = base(agent, exclusive._id, registeredTenant._id, { idempotencyKey: 'path-repeat-1' });
        agent.companyId = registered._id;
        const firstRepeat = yield callPath('agent', agent, repeatBody);
        const secondRepeat = yield callPath('agent', agent, repeatBody);
        assert(String((_e = firstRepeat.saved) === null || _e === void 0 ? void 0 : _e._id) === String((_f = secondRepeat.saved) === null || _f === void 0 ? void 0 : _f._id), 'repeated idempotency key returns the same payment');
        const repeatObligations = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: (_g = firstRepeat.saved) === null || _g === void 0 ? void 0 : _g._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null });
        assert(repeatObligations === 1, `repeated processing keeps one original obligation, got ${repeatObligations}`);
        const concurrentBodies = [
            base(agent, exclusive._id, registeredTenant._id),
            base(accountant, exclusive._id, registeredTenant._id)
        ];
        const concurrent = yield Promise.all([
            callPath('agent', agent, concurrentBodies[0]),
            callPath('accountant', accountant, concurrentBodies[1])
        ]);
        assert(concurrent[0].status === 201 && concurrent[1].status === 201, 'concurrent creates succeed');
        assert(view(concurrent[0].saved).vat === 41.85 && view(concurrent[1].saved).vat === 41.85, 'concurrent payments each resolve VAT 41.85');
        assert(String((_h = concurrent[0].saved) === null || _h === void 0 ? void 0 : _h._id) !== String((_j = concurrent[1].saved) === null || _j === void 0 ? void 0 : _j._id), 'concurrent payments are separate records');
        const gapCall = yield callPath('agent', agent, base(agent, exclusive._id, registeredTenant._id, { notes: 'FAIL_VAT_OBLIGATION' }));
        assert(gapCall.status === 201, `obligation-failure payment is saved, status ${gapCall.status}`);
        assert(view(gapCall.saved).vat === 41.85, 'failed obligation posting leaves the VAT snapshot unchanged');
        assert(((_k = gapCall.saved) === null || _k === void 0 ? void 0 : _k.accountingComplete) !== true, 'a VAT snapshot without an obligation is not accounting complete');
        const gapCount = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: (_l = gapCall.saved) === null || _l === void 0 ? void 0 : _l._id, taxType: 'VAT_ON_COMMISSION' });
        assert(gapCount === 0, 'the completeness gate does not create the missing obligation');
        const gapMessage = yield (0, paymentAccountingReconciliation_1.missingOriginalVatObligation)(gapCall.saved);
        assert(Boolean(gapMessage && gapMessage.includes('no original VAT_ON_COMMISSION obligation')), `gap detector message: ${gapMessage}`);
        const findings = yield (0, taxIntegrityService_1.detectVatOnCommissionExceptions)(String(registered._id));
        const gapFinding = findings.find((row) => { var _a; return String(row.transaction) === String((_a = gapCall.saved) === null || _a === void 0 ? void 0 : _a._id) && row.issueType === 'VAT_SNAPSHOT_WITHOUT_OBLIGATION'; });
        assert(Boolean(gapFinding), 'integrity detection reports the snapshot without an obligation');
        delete process.env.MANTIS_TEST_SEAM;
        const repaired = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String((_m = gapCall.saved) === null || _m === void 0 ? void 0 : _m._id), { createdBy: String(agent._id) });
        const repairedPayment = yield Payment_1.Payment.findById((_o = gapCall.saved) === null || _o === void 0 ? void 0 : _o._id).lean();
        const repairedObligation = yield TaxObligation_1.TaxObligation.findOne({ paymentId: (_p = gapCall.saved) === null || _p === void 0 ? void 0 : _p._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        assert(repaired.accountingComplete === true, 'explicit re-post through the accounting pipeline can complete after the obligation exists');
        assert(Number(((_q = repairedPayment === null || repairedPayment === void 0 ? void 0 : repairedPayment.commissionDetails) === null || _q === void 0 ? void 0 : _q.vatOnCommission) || 0) === 41.85, 're-post does not change the VAT snapshot');
        assert(Number((repairedObligation === null || repairedObligation === void 0 ? void 0 : repairedObligation.taxAmount) || 0) === 41.85, 're-post obligation uses the stored snapshot');
        if (failures.length) {
            console.error(failures.join('\n'));
            throw new Error(`${failures.length} VAT path consistency assertion(s) failed`);
        }
        console.log('VAT path consistency tests passed', JSON.stringify({
            registered: agentRegistered,
            unregistered: agentUnregistered,
            advanceVat: view(advance.agentCall.saved).vat,
            priorVat: view(priorPair.agentCall.saved).vat
        }));
    });
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connection.dropDatabase().catch(() => undefined);
    yield database_1.accountingConnection.dropDatabase().catch(() => undefined);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    yield database_1.accountingConnection.close().catch(() => undefined);
}));
