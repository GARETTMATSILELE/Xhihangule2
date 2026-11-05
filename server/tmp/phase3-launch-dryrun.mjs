import { spawn } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';

const raw = readFileSync(new URL('./api-settings.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
unlinkSync(new URL('./api-settings.json', import.meta.url));
const settings = {};
for (const row of JSON.parse(raw)) settings[row.name] = row.value;
if (!settings.MONGODB_URI || !settings.ACCOUNTING_DB_URI) {
  console.error('Required production settings are absent.');
  process.exit(1);
}

const child = spawn('npx', ['ts-node', '--transpile-only', 'tmp/phase3-dryrun.ts'], {
  cwd: process.cwd(),
  shell: true,
  env: {
    ...process.env,
    MONGODB_URI: settings.MONGODB_URI,
    ACCOUNTING_DB_URI: settings.ACCOUNTING_DB_URI,
    NODE_ENV: 'production',
    JWT_SECRET: 'phase3-readonly-audit-placeholder-secret',
    JWT_REFRESH_SECRET: 'phase3-readonly-audit-placeholder-refresh'
  }
});
const redact = (text) => String(text).replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]');
child.stdout.on('data', (chunk) => process.stdout.write(redact(chunk)));
child.stderr.on('data', (chunk) => process.stderr.write(redact(chunk)));
child.on('close', (code) => process.exit(code ?? 1));
