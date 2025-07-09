const mongoose = require('mongoose');
require('dotenv').config();

// Use the same database URI as the main application
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function fixPropertyOwners() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    // Import models after connection
    const { PropertyOwner } = require('./dist/models/PropertyOwner');
    const { Company } = require('./dist/models/Company');

    // Find all property owners
    const propertyOwners = await PropertyOwner.find({});
    console.log(`Found ${propertyOwners.length} property owners`);

    // Find all companies
    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies`);

    if (companies.length === 0) {
      console.log('No companies found. Cannot assign companyId to property owners.');
      return;
    }

    // Check property owners without companyId
    const ownersWithoutCompany = propertyOwners.filter(owner => !owner.companyId);
    console.log(`Found ${ownersWithoutCompany.length} property owners without companyId`);

    if (ownersWithoutCompany.length === 0) {
      console.log('All property owners already have companyId');
      return;
    }

    // Assign companyId to property owners without one
    // For simplicity, assign to the first company found
    const defaultCompany = companies[0];
    console.log(`Using default company: ${defaultCompany.name} (${defaultCompany._id})`);

    for (const owner of ownersWithoutCompany) {
      console.log(`Updating property owner: ${owner.email}`);
      owner.companyId = defaultCompany._id;
      await owner.save();
      console.log(`Updated property owner: ${owner.email} with companyId: ${owner.companyId}`);
    }

    console.log('Successfully updated all property owners');

    // Verify the updates
    const updatedOwners = await PropertyOwner.find({});
    const stillWithoutCompany = updatedOwners.filter(owner => !owner.companyId);
    console.log(`Property owners still without companyId: ${stillWithoutCompany.length}`);

  } catch (error) {
    console.error('Error fixing property owners:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run the script
fixPropertyOwners(); 