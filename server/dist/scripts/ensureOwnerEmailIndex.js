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
 * Explicit owner email index migration.
 * autoIndex and autoCreate are disabled, so Mongoose will not create this index.
 *
 * Dry run (default):
 *   npx ts-node --transpile-only src/scripts/ensureOwnerEmailIndex.ts
 *
 * Apply only when the dry run reports no duplicate, empty, or invalid emails:
 *   npx ts-node --transpile-only src/scripts/ensureOwnerEmailIndex.ts --apply
 *
 * The script never deletes or merges owner records.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const serverRoot = path_1.default.resolve(__dirname, '..', '..');
(0, dotenv_1.config)({ path: path_1.default.join(serverRoot, '.env') });
const localPath = path_1.default.join(serverRoot, '.env.development.local');
if (fs_1.default.existsSync(localPath)) {
    const parsed = (0, dotenv_1.parse)(fs_1.default.readFileSync(localPath));
    for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key])
            process.env[key] = value;
    }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INDEX_NAME = 'company_email_unique';
function maskEmail(email) {
    const [local, domain] = String(email || '').split('@');
    const head = (local || '').slice(0, 2);
    return `${head}***@${domain || 'invalid'}`;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const apply = process.argv.includes('--apply');
        const { connectDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { PropertyOwner } = yield Promise.resolve().then(() => __importStar(require('../models/PropertyOwner')));
        yield connectDatabase();
        const owners = yield PropertyOwner.find({}).select('companyId email').lean();
        const groups = new Map();
        let emptyEmails = 0;
        let invalidEmails = 0;
        for (const owner of owners) {
            const email = String(owner.email || '').trim().toLowerCase();
            const companyId = String(owner.companyId || '');
            if (!email) {
                emptyEmails += 1;
                continue;
            }
            if (!EMAIL_RE.test(email))
                invalidEmails += 1;
            const key = `${companyId}|${email}`;
            const current = groups.get(key) || { companyId, email, count: 0 };
            current.count += 1;
            groups.set(key, current);
        }
        const duplicates = [...groups.values()].filter((row) => row.count > 1);
        console.log(`owners=${owners.length}`);
        console.log(`emptyEmails=${emptyEmails}`);
        console.log(`invalidEmails=${invalidEmails}`);
        console.log(`duplicateCompanyEmails=${duplicates.length}`);
        for (const row of duplicates) {
            console.log(`duplicate company=${row.companyId} email=${maskEmail(row.email)} count=${row.count}`);
        }
        const indexes = yield PropertyOwner.collection.indexes();
        const existing = indexes.find((index) => index.name === INDEX_NAME);
        console.log(`indexPresent=${Boolean(existing)}`);
        if (!apply) {
            console.log('dry-run only; no index was created');
            process.exit(duplicates.length || emptyEmails ? 2 : 0);
        }
        if (duplicates.length || emptyEmails) {
            console.error('Refusing to create the unique index until duplicate and empty emails are resolved manually.');
            process.exit(3);
        }
        if (existing) {
            console.log('index already present');
            process.exit(0);
        }
        yield PropertyOwner.collection.createIndex({ companyId: 1, email: 1 }, { unique: true, name: INDEX_NAME, background: true });
        console.log('index created');
        process.exit(0);
    });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Owner email index migration failed');
    process.exit(1);
});
