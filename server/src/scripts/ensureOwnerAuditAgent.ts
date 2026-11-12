/**
 * Creates one isolated audit company, agent, and property.
 * Never updates an existing user unless the email is the audit agent address.
 * Does not print the password.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config as loadEnv, parse as parseEnv } from 'dotenv';

const serverRoot = path.resolve(__dirname, '..', '..');
const localPath = path.join(serverRoot, '.env.development.local');
loadEnv({ path: path.join(serverRoot, '.env') });
if (fs.existsSync(localPath)) {
  const parsed = parseEnv(fs.readFileSync(localPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

const AUDIT_EMAIL = 'mantis-owner-audit-agent@example.test';

function rememberPassword(password: string) {
  const current = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : '';
  if (/^AUDIT_AGENT_EMAIL=/m.test(current) && /^AUDIT_AGENT_PASSWORD=/m.test(current)) return;
  const lines = [
    current.endsWith('\n') || current.length === 0 ? '' : '\n',
    `AUDIT_AGENT_EMAIL=${AUDIT_EMAIL}`,
    `AUDIT_AGENT_PASSWORD=${password}`,
    '',
  ].join('\n');
  fs.appendFileSync(localPath, lines, { mode: 0o600 });
}

async function main() {
  const { connectDatabase } = await import('../config/database');
  const { User } = await import('../models/User');
  const { Company } = await import('../models/Company');
  const { Property } = await import('../models/Property');
  await connectDatabase();

  let password = process.env.AUDIT_AGENT_PASSWORD || '';
  if (password.length < 8) password = `Audit${crypto.randomBytes(9).toString('hex')}`;

  let agent = await User.findOne({ email: AUDIT_EMAIL });
  if (!agent) {
    agent = await User.create({
      email: AUDIT_EMAIL,
      password,
      firstName: 'Owner',
      lastName: 'Audit',
      role: 'agent',
      roles: ['agent'],
      isActive: true,
    });
    rememberPassword(password);
  } else if (!process.env.AUDIT_AGENT_PASSWORD) {
    agent.password = password;
    await agent.save();
    rememberPassword(password);
  }

  let company = await Company.findOne({ email: 'mantis-owner-audit@example.test' });
  if (!company) {
    company = await Company.create({
      name: 'Mantis Owner Audit',
      address: '1 Audit Lane',
      phone: '0771000001',
      email: 'mantis-owner-audit@example.test',
      registrationNumber: 'AUDIT-OWNERS',
      tinNumber: 'AUDIT-TIN',
      country: 'Zimbabwe',
      ownerId: agent._id,
      isActive: true,
      subscriptionStatus: 'active',
      onboardingStatus: 'ACTIVE',
      onboardingCompleted: true,
      tenantStatus: 'active',
      workspaceType: 'agency',
      bankAccounts: [],
      featureFlags: { propertyOwners: true, propertyAccounts: true, accounting: true },
    });
  }
  if (String(agent.companyId || '') !== String(company._id)) {
    agent.companyId = company._id;
    await agent.save();
  }

  const existingProperty = await Property.findOne({
    companyId: company._id,
    name: 'Audit Test Cottage',
  }).select('_id ownerId propertyOwnerId');
  if (!existingProperty) {
    await Property.create({
      name: 'Audit Test Cottage',
      address: '1 Audit Lane, Harare',
      companyId: company._id,
      ownerId: agent._id,
      agentId: agent._id,
      type: 'house',
      rent: 500,
      status: 'available',
      propertyOperationalStatus: 'Vacant',
      isDeleted: false,
    });
  }

  console.log('audit agent ready');
  console.log(`company=${company._id}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Audit agent setup failed');
  process.exit(1);
});
