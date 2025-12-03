import dotenv from 'dotenv';
import { connectDatabase, closeDatabase, accountingConnection } from '../config/database';
import PropertyAccount from '../models/PropertyAccount';
import { Property } from '../models/Property';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import crypto from 'crypto';
import mongoose from 'mongoose';

const ENV_PATH = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
dotenv.config({ path: ENV_PATH });

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function txKey(t: any): string {
  const dateMs = t?.date ? new Date(t.date).getTime() : 0;
  const parts = [
    String(t?.type || ''),
    String(Number(t?.amount || 0)),
    String(dateMs),
    String(t?.referenceNumber || ''),
    String(t?.recipientId || ''),
    String(t?.category || '')
  ];
  return `tx:${sha256Hex(parts.join('|'))}`;
}

function payoutKey(p: any): string {
  const dateMs = p?.date ? new Date(p.date).getTime() : 0;
  const parts = [
    String(Number(p?.amount || 0)),
    String(dateMs),
    String(p?.referenceNumber || ''),
    String(p?.recipientId || ''),
    String(p?.recipientName || '')
  ];
  return `payout:${sha256Hex(parts.join('|'))}`;
}

function parseArgs(argv: string[]): { companyId?: string; limit?: number } {
  const args = argv.slice(2);
  let companyId: string | undefined;
  let limit: number | undefined;
  for (const a of args) {
    if (a.startsWith('--company-id=')) companyId = a.split('=')[1];
    else if (a.startsWith('--limit=')) limit = Number(a.split('=')[1] || 0) || undefined;
    else if (!a.startsWith('--') && !companyId) companyId = a;
  }
  return { companyId, limit };
}

async function main() {
  const { companyId, limit } = parseArgs(process.argv);
  console.log(`[backfillIdempotencyKeys] Starting backfill for companyId=${companyId || '(all)'} limit=${limit || 'none'}`);
  const started = Date.now();
  try {
    await connectDatabase();
    // Resolve property-like ids when companyId provided
    let filter: any = {};
    if (companyId) {
      const [props, devs] = await Promise.all([
        Property.find({ companyId }).select('_id').lean(),
        Development.find({ companyId }).select('_id').lean()
      ]);
      const devIds = devs.map((d: any) => d._id);
      let unitIds: any[] = [];
      try {
        unitIds = await DevelopmentUnit.find({ developmentId: { $in: devIds } }).distinct('_id');
      } catch {}
      const ids = [...props.map(p => p._id), ...devIds, ...unitIds];
      filter.propertyId = { $in: ids };
    }
    const cursor = PropertyAccount.find(filter).cursor();
    let examined = 0;
    let updatedDocs = 0;
    for await (const doc of cursor as any as AsyncIterable<any>) {
      examined++;
      let changed = false;
      // Backfill transactions
      if (Array.isArray(doc.transactions)) {
        for (const t of doc.transactions) {
          if (!t.idempotencyKey || typeof t.idempotencyKey !== 'string' || t.idempotencyKey.trim() === '') {
            if (t.paymentId) {
              t.idempotencyKey = `payment:${String(t.paymentId)}`;
            } else {
              t.idempotencyKey = txKey(t);
            }
            changed = true;
          }
        }
      }
      // Backfill payouts
      if (Array.isArray(doc.ownerPayouts)) {
        for (const p of doc.ownerPayouts) {
          if (!p.idempotencyKey || typeof p.idempotencyKey !== 'string' || p.idempotencyKey.trim() === '') {
            p.idempotencyKey = payoutKey(p);
            changed = true;
          }
        }
      }
      if (changed) {
        try {
          await doc.save();
          updatedDocs++;
        } catch (e: any) {
          console.warn(`[backfillIdempotencyKeys] Save failed for account ${String(doc._id)}:`, e?.message || e);
        }
      }
      if (limit && updatedDocs >= limit) break;
    }
    console.log(`[backfillIdempotencyKeys] Examined: ${examined}, Updated: ${updatedDocs}, Duration: ${Date.now() - started}ms`);
    process.exit(0);
  } catch (e: any) {
    console.error('[backfillIdempotencyKeys] Failed:', e?.message || e);
    process.exit(1);
  } finally {
    try { await closeDatabase(); } catch {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


