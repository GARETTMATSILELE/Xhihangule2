const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000';
const TEST_OWNER_EMAIL = 'owner@example.com'; // Replace with actual test owner email
const TEST_OWNER_PASSWORD = 'password123'; // Replace with actual test owner password

async function testChartEndpoints() {
  try {
    console.log('Testing Chart Endpoints...\n');

    // Step 1: Login as owner
    console.log('1. Logging in as owner...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_OWNER_EMAIL,
      password: TEST_OWNER_PASSWORD
    });

    const token = loginResponse.data.token;
    console.log('Login successful, token received\n');

    // Step 2: Test occupancy chart endpoint
    console.log('2. Testing occupancy chart endpoint...');
    try {
      const occupancyResponse = await axios.get(`${BASE_URL}/charts/owner/occupancy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Occupancy chart response:', JSON.stringify(occupancyResponse.data, null, 2));
    } catch (error) {
      console.error('Occupancy chart error:', error.response?.data || error.message);
    }
    console.log('');

    // Step 3: Test payment chart endpoint
    console.log('3. Testing payment chart endpoint...');
    try {
      const paymentResponse = await axios.get(`${BASE_URL}/charts/owner/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Payment chart response:', JSON.stringify(paymentResponse.data, null, 2));
    } catch (error) {
      console.error('Payment chart error:', error.response?.data || error.message);
    }
    console.log('');

    // Step 4: Test maintenance chart endpoint
    console.log('4. Testing maintenance chart endpoint...');
    try {
      const maintenanceResponse = await axios.get(`${BASE_URL}/charts/owner/maintenance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Maintenance chart response:', JSON.stringify(maintenanceResponse.data, null, 2));
    } catch (error) {
      console.error('Maintenance chart error:', error.response?.data || error.message);
    }
    console.log('');

    // Step 5: Test properties endpoint
    console.log('5. Testing properties endpoint...');
    try {
      const propertiesResponse = await axios.get(`${BASE_URL}/owners/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Properties response:', JSON.stringify(propertiesResponse.data, null, 2));
    } catch (error) {
      console.error('Properties error:', error.response?.data || error.message);
    }
    console.log('');

    // Step 6: Test maintenance requests endpoint
    console.log('6. Testing maintenance requests endpoint...');
    try {
      const maintenanceRequestsResponse = await axios.get(`${BASE_URL}/owners/maintenance-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Maintenance requests response:', JSON.stringify(maintenanceRequestsResponse.data, null, 2));
    } catch (error) {
      console.error('Maintenance requests error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testChartEndpoints(); 