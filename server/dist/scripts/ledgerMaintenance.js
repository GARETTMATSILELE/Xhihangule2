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
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("../config/database");
const propertyAccountService_1 = require("../services/propertyAccountService");
// Load environment (supports ENV_FILE override)
const ENV_PATH = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
dotenv_1.default.config({ path: ENV_PATH });
function parseArgs(argv) {
    const args = argv.slice(2);
    let companyId;
    let dryRun = false;
    for (const a of args) {
        if (a === '--dry-run' || a === '--dry' || a === '-n')
            dryRun = true;
        else if (a.startsWith('--company-id='))
            companyId = a.split('=')[1];
        else if (!a.startsWith('--') && !companyId)
            companyId = a;
    }
    return { companyId, dryRun };
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const { companyId, dryRun } = parseArgs(process.argv);
        if (!companyId) {
            console.error('Usage: npm run ledger:maintain -- --company-id=<id> [--dry-run]');
            process.exit(1);
        }
        const started = Date.now();
        console.log(`[ledger:maintain] Starting maintenance for companyId=${companyId} dryRun=${dryRun}`);
        try {
            yield (0, database_1.connectDatabase)();
            const result = yield (0, propertyAccountService_1.runPropertyLedgerMaintenance)({ companyId, dryRun });
            console.log('[ledger:maintain] Maintenance complete:', JSON.stringify(result, null, 2));
            console.log(`[ledger:maintain] Duration: ${Date.now() - started}ms`);
            process.exit(0);
        }
        catch (e) {
            console.error('[ledger:maintain] Failed:', (e === null || e === void 0 ? void 0 : e.message) || e);
            process.exit(1);
        }
        finally {
            try {
                yield (0, database_1.closeDatabase)();
            }
            catch (_a) { }
        }
    });
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
