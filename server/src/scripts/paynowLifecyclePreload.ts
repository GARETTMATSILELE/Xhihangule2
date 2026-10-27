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

export const PAYNOW_LIFECYCLE_POLL = 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=lifecycle-test';

type PaynowMode = 'ok' | 'timeout' | 'rejected' | 'malformed' | 'throw-hash';

export const paynowTestDouble = {
  mode: 'ok' as PaynowMode,
  sends: 0,
  last: null as null | {
    integrationId: string;
    resultUrl: string;
    returnUrl: string;
    reference: string;
    email: string;
    amount: number;
  },
  pollStatus: 'Created',
  pollAmount: '19.00',
  pollCurrency: '',
  pollReference: '',
  pollPaynowReference: '70000001',
  pollFault: '' as '' | 'bad-hash' | 'timeout' | 'down' | 'malformed',
  urls: [] as string[]
};

function installStandIns() {
  const { paynowPayloadHash } = require('../services/registrationPaymentPolicy') as typeof import('../services/registrationPaymentPolicy');
  const key = 'lifecycle-test-key';

  function pollBody() {
    const values: Record<string, string> = {
      reference: paynowTestDouble.pollReference,
      paynowreference: paynowTestDouble.pollPaynowReference,
      amount: paynowTestDouble.pollAmount,
      status: paynowTestDouble.pollStatus,
      pollurl: PAYNOW_LIFECYCLE_POLL
    };
    if (paynowTestDouble.pollCurrency) values.currency = paynowTestDouble.pollCurrency;
    values.hash = paynowTestDouble.pollFault === 'bad-hash' ? 'BADHASH' : paynowPayloadHash(values, key);
    return Object.keys(values).map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(values[name])}`).join('&');
  }

  function parseQuery(queryString: string) {
    const query: Record<string, string> = {};
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
    items: Array<{ title: string; amount: number }> = [];
    constructor(public reference: string, public authEmail: string) {}
    add(title: string, amount: number) {
      this.items.push({ title, amount });
    }
  }

  class MockPaynow {
    resultUrl = '';
    returnUrl = '';
    constructor(public integrationId: string, public integrationKey: string) {}
    createPayment(reference: string, authEmail: string) {
      return new MockPayment(reference, authEmail);
    }
    async send(payment: MockPayment) {
      paynowTestDouble.sends += 1;
      const amount = payment.items.reduce((sum, item) => sum + Number(item.amount), 0);
      paynowTestDouble.last = {
        integrationId: this.integrationId,
        resultUrl: this.resultUrl,
        returnUrl: this.returnUrl,
        reference: payment.reference,
        email: payment.authEmail,
        amount
      };
      if (!paynowTestDouble.pollReference) paynowTestDouble.pollReference = payment.reference;
      if (paynowTestDouble.mode === 'timeout') {
        const error: any = new Error('timeout');
        error.code = 'ECONNABORTED';
        throw error;
      }
      if (paynowTestDouble.mode === 'throw-hash') throw new Error('Hashes do not match!');
      if (paynowTestDouble.mode === 'rejected') return { success: false, error: 'Invalid amount' };
      if (paynowTestDouble.mode === 'malformed') return { success: true };
      return {
        success: true,
        redirectUrl: 'https://www.paynow.co.zw/Interface/Process?guid=lifecycle-test',
        pollUrl: PAYNOW_LIFECYCLE_POLL
      };
    }
    parseQuery(raw: string) {
      return parseQuery(raw);
    }
    parseStatusUpdate(raw: string) {
      if (paynowTestDouble.pollFault === 'malformed' || !raw) throw new Error('An unknown error occurred');
      const fields = parseQuery(raw);
      const expected = paynowPayloadHash(fields, this.integrationKey);
      if (!fields.hash || fields.hash !== expected) throw new Error('Hashes do not match!');
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
  } as NodeModule;

  const axiosPath = require.resolve('axios');
  const axiosMock: any = async () => {
    throw new Error('unexpected Paynow HTTP call');
  };
  axiosMock.post = async (url: string) => {
    paynowTestDouble.urls.push(String(url));
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    if (host !== 'www.paynow.co.zw') throw new Error('blocked non-Paynow URL');
    if (paynowTestDouble.pollFault === 'timeout') {
      const error: any = new Error('timeout');
      error.code = 'ECONNABORTED';
      throw error;
    }
    if (paynowTestDouble.pollFault === 'down') {
      const error: any = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    return { status: 200, data: pollBody() };
  };
  axiosMock.default = axiosMock;
  axiosMock.__esModule = true;
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: axiosMock
  } as NodeModule;
}

installStandIns();
