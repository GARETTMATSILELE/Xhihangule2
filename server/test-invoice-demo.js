const mongoose = require('mongoose');
const { Invoice } = require('./dist/models/Invoice');
const ACCOUNTING_DB_URI = process.env.ACCOUNTING_DB_URI || 'mongodb://localhost:27017/accounting';

async function insertDemoInvoices() {
  try {
    await mongoose.connect(ACCOUNTING_DB_URI);
    console.log('Connected to accounting database');

    const demoInvoices = [
      {
        property: 'Demo Property',
        client: 'Demo Client',
        amount: 1234.56,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        description: 'Demo invoice for testing',
        type: 'rental',
        saleDetails: '',
        status: 'unpaid',
      },
      {
        property: 'Second Property',
        client: 'Second Client',
        amount: 4321.00,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
        description: 'Second demo invoice',
        type: 'sale',
        saleDetails: 'Includes transfer fees',
        status: 'paid',
      }
    ];

    const inserted = await Invoice.insertMany(demoInvoices);
    console.log('Demo invoices inserted:', inserted);
  } catch (error) {
    console.error('Error inserting demo invoices:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from accounting database');
  }
}

insertDemoInvoices(); 