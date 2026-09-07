'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', 'server');

function parseEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return { exists: false, file };
  const text = fs.readFileSync(p, 'utf8');
  const keys = [
    'MONGODB_URI',
    'MONGODB_URI_PROPERTY',
    'ACCOUNTING_DB_URI',
    'MONGODB_URI_ACCOUNTING',
    'CUSTOMCONNSTR_MONGODB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
    'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
    'AZURE_COSMOS_CONNECTIONSTRING',
    'NODE_ENV',
    'ENV_FILE',
    'APP_ROLE',
    'ALLOW_ACCOUNTING_INDEX_MIGRATION',
    'ENABLE_SYNC_SCHEDULES',
    'ENABLE_TRUST_BACKGROUND'
  ];
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (keys.includes(k)) found[k] = v;
  }
  function hostOf(uri) {
    if (!uri) return null;
    const noProto = String(uri).replace(/^mongodb(\+srv)?:\/\//, '');
    const noCred = noProto.replace(/^[^@]*@/, '');
    const host = noCred.split('/')[0].split('?')[0];
    const db = (noCred.split('/')[1] || '').split('?')[0];
    const cosmos = /cosmos\.azure\.com/i.test(uri);
    const remote = !/^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
    return { host, db, cosmos, remote };
  }
  const mongoKeys = [
    'MONGODB_URI',
    'MONGODB_URI_PROPERTY',
    'ACCOUNTING_DB_URI',
    'MONGODB_URI_ACCOUNTING',
    'CUSTOMCONNSTR_MONGODB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
    'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
    'AZURE_COSMOS_CONNECTIONSTRING'
  ];
  const uris = {};
  for (const k of mongoKeys) {
    if (found[k]) uris[k] = hostOf(found[k]);
  }
  return {
    exists: true,
    file,
    nonMongo: {
      NODE_ENV: found.NODE_ENV || null,
      ENV_FILE: found.ENV_FILE || null,
      APP_ROLE: found.APP_ROLE || null,
      ALLOW_ACCOUNTING_INDEX_MIGRATION: found.ALLOW_ACCOUNTING_INDEX_MIGRATION || null,
      ENABLE_SYNC_SCHEDULES: found.ENABLE_SYNC_SCHEDULES || null,
      ENABLE_TRUST_BACKGROUND: found.ENABLE_TRUST_BACKGROUND || null
    },
    uris
  };
}

console.log(JSON.stringify({
  dotenv: parseEnv('.env'),
  production: parseEnv('.env.production')
}, null, 2));
