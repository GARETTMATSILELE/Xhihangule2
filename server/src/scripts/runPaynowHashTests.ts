/**
 * Paynow hash and initiation-message tests.
 * Does not call Paynow, does not read merchant keys, and does not write payment records.
 */
import { paynowConfigurationState, paynowPayloadHash, verifyPaynowPayload } from '../services/registrationPaymentPolicy';
import {
  buildPaynowInitiationFields,
  installCorrectPaynowHashing,
  normalizePaynowCredential,
  parsePaynowBody,
  paynowAmount,
  paynowInitiationLinks,
  shouldLoadLocalPaynowConfig
} from '../services/paynowHash';

const DOCUMENTED_KEY = '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977';
const DOCUMENTED_HASH = '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  const documented = {
    id: '1201',
    reference: 'TEST REF',
    amount: '99.99',
    additionalinfo: 'A test ticket transaction',
    returnurl: 'http://www.google.com/search?q=returnurl',
    resulturl: 'http://www.google.com/search?q=resulturl',
    status: 'Message'
  };
  const documentedHash = paynowPayloadHash(documented, DOCUMENTED_KEY);
  record('documented SHA512 example', documentedHash === DOCUMENTED_HASH, documentedHash.slice(0, 12));

  const reordered = {
    status: documented.status,
    id: documented.id,
    reference: documented.reference,
    amount: documented.amount,
    additionalinfo: documented.additionalinfo,
    returnurl: documented.returnurl,
    resulturl: documented.resulturl
  };
  record('parameter order is part of the concatenation', paynowPayloadHash(reordered, DOCUMENTED_KEY) !== documentedHash);

  const withOptional = { ...documented, authemail: '' };
  record('empty optional authemail does not change the concatenation', paynowPayloadHash(withOptional, DOCUMENTED_KEY) === documentedHash);
  const withEmail = { ...documented, authemail: 'buyer@example.test' };
  record('a present optional value is included', paynowPayloadHash(withEmail, DOCUMENTED_KEY) !== documentedHash);

  record('amount 20 formats as 20.00', paynowAmount(20) === '20.00');
  record('amount 20 and 20.00 are different hash inputs', paynowPayloadHash({ ...documented, amount: '20' }, DOCUMENTED_KEY) !== paynowPayloadHash({ ...documented, amount: '20.00' }, DOCUMENTED_KEY));
  record('fractional amount keeps two decimals', paynowAmount(19.9) === '19.90');

  const spaced = { ...documented, reference: 'TEST REF ' };
  record('trailing whitespace changes the hash', paynowPayloadHash(spaced, DOCUMENTED_KEY) !== documentedHash);
  record('internal spaces stay in the documented example', documentedHash === DOCUMENTED_HASH);

  const testKey = 'test-integration-key';
  const liveKey = 'live-integration-key';
  record('test and live keys do not produce the same hash', paynowPayloadHash(documented, testKey) !== paynowPayloadHash(documented, liveKey));
  record('application mode does not select the hash key',
    paynowConfigurationState({ PAYNOW_MODE: 'test', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: testKey }).mode === 'test'
    && paynowConfigurationState({ PAYNOW_MODE: 'live', PAYNOW_INTEGRATION_ID: '23136', PAYNOW_INTEGRATION_KEY: liveKey }).mode === 'live');
  record('production does not load the local Paynow file',
    shouldLoadLocalPaynowConfig({ NODE_ENV: 'production', PAYNOW_DISABLE_LOCAL_CONFIG: '0' }) === false
    && shouldLoadLocalPaynowConfig({ NODE_ENV: 'development', PAYNOW_DISABLE_LOCAL_CONFIG: '1' }) === false
    && shouldLoadLocalPaynowConfig({ NODE_ENV: 'development' }) === true);
  const padded = normalizePaynowCredential(`  " ${liveKey}" `);
  record('quoted and padded credentials normalize to the key', padded === liveKey);
  record('an untrimmed key does not match the normalized key', paynowPayloadHash(documented, ` ${liveKey} `) !== paynowPayloadHash(documented, normalizePaynowCredential(` ${liveKey} `)));
  record('the integration key is not lowercased', paynowPayloadHash(documented, 'AbC') !== paynowPayloadHash(documented, 'abc'));

  record('missing credentials fail verification', verifyPaynowPayload({ ...documented, hash: documentedHash }, '') === false);
  record('the wrong key is rejected', verifyPaynowPayload({ ...documented, hash: documentedHash }, testKey) === false);
  record('a replaced hash is rejected', verifyPaynowPayload({ ...documented, hash: 'A'.repeat(128) }, DOCUMENTED_KEY) === false);
  record('the documented hash is accepted', verifyPaynowPayload({ ...documented, hash: documentedHash }, DOCUMENTED_KEY) === true);

  const { Paynow } = require('paynow') as { Paynow: new (id: string, key: string) => any };
  const paynow = new Paynow(` ${documented.id} `, ` ${DOCUMENTED_KEY} `);
  paynow.resultUrl = documented.resulturl;
  paynow.returnUrl = documented.returnurl;
  installCorrectPaynowHashing(paynow);
  const payment = paynow.createPayment(documented.reference, '');
  payment.add(documented.additionalinfo, 99.99);
  const built = paynow.build(payment) as Record<string, string>;
  const { hash, ...signed } = built;
  record('initiation hash matches the raw payload that will be sent', hash === paynowPayloadHash(signed, DOCUMENTED_KEY));
  record('spaced description is not percent-encoded before hashing', built.additionalinfo === 'A test ticket transaction' && !built.additionalinfo.includes('%20'));
  record('amount sent to Paynow uses the same 99.99 string as the hash', built.amount === '99.99');
  const encoded = Object.fromEntries(Object.entries(signed).map(([key, value]) => [key, encodeURI(value)]));
  record('URL-encoding before hashing does not match Paynow for spaced values', paynowPayloadHash(encoded, DOCUMENTED_KEY) !== hash);

  const mobile = buildPaynowInitiationFields(paynow, payment, { phone: '0771111111', method: 'ecocash' });
  record('mobile fields are optional and change the hash when present', mobile.hash !== hash && mobile.phone === '0771111111' && mobile.method === 'ecocash');
  record('web initiation does not send phone or method', built.phone == null && built.method == null);

  const responseFields: Record<string, string> = {
    status: 'Ok',
    browserurl: 'https://www.paynow.co.zw/Interface/Process?guid=hash-test',
    pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=hash-test'
  };
  responseFields.hash = paynowPayloadHash(responseFields, DOCUMENTED_KEY);
  const body = new URLSearchParams(responseFields).toString();
  const parsed = parsePaynowBody(body);
  const links = paynowInitiationLinks(parsed);
  record('successful initiation response verifies', verifyPaynowPayload(parsed, DOCUMENTED_KEY) === true);
  record('browserurl and pollurl are extracted from the response',
    links.status === 'Ok'
    && links.browserUrl === responseFields.browserurl
    && links.pollUrl === responseFields.pollurl);
  const tampered = body.replace(/hash=[^&]+/, 'hash=' + 'B'.repeat(128));
  record('invalid response hash is rejected', verifyPaynowPayload(parsePaynowBody(tampered), DOCUMENTED_KEY) === false);

  const failed = checks.filter((check) => !check.ok);
  console.log(`${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
