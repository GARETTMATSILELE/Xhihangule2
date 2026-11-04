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
exports.paynowTestDouble = exports.PAYNOW_LIFECYCLE_POLL = void 0;
/**
 * Install Paynow and HTTP stand-ins before the checkout controller loads.
 * The stand-ins never call Paynow and never read the merchant integration key.
 */
process.env.NODE_ENV = 'development';
process.env.PAYNOW_MODE = 'test';
process.env.PAYNOW_INTEGRATION_ID = '90001';
process.env.PAYNOW_INTEGRATION_KEY = 'lifecycle-test-key';
process.env.PAYNOW_RESULT_URL = 'https://payments.example.test/api/paynow/result';
process.env.PAYNOW_RETURN_URL = 'https://payments.example.test/api/paynow/return';
process.env.PAYNOW_CALLBACK_HOST = 'payments.example.test';
process.env.PUBLIC_BASE_URL = 'https://payments.example.test';
process.env.CLIENT_URL = 'https://payments.example.test';
process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
process.env.DASHBOARD_KPI_REFRESH_DEBOUNCE_MS = '600000';
process.env.PAYNOW_DISABLE_LOCAL_CONFIG = '1';
exports.PAYNOW_LIFECYCLE_POLL = 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=lifecycle-test';
exports.paynowTestDouble = {
    mode: 'ok',
    sends: 0,
    last: null,
    pollStatus: 'Created',
    pollAmount: '19.00',
    pollCurrency: '',
    pollReference: '',
    pollPaynowReference: '70000001',
    pollFault: '',
    urls: []
};
function installStandIns() {
    const { paynowPayloadHash } = require('../services/registrationPaymentPolicy');
    const key = 'lifecycle-test-key';
    function pollBody() {
        const values = {
            reference: exports.paynowTestDouble.pollReference,
            paynowreference: exports.paynowTestDouble.pollPaynowReference,
            amount: exports.paynowTestDouble.pollAmount,
            status: exports.paynowTestDouble.pollStatus,
            pollurl: exports.PAYNOW_LIFECYCLE_POLL
        };
        if (exports.paynowTestDouble.pollCurrency)
            values.currency = exports.paynowTestDouble.pollCurrency;
        values.hash = exports.paynowTestDouble.pollFault === 'bad-hash' ? 'BADHASH' : paynowPayloadHash(values, key);
        return Object.keys(values).map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(values[name])}`).join('&');
    }
    function parseQuery(queryString) {
        const query = {};
        const body = queryString[0] === '?' ? queryString.slice(1) : queryString;
        for (const pair of body.split('&')) {
            const idx = pair.indexOf('=');
            const left = idx >= 0 ? pair.slice(0, idx) : pair;
            const right = idx >= 0 ? pair.slice(idx + 1) : '';
            query[decodeURIComponent(left.replace(/\+/g, '%20'))] = decodeURIComponent(right.replace(/\+/g, '%20'));
        }
        return query;
    }
    class MockPayment {
        constructor(reference, authEmail) {
            this.reference = reference;
            this.authEmail = authEmail;
            this.items = [];
        }
        add(title, amount) {
            this.items.push({ title, amount });
        }
    }
    class MockPaynow {
        constructor(integrationId, integrationKey) {
            this.integrationId = integrationId;
            this.integrationKey = integrationKey;
            this.resultUrl = '';
            this.returnUrl = '';
        }
        createPayment(reference, authEmail) {
            return new MockPayment(reference, authEmail);
        }
        send(payment) {
            return __awaiter(this, void 0, void 0, function* () {
                exports.paynowTestDouble.sends += 1;
                const amount = payment.items.reduce((sum, item) => sum + Number(item.amount), 0);
                exports.paynowTestDouble.last = {
                    integrationId: this.integrationId,
                    resultUrl: this.resultUrl,
                    returnUrl: this.returnUrl,
                    reference: payment.reference,
                    email: payment.authEmail,
                    amount
                };
                if (!exports.paynowTestDouble.pollReference)
                    exports.paynowTestDouble.pollReference = payment.reference;
                if (exports.paynowTestDouble.mode === 'timeout') {
                    const error = new Error('timeout');
                    error.code = 'ECONNABORTED';
                    throw error;
                }
                if (exports.paynowTestDouble.mode === 'throw-hash')
                    throw new Error('Hashes do not match!');
                if (exports.paynowTestDouble.mode === 'rejected')
                    return { success: false, error: 'Invalid amount' };
                if (exports.paynowTestDouble.mode === 'malformed')
                    return { success: true };
                return {
                    success: true,
                    redirectUrl: 'https://www.paynow.co.zw/Interface/Process?guid=lifecycle-test',
                    pollUrl: exports.PAYNOW_LIFECYCLE_POLL
                };
            });
        }
        parseQuery(raw) {
            return parseQuery(raw);
        }
        parseStatusUpdate(raw) {
            if (exports.paynowTestDouble.pollFault === 'malformed' || !raw)
                throw new Error('An unknown error occurred');
            const fields = parseQuery(raw);
            const expected = paynowPayloadHash(fields, this.integrationKey);
            if (!fields.hash || fields.hash !== expected)
                throw new Error('Hashes do not match!');
            return {
                status: fields.status,
                amount: fields.amount,
                reference: fields.reference,
                paynowReference: fields.paynowreference,
                pollUrl: fields.pollurl
            };
        }
    }
    const paynowPath = require.resolve('paynow');
    require.cache[paynowPath] = {
        id: paynowPath,
        filename: paynowPath,
        loaded: true,
        exports: { Paynow: MockPaynow }
    };
    const axiosPath = require.resolve('axios');
    const axiosMock = () => __awaiter(this, void 0, void 0, function* () {
        throw new Error('unexpected Paynow HTTP call');
    });
    axiosMock.post = (url) => __awaiter(this, void 0, void 0, function* () {
        exports.paynowTestDouble.urls.push(String(url));
        const host = (() => { try {
            return new URL(url).host;
        }
        catch (_a) {
            return '';
        } })();
        if (host !== 'www.paynow.co.zw')
            throw new Error('blocked non-Paynow URL');
        if (exports.paynowTestDouble.pollFault === 'timeout') {
            const error = new Error('timeout');
            error.code = 'ECONNABORTED';
            throw error;
        }
        if (exports.paynowTestDouble.pollFault === 'down') {
            const error = new Error('connect ECONNREFUSED');
            error.code = 'ECONNREFUSED';
            throw error;
        }
        return { status: 200, data: pollBody() };
    });
    axiosMock.default = axiosMock;
    axiosMock.__esModule = true;
    require.cache[axiosPath] = {
        id: axiosPath,
        filename: axiosPath,
        loaded: true,
        exports: axiosMock
    };
}
installStandIns();
