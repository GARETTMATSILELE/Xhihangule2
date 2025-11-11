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
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = require("../config/database");
const reconciliationService_1 = require("../services/reconciliationService");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const argv = process.argv.slice(2);
        const isApply = argv.includes('--apply');
        const isDryRun = argv.includes('--dry-run') || !isApply;
        console.log(`[reconcile] Starting reconciliation (${isDryRun ? 'dry-run' : 'apply'})`);
        yield (0, database_1.connectDatabase)();
        try {
            const result = yield (0, reconciliationService_1.reconcileDuplicates)(isDryRun);
            console.log('[reconcile] Result summary:', JSON.stringify(result, null, 2));
            if (!isDryRun) {
                console.log('[reconcile] Apply completed successfully.');
            }
            else {
                console.log('[reconcile] Dry-run completed (no changes applied).');
            }
            process.exitCode = 0;
        }
        catch (e) {
            console.error('[reconcile] Failed:', (e === null || e === void 0 ? void 0 : e.message) || e);
            process.exitCode = 1;
        }
        finally {
            yield (0, database_1.closeDatabase)();
        }
    });
}
main().catch((e) => __awaiter(void 0, void 0, void 0, function* () {
    console.error('[reconcile] Unhandled error:', e);
    try {
        yield (0, database_1.closeDatabase)();
    }
    catch (_a) { }
    process.exit(1);
}));
