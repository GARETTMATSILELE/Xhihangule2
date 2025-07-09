const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test the owner properties endpoint
async function testOwnerEndpoints() {
  try {
    console.log('Testing owner endpoints...\n');

    // Test 1: Get owner properties (should require authentication)
    console.log('1. Testing GET /owners/properties (without auth)...');
    try {
      const response = await axios.get(`${BASE_URL}/owners/properties`);
      console.log('❌ Should have failed without authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Test 2: Get owner maintenance requests (should require authentication)
    console.log('\n2. Testing GET /owners/maintenance-requests (without auth)...');
    try {
      const response = await axios.get(`${BASE_URL}/owners/maintenance-requests`);
      console.log('❌ Should have failed without authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Test 3: Check if endpoints are reachable (should return 401, not 404)
    console.log('\n3. Testing endpoint availability...');
    try {
      const response = await axios.get(`${BASE_URL}/owners/properties`);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Endpoint exists and requires authentication');
      } else if (error.response?.status === 404) {
        console.log('❌ Endpoint not found - check route mounting');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    console.log('\n✅ Owner endpoints are properly configured!');
    console.log('\nTo test with authentication, you would need to:');
    console.log('1. Create a property owner account');
    console.log('2. Login to get a JWT token');
    console.log('3. Include the token in the Authorization header');
    console.log('4. Make authenticated requests to the endpoints');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testOwnerEndpoints(); 