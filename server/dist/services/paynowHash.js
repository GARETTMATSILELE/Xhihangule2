"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paynowAmount = paynowAmount;
exports.paynowItemSummary = paynowItemSummary;
exports.normalizePaynowCredential = normalizePaynowCredential;
exports.shouldLoadLocalPaynowConfig = shouldLoadLocalPaynowConfig;
exports.buildPaynowInitiationFields = buildPaynowInitiationFields;
exports.installCorrectPaynowHashing = installCorrectPaynowHashing;
exports.parsePaynowBody = parsePaynowBody;
exports.paynowInitiationLinks = paynowInitiationLinks;
const registrationPaymentPolicy_1 = require("./registrationPaymentPolicy");
/** Two decimal places, shared by the hash and the body. 20 and 20.00 must not be mixed. */
function paynowAmount(amount) {
    if (!Number.isFinite(amount))
        return '';
    return (Math.round(amount * 100) / 100).toFixed(2);
}
/** Item titles in cart order. Does not drop the last character of the description. */
function paynowItemSummary(payment) {
    var _a;
    const items = (_a = payment.items) === null || _a === void 0 ? void 0 : _a.items;
    if (!Array.isArray(items))
        return '';
    return items
        .map((item) => (item === null || item === void 0 ? void 0 : item.title) == null ? '' : String(item.title))
        .filter((title) => title !== '')
        .join(', ');
}
function normalizePaynowCredential(value) {
    let text = String(value !== null && value !== void 0 ? value : '').trim();
    if (text.length >= 2) {
        const quote = text[0];
        if ((quote === '"' || quote === "'") && text[text.length - 1] === quote) {
            text = text.slice(1, -1).trim();
        }
    }
    return text;
}
/** A production process must not read server/config/local.paynow.json. */
function shouldLoadLocalPaynowConfig(env = process.env) {
    return env.NODE_ENV !== 'production' && env.PAYNOW_DISABLE_LOCAL_CONFIG !== '1';
}
/**
 * Fields posted to Paynow, in the order they are hashed.
 * The hash is the raw values plus the integration key. Nothing is URL-encoded first.
 */
function buildPaynowInitiationFields(endpoint, payment, mobile) {
    var _a, _b;
    const total = typeof payment.total === 'function' ? payment.total() : 0;
    const fields = {
        resulturl: String(endpoint.resultUrl || ''),
        returnurl: String(endpoint.returnUrl || ''),
        reference: String(payment.reference || ''),
        amount: paynowAmount(total),
        id: normalizePaynowCredential(endpoint.integrationId),
        additionalinfo: paynowItemSummary(payment),
        authemail: payment.authEmail == null ? '' : String(payment.authEmail)
    };
    if (mobile) {
        fields.phone = String((_a = mobile.phone) !== null && _a !== void 0 ? _a : '');
        fields.method = String((_b = mobile.method) !== null && _b !== void 0 ? _b : '');
    }
    fields.status = 'Message';
    fields.hash = (0, registrationPaymentPolicy_1.paynowPayloadHash)(fields, normalizePaynowCredential(endpoint.integrationKey));
    return fields;
}
/** Replace the SDK hash, which URL-encodes values and lowercases the integration key. */
function installCorrectPaynowHashing(paynow) {
    paynow.integrationId = normalizePaynowCredential(paynow.integrationId);
    paynow.integrationKey = normalizePaynowCredential(paynow.integrationKey);
    paynow.generateHash = (values, integrationKey) => (0, registrationPaymentPolicy_1.paynowPayloadHash)(values, String(integrationKey || ''));
    paynow.build = function build(payment) {
        return buildPaynowInitiationFields(this, payment);
    };
    paynow.buildMobile = function buildMobile(payment, phone, method) {
        return buildPaynowInitiationFields(this, payment, { phone, method });
    };
}
function parsePaynowBody(body) {
    const query = {};
    const raw = String(body || '').replace(/^\uFEFF/, '');
    const pairs = (raw.startsWith('?') ? raw.slice(1) : raw).split('&');
    for (const pair of pairs) {
        if (!pair)
            continue;
        const idx = pair.indexOf('=');
        const name = decodePaynowComponent(idx >= 0 ? pair.slice(0, idx) : pair);
        const value = decodePaynowComponent(idx >= 0 ? pair.slice(idx + 1) : '');
        query[name] = value;
    }
    return query;
}
function paynowInitiationLinks(fields) {
    return {
        status: String(fields.status || ''),
        browserUrl: String(fields.browserurl || fields.browserUrl || ''),
        pollUrl: String(fields.pollurl || fields.pollUrl || ''),
        error: String(fields.error || '')
    };
}
function decodePaynowComponent(value) {
    try {
        return decodeURIComponent(String(value || '').replace(/%(?![\da-f]{2})/gi, '%25').replace(/\+/g, '%20'));
    }
    catch (_a) {
        return String(value || '');
    }
}
