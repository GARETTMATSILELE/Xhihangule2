import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!uri) {
    console.error('Missing MONGODB_URI env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection;
  db.on('error', (err) => console.error('Mongo error:', err));
  const LevyPayment = db.collection('levypayments');

  const dryRun = process.argv.includes('--dry');
  const companyId = process.env.COMPANY_ID_FILTER; // optional filter

  const filter: any = { paymentType: 'levy' };
  if (companyId) {
    try { filter.companyId = new mongoose.Types.ObjectId(companyId); } catch {}
  }
  // Only those missing either period field
  filter.$or = [{ levyPeriodMonth: { $exists: false } }, { levyPeriodYear: { $exists: false } }];

  const cursor = LevyPayment.find(filter, { projection: { _id: 1, paymentDate: 1, levyPeriodMonth: 1, levyPeriodYear: 1 } });
  let updated = 0; let scanned = 0;
  while (await cursor.hasNext()) {
    const doc: any = await cursor.next();
    scanned++;
    const d = doc.paymentDate ? new Date(doc.paymentDate) : new Date();
    const month = (d.getMonth() + 1);
    const year = d.getFullYear();
    if (!dryRun) {
      await LevyPayment.updateOne({ _id: doc._id }, { $set: { levyPeriodMonth: month, levyPeriodYear: year } });
    }
    updated++;
    if (updated % 100 === 0) console.log(`Updated ${updated} levy payments...`);
  }
  console.log(`Scanned ${scanned}, ${dryRun ? 'would update' : 'updated'} ${updated} levy payments.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



