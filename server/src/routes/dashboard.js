// routes/dashboard.js 
const express = require('express');
const router = express.Router();
const dashboardService = require('../services/dashboardService');
const auth = require('../middleware/auth');

// CORS middleware
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-tenant-id');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Enhanced main dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({
        error: 'Authentication failed: User or tenant not found',
        success: false,
        code: 'AUTH_ERROR'
      });
    }

    const tenantId = req.user.tenant_id;
    const { startDate, endDate, filtered } = req.query;
    
    let dateFilter = {};
    if (filtered === 'true' && startDate && endDate) {
      dateFilter = { startDate, endDate };
    }

    // Get comprehensive dashboard data
    const [basicStats, detailedStats, performanceMetrics] = await Promise.all([
      dashboardService.getDashboardStats(tenantId, dateFilter),
      dashboardService.getDetailedStats(tenantId, dateFilter),
      dashboardService.getPerformanceMetrics(tenantId, dateFilter)
    ]);

    const response = {
      // Basic stats for the cards
      unreadChats: basicStats.unreadChats,
      templatesSent: basicStats.templatesSent,
      newContacts: basicStats.newContacts,
      totalContacts: basicStats.totalContacts,
      
      // Additional basic stats
      deliveredMessages: basicStats.deliveredMessages,
      failedMessages: basicStats.failedMessages,
      readMessages: basicStats.readMessages,
      totalMessages: basicStats.totalMessages,
      
      // Detailed analytics for charts
      messageStatusBreakdown: detailedStats.messageStatusBreakdown,
      contactGrowthTrend: detailedStats.contactGrowthTrend,
      templateUsageStats: detailedStats.templateUsageStats,
      broadcastStats: detailedStats.broadcastStats,
      hourlyMessageTrends: detailedStats.hourlyMessageTrends,
      topPerformingTemplates: detailedStats.topPerformingTemplates,
      
      // Performance metrics
      performanceMetrics,
      
      // Meta information
      tenantId,
      userId: req.user.id,
      success: true,
      timestamp: new Date().toISOString(),
      message: filtered === 'true' 
        ? `Filtered dashboard data from ${startDate} to ${endDate}` 
        : 'Dashboard data loaded successfully',
      dateFilter: dateFilter.startDate ? dateFilter : null
    };

    res.json(response);

  } catch (error) {
    console.error('Dashboard stats error:', {
      message: error.message,
      tenantId: req.user?.tenant_id,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to fetch dashboard stats',
      message: error.message,
      success: false,
      code: 'INTERNAL_ERROR',
      tenantId: req.user?.tenant_id
    });
  }
});

// Real-time stats endpoint
router.get('/stats/realtime', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({
        error: 'Authentication failed',
        success: false
      });
    }

    const tenantId = req.user.tenant_id;
    const realTimeStats = await dashboardService.getRealTimeStats(tenantId);

    res.json({
      ...realTimeStats,
      userId: req.user.id,
      success: true,
      realtime: true
    });

  } catch (error) {
    console.error('Real-time stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch real-time stats',
      success: false
    });
  }
});

// Performance metrics endpoint
router.get('/performance', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({
        error: 'Authentication failed',
        success: false
      });
    }

    const tenantId = req.user.tenant_id;
    const { startDate, endDate, filtered } = req.query;
    
    let dateFilter = {};
    if (filtered === 'true' && startDate && endDate) {
      dateFilter = { startDate, endDate };
    }

    const performanceMetrics = await dashboardService.getPerformanceMetrics(tenantId, dateFilter);

    res.json({
      ...performanceMetrics,
      tenantId,
      success: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({
      error: 'Failed to fetch performance metrics',
      success: false
    });
  }
});

// Test endpoint
router.get('/stats/test', (req, res) => {
  res.json({
    unreadChats: 25,
    templatesSent: 78,
    newContacts: 12,
    totalContacts: 234,
    success: true,
    timestamp: new Date().toISOString(),
    message: 'Dashboard API working!',
    tenantId: 'test-tenant'
  });
});

module.exports = router;
