const express = require('express');
const { getDatabaseStats } = require('../database/init');
const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      database: {
        connected: true,
        stats
      },
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      details: error.message
    });
  }
});

module.exports = router;