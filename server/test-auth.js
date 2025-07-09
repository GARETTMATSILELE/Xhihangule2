const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function testAuth() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const { PropertyOwner } = require('./dist/models/PropertyOwner');
    const { AuthService } = require('./dist/services/authService');

    const authService = AuthService.getInstance();
    await authService.initialize();

    // Find the property owner directly
    const propertyOwner = await PropertyOwner.findOne({ 
      email: 'ebrahim@thebenjaminsrealty.co.zw' 
    });
    
    if (!propertyOwner) {
      console.log('Property owner not found');
      return;
    }

    console.log('Property owner found:', {
      id: propertyOwner._id,
      email: propertyOwner.email,
      companyId: propertyOwner.companyId,
      companyIdType: typeof propertyOwner.companyId
    });

    // Test getUserById
    const userResult = await authService.getUserById(propertyOwner._id.toString());
    console.log('getUserById result:', {
      type: userResult?.type,
      user: userResult ? {
        id: userResult.user._id,
        email: userResult.user.email,
        companyId: userResult.user.companyId,
        companyIdType: typeof userResult.user.companyId
      } : null
    });

    // Test verifyToken logic
    if (userResult) {
      const { user, type } = userResult;
      const result = {
        userId: user._id.toString(),
        email: user.email,
        role: type === 'user' ? user.role : 'owner',
        companyId: user.companyId ? user.companyId.toString() : undefined
      };
      console.log('Simulated verifyToken result:', result);
    }

  } catch (error) {
    console.error('Error testing auth:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

testAuth(); 