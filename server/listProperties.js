// listProperties.js
const mongoose = require('mongoose');
const { Property } = require('./dist/models/Property');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name';

async function main() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const properties = await Property.find({}, { name: 1 });
    console.log('Count:', properties.length);
    console.log('Names:', properties.map(p => p.name));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main(); 