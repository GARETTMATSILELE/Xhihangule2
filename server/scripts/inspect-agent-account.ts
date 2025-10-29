import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/property-management';
  const agentId = process.argv.find((a) => a.startsWith('--agent='))?.split('=')[1];
  if (!agentId) {
    console.error('Provide --agent=<id>');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection;
  const AgentAccounts = db.collection('agentaccounts');
  const acc = await AgentAccounts.findOne({ agentId: new mongoose.Types.ObjectId(agentId) });
  if (!acc) {
    console.log('No agent account found for', agentId);
    await mongoose.disconnect();
    return;
  }
  console.log('Agent account:', String(acc._id));
  const txs = Array.isArray(acc.transactions) ? acc.transactions : [];
  console.log('Transactions count:', txs.length);
  // Print first 20 commission transactions sorted by date desc
  const sorted = txs
    .filter((t: any) => t.type === 'commission')
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 40);
  for (const t of sorted) {
    console.log(`[${new Date(t.date).toISOString().slice(0,10)}] ${t.description} | amt=${t.amount} | ref=${t.reference || ''} | id=${t._id}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });


