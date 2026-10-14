/**
 * Static checks for the landing-page CSS chunk and onboarding index declarations.
 * Does not connect to a database or change data.
 */
import fs from 'fs';
import path from 'path';
import { OnboardingSession } from '../models/OnboardingSession';
import { PaymentSession } from '../models/PaymentSession';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

type IndexSpec = [Record<string, unknown>, { unique?: boolean }?];

function singleIdempotencyIndex(modelName: string, specs: IndexSpec[]) {
  const matches = specs.filter(([keys]) => keys.idempotencyKey === 1 && Object.keys(keys).length === 1);
  record(
    `${modelName} declares one idempotencyKey index`,
    matches.length === 1,
    `count ${matches.length}`
  );
  record(
    `${modelName} idempotencyKey index is unique`,
    matches.length === 1 && matches[0][1]?.unique === true,
    JSON.stringify(matches.map(([, options]) => options))
  );
}

function main() {
  const root = path.join(__dirname, '..', '..', '..');
  const landingCss = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'LandingPage', 'LandingPage.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(root, 'client', 'public', 'index.html'), 'utf8');
  const serverIndex = fs.readFileSync(path.join(root, 'server', 'src', 'index.ts'), 'utf8');

  record('Landing CSS does not import a remote stylesheet', !/@import\s+url\(/i.test(landingCss) && !landingCss.includes('fonts.googleapis.com'));
  record(
    'Document head loads Inter without a CSS-chunk import',
    indexHtml.includes('rel="stylesheet"') && indexHtml.includes('https://fonts.googleapis.com/css2?family=Inter')
  );
  record('Production style policy allows the Inter stylesheet', serverIndex.includes('"https://fonts.googleapis.com"'));
  record('Production font policy allows the Inter font files', serverIndex.includes('"https://fonts.gstatic.com"'));

  singleIdempotencyIndex(OnboardingSession.modelName, OnboardingSession.schema.indexes() as IndexSpec[]);
  singleIdempotencyIndex(PaymentSession.modelName, PaymentSession.schema.indexes() as IndexSpec[]);

  const failed = checks.filter((check) => !check.ok);
  console.log(`CSS and index declaration checks: ${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
