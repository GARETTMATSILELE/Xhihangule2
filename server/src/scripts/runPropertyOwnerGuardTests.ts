import assert from 'assert';
import { ownerRetirementMode, validateNewPropertyOwner, validateOwnerContact } from '../services/propertyOwnerGuards';
import { decideOwnerPortalAccess } from '../services/ownerPortalUser';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('create requires contact fields', () => {
  assert.strictEqual(
    validateNewPropertyOwner({ email: '', password: '', firstName: '', lastName: '', phone: '' }),
    'First name, last name, email, phone and password are required',
  );
});

check('create rejects an invalid email', () => {
  const message = validateNewPropertyOwner({
    email: 'not-an-email', password: 'secret1', firstName: 'A', lastName: 'B', phone: '0771234567',
  });
  assert.strictEqual(message, 'Enter a valid email address');
});

check('create rejects a short phone number', () => {
  const message = validateNewPropertyOwner({
    email: 'owner@example.com', password: 'secret1', firstName: 'A', lastName: 'B', phone: '12',
  });
  assert.strictEqual(message, 'Enter a valid phone number');
});

check('create rejects a short password', () => {
  const message = validateNewPropertyOwner({
    email: 'owner@example.com', password: '123', firstName: 'A', lastName: 'B', phone: '+263771234567',
  });
  assert.strictEqual(message, 'Password must be at least 6 characters');
});

check('create accepts a complete owner', () => {
  assert.strictEqual(validateNewPropertyOwner({
    email: 'Owner@Example.com', password: 'secret1', firstName: 'A', lastName: 'B', phone: '+263 77 123 4567',
  }), null);
});

check('contact update rejects a bad email and accepts a blank optional phone', () => {
  assert.strictEqual(validateOwnerContact({ email: 'bad' }), 'Enter a valid email address');
  assert.strictEqual(validateOwnerContact({ phone: '' }), null);
});

check('owner with properties is deactivated', () => {
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 1, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
  }), 'deactivate');
});

check('owner with a lease or payment history is deactivated', () => {
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 1, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
  }), 'deactivate');
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 0, paymentCount: 2, accountCount: 0, historyCount: 0, documentCount: 0,
  }), 'deactivate');
});

check('owner with a ledger, history or documents is deactivated', () => {
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 1, historyCount: 0, documentCount: 0,
  }), 'deactivate');
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 1, documentCount: 0,
  }), 'deactivate');
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 1,
  }), 'deactivate');
});

check('portal access is created only for a new email', () => {
  assert.strictEqual(decideOwnerPortalAccess(null, 'company-a'), 'create');
});

check('an existing owner portal in the same company is reused', () => {
  assert.strictEqual(decideOwnerPortalAccess({ companyId: 'company-a', role: 'owner', roles: ['owner'] }, 'company-a'), 'already_owner');
});

check('another account with the same email is not linked', () => {
  assert.strictEqual(decideOwnerPortalAccess({ companyId: 'company-a', role: 'agent', roles: ['agent'] }, 'company-a'), 'blocked');
  assert.strictEqual(decideOwnerPortalAccess({ companyId: 'company-b', role: 'owner', roles: ['owner'] }, 'company-a'), 'blocked');
});

check('owner with no links can be deleted', () => {
  assert.strictEqual(ownerRetirementMode({
    linkedPropertyCount: 0, leaseCount: 0, paymentCount: 0, accountCount: 0, historyCount: 0, documentCount: 0,
  }), 'delete');
});

console.log(`property owner guards: ${passed} passed`);
