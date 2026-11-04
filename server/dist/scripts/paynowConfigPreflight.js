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
 * Read-only Paynow routing preflight.
 * Prints hosts and mode only. Exits 1 when the result URL is not this server.
 * Does not create a payment and does not print integration keys.
 */
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
function envFile() {
    const file = process.env.ENV_FILE || '.env';
    const full = path_1.default.resolve(__dirname, '..', '..', file);
    const values = {};
    if (!fs_1.default.existsSync(full))
        return values;
    for (const line of fs_1.default.readFileSync(full, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match)
            continue;
        values[match[1]] = match[2].trim().replace(/^"|"$/g, '');
    }
    return values;
}
function requestStatus(target) {
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(target);
        }
        catch (_a) {
            resolve('invalid-url');
            return;
        }
        const lib = url.protocol === 'https:' ? https_1.default : http_1.default;
        const req = lib.request(url, { method: 'POST', timeout: 8000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '0' } }, (res) => {
            res.resume();
            resolve(res.statusCode || 0);
        });
        req.on('timeout', () => { req.destroy(); resolve('timeout'); });
        req.on('error', () => resolve('unreachable'));
        req.end();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const file = envFile();
        const merged = Object.assign(Object.assign({}, file), process.env);
        const integrationId = String(merged.PAYNOW_INTEGRATION_ID || '');
        const runtimeHost = `localhost:${process.env.PORT || 5000}`;
        const decision = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(merged, {
            nodeEnv: process.env.NODE_ENV || 'development',
            requestHost: runtimeHost
        });
        const result = decision.resultUrl || String(merged.PAYNOW_RESULT_URL || '');
        const localDefaultDatabase = !process.env.MONGODB_URI && process.env.NODE_ENV !== 'production';
        const resultStatus = result ? yield requestStatus(result) : 'missing';
        const report = {
            runtimeEnvironment: process.env.NODE_ENV || 'undefined',
            runtimeHost,
            paynowMode: decision.mode,
            integrationIdSuffix: integrationId ? integrationId.slice(-2) : '',
            integrationIdLength: integrationId.length,
            resultHost: decision.resultHost,
            resultPath: decision.resultPath,
            returnHost: decision.returnHost,
            returnPath: decision.returnPath,
            issues: decision.issues,
            resultHostOwnsThisProcess: decision.ok,
            callbackProbeStatus: resultStatus,
            providerDashboardModeChecked: false,
            database: localDefaultDatabase ? 'local-development-default' : 'external-uri-configured',
            localConfigDisabledForTests: process.env.PAYNOW_DISABLE_LOCAL_CONFIG === '1',
            createPaymentAllowed: decision.ok && decision.mode === 'test'
        };
        console.log(JSON.stringify(report, null, 2));
        if (!report.createPaymentAllowed)
            process.exit(1);
    });
}
main().catch((error) => {
    console.error(String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200));
    process.exit(1);
});
