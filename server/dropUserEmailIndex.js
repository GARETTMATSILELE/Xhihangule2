const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function dropIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('Attempting to drop email_1 index...');
    const result = await mongoose.connection.db.collection('users').dropIndex('email_1');
    console.log('Index dropped successfully:', result);
  } catch (error) {
    if (error.code === 26) {
      console.log('Index does not exist, nothing to drop');
    } else {
      console.error('Error dropping index:', error);
    }
  } finally {
    console.log('Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

dropIndex().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 