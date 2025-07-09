const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function cleanupDuplicateUser() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const { User } = require('./dist/models/User');
    const { PropertyOwner } = require('./dist/models/PropertyOwner');

    const email = 'ebrahim@thebenjaminsrealty.co.zw';

    // Check if PropertyOwner exists
    const propertyOwner = await PropertyOwner.findOne({ email });
    if (!propertyOwner) {
      console.log('No PropertyOwner found with this email. Cannot safely remove User record.');
      return;
    }

    console.log('PropertyOwner found:', {
      id: propertyOwner._id,
      email: propertyOwner.email,
      companyId: propertyOwner.companyId
    });

    // Check if User exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('No User found with this email. Nothing to clean up.');
      return;
    }

    console.log('User found:', {
      id: user._id,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    });

    // Confirm the User record is safe to remove
    if (user.role !== 'owner') {
      console.log('User record has role:', user.role, '- not removing as it might be a different type of user');
      return;
    }

    if (user.companyId) {
      console.log('User record has companyId:', user.companyId, '- not removing as it might have important data');
      return;
    }

    // Remove the User record
    console.log('Removing duplicate User record...');
    const result = await User.deleteOne({ _id: user._id });
    
    if (result.deletedCount > 0) {
      console.log('Successfully removed duplicate User record');
      console.log('PropertyOwner record will now be used for authentication');
    } else {
      console.log('Failed to remove User record');
    }

  } catch (error) {
    console.error('Error cleaning up duplicate user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

cleanupDuplicateUser(); 