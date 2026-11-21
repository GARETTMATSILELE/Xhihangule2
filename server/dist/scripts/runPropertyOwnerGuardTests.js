"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const propertyOwnerGuards_1 = require("../services/propertyOwnerGuards");
const ownerPortalUser_1 = require("../services/ownerPortalUser");
let passed = 0;
function check(name, fn) {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
}
check('create requires contact fields', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.validateNewPropertyOwner)({ email: '', password: '', firstName: '', lastName: '', phone: '' }), 'First name, last name, email, phone and password are required');
});
check('create rejects an invalid email', () => {
    const message = (0, propertyOwnerGuards_1.validateNewPropertyOwner)({
        email: 'not-an-email', password: 'secret1', firstName: 'A', lastName: 'B', phone: '0771234567',
    });
    assert_1.default.strictEqual(message, 'Enter a valid email address');
});
check('create rejects a short phone number', () => {
    const message = (0, propertyOwnerGuards_1.validateNewPropertyOwner)({
        email: 'owner@example.com', password: 'secret1', firstName: 'A', lastName: 'B', phone: '12',
    });
    assert_1.default.strictEqual(message, 'Enter a valid phone number');
});
check('create rejects a short password', () => {
    const message = (0, propertyOwnerGuards_1.validateNewPropertyOwner)({
        email: 'owner@example.com', password: '123', firstName: 'A', lastName: 'B', phone: '+263771234567',
    });
    assert_1.default.strictEqual(message, 'Password must be at least 6 characters');
});
check('create accepts a complete owner', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.validateNewPropertyOwner)({
        email: 'Owner@Example.com', password: 'secret1', firstName: 'A', lastName: 'B', phone: '+263 77 123 4567',
    }), null);
});
check('contact update rejects a bad email and accepts a blank optional phone', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.validateOwnerContact)({ email: 'bad' }), 'Enter a valid email address');
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.validateOwnerContact)({ phone: '' }), null);
});
check('owner with properties is deactivated', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 1, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
    }), 'deactivate');
});
check('owner with a lease or payment history is deactivated', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 1, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
    }), 'deactivate');
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 0, paymentCount: 2, accountCount: 0, historyCount: 0, documentCount: 0,
    }), 'deactivate');
});
check('owner with a ledger, history or documents is deactivated', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 1, historyCount: 0, documentCount: 0,
    }), 'deactivate');
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 1, documentCount: 0,
    }), 'deactivate');
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 1,
    }), 'deactivate');
});
check('portal access is created only for a new email', () => {
    assert_1.default.strictEqual((0, ownerPortalUser_1.decideOwnerPortalAccess)(null, 'company-a'), 'create');
});
check('an existing owner portal in the same company is reused', () => {
    assert_1.default.strictEqual((0, ownerPortalUser_1.decideOwnerPortalAccess)({ companyId: 'company-a', role: 'owner', roles: ['owner'] }, 'company-a'), 'already_owner');
});
check('another account with the same email is not linked', () => {
    assert_1.default.strictEqual((0, ownerPortalUser_1.decideOwnerPortalAccess)({ companyId: 'company-a', role: 'agent', roles: ['agent'] }, 'company-a'), 'blocked');
    assert_1.default.strictEqual((0, ownerPortalUser_1.decideOwnerPortalAccess)({ companyId: 'company-b', role: 'owner', roles: ['owner'] }, 'company-a'), 'blocked');
});
check('owner with no links can be deleted', () => {
    assert_1.default.strictEqual((0, propertyOwnerGuards_1.ownerRetirementMode)({
        linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
    }), 'delete');
});
console.log(`property owner guards: ${passed} passed`);
