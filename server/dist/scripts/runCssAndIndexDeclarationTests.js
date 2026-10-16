"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Static checks for the landing-page CSS chunk and onboarding index declarations.
 * Does not connect to a database or change data.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const OnboardingSession_1 = require("../models/OnboardingSession");
const PaymentSession_1 = require("../models/PaymentSession");
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function singleIdempotencyIndex(modelName, specs) {
    var _a;
    const matches = specs.filter(([keys]) => keys.idempotencyKey === 1 && Object.keys(keys).length === 1);
    record(`${modelName} declares one idempotencyKey index`, matches.length === 1, `count ${matches.length}`);
    record(`${modelName} idempotencyKey index is unique`, matches.length === 1 && ((_a = matches[0][1]) === null || _a === void 0 ? void 0 : _a.unique) === true, JSON.stringify(matches.map(([, options]) => options)));
}
function main() {
    const root = path_1.default.join(__dirname, '..', '..', '..');
    const landingCss = fs_1.default.readFileSync(path_1.default.join(root, 'client', 'src', 'pages', 'LandingPage', 'LandingPage.css'), 'utf8');
    const indexHtml = fs_1.default.readFileSync(path_1.default.join(root, 'client', 'public', 'index.html'), 'utf8');
    const serverIndex = fs_1.default.readFileSync(path_1.default.join(root, 'server', 'src', 'index.ts'), 'utf8');
    record('Landing CSS does not import a remote stylesheet', !/@import\s+url\(/i.test(landingCss) && !landingCss.includes('fonts.googleapis.com'));
    record('Document head loads Inter without a CSS-chunk import', indexHtml.includes('rel="stylesheet"') && indexHtml.includes('https://fonts.googleapis.com/css2?family=Inter'));
    record('Production style policy allows the Inter stylesheet', serverIndex.includes('"https://fonts.googleapis.com"'));
    record('Production font policy allows the Inter font files', serverIndex.includes('"https://fonts.gstatic.com"'));
    singleIdempotencyIndex(OnboardingSession_1.OnboardingSession.modelName, OnboardingSession_1.OnboardingSession.schema.indexes());
    singleIdempotencyIndex(PaymentSession_1.PaymentSession.modelName, PaymentSession_1.PaymentSession.schema.indexes());
    const failed = checks.filter((check) => !check.ok);
    console.log(`CSS and index declaration checks: ${checks.length - failed.length}/${checks.length} passed`);
    process.exit(failed.length ? 1 : 0);
}
main();
