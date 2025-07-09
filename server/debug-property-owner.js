const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function debugPropertyOwner() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const { PropertyOwner } = require('./dist/models/PropertyOwner');
    const { Company } = require('./dist/models/Company');

    const propertyOwner = await PropertyOwner.findOne({ 
      email: 'ebrahim@thebenjaminsrealty.co.zw' 
    });
    
    if (!propertyOwner) {
      console.log('Property owner not found');
      return;
    }

    console.log('Property owner found:');
    console.log('ID:', propertyOwner._id);
    console.log('Email:', propertyOwner.email);
    console.log('CompanyId:', propertyOwner.companyId);
    console.log('CompanyId type:', typeof propertyOwner.companyId);
    
    if (propertyOwner.companyId) {
      const company = await Company.findById(propertyOwner.companyId);
      if (company) {
        console.log('Company found:', {
          id: company._id,
          name: company.name,
          email: company.email
        });
      } else {
        console.log('Company not found for companyId:', propertyOwner.companyId);
      }
    } else {
      console.log('Property owner has no companyId');
    }

    const allOwners = await PropertyOwner.find({});
    console.log('\nAll property owners:');
    allOwners.forEach(owner => {
      console.log(`- ${owner.email}: companyId = ${owner.companyId}`);
    });

  } catch (error) {
    console.error('Error debugging property owner:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

debugPropertyOwner(); 