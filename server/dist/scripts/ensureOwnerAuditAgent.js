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
/**
 * Creates one isolated audit company, agent, and property.
 * Never updates an existing user unless the email is the audit agent address.
 * Does not print the password.
 */
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const serverRoot = path_1.default.resolve(__dirname, '..', '..');
const localPath = path_1.default.join(serverRoot, '.env.development.local');
(0, dotenv_1.config)({ path: path_1.default.join(serverRoot, '.env') });
if (fs_1.default.existsSync(localPath)) {
    const parsed = (0, dotenv_1.parse)(fs_1.default.readFileSync(localPath));
    for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key])
            process.env[key] = value;
    }
}
const AUDIT_EMAIL = 'mantis-owner-audit-agent@example.test';
function rememberPassword(password) {
    const current = fs_1.default.existsSync(localPath) ? fs_1.default.readFileSync(localPath, 'utf8') : '';
    if (/^AUDIT_AGENT_EMAIL=/m.test(current) && /^AUDIT_AGENT_PASSWORD=/m.test(current))
        return;
    const lines = [
        current.endsWith('\n') || current.length === 0 ? '' : '\n',
        `AUDIT_AGENT_EMAIL=${AUDIT_EMAIL}`,
        `AUDIT_AGENT_PASSWORD=${password}`,
        '',
    ].join('\n');
    fs_1.default.appendFileSync(localPath, lines, { mode: 0o600 });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const { connectDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
        const { Property } = yield Promise.resolve().then(() => __importStar(require('../models/Property')));
        yield connectDatabase();
        let password = process.env.AUDIT_AGENT_PASSWORD || '';
        if (password.length < 8)
            password = `Audit${crypto_1.default.randomBytes(9).toString('hex')}`;
        let agent = yield User.findOne({ email: AUDIT_EMAIL });
        if (!agent) {
            agent = yield User.create({
                email: AUDIT_EMAIL,
                password,
                firstName: 'Owner',
                lastName: 'Audit',
                role: 'agent',
                roles: ['agent'],
                isActive: true,
            });
            rememberPassword(password);
        }
        else if (!process.env.AUDIT_AGENT_PASSWORD) {
            agent.password = password;
            yield agent.save();
            rememberPassword(password);
        }
        let company = yield Company.findOne({ email: 'mantis-owner-audit@example.test' });
        if (!company) {
            company = yield Company.create({
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
            yield agent.save();
        }
        const existingProperty = yield Property.findOne({
            companyId: company._id,
            name: 'Audit Test Cottage',
        }).select('_id ownerId propertyOwnerId');
        if (!existingProperty) {
            yield Property.create({
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
    });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Audit agent setup failed');
    process.exit(1);
});
