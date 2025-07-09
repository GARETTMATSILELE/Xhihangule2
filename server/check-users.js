const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function checkUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const { User } = require('./dist/models/User');
    const { PropertyOwner } = require('./dist/models/PropertyOwner');

    const email = 'ebrahim@thebenjaminsrealty.co.zw';

    // Check User collection
    const user = await User.findOne({ email });
    console.log('\n=== User Collection ===');
    if (user) {
      console.log('User found:', {
        id: user._id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        isActive: user.isActive
      });
    } else {
      console.log('No user found with this email');
    }

    // Check PropertyOwner collection
    const propertyOwner = await PropertyOwner.findOne({ email });
    console.log('\n=== PropertyOwner Collection ===');
    if (propertyOwner) {
      console.log('PropertyOwner found:', {
        id: propertyOwner._id,
        email: propertyOwner.email,
        companyId: propertyOwner.companyId,
        properties: propertyOwner.properties
      });
    } else {
      console.log('No property owner found with this email');
    }

    // Check for any other users with similar emails
    console.log('\n=== All Users with Similar Emails ===');
    const allUsers = await User.find({ 
      email: { $regex: 'ebrahim', $options: 'i' } 
    });
    allUsers.forEach(u => {
      console.log(`- ${u.email}: id=${u._id}, role=${u.role}, companyId=${u.companyId}`);
    });

    console.log('\n=== All PropertyOwners with Similar Emails ===');
    const allPropertyOwners = await PropertyOwner.find({ 
      email: { $regex: 'ebrahim', $options: 'i' } 
    });
    allPropertyOwners.forEach(po => {
      console.log(`- ${po.email}: id=${po._id}, companyId=${po.companyId}`);
    });

  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

checkUsers(); 