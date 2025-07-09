import express from 'express';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  console.log('Test route hit');
  res.json({ 
    message: 'Test route working',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// Health check
router.get('/health', (req, res) => {
  console.log('Health route hit');
  res.json({ 
    status: 'ok', 
    service: 'test-report-routes',
    timestamp: new Date().toISOString()
  });
});

console.log('Test report routes defined');

export default router; 