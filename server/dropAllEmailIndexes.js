const mongoose = require('mongoose');
require('dotenv').config();

async function dropAllEmailIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const collections = [
      'users',
      'companies',
      'tenants',
      'propertyowners'
    ];

    for (const collection of collections) {
      try {
        const indexes = await mongoose.connection.db.collection(collection).indexes();
        console.log(`\nIndexes in ${collection}:`, indexes.map(idx => idx.name));

        for (const index of indexes) {
          if (index.name.includes('email')) {
            console.log(`Dropping index ${index.name} from ${collection}`);
            await mongoose.connection.db.collection(collection).dropIndex(index.name);
          }
        }
      } catch (err) {
        console.log(`Error processing ${collection}:`, err.message);
      }
    }

    console.log('\nAll email indexes dropped successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

dropAllEmailIndexes(); 