const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function testToken() {
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

    // Find the property owner
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
      companyId: propertyOwner.companyId
    });

    // Test token generation
    const token = authService.generateAccessToken(propertyOwner, 'propertyOwner');
    console.log('Generated token:', token);

    // Decode the token to see what's in it
    const decoded = authService.decodeToken(token);
    console.log('Decoded token payload:', decoded);

  } catch (error) {
    console.error('Error testing token:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

testToken(); 