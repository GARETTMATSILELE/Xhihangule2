/**
 * Read-only Paynow routing preflight.
 * Prints hosts and mode only. Exits 1 when the result URL is not this server.
 * Does not create a payment and does not print integration keys.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { evaluatePaynowDeployment } from '../services/registrationPaymentPolicy';

function envFile(): Record<string, string> {
  const file = process.env.ENV_FILE || '.env';
  const full = path.resolve(__dirname, '..', '..', file);
  const values: Record<string, string> = {};
  if (!fs.existsSync(full)) return values;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
  return values;
}

function requestStatus(target: string): Promise<number | string> {
  return new Promise((resolve) => {
    let url: URL;
    try { url = new URL(target); } catch { resolve('invalid-url'); return; }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'POST', timeout: 8000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '0' } }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => { req.destroy(); resolve('timeout'); });
    req.on('error', () => resolve('unreachable'));
    req.end();
  });
}

async function main() {
  const file = envFile();
  const merged: NodeJS.ProcessEnv = { ...file, ...process.env };
  const integrationId = String(merged.PAYNOW_INTEGRATION_ID || '');
  const runtimeHost = `localhost:${process.env.PORT || 5000}`;
  const decision = evaluatePaynowDeployment(merged, {
    nodeEnv: process.env.NODE_ENV || 'development',
    requestHost: runtimeHost
  });
  const result = decision.resultUrl || String(merged.PAYNOW_RESULT_URL || '');
  const localDefaultDatabase = !process.env.MONGODB_URI && process.env.NODE_ENV !== 'production';
  const resultStatus = result ? await requestStatus(result) : 'missing';

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
  if (!report.createPaymentAllowed) process.exit(1);
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 200));
  process.exit(1);
});
