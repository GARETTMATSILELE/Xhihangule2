/**
 * Fails when tracked files contain credential patterns.
 * Prints the file and rule only. Never prints a secret value.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const tracked = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
const textExt = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|txt|html|css|example|ps1|env|gitignore|dockerignore)$/i;
const blockedPaths = new Set([
  'server/.env',
  'server/.env.production',
  'client/.env',
  'client/.env.local',
  'server/.env.local'
]);
const rules = [
  { name: 'stripe-webhook-literal', re: /whsec_[A-Za-z0-9+/=]{8,}/ },
  { name: 'stripe-secret-key', re: /sk_(live|test)_[A-Za-z0-9]+/ },
  { name: 'atlas-uri-with-credentials', re: /mongodb\+srv:\/\/(?!<)[^/\s:]+:(?!<)[^@\s]+@/ },
  { name: 'remote-mongo-uri-with-credentials', re: /mongodb:\/\/(?!<)(?!127\.0\.0\.1)(?!localhost)[^/\s:]+:(?!<)[^@\s]+@/ },
  { name: 'dodo-live-key', re: /dodo_live_[A-Za-z0-9]+/ },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/ }
];
const findings = [];

for (const file of tracked) {
  if (blockedPaths.has(file.replace(/\\/g, '/'))) findings.push({ file, rule: 'tracked-secret-file' });
  if (file.includes('node_modules/') || !textExt.test(file)) continue;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  for (const rule of rules) {
    if (rule.re.test(text)) findings.push({ file, rule: rule.name });
  }
}

if (findings.length) {
  for (const finding of findings) console.error(finding.rule + ' ' + finding.file);
  process.exit(1);
}
console.log('Tracked credential scan passed.');
