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
 * Signup gate tests. They do not connect to MongoDB, call Paynow, or create a company.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const onboardingRoutes_1 = __importDefault(require("../routes/onboardingRoutes"));
const errorHandler_1 = require("../middleware/errorHandler");
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function request(port, method, path, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = {};
                try {
                    json = text ? JSON.parse(text) : {};
                }
                catch (_a) {
                    json = {};
                }
                resolve({ status: res.statusCode || 0, json, text });
            });
        });
        req.on('error', reject);
        req.end(payload);
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        mongoose_1.default.set('bufferCommands', false);
        const closed = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production' });
        record('Signup disabled in production when the flag is missing', closed.signupEnabled === false && closed.code === 'SIGNUP_DISABLED');
        const opened = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' });
        record('Signup enabled only when production explicitly allows it', opened.signupEnabled === true && opened.emailAllowed === true && opened.allowlistRestricted === false);
        const closedFlag = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'false', SIGNUP_EMAIL_ALLOWLIST: '' }, 'owner@example.com');
        record('Signup stays closed when the production flag is false', closedFlag.signupEnabled === false && closedFlag.code === 'SIGNUP_DISABLED' && closedFlag.emailAllowed === false);
        const blankAllowlist = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' }, 'owner@example.com');
        record('An unset allowlist does not block registration when the flag is true', blankAllowlist.signupEnabled === true && blankAllowlist.allowlistRestricted === false && blankAllowlist.emailAllowed === true);
        const allowlistAlone = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', SIGNUP_EMAIL_ALLOWLIST: 'owner@example.com' }, 'owner@example.com');
        record('An allowlist does not open production signup by itself', allowlistAlone.signupEnabled === false && allowlistAlone.code === 'SIGNUP_DISABLED');
        const invalidAllowlist = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'not-an-email' }, 'owner@example.com');
        record('An invalid allowlist does not become unrestricted signup', invalidAllowlist.emailAllowed === false && invalidAllowlist.code === 'SIGNUP_NOT_INVITED');
        const explicitOpen = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: '' }, 'owner@example.com');
        record('Unrestricted signup requires the explicit public-signup flag and a blank allowlist', explicitOpen.signupEnabled === true && explicitOpen.allowlistRestricted === false && explicitOpen.emailAllowed === true);
        const invited = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'Owner@Example.com' }, 'owner@example.com');
        const stranger = (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'owner@example.com' }, 'other@example.com');
        record('The allowlist accepts only the authorised email', invited.emailAllowed === true && stranger.code === 'SIGNUP_NOT_INVITED');
        record('Development signup remains available', (0, publicSignupCompany_1.publicSignupDecision)({ NODE_ENV: 'development' }).signupEnabled === true);
        const hookSource = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../../client/src/hooks/useSignupAvailability.tsx'), 'utf8');
        record('A failed availability request does not open the signup form', hookSource.includes("setState(response.data?.signupEnabled ? 'open' : 'closed')")
            && hookSource.includes("setState(code === 'DB_NOT_READY' ? 'database' : 'unavailable')")
            && !hookSource.includes("setState('open')"));
        const paid = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'monthly' });
        const trial = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'SME', registrationMode: 'trial', billingCycle: 'yearly' });
        record('Paid registration keeps payment required and ignores a client-selected plan price', paid.ok === true && paid.paymentRequired === true && paid.plan === 'INDIVIDUAL' && paid.billingCycle === 'monthly');
        record('Trial registration does not require payment and stays on the Individual plan', trial.ok === true && trial.paymentRequired === false && trial.plan === 'INDIVIDUAL');
        record('A test checkout does not match a live server', (0, registrationPaymentPolicy_1.paynowModeMatchesSession)('test', { PAYNOW_MODE: 'live', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: 'signup-test-key' }) === false);
        const previous = {
            NODE_ENV: process.env.NODE_ENV,
            ALLOW_PUBLIC_SIGNUP: process.env.ALLOW_PUBLIC_SIGNUP,
            SIGNUP_EMAIL_ALLOWLIST: process.env.SIGNUP_EMAIL_ALLOWLIST
        };
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api/onboarding', onboardingRoutes_1.default);
        app.use(errorHandler_1.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
        const port = server.address().port;
        try {
            process.env.NODE_ENV = 'production';
            delete process.env.ALLOW_PUBLIC_SIGNUP;
            delete process.env.SIGNUP_EMAIL_ALLOWLIST;
            const hidden = yield request(port, 'GET', '/api/onboarding/availability');
            const rejected = yield request(port, 'POST', '/api/onboarding/start', { email: 'owner@example.com', password: 'Secret123', name: 'Owner' });
            record('The availability endpoint and registration route agree that signup is closed', hidden.status === 200 && hidden.json.signupEnabled === false && hidden.json.onboardingEnabled === true && hidden.json.paidRegistrationRequiresPayment === true
                && !('database' in hidden.json) && !('checkout' in hidden.json) && !/mongodb|allowlist@|SIGNUP_EMAIL/i.test(hidden.text)
                && rejected.status === 403 && rejected.json.code === 'SIGNUP_DISABLED' && !rejected.text.includes('mongodb'));
            process.env.ALLOW_PUBLIC_SIGNUP = 'false';
            delete process.env.SIGNUP_EMAIL_ALLOWLIST;
            const explicitlyClosed = yield request(port, 'GET', '/api/onboarding/availability');
            const explicitlyRejected = yield request(port, 'POST', '/api/onboarding/start', { email: 'owner@example.com', password: 'Secret123', name: 'Owner' });
            record('The backend stays closed when ALLOW_PUBLIC_SIGNUP is false', explicitlyClosed.json.signupEnabled === false && explicitlyClosed.json.allowlistRestricted === false
                && explicitlyRejected.status === 403 && explicitlyRejected.json.code === 'SIGNUP_DISABLED');
            process.env.ALLOW_PUBLIC_SIGNUP = 'true';
            delete process.env.SIGNUP_EMAIL_ALLOWLIST;
            const open = yield request(port, 'GET', '/api/onboarding/availability');
            const gatePassed = yield request(port, 'POST', '/api/onboarding/start', {
                email: 'owner@example.com',
                password: 'Secret123',
                name: 'Owner',
                plan: 'INDIVIDUAL',
                registrationMode: 'paid',
                billingCycle: 'monthly',
                company: { name: 'Owner Co', country: 'Zimbabwe', companyType: 'INDIVIDUAL_LANDLORD' }
            });
            record('An empty allowlist reports public signup open and the backend does not reject it', open.status === 200 && open.json.signupEnabled === true && open.json.onboardingEnabled === true && open.json.allowlistRestricted === false
                && open.json.paidRegistrationRequiresPayment === true
                && gatePassed.status !== 403 && gatePassed.json.code !== 'SIGNUP_DISABLED' && gatePassed.json.code !== 'SIGNUP_NOT_INVITED');
            process.env.SIGNUP_EMAIL_ALLOWLIST = 'owner@example.com';
            const visible = yield request(port, 'GET', '/api/onboarding/availability');
            const blocked = yield request(port, 'POST', '/api/onboarding/start', { email: 'other@example.com', password: 'Secret123', name: 'Other', company: { name: 'Other Co' } });
            record('An open allowlist still rejects an unauthorised email before creating records', visible.json.signupEnabled === true && visible.json.allowlistRestricted === true && !JSON.stringify(visible.json).includes('owner@example.com')
                && blocked.status === 403 && blocked.json.code === 'SIGNUP_NOT_INVITED');
            if (mongoose_1.default.connection.readyState !== 0) {
                record('A database failure does not expose a connection string', false, 'refused to continue because a database was already connected');
            }
            else {
                const databaseDown = yield request(port, 'POST', '/api/onboarding/start', {
                    email: 'owner@example.com',
                    password: 'Secret123',
                    name: 'Owner',
                    plan: 'INDIVIDUAL',
                    registrationMode: 'paid',
                    billingCycle: 'monthly',
                    company: { name: 'Owner Co', country: 'Zimbabwe', companyType: 'INDIVIDUAL_LANDLORD' }
                });
                record('A database failure does not expose a connection string', databaseDown.status === 500 && databaseDown.json.code === 'INTERNAL_SERVER_ERROR' && databaseDown.json.message === 'Something went wrong' && !/mongodb:\/\/|AccountKey|stack/i.test(databaseDown.text));
            }
        }
        finally {
            process.env.NODE_ENV = previous.NODE_ENV;
            if (previous.ALLOW_PUBLIC_SIGNUP === undefined)
                delete process.env.ALLOW_PUBLIC_SIGNUP;
            else
                process.env.ALLOW_PUBLIC_SIGNUP = previous.ALLOW_PUBLIC_SIGNUP;
            if (previous.SIGNUP_EMAIL_ALLOWLIST === undefined)
                delete process.env.SIGNUP_EMAIL_ALLOWLIST;
            else
                process.env.SIGNUP_EMAIL_ALLOWLIST = previous.SIGNUP_EMAIL_ALLOWLIST;
            yield new Promise((resolve) => server.close(() => resolve()));
        }
        const failed = checks.filter((check) => !check.ok);
        console.log(`${checks.length - failed.length}/${checks.length} signup availability checks passed`);
        if (failed.length)
            process.exit(1);
    });
}
main().catch((error) => {
    console.error(String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200));
    process.exit(1);
});
