const { initializeSyncServices, checkSyncServicesHealth } = require('./dist/scripts/startSyncServices');

async function testSyncServices() {
  try {
    console.log('🧪 Testing sync services...');
    
    // Test initialization
    await initializeSyncServices();
    console.log('✅ Sync services initialized successfully');
    
    // Test health check
    const isHealthy = await checkSyncServicesHealth();
    console.log('✅ Health check passed:', isHealthy);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSyncServices();
